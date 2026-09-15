import { chromium } from 'playwright';
const url=process.env.DEMO_URL||'http://127.0.0.1:7781/?demo';
let browser;
try { browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(url);await page.evaluate(async()=>{const recovery=await import('/src/recovery.test.ts');const operations=await import('/src/operations.test.ts');recovery.runRecoveryTests();await operations.runOperationsTests()});console.log('recovery frontend tests passed'); } finally { await browser?.close(); }
