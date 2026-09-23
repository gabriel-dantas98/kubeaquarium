import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const root = path.resolve(import.meta.dirname, '../..');
const data = async (file, type) => `data:${type};base64,${(await readFile(path.join(root, file))).toString('base64')}`;
const font = await data('video/public/fonts/BarlowCondensed-SemiBold.ttf', 'font/ttf');
const helm = await data('video/public/kubernetes-helm.png', 'image/png');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(`<style>@font-face{font-family:Launch;src:url(${font})}*{box-sizing:border-box}body{margin:0;background:#061c26;color:#edf0dc;font-family:Launch,sans-serif}.card{position:relative;width:1200px;height:630px;padding:52px 64px;background:radial-gradient(ellipse at 85% 50%,#12465166,transparent 60%);overflow:hidden}.brand{font-size:32px}.brand span{color:#a8efbb}h1{font-size:86px;line-height:1.02;letter-spacing:-1px;margin:58px 0 20px;position:relative;z-index:1}h1 span{color:#a8efbb}p{font:22px/1.5 sans-serif;color:#c0d4cc;margin:0;position:relative;z-index:1}.helm{position:absolute;width:445px;height:445px;object-fit:contain;right:25px;top:96px}.footer{position:absolute;bottom:42px;left:64px;right:64px;border-top:1px solid #a8efbb40;padding-top:18px;font:15px sans-serif;letter-spacing:2px;color:#ff9d62}</style><div class="card"><div class="brand"><span>◒</span> kubeaquarium</div><h1>YOUR CLUSTER.<br><span>AN OCEAN TO EXPLORE.</span></h1><p>Explore Kubernetes as a living aquarium.<br>Choose your vessel. Dive into the demo.</p><img class="helm" src="${helm}" alt=""><div class="footer">INTERACTIVE DEMO · NO KUBERNETES REQUIRED</div></div>`);
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(img => img.decode())); });
  await mkdir(path.join(root, 'web/public/social'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'web/public/social/kubeaquarium.png') });
} finally { await browser.close(); }
