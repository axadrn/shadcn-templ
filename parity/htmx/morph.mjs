import {chromium, webkit} from 'playwright';
// Usage: node htmx/morph.mjs <chromium|webkit>, against the fixture in
// htmx/server. Overlays through htmx's innerMorph, the swap Datastar and
// idiomorph do (issue #657): a morph keeps the nodes it can match, so a
// trigger survives while the popup it portaled before comes back re-rendered.
// Every round uses each overlay once, then morphs. After a morph every id is
// unique, no portaled content outlives its declaration, and each overlay
// opens, highlights on hover, posts once and closes.
// BUNDLE=<file> serves another bundle, e.g. main's, to see the test fail.
const base=process.env.HTMX_URL||'http://localhost:8099';
const browser=await ({chromium,webkit}[process.argv[2]||'chromium']).launch();
const page=await browser.newPage({viewport:{width:1280,height:900}});
page.setDefaultTimeout(4000);
if(process.env.BUNDLE)await page.route('**/assets/js/shadcn-templ-*.js',route=>route.fulfill({path:process.env.BUNDLE,contentType:'text/javascript'}));
const posts=[],errors=[];let failures=0;
page.on('request',r=>{if(r.method()==='POST')posts.push(new URL(r.url()).pathname)});
page.on('pageerror',e=>errors.push(e.message));
const check=(ok,label)=>{console.log(`${ok?"PASS":"FAIL"} ${label}`);if(!ok)failures++;return ok};
// open: how the trigger opens it. item: the list item that highlights on
// hover and posts on press. hit: the post button inside the popup.
const OVERLAYS=[
 {name:'dropdownmenu',open:'click',item:'[data-slot="dropdown-menu-item"]'},
 {name:'contextmenu',open:'contextmenu',item:'[data-slot="context-menu-item"]'},
 {name:'popover',open:'click',hit:true},
 {name:'hovercard',open:'hover',hit:true},
 {name:'tooltip',open:'hover'},
 {name:'select',open:'click',item:'[data-slot="select-item"]'},
 {name:'combobox',open:'click',item:'[data-slot="combobox-item"]'},
 {name:'dialog',open:'click',hit:true},
 {name:'alertdialog',open:'click',hit:true},
 {name:'sheet',open:'click',hit:true},
 {name:'drawer',open:'click',hit:true},
];
const visible=(locator,ok=true)=>locator.waitFor({state:ok?'visible':'hidden',timeout:2500}).then(()=>true,()=>false);
const posted=async(name,action)=>{
 const before=posts.filter(p=>p==='/hit/'+name).length;
 await action();await page.waitForTimeout(250);
 return posts.filter(p=>p==='/hit/'+name).length-before;
};
async function use(round,o){
 const label=`round ${round}: ${o.name}`;
 const trigger=page.locator(`[data-probe="${o.name}"] [data-slot$="-trigger"]`).first();
 const content=page.locator('#probe-'+o.name);
 if(o.open==='hover')await trigger.hover();
 else await trigger.click({button:o.open==='contextmenu'?'right':'left'});
 if(!check(await visible(content),`${label} opens`))return;
 if(o.item){
  const item=content.locator(o.item).first();
  await item.hover();
  check(await item.evaluate(e=>new Promise(r=>setTimeout(()=>r(e.hasAttribute('data-highlighted')),150))),`${label} highlights the hovered item`);
  check(await posted(o.name,()=>item.click())===1,`${label} item posts once`);
 }else if(o.hit){
  // A click event: the fixture's popups carry no layout of their own.
  check(await posted(o.name,()=>content.locator(`[hx-post="/hit/${o.name}"]`).dispatchEvent('click'))===1,`${label} posts once`);
 }
 if(o.open==='hover')await page.mouse.move(1270,890);
 else if(await content.isVisible())await page.keyboard.press('Escape');
 check(await visible(content,false),`${label} closes`);
 await page.waitForTimeout(150);
}
const structure=async(label)=>{
 const s=await page.evaluate((names)=>{
  const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);
  return {
   duplicates:[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))],
   contents:names.filter(n=>document.querySelectorAll('#probe-'+n).length!==1),
   // A portaled node whose declaration rendered a new one in its place.
   stale:[...document.querySelectorAll('[data-base-ui-portal]')].filter(n=>{
    const owner=n._templPortalOwner;
    return owner&&(!owner.isConnected||[...owner.children].some(c=>c!==n&&c.matches('[data-base-ui-portal]')));
   }).length,
  };
 },OVERLAYS.map(o=>o.name));
 check(s.duplicates.length===0,`${label}: unique ids ${JSON.stringify(s.duplicates)}`);
 check(s.contents.length===0,`${label}: one content per overlay ${JSON.stringify(s.contents)}`);
 check(s.stale===0,`${label}: no stale portaled content (${s.stale})`);
};
try{
 await page.goto(base);
 await page.addStyleTag({url:'/assets/css/output.css'});await page.waitForTimeout(400);
 for(let round=0;round<=5;round++){
  if(round){
   // Rounds 2 and 4 morph twice, the second time without using anything.
   for(let n=0;n<(round%2?1:2);n++){await page.locator('#morph').click();await page.waitForTimeout(600)}
  }
  await structure(`round ${round}`);
  for(const o of OVERLAYS){
   try{await use(round,o)}
   catch(e){check(false,`round ${round}: ${o.name} ${e.message.split('\n')[0]}`);await page.keyboard.press('Escape');await page.mouse.move(1270,890)}
  }
 }
 check(errors.length===0,`page errors: ${JSON.stringify(errors)}`);
}finally{await browser.close()}
console.log('failed expectations:',failures);process.exitCode=failures?1:0;
