(function(){
'use strict';
const C=window.ShopCSVCore;
const R=window.ShopCSVRepeat;
const $=id=>document.getElementById(id);
let data=null,latest=null,mapping={},fileName='',batchFiles=[],batchResult=null;
const PROFILE_KEY='shopcsv-fixer-v04-named-mappings';
const sampleClean='Item No.,Product Name,Retail Price,Brand,Image Link,Description\nV3-TS-001,Canvas Tote V3 Test,18.00,Sample Studio,,"Everyday tote, cotton"\nV3-TS-002,Desk Lamp V3 Test,42.50,Sample Studio,,"Modern desk lamp"';
const sampleIssues='Item No.,Product Name,Retail Price,Brand,Image Link,Description\nTS-003,Bottle,0.00,Sample Studio,not-a-link,Reusable bottle\nTS-004,Desk Lamp,$42.50,Sample Studio,https://example.com/lamp.jpg,Modern desk lamp';
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function notify(msg,err){const n=$('notice');n.textContent=msg;n.className='notice'+(err?' danger':'');n.hidden=false;}
function loadProfiles(){try{const p=JSON.parse(localStorage.getItem(PROFILE_KEY)||'[]');return Array.isArray(p)?p.filter(x=>x&&x.name&&Array.isArray(x.headers)&&x.fields).slice(0,40):[]}catch(e){return []}}
function refreshProfiles(){const selector=$('profiles');selector.innerHTML='<option value="">Choose saved profile</option>';if(!data)return;for(const p of loadProfiles()){if(R.compatible(p.headers,data.headers)){const o=document.createElement('option');o.value=p.name;o.textContent=p.name;selector.append(o)}}}
function updateMapControls(){for(const f of C.FIELDS){const s=document.querySelector(`select[data-field="${f}"]`);if(s)s.value=String(mapping[f]??-1)}}
function applyToCurrentProfile(p){mapping=R.applyProfile(p,data.headers);updateMapControls();renderPending();}
function clearBatch(){batchResult=null;$('batch-zip').disabled=true;$('batch-results').innerHTML='';}

function loadText(text,name){try{data=C.parseCSV(text);fileName=name||'sample.csv';mapping=C.suggestMapping(data.headers);latest=null;
  $('input-info').textContent=`${fileName} • ${data.rows.length} rows • ${data.headers.length} columns`; $('step-map').hidden=false;$('mapping-list').innerHTML='';refreshProfiles();clearBatch();$('step-batch').hidden=false;
  for(const f of C.FIELDS){const wrap=document.createElement('label');wrap.className='map-row';const title=document.createElement('span');title.textContent=f+(f==='Title'||f==='Price'?' *':'');const select=document.createElement('select');select.dataset.field=f;select.append(new Option('Not mapped','-1'));data.headers.forEach((h,i)=>select.append(new Option(h,String(i))));select.value=String(mapping[f]);select.addEventListener('change',()=>{mapping[f]=Number(select.value);latest=null;renderPending();clearBatch()});wrap.append(title,select);$('mapping-list').append(wrap)}
  renderPending();notify('CSV loaded locally. No file is uploaded to a server.');
}catch(e){notify(e.message,true);$('step-map').hidden=true;$('step-results').hidden=true;data=null}}
function renderPending(){$('step-results').hidden=true;$('download').disabled=true;$('result').textContent='Select your columns, then run validation.'}
function validate(){if(!data)return;latest=C.convert(data,mapping,{imageMode:document.querySelector('input[name="image-mode"]:checked')?.value||'omit'});$('step-results').hidden=false;
  $('processed').textContent=String(data.rows.length);$('errors').textContent=String(latest.errors);$('warnings').textContent=String(latest.warnings);$('images-export').textContent=String(latest.imagesIncluded);$('image-summary').textContent=latest.imageMode==='omit'?'Safe mode: image URLs excluded. Add images in Shopify after import.':`Include mode: ${latest.imagesIncluded} unverified HTTPS image URL(s) retained. Shopify might fail to download them.`;
  const list=$('issues');list.innerHTML='';const items=latest.issues.slice(0,80);if(!items.length)list.innerHTML='<div class="issue ok">No issues were found by the MVP checks.</div>';
  for(let item of items){const row=document.createElement('div');row.className='issue '+item.type;row.innerHTML=`<span class="tag ${item.type}">${item.type.toUpperCase()}</span><span><b>${item.row==='—'?'Mapping':`Row ${esc(item.row)}`} · ${esc(item.field)}</b><small>${esc(item.message)}</small>${item.action?`<span class="issue-fix"><b>How to fix:</b> ${esc(item.action)}</span>`:''}</span>`;list.append(row)}
  if(latest.issues.length>80){const note=document.createElement('p');note.className='muted';note.textContent=`Showing 80 of ${latest.issues.length} issues.`;list.append(note)}
  const ready=latest.errors===0; $('result').textContent=ready?'Checks passed. Review the preview, then download a draft-only new-product CSV.':'Export blocked until all red errors are resolved.'; $('download').disabled=!ready;
  const th=latest.headers.map(h=>`<th>${esc(h)}</th>`).join('');let tr=latest.rows.slice(0,4).map(r=>'<tr>'+r.map(c=>`<td>${esc(c)}</td>`).join('')+'</tr>').join('');$('preview').innerHTML='<table><thead><tr>'+th+'</tr></thead><tbody>'+tr+'</tbody></table>';
}
async function readUTF8(file){const buffer=await file.arrayBuffer();try{return new TextDecoder('utf-8',{fatal:true}).decode(buffer)}catch(e){throw new Error('This file is not valid UTF-8. Re-save the CSV as UTF-8 before continuing.')}}
function downloadBlob(name,b){const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500)}
function downloadText(name,txt,type){downloadBlob(name,new Blob([txt],{type:type||'text/plain;charset=utf-8'}));}
$('demo').addEventListener('click',()=>loadText(sampleClean,'sample_clean.csv'));
$('demo-issues').addEventListener('click',()=>loadText(sampleIssues,'sample_issues.csv'));
$('upload').addEventListener('change',async(e)=>{const f=e.target.files?.[0];if(!f)return;if(f.size>5*1024*1024){notify('File is larger than 5MB. Split your CSV first.',true);return}try{const t=await readUTF8(f);loadText(t,f.name)}catch(err){notify(err.message,true)}});
$('validate').addEventListener('click',validate);
document.querySelectorAll('input[name="image-mode"]').forEach(el=>el.addEventListener('change',()=>{if(data){latest=null;renderPending();clearBatch()}}));
$('save-mapping').addEventListener('click',()=>{if(!data)return;try{
 const p=R.makeProfile($('profile-name').value,data.headers,mapping);const arr=loadProfiles();
 const ix=arr.findIndex(x=>x.name.toLowerCase()===p.name.toLowerCase());if(ix>=0)arr.splice(ix,1);
 arr.push(p);if(arr.length>40)arr.shift();localStorage.setItem(PROFILE_KEY,JSON.stringify(arr));refreshProfiles();$('profiles').value=p.name;
 notify('Saved mapping profile "'+p.name+'" in this browser. Column names only, never product rows.');
 }catch(e){notify(e.message,true)}});
$('restore-mapping').addEventListener('click',()=>{if(!data)return;try{
 const p=loadProfiles().find(x=>x.name===$('profiles').value);if(!p)throw new Error('Select a compatible saved profile first.');
 applyToCurrentProfile(p);$('profile-name').value=p.name;clearBatch();notify('Applied profile "'+p.name+'". Check mapping before exporting.');
 }catch(e){notify(e.message,true)}});
$('delete-mapping').addEventListener('click',()=>{const name=$('profiles').value;if(!name)return notify('Select a profile to delete.',true);
 try{const keep=loadProfiles().filter(x=>x.name!==name);localStorage.setItem(PROFILE_KEY,JSON.stringify(keep));refreshProfiles();$('profile-name').value='';notify('Deleted profile "'+name+'" from this browser.');}catch(e){notify(e.message,true)}});
$('profiles').addEventListener('change',()=>{if($('profiles').value)$('profile-name').value=$('profiles').value});
$('batch-files').addEventListener('change',(e)=>{batchFiles=[...(e.target.files||[])];clearBatch();$('batch-selected').textContent=batchFiles.length+' file(s) selected (max 10, 20MB total).'});
$('batch-run').addEventListener('click',async()=>{if(!data)return notify('Load a reference supplier CSV first.',true);
 if(!batchFiles.length)return notify('Choose batch CSV files first.',true);
 if(batchFiles.length>10)return notify('Choose at most 10 CSV files.',true);
 if(batchFiles.reduce((n,f)=>n+f.size,0)>20*1024*1024)return notify('Batch exceeds 20MB.',true);
 $('batch-run').disabled=true;clearBatch();
 try{
  const inputs=[];for(const file of batchFiles){inputs.push({name:file.name,text:await readUTF8(file)})}
  batchResult=R.batchConvert(inputs,data.headers,mapping,{imageMode:document.querySelector('input[name="image-mode"]:checked')?.value||'omit'});
  const target=$('batch-results');const summary=document.createElement('p');summary.className='status-summary';summary.textContent=batchResult.ready?`All ${batchResult.files.length} files passed. Download the ZIP of draft-only CSVs.`:`Batch export blocked: ${batchResult.errors} error(s), ${batchResult.warnings} warning(s). Fix files and try again.`;target.append(summary);
  for(const item of batchResult.files){const div=document.createElement('div');div.className='batch-row';const heading=document.createElement('b');heading.textContent=item.name;div.append(heading);const stat=document.createElement('span');stat.textContent=`${item.result?.rows.length||0} row(s) · ${item.errors} error(s) · ${item.warnings} warning(s)`;div.append(stat);
   for(const issue of item.issues.filter(x=>x.type==='error').slice(0,3)){const p=document.createElement('p');p.className='muted';p.textContent=`${issue.field}: ${issue.message}`;div.append(p)}target.append(div)}
  $('batch-zip').disabled=!batchResult.ready;
 }catch(e){notify(e.message,true)}finally{$('batch-run').disabled=false}
});
$('batch-zip').addEventListener('click',()=>{if(!batchResult||!batchResult.ready)return;
 try{const names=new Set();const entries=batchResult.files.map((file,i)=>{
  let n='draft_'+file.name.replace(/\.csv$/i,'')+'.csv';if(names.has(n))n='draft_'+(i+1)+'_'+n;names.add(n);
  return {name:n,content:'\uFEFF'+C.toCSV([file.result.headers,...file.result.rows])};
 });
 const zip=R.makeZip(entries);if(zip.length>80*1024*1024)throw new Error('Batch ZIP exceeds 80MB. Split the inputs.');
 downloadBlob('shopcsv_batch_drafts.zip',new Blob([zip],{type:'application/zip'}));notify('Batch ZIP downloaded. Review drafts and test a few products in Shopify first.');
 }catch(e){notify(e.message,true)}});
$('download').addEventListener('click',()=>{if(!latest||latest.errors)return;let csv=C.toCSV([latest.headers,...latest.rows]);let size=new Blob([csv]).size;if(size>15*1024*1024){notify('Shopify product CSV must be smaller than 15MB. Split input.',true);return}downloadText('shopcsv_draft_new_products.csv','\uFEFF'+csv,'text/csv;charset=utf-8');notify('Draft-only CSV downloaded. Test a few products in Shopify first.');});
$('download-report').addEventListener('click',()=>{if(!latest)return;const head=['Row','Level','Category','Field','Message','How to fix'];const rows=latest.issues.map(x=>[x.row,x.type,x.category,x.field,x.message,x.action]);downloadText('shopcsv_validation_report.csv','\uFEFF'+C.safeReportCSV([head,...rows]),'text/csv;charset=utf-8')});
})();
