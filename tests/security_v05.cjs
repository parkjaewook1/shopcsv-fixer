const { test } = require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const C = require('../ShopCSV_Fixer_v0_5_Site_Deploy/assets/core.js');
const siteDirectory = path.resolve(__dirname, '../ShopCSV_Fixer_v0_5_Site_Deploy');
function check(title,desc='Normal',price='10.50'){
  const p=C.parseCSV('Title,Price,Description,SKU\n"'+title.replace(/"/g,'""')+'",'+price+',"'+desc.replace(/"/g,'""')+'",ABC');
  return C.convert(p,C.suggestMapping(p.headers));
}
test('formula in title blocked even with leading whitespace',()=>assert.ok(check('  =2+2').issues.some(x=>x.category==='formula')));
test('minus prefix in SKU blocked',()=>{const p=C.parseCSV('Title,Price,SKU\nBag,10,-1+2');assert.ok(C.convert(p,C.suggestMapping(p.headers)).issues.some(x=>x.category==='formula'&&x.field==='SKU'))});
test('full-width formula prefix blocked',()=>assert.ok(check('＝SUM(1)').issues.some(x=>x.category==='formula')));
test('HTML in description blocked',()=>assert.ok(check('Bag','<img src=x onerror=alert(1)>').issues.some(x=>x.category==='markup')));
test('HTML-like title blocked',()=>assert.ok(check('<script>alert(1)</script>').issues.some(x=>x.category==='markup')));
test('ordinary title with numbers and punctuation remains allowed',()=>assert.equal(check('10oz Mug — White','Stoneware', '19.00').errors,0));
test('HTML-free description remains allowed',()=>assert.equal(check('Natural Cotton Tote','Contains 100% cotton, great for travel.').errors,0));
test('report exports neutralize formula-starting cells without changing Shopify text',()=>{
  const rep=C.safeReportCSV([['Row','Message'],['2','=HYPERLINK("evil","click")']]);
  assert.ok(!rep.includes('=HYPERLINK'));assert.match(rep,/unsafe formula-like content redacted/);
});
test('UTF-8 CSV parser has a 5MB text limit',()=>assert.throws(()=>C.parseCSV('x'.repeat(5*1024*1024+1)),/5MB/));
test('public HTML uses local scripts and no inline script or style attributes',()=>{
  for(const f of ['index.html','tool.html','feedback.html','privacy.html']){
    const html=fs.readFileSync(path.join(siteDirectory,f),'utf8');
    assert.doesNotMatch(html,/<script(?![^>]*src=)/i);assert.doesNotMatch(html,/\sstyle=/i);
    for (const [, source] of html.matchAll(/<script\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) {
      assert.match(source, /^assets\/[\w.-]+\.js$/);
    }
  }
});
test('Cloudflare CSP allows only the configured analytics origins and keeps resource restrictions', () => {
  const headers = fs.readFileSync(path.join(siteDirectory, '_headers'), 'utf8');
  const rules = headers.split(/\r?\n/).filter(line => line.trim() && !line.trimStart().startsWith('#'));
  assert.deepEqual(rules.filter(line => !/^\s/.test(line)), ['/*']);

  const policies = rules
    .filter(line => /^\s+content-security-policy\s*:/i.test(line))
    .map(line => line.slice(line.indexOf(':') + 1));
  assert.equal(policies.length, 1, 'Expected one enforced policy for the catch-all rule');

  const directives = new Map();
  for (const directive of policies[0].split(';').map(value => value.trim()).filter(Boolean)) {
    const [name, ...sources] = directive.split(/\s+/);
    const key = name.toLowerCase();
    assert.equal(directives.has(key), false, 'CSP directives must be unique');
    directives.set(key, sources.sort());
  }

  // Exact source lists make additional origins, wildcards, and script overrides fail.
  assert.deepEqual(directives, new Map([
    ['default-src', ["'none'"]],
    ['base-uri', ["'none'"]],
    ['frame-ancestors', ["'none'"]],
    ['object-src', ["'none'"]],
    ['form-action', ["'none'"]],
    ['script-src', ["'self'", 'https://static.cloudflareinsights.com']],
    ['style-src', ["'self'"]],
    ['img-src', ["'self'", 'data:']],
    ['connect-src', ['https://cloudflareinsights.com']],
    ['font-src', ["'none'"]],
    ['upgrade-insecure-requests', []],
  ]));
});
