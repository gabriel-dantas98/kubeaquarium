import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1280,height:720}});
try {
 await page.route('**/radar-test',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><link rel="stylesheet" href="/src/hud/hud.css"><div id="hud"><div id="radar" class="radar"><div class="radar-scope" id="radar-scope"></div><div class="radar-console"><div class="radar-head"><span class="radar-title">resource radar</span><span id="radar-count" class="radar-count"></span></div><div class="radar-input-row"><span class="radar-prompt">SCAN</span><input id="radar-input"></div><div id="radar-results" class="radar-results"></div><div id="radar-empty" class="radar-empty hidden"></div></div></div></div>`}));
 await page.goto(new URL('/radar-test',process.env.DEMO_URL??'http://127.0.0.1:7781').href);
 await page.evaluate(async()=>{
  const {RadarHUD}=await import('/src/hud/radar.ts');const {projectRadar}=await import('/src/hud/radar-projection.ts');
  const check=(v,m)=>{if(!v)throw new Error(m)};
  const p={x:10,y:5,z:-20},pose={position:{x:0,y:0,z:0},forward:{x:0,y:0,z:-1}};
  const a=projectRadar(p,pose,100),b=projectRadar({x:30,y:8,z:20},{...pose,position:{x:20,y:3,z:40}},100);check(JSON.stringify(a)===JSON.stringify(b),'translated projection differs');
  const rotated=projectRadar(p,{...pose,forward:{x:1,y:0,z:0}},100);check(Math.abs(rotated.x+.2)<1e-9&&Math.abs(rotated.y+.1)<1e-9,'heading rotation incorrect');
  const far=projectRadar({x:1000,y:-10,z:1000},pose,50);check(far.outside&&Math.abs(Math.hypot(far.x,far.y)-1)<1e-9&&far.altitude===-10,'out of range projection');
  let items=[{id:'left',name:'left',kind:'pod',namespace:'test',position:{x:-10,y:5,z:0}},{id:'right',name:'right',kind:'pod',namespace:'test',position:{x:10,y:-5,z:0}},{id:'far',name:'far',kind:'pod',namespace:'test',position:{x:1000,y:-10,z:1000}},{id:'absent',name:'absent',kind:'pod',position:null}];items=items.map(item=>({...item,tokens:[item.name]}));let selected;
  const radar=new RadarHUD({getItems:()=>items,getPose:()=>pose,onSelect:item=>selected=item.id});radar.open();
  check(document.querySelectorAll('.radar-blip').length===3,'fabricated missing position');check(document.getElementById('radar-results').textContent.includes('Position unavailable'),'missing position not disclosed');
  const input=document.getElementById('radar-input');input.value='right';input.dispatchEvent(new Event('input'));const blip=document.querySelector('.radar-blip');check(blip.getAttribute('aria-label').includes('↓'),'altitude missing');check(blip.title.includes('5 units below'),'altitude is not visible on marker hover');check(document.querySelector('.radar-status-line').textContent.includes('5↓'),'altitude is not visible in the scope');
  for(let i=0;i<50;i++){pose.position.x++;radar.refresh();check(document.querySelector('.radar-blip')===blip,'refresh recreated marker');check(document.activeElement===input&&input.value==='right','refresh lost query/focus');}
  blip.click();check(selected==='right','marker selected wrong UID');
 radar.open();const stale=document.querySelector('[data-uid="right"]');items=items.filter(i=>i.id!=='right');selected=undefined;stale.click();check(selected===undefined,'stale marker selected removed pod');radar.refresh();check(!document.querySelector('[data-uid="right"]'),'removed marker retained');
 });
 assert.equal(await page.locator('[aria-label="Radar range"] option').count(),4);
 assert.equal(await page.locator('.radar-console [aria-label="Radar range"]').count(),1,'range control must remain in the console');
 const desktop=await page.locator('#radar').boundingBox();const desktopScope=await page.locator('#radar-scope').boundingBox();const desktopConsole=await page.locator('.radar-console').boundingBox();
 assert.ok(desktop&&desktop.y>=0&&desktop.y+desktop.height<=720,'desktop radar must fit the viewport');
 assert.ok(desktopScope&&desktopConsole&&desktopScope.x+desktopScope.width<desktopConsole.x,'desktop scope must remain left of the console');
 assert.ok(await page.locator('.radar-heading').isVisible(),'heading must be visible');
 assert.equal(await page.locator('.radar-heading').textContent(),'Ahead ↑ · 100u','heading must identify the camera-relative forward direction');
 await page.locator('#radar-input').fill('far');
 assert.match(await page.locator('.radar-status-line').textContent(),/u · 10↓/,'out-of-range distance and altitude must be visible in the scope');
 await mkdir('docs/screenshots/visual-feedback',{recursive:true});
 await page.screenshot({path:'docs/screenshots/visual-feedback/radar-1280x720.png'});
 await page.setViewportSize({width:640,height:800});
 const mobile=await page.locator('#radar').boundingBox();const mobileScope=await page.locator('#radar-scope').boundingBox();const mobileConsole=await page.locator('.radar-console').boundingBox();
 assert.ok(mobile&&mobile.y>=0&&mobile.y+mobile.height<=800,'mobile radar must fit the viewport');
 assert.ok(mobileScope&&mobileConsole&&mobileScope.y+mobileScope.height<=mobileConsole.y,'mobile scope must remain above the console');
 await page.screenshot({path:'docs/screenshots/visual-feedback/radar-640x800.png'});
 await page.locator('#radar-input').fill('missing');
 assert.equal(await page.locator('.radar-status-line').textContent(),'','empty results must clear the scope status');
 await page.locator('#radar-input').fill('absent');
 assert.equal(await page.locator('.radar-status-line').textContent(),'','items without position must clear the scope status');
 console.log('radar projection, ranges, identity and refresh checks passed');
}finally{await browser.close();}
