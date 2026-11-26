const { test } = require('node:test');
const assert=require('node:assert/strict');
const C=require('../ShopCSV_Fixer_v0_5_Site_Deploy/assets/core.js'),R=require('../ShopCSV_Fixer_v0_5_Site_Deploy/assets/repeat.js');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

function readFixture(name) {
  return readFileSync(join(__dirname, 'samples', 'batch_v04', name), 'utf8');
}

const a = readFixture('supplier_week_1.csv');
const b = readFixture('supplier_week_2_reordered.csv');
const duplicateHandle = readFixture('supplier_duplicate_handle.csv');
const headers=C.parseCSV(a).headers,mapping=C.suggestMapping(headers);
test('header signature ignores column order',()=>assert.equal(R.compatible(C.parseCSV(a).headers,C.parseCSV(b).headers),true));
test('header profile does not keep product row data',()=>{let p=R.makeProfile('Papers',headers,mapping);assert.doesNotMatch(JSON.stringify(p),/Blue Notebook|NOTE-01/)});
test('mapping restored when header order changes',()=>{let p=R.makeProfile('Papers',headers,mapping),x=C.parseCSV(b);let m=R.applyProfile(p,x.headers);assert.equal(x.rows[0][m.Title],'Red Notebook');assert.equal(x.rows[0][m.Price],'18.50')});
test('required mappings enforced',()=>assert.throws(()=>R.makeProfile('x',headers,{Title:0,Price:-1}),/both Title and retail Price/));
test('mismatched headers rejected',()=>assert.throws(()=>R.applyProfile(R.makeProfile('x',headers,mapping),['Other','Title']),/different/));
test('batch converts reordered files with correct prices',()=>{const r=R.batchConvert([{name:'one.csv',text:a},{name:'two.csv',text:b}],headers,mapping);assert.equal(r.ready,true);assert.equal(r.files[1].result.rows[0][7],'18.50');assert.equal(r.files[1].result.rows[0][9],'draft')});
test('duplicate handles across files block batch',()=>{const r=R.batchConvert([{name:'one.csv',text:a},{name:'two.csv',text:duplicateHandle}],headers,mapping);assert.equal(r.ready,false);assert.ok(r.files[1].issues.some(x=>x.category==='cross-file-handle'))});
test('duplicate sku across files block batch',()=>{const r=R.batchConvert([{name:'one.csv',text:a},{name:'two.csv',text:b.replace('NOTE-02','NOTE-01')}],headers,mapping);assert.equal(r.ready,false);assert.ok(r.files[1].issues.some(x=>x.category==='cross-file-sku'))});
test('header differences block batch',()=>{const r=R.batchConvert([{name:'one.csv',text:a},{name:'other.csv',text:'Title,Price\nCup,4'}],headers,mapping);assert.equal(r.ready,false);assert.match(r.files[1].issues[0].message,/different columns/)});
test('unsafe file path sanitized for ZIP',()=>{const r=R.makeZip([{name:'../danger.csv',content:'ok'}]);assert.ok(r.length>22);assert.ok(!Buffer.from(r).includes(Buffer.from('../danger.csv')))});
test('ZIP produces local and central entries',()=>{const r=R.makeZip([{name:'a.csv',content:'\ufeffa,b\n1,2\n'},{name:'b.csv',content:'x,y\n'}]);assert.equal(new DataView(r.buffer).getUint32(0,true),0x04034b50);assert.equal(new DataView(r.buffer).getUint32(r.length-22,true),0x06054b50)});
test('over-size and too many inputs rejected', () => {
  const oversized = R.batchConvert(
    [{ name: 'oversized.csv', text: 'x'.repeat(5 * 1024 * 1024 + 1) }],
    headers,
    mapping
  );
  assert.equal(oversized.ready, false);
  assert.match(oversized.files[0].issues[0].message, /5MB limit/);

  const tooMany = Array.from({ length: 11 }, (_, index) => ({ name: `${index}.csv`, text: a }));
  assert.throws(() => R.batchConvert(tooMany, headers, mapping), /1–10/);
});
