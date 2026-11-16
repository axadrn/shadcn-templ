import {chromium, webkit} from 'playwright';
// Usage: node htmx/boost.mjs <chromium|webkit>, against the fixture in
// htmx/server. Boosted page changes and history restores while a toast is on
// screen (issue #656): the page keeps painting, the old toaster leaves no
// observer or window listener behind, the new one works.
// BUNDLE=<file> serves another bundle, e.g. main's, to see the test fail.
const base=process.env.HTMX_URL||'http://localhost:8099';
const engine=process.argv[2]||'chromium';
const browser=await ({chromium,webkit}[engine]).launch();
const page=await browser.newPage({viewport:{width:1280,height:900}});
page.setDefaultTimeout(5000);
if(process.env.BUNDLE)await page.route('**/assets/js/shadcn-templ-*.js',route=>route.fulfill({path:process.env.BUNDLE,contentType:'text/javascript'}));
// Counts observer callbacks, the loop of the freeze.
await page.addInitScript(()=>{
 window.__observed=0;
 for(const name of ['MutationObserver','ResizeObserver']){
  const Observer=window[name];
  window[name]=class extends Observer{constructor(callback){super((...args)=>{window.__observed++;return callback(...args)})}};
 }
});
const errors=[];let failures=0;
page.on('pageerror',e=>errors.push(e.message));
const check=(ok,label)=>{console.log(`${ok?'PASS':'FAIL'} ${label}`);if(!ok)failures++};
// A frozen tab never answers, so every evaluate races a timer.
const answer=(fn,arg)=>Promise.race([page.evaluate(fn,arg),new Promise(r=>setTimeout(()=>r('timeout'),3000))]);
const paints=()=>answer(()=>new Promise(r=>requestAnimationFrame(()=>r(true))));
// The window listeners per type, through the DevTools protocol (Chromium).
const cdp=engine==='chromium'?await page.context().newCDPSession(page):null;
const windowListeners=async()=>{
 if(!cdp)return null;
 const {result}=await cdp.send('Runtime.evaluate',{expression:'window'});
 const {listeners}=await cdp.send('DOMDebugger.getEventListeners',{objectId:result.objectId});
 const counts={};for(const l of listeners)counts[l.type]=(counts[l.type]||0)+1;
 delete counts.__playwright_global_listeners_check__;
 return JSON.stringify(Object.entries(counts).sort());
};
const showToast=async(title)=>{
 await answer((title)=>window.templ.toast.add({title}),title);
 await page.waitForSelector('[data-slot="toast"]',{state:'visible'});
};
try{
 await page.goto(base+'/boost/a');
 await page.addStyleTag({url:'/assets/css/output.css'});
 const fresh=await windowListeners();
 let current='a';
 for(let round=1;round<=20;round++){
  await showToast('Saved '+round);
  const next=current==='a'?'b':'a';
  if(round%5===0)await page.goBack();
  else await page.locator('#next').click();
  const arrived=await Promise.race([page.waitForFunction((name)=>document.getElementById('page')?.textContent===name,next).then(()=>true),new Promise(r=>setTimeout(()=>r(false),4000))]);
  const painted=await paints();
  check(arrived&&painted===true,`round ${round}: ${round%5===0?'back':'link'} to ${next} paints`);
  if(painted!==true)break;
  current=next;
  await page.waitForTimeout(300);
  const before=await answer(()=>window.__observed);
  await page.waitForTimeout(700);
  const after=await answer(()=>window.__observed);
  check(after-before===0,`round ${round}: no observer callbacks once settled (${after-before})`);
  check(await answer(()=>document.querySelectorAll('[data-slot="toast-viewport"]').length)===1,`round ${round}: one toast viewport`);
 }
 if(!failures){
  // The toaster on the last page works and leaves when it is done.
  await showToast('Fresh');
  check(await page.locator('[data-slot="toast"]').count()===1,'the new toaster shows one toast');
  await answer(()=>window.templ.toast.close());
  await page.waitForTimeout(800);
  const settled=await windowListeners();
  if(settled)check(settled===fresh,`window listeners as on a fresh load after 20 page changes: ${settled}`);
 }
 check(errors.length===0,`page errors: ${JSON.stringify(errors)}`);
}finally{
 await Promise.race([browser.close(),new Promise(r=>setTimeout(r,3000))]);
}
console.log('failed expectations:',failures);process.exit(failures?1:0);
