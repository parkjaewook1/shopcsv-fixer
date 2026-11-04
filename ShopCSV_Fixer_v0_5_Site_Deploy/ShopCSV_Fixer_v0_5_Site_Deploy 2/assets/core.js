(function(root){
'use strict';
const FIELDS = ['Title','URL handle','SKU','Price','Vendor','Description','Product image URL'];
const HEADERS = ['Title','URL handle','Description','Vendor','SKU','Option1 name','Option1 value','Price','Product image URL','Status','Published on online store'];
const SYNONYMS = {
 'Title':['title','product name','product title','name','item name','product_name'],
 'URL handle':['url handle','handle','slug','product handle'],
 'SKU':['sku','item no','item number','item code','product sku','supplier sku','stock code','product id'],
 'Price':['price','retail price','selling price','sale price','list price','unit price','sales price'],
 'Vendor':['vendor','brand','manufacturer','supplier','maker'],
 'Description':['description','product description','details','body','description text'],
 'Product image URL':['product image url','image url','image link','image src','main image','photo url','primary image']
};
function normalize(s){return String(s ?? '').trim().toLowerCase().replace(/[_.\-()]/g,' ').replace(/\s+/g,' ').trim()}
function delimiterFromText(text){let top=String(text).split(/\r?\n/).slice(0,6).filter(Boolean); let candidates=[',',';','\t']; let scores=candidates.map(c=>top.reduce((a,line)=>a+(line.split(c).length-1),0)); let max=Math.max(...scores); return max?candidates[scores.indexOf(max)]:','}
function parseCSV(text, delimiter){
 const src=String(text??'').replace(/^\uFEFF/,''); if(src.length>5*1024*1024)throw new Error('CSV exceeds the 5MB text limit.'); const delim=delimiter || delimiterFromText(src); const rows=[];let row=[],cell='',quoted=false,ending=false;
 for(let i=0;i<src.length;i++){
  const c=src[i];
  if(quoted){if(c==='"'){if(src[i+1]==='"'){cell+='"';i++}else{quoted=false;ending=true}}else{cell+=c};continue}
  if(c==='"'){if(cell===''){quoted=true;continue}else{throw new Error('Unexpected quote at character '+(i+1))}}
  if(c===delim){row.push(cell);cell='';ending=false;continue}
  if(c==='\n'||c==='\r'){if(c==='\r'&&src[i+1]==='\n')i++;row.push(cell);if(row.some(v=>String(v).trim()!==''))rows.push(row);row=[];cell='';ending=false;continue}
  if(ending&&!/\s/.test(c))throw new Error('Unexpected character after closing quote near '+(i+1));
  cell+=c;
 }
 if(quoted)throw new Error('Unclosed quoted CSV field');
 if(cell!==''||row.length){row.push(cell);if(row.some(v=>String(v).trim()!==''))rows.push(row)}
 if(rows.length<2)throw new Error('The CSV must contain a header and at least one data row.');
 const headers=rows[0].map(x=>String(x).trim());
 if(headers.some(x=>!x))throw new Error('A CSV header is empty.');
 if(new Set(headers.map(normalize)).size!==headers.length)throw new Error('Duplicate column names in CSV.');
 if(headers.length>80)throw new Error('Too many columns (maximum 80).');
 if(rows.length>5001)throw new Error('Too many data rows (maximum 5000).');
 const invalid=rows.findIndex((r,i)=>i>0&&r.length!==headers.length);
 if(invalid!==-1)throw new Error('CSV row '+(invalid+1)+' has a different number of columns.');
 return {delimiter:delim,headers,rows:rows.slice(1)};
}
function suggestMapping(headers){let used=new Set(), mapping={}; for(let field of FIELDS){let idx=headers.findIndex((h,i)=>!used.has(i)&&SYNONYMS[field].includes(normalize(h)));if(idx>=0){mapping[field]=idx;used.add(idx)}else mapping[field]=-1};return mapping}
function slugify(s){return String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,120)}
function csvEsc(s){const x=String(s??'');return /[",\n\r]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x}
function toCSV(data){return data.map(row=>row.map(csvEsc).join(',')).join('\n')+'\n'}
// We block formula-like input in Shopify exports rather than silently mutate product data.
// Reports may include user-controlled values, so guard them separately before spreadsheet export.
function hasFormulaPrefix(value){return /^[\s\u200b-\u200d\ufeff]*[=+\-@＝＋－＠]/u.test(String(value??''))}
function safeReportCSV(data){return toCSV(data.map(row=>row.map(value=>hasFormulaPrefix(value)?'[unsafe formula-like content redacted]':String(value??''))))}
function hasMarkup(value){return /[<>]/.test(String(value??''))}

function variantColumns(headers){
 return headers.map((raw,i)=>({raw,i,name:normalize(raw)})).filter(({name})=>
  /^(?:size|colour|color|variant(?:\s+.*)?|option(?:\s*[123])?(?:\s+(?:name|value|values|linkedto))?)$/.test(name)
 );
}
function describeDuplicate(prev,current,firstRow){
 const exactlySame=prev.raw.length===current.raw.length && prev.raw.every((v,i)=>String(v).trim()===String(current.raw[i]).trim());
 if(exactlySame)return {
  category:'exact-duplicate',
  message:`This row duplicates row ${firstRow} exactly (handle: ${current.handle}).`,
  action:`Remove the accidental duplicate from the source CSV; keep only one row for this product. Verify before deleting anything.`
 };
 if(prev.title!==current.title)return {
  category:'handle-collision',
  message:`Different titles share the same URL handle '${current.handle}' (row ${firstRow}: '${prev.title}', this row: '${current.title}').`,
  action:'If these are separate products, give each a unique URL handle. If they belong to one product, use a variant-capable tool instead.'
 };
 if(prev.sku===current.sku && prev.image!==current.image && prev.image && current.image)return {
  category:'additional-image-candidate',
  message:`The same product and SKU use handle '${current.handle}' with different image URLs (first seen at row ${firstRow}). This may be an extra image row.`,
  action:'Multiple-image galleries are not supported. Keep one image row here or switch to an importer that supports multiple image rows.'
 };
 if(prev.sku!==current.sku)return {
  category:'variant-candidate',
  message:`Same product title/handle but different SKUs ('${prev.sku||'(blank)'}' vs '${current.sku||'(blank)'}'; first seen at row ${firstRow}). These could be color/size variants OR separate products.`,
  action:'Check the actual product relationship. Use a variant-capable importer for variants; for independent products, assign unique URL handles.'
 };
 return {
  category:'repeated-handle',
  message:`Multiple different rows share the handle '${current.handle}' (first seen at row ${firstRow}). The relationship cannot be determined safely.`,
  action:'Compare rows manually. Use a unique handle for independent products; use a variant/image-capable tool for related rows.'
 };
}
function isReservedOrPrivateImageHost(hostname){
 const h=String(hostname||'').toLowerCase().replace(/\.$/,'');
 if(!h || h==='localhost'||h.endsWith('.localhost')||h==='example.com'||h.endsWith('.example.com')||h==='example.org'||h.endsWith('.example.org')||h==='example.net'||h.endsWith('.example.net')||h.endsWith('.test')||h.endsWith('.invalid')||h.endsWith('.example')||h==='0.0.0.0'||h==='[::1]')return true;
 const parts=h.split('.');
 if(parts.length===4&&parts.every(x=>/^\d+$/.test(x)&&+x>=0&&+x<=255)){
  const a=+parts[0],b=+parts[1];
  return a===0||a===10||a===127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a>=224;
 }
 return h.startsWith('[fc')||h.startsWith('[fd')||h.startsWith('[fe80:');
}
function inspectImageURL(raw){
 const input=String(raw||'').trim();
 if(!input)return {kind:'missing',reason:'No image URL provided.'};
 if(/[\\\r\n\t]/.test(input))return {kind:'invalid',reason:'The link contains a backslash or control character.'};
 let u;
 try{u=new URL(input)}catch(e){return {kind:'invalid',reason:'Not an absolute URL.'}}
 if(u.protocol!=='https:')return {kind:'invalid',reason:'Only HTTPS image links can be included.'};
 if(u.username||u.password)return {kind:'invalid',reason:'URLs containing usernames or passwords are not supported.'};
 if(isReservedOrPrivateImageHost(u.hostname))return {kind:'placeholder',reason:'This host is reserved for examples or is a local/private address.'};
 if(!u.hostname.includes('.') && !u.hostname.includes(':'))return {kind:'invalid',reason:'A public host name is required.'};
 return {kind:'unverified',reason:'URL format looks acceptable; reachability and image type are NOT checked.'};
}
function convert(parsed,mapping,options={}){
 const imageMode=options.imageMode==='include'?'include':'omit';

 const issues=[],out=[],handles=new Map(),skus=new Map();let imagesIncluded=0,imagesOmitted=0;
 if(!parsed||!parsed.rows||!parsed.headers)throw new Error('No parsed CSV');
 const add=(row,field,type,message,action='',category='validation')=>issues.push({row,field,type,message,action,category});
 for(const field of ['Title','Price']){
  if(!Number.isInteger(mapping?.[field])||mapping[field]<0||mapping[field]>=parsed.headers.length){
   add('—',field,'error',`Required ${field} column is not mapped.`,`Select the supplier column containing ${field==='Price'?'the retail selling price (not unit cost)':'product titles'}.`,'mapping');
  }
 }
 const suspected=variantColumns(parsed.headers);
 for(let i=0;i<parsed.rows.length;i++){
  const src=parsed.rows[i];
  const get=f=>Number.isInteger(mapping?.[f])&&mapping[f]>=0&&mapping[f]<src.length?String(src[mapping[f]]??'').trim():'';
  const title=get('Title'),price=get('Price'),handle=get('URL handle')||slugify(title),sku=get('SKU'),image=get('Product image URL'),vendor=get('Vendor'),desc=get('Description');
  const rowNo=i+2;
  if(!title)add(rowNo,'Title','error','Product title is missing.','Enter a title in the mapped source column.','missing-title');
  if(!handle)add(rowNo,'URL handle','error','Cannot derive a URL handle from this title.','Map an explicit ASCII URL handle for this row.','invalid-handle');
  else if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle))add(rowNo,'URL handle','error',`Invalid URL handle '${handle}'.`,'Use lowercase English letters, digits and hyphens (for example: soft-tee-red).','invalid-handle');
  const current={raw:src,title,price,handle,sku,image};
  if(handles.has(handle)&&handle){
   const first=handles.get(handle),detail=describeDuplicate(first.record,current,first.row);
   add(rowNo,'URL handle','error',detail.message,detail.action,detail.category);
  } else if(handle)handles.set(handle,{row:rowNo,record:current});
  if(!price)add(rowNo,'Price','error','Blank selling price; Shopify may otherwise default to 0.00.','Enter the retail selling price. Never map supplier unit cost as Price.','missing-price');
  else if(!/^\d+(?:\.\d{1,2})?$/.test(price))add(rowNo,'Price','error',`Invalid selling price '${price}'.`,'Use a nonnegative number with up to two decimal places and no currency symbol (for example: 19.99).','invalid-price');
  else if(Number(price)===0)add(rowNo,'Price','warning','Selling price is 0.00.','Check that the item is intentionally free.','zero-price');
  if(sku&&skus.has(sku)){
   add(rowNo,'SKU','error',`SKU '${sku}' is repeated (first seen at row ${skus.get(sku)}).`,'Confirm if this is a duplicate, variant, or supplier error; do not remove a legitimate variant automatically.','duplicate-sku');
  }else if(sku)skus.set(sku,rowNo);
  if(!sku)add(rowNo,'SKU','warning','SKU is empty (optional, but makes later reconciliation harder).','Provide a supplier SKU when available.','missing-sku');
  let exportImage='';
  if(imageMode==='omit'){
   if(image){imagesOmitted++;
    add(rowNo,'Product image URL','warning','Image link excluded by Safe mode. The product can be created without an image.',
      'After importing, upload the real image in Shopify Admin → Products → Media; or choose Include image URLs and supply public HTTPS direct-image links.','image-omitted');
   }
  } else if(image){
   const inspection=inspectImageURL(image);
   if(inspection.kind==='invalid'){
    add(rowNo,'Product image URL','error',`Image link cannot be included: ${inspection.reason}`,
      'Replace the link with a public HTTPS direct-image URL, leave the image cell blank, or switch to Safe mode to omit all images.','invalid-image');
   }else if(inspection.kind==='placeholder'){
    add(rowNo,'Product image URL','error',`This is not a usable public image link: ${inspection.reason}`,
      'Replace the sample/private URL with a real public HTTPS image URL, clear the image cell, or select Safe mode to omit all images.','placeholder-image');
   }else{
    exportImage=image;imagesIncluded++;
    add(rowNo,'Product image URL','warning','Image URL retained but its availability and content have NOT been checked.',
      'Confirm that this is a direct, publicly accessible image. Shopify downloads it during import and may reject blocked or missing files.','image-unverified');
   }
  }
  for(const [field,value] of [['Title',title],['Vendor',vendor],['Description',desc],['SKU',sku]]){
   if(hasFormulaPrefix(value))add(rowNo,field,'error','Potential spreadsheet formula prefix detected.','Remove the leading formula character (=, +, -, @ or their full-width equivalents) before export.','formula');
   if(hasMarkup(value))add(rowNo,field,'error','HTML-like markup detected in a mapped text field.','Use plain text only. This MVP does not sanitize or import HTML product descriptions.','markup');
  }
  const active=suspected.filter(x=>String(src[x.i]??'').trim()!=='');
  if(active.length){
   const shown=active.slice(0,5).map(x=>`${x.raw}='${String(src[x.i]).trim().slice(0,45)}'`).join('; ');
   add(rowNo,'Variants','error',`Source columns contain possible option/variant data: ${shown}${active.length>5?'; …':''}.`,
    'Check whether these are size/color choices or other product attributes. If they represent variants, use a variant-capable import tool. This MVP cannot safely convert them.','unsupported-option-columns');
  }
  out.push([title,handle,desc,vendor,sku,'Title','Default Title',price,exportImage,'draft','false']);
 }
 return {headers:HEADERS,rows:out,issues,errors:issues.filter(i=>i.type==='error').length,warnings:issues.filter(i=>i.type==='warning').length,imageMode,imagesIncluded,imagesOmitted};
}

root.ShopCSVCore={FIELDS,HEADERS,parseCSV,suggestMapping,convert,toCSV,safeReportCSV,hasFormulaPrefix,hasMarkup,slugify,delimiterFromText,variantColumns,describeDuplicate,inspectImageURL,isReservedOrPrivateImageHost};
if(typeof module!=='undefined' && module.exports)module.exports=root.ShopCSVCore;
})(typeof window!=='undefined'?window:globalThis);
