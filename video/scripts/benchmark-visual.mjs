import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const url = process.env.BENCH_URL ?? 'http://127.0.0.1:5180';
const output = process.env.BENCH_OUTPUT ?? 'output/playwright/benchmark';
const duration = Number(process.env.BENCH_MS ?? 5000);
const rounds = Number(process.env.BENCH_ROUNDS ?? 3);
await mkdir(output, {recursive:true});
const browser = await chromium.launch({headless:true, args:['--enable-gpu','--use-angle=metal']});
const results=[];
try {
for (const count of [200,1200,2500]) {
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
 const pods=Array.from({length:count},(_,i)=>({uid:`bench-${i}`,name:`worker-${i}`,namespace:`bench-${i%8}`,node:'node-1',phase:'Running',ready:i%10!==0,restartCount:0,reason:i%10===0?'CrashLoopBackOff':'',cpuMillis:100,memMib:128,createdAt:'2026-09-14T00:00:00Z',controller:{apiVersion:'apps/v1',kind:'ReplicaSet',name:`worker-${i%8}`,uid:`rs-${i%8}`},deletionTimestamp:''}));
 let socket;
 await page.route('**/api/**',async route=>{
  const req=route.request();
  if(req.method()==='DELETE') {
   const name=decodeURIComponent(new URL(req.url()).pathname.split('/').at(-1)); const p=pods.find(p=>p.name===name);
   await route.fulfill({status:202,json:{accepted:true,uid:p?.uid}});
   if(p) socket?.send(JSON.stringify({type:'deleted',uid:p.uid}));
  } else await route.fulfill({json:req.url().endsWith('/contexts')?[{name:'BENCHMARK SIMULATED',current:true}]:{type:'snapshot',pods}});
 });
 await page.routeWebSocket('**/api/stream',ws=>{socket=ws; ws.send(JSON.stringify({type:'snapshot',pods}));});
 await page.goto(url); await page.waitForFunction(n=>window.__kubeaquarium?.pods===n,count);
 await page.waitForTimeout(2500);
 for(let round=0;round<rounds;round++) for(const scenario of ['overview','filter','radar','dive','impact']) {
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  if(scenario==='filter'){await page.keyboard.press('/');await page.locator('#search-input').fill('ns:bench-1');}
  if(scenario==='radar') await page.keyboard.press('Control+k');
  if(scenario==='dive'||scenario==='impact') {
   await page.keyboard.press('f');
   if(scenario==='impact') { if(!(await page.evaluate(()=>window.__kubeaquarium.attackMode))) await page.keyboard.press('Control+l'); await page.mouse.click(720,450); }
  }
  await page.waitForTimeout(350);
  const sample=await page.evaluate(ms=>new Promise(resolve=>{
   const values=[];let first,last;
   const tick=t=>{first??=t;if(last!==undefined)values.push(t-last);last=t;if(t-first<ms)requestAnimationFrame(tick);else{
    const sorted=[...values].sort((a,b)=>a-b); const q=p=>sorted[Math.ceil(sorted.length*p)-1];
    resolve({frames:values.length,p50:q(.5),p95:q(.95),p99:q(.99),over50:values.filter(x=>x>50).length,raw:values,canvas:[document.querySelector('canvas').width,document.querySelector('canvas').height]});
   }};requestAnimationFrame(tick);
  }),duration);
  results.push({count,round,scenario,...sample});
  if(round===0)await page.screenshot({path:`${output}/${count}-${scenario}.png`});
  console.log(JSON.stringify({count,round,scenario,p95:sample.p95}));
  await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  if(await page.evaluate(()=>window.__kubeaquarium.attackMode)) await page.keyboard.press('Control+l');
 }
 await page.close();if(errors.length)throw new Error(errors.join('\n'));
}
} finally {await writeFile(`${output}/metrics.json`,JSON.stringify({url,duration,rounds,browser:browser.version(),viewport:[1440,900],results},null,2));await browser.close();}
