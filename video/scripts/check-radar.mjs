import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch();const page=await browser.newPage();
try {
 await page.route('**/radar-test',route=>route.fulfill({contentType:'text/html',body:'<div id="radar"><input id="radar-input"><span id="radar-count"></span><div id="radar-results"></div><div id="radar-scope"></div><div id="radar-empty"></div></div>'}));
 await page.goto(new URL('/radar-test',process.env.DEMO_URL??'http://127.0.0.1:7781').href);
 await page.evaluate(async()=>{
  const {RadarHUD}=await import('/src/hud/radar.ts');const {projectRadar}=await import('/src/hud/radar-projection.ts');
  const check=(v,m)=>{if(!v)throw new Error(m)};
  const p={x:10,y:5,z:-20},pose={position:{x:0,y:0,z:0},forward:{x:0,y:0,z:-1}};
  const a=projectRadar(p,pose,100),b=projectRadar({x:30,y:8,z:20},{...pose,position:{x:20,y:3,z:40}},100);check(JSON.stringify(a)===JSON.stringify(b),'translated projection differs');
  const rotated=projectRadar(p,{...pose,forward:{x:1,y:0,z:0}},100);check(Math.abs(rotated.x+.2)<1e-9&&Math.abs(rotated.y+.1)<1e-9,'heading rotation incorrect');
  const far=projectRadar({x:1000,y:-10,z:1000},pose,50);check(far.outside&&Math.abs(Math.hypot(far.x,far.y)-1)<1e-9&&far.altitude===-10,'out of range projection');
  let items=[{id:'left',name:'left',kind:'pod',namespace:'test',position:{x:-10,y:5,z:0}},{id:'right',name:'right',kind:'pod',namespace:'test',position:{x:10,y:-5,z:0}},{id:'absent',name:'absent',kind:'pod',position:null}];items=items.map(item=>({...item,tokens:[item.name]}));let selected;
  const radar=new RadarHUD({getItems:()=>items,getPose:()=>pose,onSelect:item=>selected=item.id});radar.open();
  check(document.querySelectorAll('.radar-blip').length===2,'fabricated missing position');check(document.getElementById('radar-results').textContent.includes('Position unavailable'),'missing position not disclosed');
  const input=document.getElementById('radar-input');input.value='right';input.dispatchEvent(new Event('input'));const blip=document.querySelector('.radar-blip');check(blip.getAttribute('aria-label').includes('↓'),'altitude missing');
  for(let i=0;i<50;i++){pose.position.x++;radar.refresh();check(document.querySelector('.radar-blip')===blip,'refresh recreated marker');check(document.activeElement===input&&input.value==='right','refresh lost query/focus');}
  blip.click();check(selected==='right','marker selected wrong UID');
  radar.open();const stale=document.querySelector('[data-uid="right"]');items=items.filter(i=>i.id!=='right');selected=undefined;stale.click();check(selected===undefined,'stale marker selected removed pod');radar.refresh();check(!document.querySelector('[data-uid="right"]'),'removed marker retained');
 });
 assert.equal(await page.locator('[aria-label="Radar range"] option').count(),4);
 console.log('radar projection, ranges, identity and refresh checks passed');
}finally{await browser.close();}
