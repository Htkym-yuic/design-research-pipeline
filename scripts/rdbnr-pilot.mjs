import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {validateSeed, classifyObservation, buildResults, validateResults} from './rdbnr-pilot-core.mjs';

// Safety gate: this first pilot is always read-only. No image, screenshot, Dropbox, Notion or Github write.
const args = process.argv.slice(2);
if (args.includes('--write') || args.includes('--live') || args.includes('--save-image')) {
  console.error('本パイロットでは書き込み・画像保存は禁止です。');
  process.exit(2);
}
const seedPath = 'data/rdbnr-pilot-reviewed.json';
const outDir = process.env.RDBNR_OUTPUT_DIR || 'artifacts/rdbnr-pilot';
const seed = JSON.parse(await fs.readFile(seedPath,'utf8'));
const item = validateSeed(seed);
let observation = {status:0,final_url:'',text:'',document_title:'',h1:'',meta_description:'',error:''};
let browser;
try {
  browser = await chromium.launch({headless:true});
  const context = await browser.newContext({locale:'ja-JP'});
  const page = await context.newPage();
  const response = await page.goto(item.source_detail_url, {waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForLoadState('networkidle',{timeout:4500}).catch(()=>{});
  observation = await page.evaluate(() => ({
    final_url: location.href,
    document_title: document.title,
    h1: document.querySelector('h1')?.textContent?.trim() ?? '',
    meta_description: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
    // Read-only ephemeral check; raw page text / HTML is never saved.
    text: document.body?.innerText?.slice(0,35000) ?? ''
  }));
  observation.status = response?.status() ?? 0;
  await context.close();
} catch (error) {
  observation.error = error.message;
} finally {
  if (browser) await browser.close();
}
const verdict = classifyObservation(item.source_detail_url, observation);
const results = buildResults(seed,observation,verdict);
validateResults(results.drs,results.report);
await fs.mkdir(outDir,{recursive:true});
await Promise.all([
  fs.writeFile(`${outDir}/scout-drs-1.0.json`,JSON.stringify(results.drs,null,2)+'\n','utf8'),
  fs.writeFile(`${outDir}/report.json`,JSON.stringify(results.report,null,2)+'\n','utf8')
]);
console.log(JSON.stringify({status:verdict.status,collected_count:results.drs.run.collected_count,failure_reason:verdict.failure_reason,output_dir:outDir,rights:'rights_excluded',image_saved:false,notion_updated:false}));
// Manual-review is a valid safe outcome, not a reason to retry with proxy or bypass.
