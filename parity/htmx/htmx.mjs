import {chromium, webkit} from 'playwright';
import fs from 'node:fs';
// Usage: node htmx/htmx.mjs <chromium|webkit>, against the fixture in htmx/server.
const base=process.env.HTMX_URL||'http://localhost:8099';
const browser=await ({chromium,webkit}[process.argv[2]||'chromium']).launch();
const root=new URL('../../',import.meta.url).pathname;
const page=await browser.newPage({viewport:{width:1280,height:900}});
page.setDefaultTimeout(7000);
// Stage probes use the normal watcher's current bundle with the unchanged Go fixture.
if(process.env.CURRENT_BUNDLE)await page.route('**/assets/js/shadcn-templ-*.js',route=>{
 const name=fs.readFileSync(root+'components/scripts_bundle.go','utf8').match(/shadcn-templ-[a-f0-9]+\.js/)[0];
 return route.fulfill({path:root+'assets/js/'+name,contentType:'text/javascript'});
});
const posts=[],errors=[];let failures=0;
page.on('request',r=>{if(r.method()==='POST')posts.push(new URL(r.url()).pathname)});
page.on('pageerror',e=>errors.push(e.message));
const check=(ok,label)=>{console.log(`${ok?'PASS':'FAIL'} ${label}`);if(!ok)failures++};
// Every probe component's portal node: a [data-base-ui-portal] that sits in
// its [data-templ-portal] holder until the first open, then in <body> or in
// the portal node of an enclosing portal.
const NAMES=['dropdownmenu','contextmenu','popover','hovercard','tooltip','select','combobox','dialog','nested','alertdialog','sheet','drawer'];
const portalState=()=>page.evaluate((names)=>{
 const contents=names.map(n=>document.getElementById('probe-'+n)).filter(Boolean).map(e=>({e,portal:e.closest('[data-base-ui-portal]')})).filter(x=>x.portal);
 return {templates:document.querySelectorAll('template[data-templ-portal]').length,
  contents:contents.map(({e,portal})=>({id:e.id,inWrapper:!!portal.parentElement?.hasAttribute('data-templ-portal'),inBody:!portal.parentElement?.hasAttribute('data-templ-portal')&&document.body.contains(portal),ownerEmpty:!!portal._templPortalOwner?.isConnected&&portal._templPortalOwner.children.length===0})),
  items:[...document.querySelectorAll('[hx-post]')].map(e=>({name:e.getAttribute('hx-post'),powered:e.hasAttribute('data-htmx-powered')})),
  unique:[...document.querySelectorAll('[id]')].every(e=>document.querySelectorAll(`[id="${CSS.escape(e.id)}"]`).length===1)
 };
},NAMES);
try{
 await page.goto(base);
 // The fixture renders no stylesheet. Popups need theirs (z-50 over Base UI's
 // fixed internal backdrop), as on every real page.
 await page.addStyleTag({url:'/assets/css/output.css'});await page.waitForTimeout(400);
 for(let round=0;round<3;round++){
  if(round){await page.locator('#swap').click();await page.waitForTimeout(500)}
  const state=await portalState();
  check(state.items.length===12,`round ${round}: 12 post elements (${state.items.length})`);
  for(const item of state.items)check(item.powered,`round ${round}: ${item.name} powered`);
  check(state.templates===0,`round ${round}: no portal templates`);
  check(state.contents.length===12,`round ${round}: 12 contents (${state.contents.length})`);
  for(const c of state.contents)check(c.inWrapper&&!c.inBody,`round ${round}: ${c.id} stays in wrapper before open`);
  check(state.unique,`round ${round}: unique ids`);
  const opened=new Set();
  for(const name of ['dropdownmenu','dialog']){
   const hit=`/hit/${name}`,before=posts.filter(x=>x===hit).length;
   await page.locator(`[data-probe="${name}"] > button`).click();
   await page.locator(`[hx-post="${hit}"]`).click();await page.waitForTimeout(200);
   check(posts.filter(x=>x===hit).length===before+1,`round ${round}: ${name} POST exactly once`);
   opened.add('probe-'+name);
   if(name==='dialog'&&round===2){
    const nestedBefore=posts.filter(x=>x==='/hit/nested').length;
    await page.locator('#probe-dialog [data-templ-controls="probe-nested"]').click();
    await page.locator('[hx-post="/hit/nested"]').click();await page.waitForTimeout(200);
    check(posts.filter(x=>x==='/hit/nested').length===nestedBefore+1,`round ${round}: nested POST exactly once`);
    check(await page.locator('#probe-nested').evaluate(e=>{const o=e.closest('[data-base-ui-portal]').querySelector(':scope > [data-slot=dialog-overlay]');return !o||o.hidden||getComputedStyle(o).display==='none'}),`round ${round}: nested backdrop hidden`);
    await page.keyboard.press('Escape');await page.waitForTimeout(300);
    check(await page.locator('#probe-nested').isHidden()&&await page.locator('#probe-dialog').isVisible(),`round ${round}: nested Escape preserves parent`);
    opened.add('probe-nested');
   }
   await page.keyboard.press('Escape');await page.waitForTimeout(300);
   const after=await portalState();
   for(const id of opened){const c=after.contents.find(c=>c.id===id);check(c?.inBody&&c.ownerEmpty,`round ${round}: ${id} portaled with empty connected owner`)}
   check(after.contents.filter(c=>c.inBody).length===opened.size,`round ${round}: no stale body contents (${after.contents.filter(c=>c.inBody).length}/${opened.size})`);
  }
 }
 check(errors.length===0,`page errors: ${JSON.stringify(errors)}`);
}finally{await browser.close()}
console.log('failed expectations:',failures);process.exitCode=failures?1:0;
