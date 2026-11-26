const { test } = require('node:test');
const assert=require('node:assert/strict');
const c=require('../ShopCSV_Fixer_v0_5_Site_Deploy/assets/core.js');
const normal='Item No.,Product Name,Retail Price,Brand,Image Link\n001,"Mug, Ceramic",12.50,Studio,https://example.com/mug.jpg\n002,Tray,9.90,Studio,https://example.com/tray.jpg';
const get=()=>{const p=c.parseCSV(normal);return {p,m:c.suggestMapping(p.headers)}};
test('quoted commas and leading zero SKUs',()=>{let {p,m}=get(),r=c.convert(p,m);assert.equal(p.rows[0][1],'Mug, Ceramic');assert.equal(r.rows[0][4],'001');assert.equal(r.errors,0)});
test('draft and unpublished by default',()=>{let {p,m}=get(),r=c.convert(p,m);assert.deepEqual(r.rows[0].slice(-2),['draft','false'])});
test('missing price blocks export',()=>{let {p,m}=get();m.Price=-1;assert.ok(c.convert(p,m).errors>0)});
test('invalid price blocks export',()=>{let {p,m}=get();p.rows[0][2]='$12.50';assert.ok(c.convert(p,m).issues.some(x=>x.field==='Price'&&x.type==='error'))});
test('duplicate SKU blocks export',()=>{let {p,m}=get();p.rows[1][0]='001';assert.ok(c.convert(p,m).issues.some(x=>x.field==='SKU'&&x.type==='error'))});
test('duplicate title implies unsupported variants',()=>{let {p,m}=get();p.rows[1][1]='Mug, Ceramic';assert.ok(c.convert(p,m).issues.some(x=>x.field==='URL handle'&&x.type==='error'))});
test('variant columns block export',()=>{let {p,m}=get();p.headers.push('Color');p.rows.forEach(r=>r.push('Blue'));assert.ok(c.convert(p,m).issues.some(x=>x.field==='Variants'&&x.type==='error'))});
test('bad image URL blocks export',()=>{let {p,m}=get();p.rows[0][4]='http://example.com/a.jpg';assert.ok(c.convert(p,m,{imageMode:'include'}).errors>0)});
test('CSV roundtrip quoted newline & BOM',()=>{let str=c.toCSV([['Title','Description'],['A','two\nlines, "quoted"']]);let p=c.parseCSV('\uFEFF'+str);assert.equal(p.rows[0][1],'two\nlines, "quoted"')});
test('tab-delimited imports',()=>{let p=c.parseCSV('Product Name\tPrice\nA\t10.99');assert.equal(p.rows[0][0],'A')});
test('row column mismatches blocked',()=>assert.throws(()=>c.parseCSV('A,B\n1'),/different number/));
test('unclosed quotes rejected',()=>assert.throws(()=>c.parseCSV('A,B\n"x,y'),/Unclosed/));
test('zero price triggers warning',()=>{let {p,m}=get();p.rows[0][2]='0';assert.ok(c.convert(p,m).issues.some(x=>x.type==='warning'&&x.field==='Price'))});
test('unit cost not automatically price',()=>{let p=c.parseCSV('Product Name,Unit Cost\nShirt,12.00');assert.equal(c.suggestMapping(p.headers).Price,-1)});
test('formula injection blocks',()=>{let {p,m}=get();p.rows[0][1]='=HYPERLINK("x","x")';assert.ok(c.convert(p,m).issues.some(x=>x.field==='Title'&&x.type==='error'))});
// v0.1 suite completed; run the extended v0.2 suite below.
// v0.2: actionable, non-destructive validation cases.
function check(csv){const p=c.parseCSV(csv),m=c.suggestMapping(p.headers);return c.convert(p,m)}
test('exact duplicate row gets a specific explanation and repair action',()=>{
 const r=check('SKU,Product Name,Price\nA1,Shirt,10.00\nA1,Shirt,10.00');
 const x=r.issues.find(i=>i.category==='exact-duplicate');assert.ok(x);assert.match(x.action,/duplicate/i);
});
test('separate titles sharing explicit handle flagged as handle collision',()=>{
 const r=check('SKU,Product Name,Price,URL handle\nA1,Red Shirt,10.00,shirt\nA2,Blue Shirt,12.00,shirt');
 const x=r.issues.find(i=>i.category==='handle-collision');assert.ok(x);assert.match(x.action,/unique URL handle/i);
});
test('one title with different SKUs recognized as variant candidate not proven variant',()=>{
 const r=check('SKU,Product Name,Price\nRED-1,Soft Tee,19\nBLU-2,Soft Tee,19');
 const x=r.issues.find(i=>i.category==='variant-candidate');assert.ok(x);assert.match(x.message,/could be/i);assert.equal(r.errors>0,true);
});
test('different image URLs for same SKU recognized as extra-image candidate',()=>{
 const r=check('SKU,Product Name,Price,Image Link\nA1,Shirt,12,https://images.test/1.jpg\nA1,Shirt,12,https://images.test/2.jpg');
 assert.ok(r.issues.some(x=>x.category==='additional-image-candidate'));
});
test('support is blocked when Color column populated and includes exact source column/value',()=>{
 const r=check('SKU,Product Name,Price,Color\nA1,Shirt,12,Red');
 const x=r.issues.find(x=>x.category==='unsupported-option-columns');assert.ok(x);assert.match(x.message,/Color='Red'/);
});
test('no variant blocker for blank optional Color',()=>{
 const r=check('SKU,Product Name,Price,Color\nA1,Shirt,12,');
 assert.equal(r.issues.some(x=>x.category==='unsupported-option-columns'),false);
});
test('variant Option1 Value column triggers source-based explanation',()=>{
 const r=check('SKU,Product Name,Price,Option1 Value\nA1,Shirt,12,Large');
 assert.ok(r.issues.some(x=>/Option1 Value='Large'/.test(x.message)));
});
test('variant SKU column triggers unsupported option detection',()=>{
 const r=check('SKU,Product Name,Price,Variant SKU\nA1,Shirt,12,A1-R');
 assert.ok(r.issues.some(x=>x.category==='unsupported-option-columns'));
});
test('custom option field without value is not blocked',()=>{
 const r=check('SKU,Product Name,Price,Size\nA1,Shirt,12,');assert.equal(r.errors,0);
});
test('include mode rejects example.com as non-real image host',()=>{
 const p=c.parseCSV('SKU,Product Name,Price,Image Link\nA1,Shirt,12,https://example.com/test.jpg'),m=c.suggestMapping(p.headers);
 const r=c.convert(p,m,{imageMode:'include'});assert.ok(r.errors>0);assert.ok(r.issues.some(x=>x.category==='placeholder-image'));
});
test('include mode labels external HTTPS image URL as unverified',()=>{
 const p=c.parseCSV('SKU,Product Name,Price,Image Link\nA1,Shirt,12,https://cdn.shopify.com/s/files/1/0000/0000/files/image.jpg'),m=c.suggestMapping(p.headers);
 const r=c.convert(p,m,{imageMode:'include'});assert.equal(r.errors,0);assert.ok(r.issues.some(x=>x.category==='image-unverified'));assert.equal(r.rows[0][8],'https://cdn.shopify.com/s/files/1/0000/0000/files/image.jpg');
});
test('mapped required column missing is actionable',()=>{
 const p=c.parseCSV('SKU,Title\nA1,Shirt'),m=c.suggestMapping(p.headers); const r=c.convert(p,m);
 assert.ok(r.issues.some(x=>x.category==='mapping' && /retail selling price/.test(x.action)));
});
test('all generated headers match documented contemporary field spellings',()=>{
 const list=['Title','URL handle','Description','Vendor','SKU','Option1 name','Option1 value','Price','Product image URL','Status','Published on online store'];
 assert.deepEqual(c.HEADERS,list);
});
test('all generated rows remain unpublished draft',()=>{
 const r=check('SKU,Product Name,Price\nA1,Shirt,10\nA2,Bag,20');
 for(const row of r.rows){assert.equal(row[r.headers.indexOf('Status')],'draft');assert.equal(row[r.headers.indexOf('Published on online store')],'false')}
});
test('issue objects contain category, repair action for blockers',()=>{
 const r=check('SKU,Product Name,Price\nA1,Shirt,$10');
 for(const i of r.issues.filter(i=>i.type==='error')){assert.ok(i.category);assert.ok(i.action)}
});
test('when two distinct products create identical title-based handles, export is blocked',()=>{
 const r=check('SKU,Product Name,Price\nA1,Summer Shirt,9\nA2,Summer Shirt,10');
 assert.ok(r.issues.some(x=>x.field==='URL handle'));assert.ok(r.errors>0);
});
test('CSV report can contain repair actions and commas without corruption',()=>{
 const r=check('SKU,Product Name,Price\nA1,Shirt,$10');
 const rows=[['Row','Level','Category','Field','Message','How to fix'],...r.issues.map(x=>[x.row,x.type,x.category,x.field,x.message,x.action])];
 const result=c.parseCSV(c.toCSV(rows));assert.equal(result.rows.length,r.issues.length);assert.equal(result.rows[0].length,6);
});

// v0.3: image-safe CSV export & guardrails
const ic=(images,mode)=>{const p=c.parseCSV('Item No.,Product Name,Retail Price,Image Link\nAA,Canvas Tote,18.00,'+images),m=c.suggestMapping(p.headers);return c.convert(p,m,mode?{imageMode:mode}:undefined)};
test('safe mode default omits link without blocking product',()=>{
 const r=ic('https://example.com/tote.jpg');assert.equal(r.errors,0);assert.equal(r.rows[0][8],'');assert.equal(r.imagesOmitted,1);assert.ok(r.issues.some(i=>i.category==='image-omitted'));
});
test('safe mode also omits malformed image URL and does not block export',()=>{
 const r=ic('not-a-link','omit');assert.equal(r.errors,0);assert.equal(r.rows[0][8],'');assert.equal(r.imagesIncluded,0);
});
test('missing image URL is allowed with no image-related warning',()=>{
 const r=ic('');assert.equal(r.errors,0);assert.equal(r.warnings,0);assert.equal(r.rows[0][8],'');
});
test('include mode missing image link still allowed',()=>{
 const r=ic('','include');assert.equal(r.errors,0);assert.equal(r.warnings,0);assert.equal(r.rows[0][8],'');
});
test('include mode blocks HTTP links, export image remains blank',()=>{
 const r=ic('http://some-public-site.net/p.jpg','include');assert.ok(r.errors>0);assert.equal(r.rows[0][8],'');assert.ok(r.issues.some(i=>i.category==='invalid-image'));
});
test('include mode blocks .test and .invalid placeholder hosts',()=>{
 for(const host of ['images.test','example.invalid','example.com','foo.example.net']){
  const r=ic(`https://${host}/photo.jpg`,'include');assert.ok(r.errors>0,host);assert.ok(r.issues.some(i=>i.category==='placeholder-image'));
 }
});
test('include mode blocks private IPv4 and localhost',()=>{
 for(const host of ['127.0.0.1','192.168.1.1','10.1.2.3','172.19.0.4','localhost']){
  const r=ic(`https://${host}/photo.jpg`,'include');assert.ok(r.errors>0,host);
 }
});
test('include mode blocks embedded credentials',()=>{
 const imageURL = new URL('https://example.com/img.png');
 imageURL.username = 'fixture-user';
 imageURL.password = 'fixture-password';
 const result = ic(imageURL.href, 'include');
 assert.ok(result.issues.some(issue => issue.category === 'invalid-image' && /usernames or passwords/.test(issue.message)));
});
test('include mode blocks backslashes and newline-escaped corrupt links',()=>{
 const r=ic('https:\\photos.domain.com\\img.jpg','include');assert.ok(r.errors>0);
});
test('include mode supports syntactically valid public HTTPS links but cannot fetch them',()=>{
 const r=ic('https://cdn.shopify.com/s/files/1/0000/0000/files/img.jpg','include');assert.equal(r.errors,0);assert.equal(r.imagesIncluded,1);assert.ok(r.warnings>0);assert.equal(r.rows[0][8],'https://cdn.shopify.com/s/files/1/0000/0000/files/img.jpg');
});
test('image handling never modifies source CSV data',()=>{
 const p=c.parseCSV('Product Name,Price,Image Link\nTote,18.00,https://example.com/a.jpg'),m=c.suggestMapping(p.headers);
 c.convert(p,m);assert.equal(p.rows[0][2],'https://example.com/a.jpg');
});
test('both image modes keep generated products draft and unpublished',()=>{
 for(const mode of ['omit','include']){const r=ic('',mode);assert.deepEqual(r.rows[0].slice(-2),['draft','false']);}
});
test('safe image mode never suppresses unrelated price errors',()=>{
 const p=c.parseCSV('Product Name,Price,Image Link\nTote,not-a-price,https://example.com/a.jpg'),m=c.suggestMapping(p.headers);
 const r=c.convert(p,m);assert.ok(r.errors>0);assert.ok(r.issues.some(i=>i.field==='Price'));
});
