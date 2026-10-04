import {chromium,webkit} from 'playwright';
const base=process.env.TEMPL_URL||'http://localhost:8090';
const engine=process.argv[2]||'chromium';const browser=await ({chromium,webkit}[engine]).launch();
const page=await browser.newPage({viewport:{width:1000,height:850}});page.setDefaultTimeout(10000);
let failures=0;const errors=[];page.on('pageerror',e=>errors.push(e.message));
const settle=()=>page.waitForTimeout(650);
const read=()=>page.evaluate(()=>{
 const active=document.activeElement;
 const kinds={dropdownmenu:'dropdown-menu-content',popover:'popover-content',combobox:'combobox-content',tooltip:'tooltip-content',contextmenu:'context-menu-content',select:'select-content'};
 // data-open sits on the positioner around the slotted popup, or on the popup itself.
 const isOpen=(slot)=>[...document.querySelectorAll(`[data-slot="${slot}"]`)].some(p=>p.hasAttribute('data-open')||p.parentElement.hasAttribute('data-open'));
 return {dialogOpen:[...document.querySelectorAll('[role=dialog][data-templ-modal],[role=alertdialog][data-templ-modal]')].some(e=>window.templ.dialog.isOpen(e)),drawers:[...[...document.querySelectorAll('[data-slot=drawer-viewport]')].filter(e=>window.templ.drawer.isOpen(e))].map(e=>e.querySelector('[data-slot=drawer-title]')?.textContent.trim()),...Object.fromEntries(Object.entries(kinds).map(([k,slot])=>[k+'Open',isOpen(slot)])),contextSubOpen:isOpen('context-menu-sub-content'),active:active?.tagName,focusDropdown:!!active?.matches('[aria-haspopup="menu"][data-templ-controls]'),focusSelect:active?.getAttribute('data-slot')==='select-trigger',focusInput:!!active?.matches('input[role=combobox]'),value:document.querySelector('input[role=combobox]')?.value};
});
const assert=(label,actual,expected)=>{if(JSON.stringify(actual)!==JSON.stringify(expected)){failures++;console.log('FAIL',label,JSON.stringify({actual,expected}));}};
const check=async(label,expected)=>{await settle();const state=await read();console.log(label,JSON.stringify(state));for(const[k,v]of Object.entries(expected))assert(label+' '+k,state[k],v);return state;};
const fresh=async(path,width=1000)=>{await page.setViewportSize({width,height:850});await page.goto(base+'/preview/'+path);await settle();await page.evaluate(()=>{window.escapeAtDocument=false;document.addEventListener('keydown',e=>{if(e.key==='Escape')window.escapeAtDocument=true;});});};
const escape=async(label,expected,{prevented=true,atDocument=false}={})=>{
 const result=await page.evaluate(()=>{window.escapeAtDocument=false;const target=document.activeElement;const accepted=target.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));return{prevented:!accepted,atDocument:window.escapeAtDocument,target:target.tagName};});
 console.log(label+' event',JSON.stringify(result));assert(label+' prevented',result.prevented,prevented);assert(label+' atDocument',result.atDocument,atDocument);return check(label,expected);
};
const scenario=async(label,fn)=>{try{await fn();}catch(e){failures++;console.log('FAIL',label,e.stack);}};
try{
 await scenario('A',async()=>{
  await fresh('sidebar-demo',750);await page.locator('[data-slot=sidebar-trigger]:visible').first().click();await settle();
  await page.locator('[id$="-mobile"] [aria-haspopup="menu"]').first().click();await settle();
  await page.locator('[data-open] > [data-slot=dropdown-menu-content] [role="menuitem"]').first().focus();
  await check('A open',{dialogOpen:true,dropdownmenuOpen:true});
  await escape('A menu Escape',{dropdownmenuOpen:false,dialogOpen:true,focusDropdown:true});
  await escape('A sheet Escape',{dialogOpen:false});
 });
 await scenario('B',async()=>{
  await fresh('drawer-nested');await page.getByRole('button',{name:'Open Drawer',exact:true}).click();await settle();
  await page.getByRole('button',{name:'Open Nested Drawer',exact:true}).click();await check('B open',{drawers:['Drawer','Nested Drawer']});
  await escape('B nested Escape',{drawers:['Drawer']});await escape('B outer Escape',{drawers:[]});
 });
 await scenario('C',async()=>{await fresh('dialog-demo');await page.locator('[data-base-ui-click-trigger]').click();await check('C open',{dialogOpen:true});await escape('C Escape',{dialogOpen:false});});
 await scenario('D',async()=>{await fresh('popover-form');await page.locator('[data-base-ui-click-trigger]').click();await check('D open',{popoverOpen:true});await page.evaluate(()=>document.activeElement.blur());await escape('D fallback',{popoverOpen:false},{atDocument:true});});
 await scenario('E',async()=>{await fresh('combobox-demo');const input=page.locator('input[role=combobox]');await input.focus();await input.press('ArrowDown');await check('E open',{comboboxOpen:true,focusInput:true});const value=await input.inputValue();await escape('E Escape',{comboboxOpen:false,focusInput:true,value});});
 await scenario('F',async()=>{await fresh('tooltip-keyboard');await page.keyboard.press('Tab');await check('F open',{tooltipOpen:true});await escape('F Escape',{tooltipOpen:false});});
 await scenario('G',async()=>{await fresh('context-menu-demo');await page.locator('[data-templ-context-menu-trigger]').click({button:'right'});await check('G open',{contextmenuOpen:true});await escape('G Escape',{contextmenuOpen:false});
  await fresh('context-menu-submenu');await page.locator('[data-templ-context-menu-trigger]').click({button:'right'});await settle();const sub=page.locator('[data-slot=context-menu-sub-trigger]');await sub.focus();await sub.press('ArrowRight');await settle();await page.locator('[data-slot=context-menu-sub-content] [role="menuitem"]').first().focus();await check('G submenu open',{contextmenuOpen:true,contextSubOpen:true});await escape('G submenu Escape',{contextmenuOpen:true,contextSubOpen:false});await settle();await escape('G root Escape',{contextmenuOpen:false,contextSubOpen:false});
 });
 await scenario('H',async()=>{await fresh('select-demo');const trigger=page.locator('[data-slot=select-trigger]');await trigger.focus();await trigger.press('ArrowDown');await check('H open',{selectOpen:true});await escape('H Escape',{selectOpen:false,focusSelect:true});});
 assert('page errors',errors,[]);
}finally{await browser.close();}
console.log(engine+': '+failures+' failed expectations');process.exitCode=failures?1:0;
