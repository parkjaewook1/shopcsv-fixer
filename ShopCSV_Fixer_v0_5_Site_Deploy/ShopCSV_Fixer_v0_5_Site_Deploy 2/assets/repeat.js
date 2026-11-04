(function(root){
'use strict';
const C=root.ShopCSVCore;
function normalize(v){return String(v??'').trim().toLowerCase().replace(/[_.\-()]/g,' ').replace(/\s+/g,' ').trim()}
function signature(headers){return headers.map(normalize).sort().join('\u001f')}
function compatible(a,b){return Array.isArray(a)&&Array.isArray(b)&&signature(a)===signature(b)}
function makeProfile(name,headers,mapping){
 const clean=String(name??'').trim().slice(0,60);
 if(!clean)throw new Error('Enter a profile name (for example, Acme supplier).');
 const fields={};for(const f of C.FIELDS)fields[f]=Number.isInteger(mapping[f])&&mapping[f]>=0?headers[mapping[f]]??null:null;
 if(!fields.Title||!fields.Price)throw new Error('Map both Title and retail Price before saving a profile.');
 return {name:clean,headers:[...headers],fields};
}
function applyProfile(profile,headers){
 if(!profile||!compatible(profile.headers,headers))throw new Error('Column header set is different. This profile cannot be applied safely.');
 const m={};for(const f of C.FIELDS){let target=profile.fields?.[f];m[f]=target==null?-1:headers.findIndex(h=>normalize(h)===normalize(target))}return m;
}
function safeName(name,index){let n=String(name||`supplier_${index}.csv`).split(/[\\/]/).pop().replace(/[^\w. -]/g,'_').replace(/\.+/g,'.').slice(0,90);return n||`supplier_${index}.csv`}
function batchConvert(files,baseHeaders,baseMapping,options={}){
 if(!Array.isArray(files)||files.length===0||files.length>10)throw new Error('Choose 1–10 CSV files.');
 if(files.reduce((s,f)=>s+String(f.text??'').length,0)>20*1024*1024)throw new Error('Batch total exceeds 20MB.');
 const processed=[],seenHandles=new Map(),seenSkus=new Map(),seenNames=new Set(); let errors=0,warnings=0;
 for(let i=0;i<files.length;i++){
  const f=files[i]; const file=safeName(f.name,i+1);
  let item={name:file,index:i+1,issues:[],errors:0,warnings:0,result:null};
  const failure=(msg)=>{item.errors++;item.issues.push({row:'—',type:'error',field:'File',category:'batch-file',message:msg,action:'Correct this file and try again.'})};
  if(seenNames.has(file.toLowerCase()))failure('Duplicate file name in batch. Rename one of the source files.');
  seenNames.add(file.toLowerCase());
  if(String(f.text??'').length>5*1024*1024)failure('File exceeds 5MB limit.');
  if(!item.errors)try{
   const parsed=C.parseCSV(f.text);
   if(!compatible(baseHeaders,parsed.headers))failure('This file uses different columns. Process it separately with its own mapping profile.');
   else{
    const remapped=applyProfile(makeProfile('Batch',baseHeaders,baseMapping),parsed.headers);
    const result=C.convert(parsed,remapped,options);item.result=result;
    item.issues.push(...result.issues);item.errors+=result.errors;item.warnings+=result.warnings;
    if(result.errors===0){
     for(let j=0;j<result.rows.length;j++){
      const row=result.rows[j],handle=row[1],sku=row[4];
      if(handle && seenHandles.has(handle)){
       item.errors++;item.issues.push({row:j+2,type:'error',field:'URL handle',category:'cross-file-handle',message:`Handle '${handle}' also exists in ${seenHandles.get(handle)}.`,action:'Remove duplicate products or process separately after reviewing the relationship.'});
      }else if(handle)seenHandles.set(handle,file);
      if(sku && seenSkus.has(sku)){
       item.errors++;item.issues.push({row:j+2,type:'error',field:'SKU',category:'cross-file-sku',message:`SKU '${sku}' also exists in ${seenSkus.get(sku)}.`,action:'Review duplicated SKUs before importing.'});
      }else if(sku)seenSkus.set(sku,file);
     }
    }
   }
  }catch(e){failure(e.message)}
  processed.push(item);errors+=item.errors;warnings+=item.warnings;
 }
 return {files:processed,errors,warnings,ready:errors===0};
}
const encoder=new TextEncoder();
const CRC_TABLE=Array.from({length:256},(_,n)=>{let c=n;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
function crc32(bytes){let c=0xffffffff;for(let i=0;i<bytes.length;i++)c=CRC_TABLE[(c^bytes[i])&255]^(c>>>8);return (c^0xffffffff)>>>0}
function makeZip(entries){
 if(!Array.isArray(entries)||!entries.length||entries.length>30)throw new Error('ZIP requires 1–30 files.');
 const chunks=[],central=[];let offset=0;
 const bytesTo=(parts)=>{let len=parts.reduce((n,x)=>n+x.length,0),out=new Uint8Array(len),at=0;for(let x of parts){out.set(x,at);at+=x.length}return out};
 const local=(name,data,crc)=>{const header=new Uint8Array(30+name.length),v=new DataView(header.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x0800,true);v.setUint16(8,0,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);header.set(name,30);return header};
 for(let e of entries){
  const name=encoder.encode(safeName(e.name,1));const data=typeof e.content==='string'?encoder.encode(e.content):e.content;
  if(!(data instanceof Uint8Array)||data.length>15*1024*1024)throw new Error('ZIP entry must be a valid file under 15MB.');
  const crc=crc32(data),head=local(name,data,crc);chunks.push(head,data);
  const c=new Uint8Array(46+name.length),v=new DataView(c.buffer);
  v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x0800,true);v.setUint32(16,crc,true);v.setUint32(20,data.length,true);v.setUint32(24,data.length,true);v.setUint16(28,name.length,true);v.setUint32(42,offset,true);c.set(name,46);central.push(c);
  offset+=head.length+data.length;
 }
 const centralData=bytesTo(central);const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,entries.length,true);v.setUint16(10,entries.length,true);v.setUint32(12,centralData.length,true);v.setUint32(16,offset,true);
 return bytesTo([...chunks,centralData,end]);
}
root.ShopCSVRepeat={normalize,signature,compatible,makeProfile,applyProfile,batchConvert,makeZip};
if(typeof module!=='undefined'&&module.exports)module.exports=root.ShopCSVRepeat;
})(typeof window!=='undefined'?window:globalThis);
