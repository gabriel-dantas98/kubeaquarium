import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({args:['--enable-gpu','--use-angle=metal']});
const page=await browser.newPage();
try {
  await page.addInitScript(()=>{
    window.audioEvents=[];
    class Param {value=0;setValueAtTime(v){this.value=v;}exponentialRampToValueAtTime(){} }
    class Node {gain=new Param();frequency=new Param();connect(){return this;}disconnect(){}start(){window.audioEvents.push('start');}stop(){queueMicrotask(()=>this.onended?.());} }
    window.AudioContext=class {state='suspended';currentTime=0;destination={};constructor(){window.audioEvents.push('create');}createGain(){return new Node();}createOscillator(){return new Node();}async resume(){this.state='running';window.audioEvents.push('resume');}async suspend(){this.state='suspended';window.audioEvents.push('suspend');}async close(){this.state='closed';}};
  });
  await page.goto(process.env.DEMO_URL??'http://127.0.0.1:7781/?demo');await page.waitForFunction(()=>window.__kubeaquarium?.pods>0);
  assert.deepEqual(await page.evaluate(()=>window.audioEvents),[],'audio created before gesture');
  await page.getByRole('button',{name:'Sound: off',exact:true}).click();
  assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'),'true');
  assert.ok((await page.evaluate(()=>window.audioEvents)).includes('start'));
  await page.reload();await page.waitForFunction(()=>window.__kubeaquarium?.pods>0);
  assert.deepEqual(await page.evaluate(()=>window.audioEvents),[],'stored preference auto-started audio');
  await page.keyboard.press('x');
  assert.ok((await page.evaluate(()=>window.audioEvents)).includes('create'));
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  assert.ok((await page.evaluate(()=>window.audioEvents)).includes('suspend'));
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
  const resumes=await page.evaluate(()=>window.audioEvents.filter(x=>x==='resume').length);
  await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.audioEvents.filter(x=>x==='resume').length),resumes,'visibility resumed audio without gesture');
  await page.getByRole('button',{name:'Sound: on',exact:true}).click();
  assert.equal(await page.locator('#sound-toggle').getAttribute('aria-pressed'),'false');
  console.log('audio opt-in, persistence and visibility checks passed');
}finally{await browser.close();}
