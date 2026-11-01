import {chromium} from '@playwright/test';
import {readdir,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.join(process.env.LOCALAPPDATA||'', 'ms-playwright');
const executablePath=process.env.PLAYWRIGHT_BROWSER_PATH||path.join(root,(await readdir(root)).filter(d=>/^chromium-\d+$/.test(d)).sort().at(-1),'chrome-win64','chrome.exe');
const browser=await chromium.launch({headless:true,executablePath});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});let stateRequests=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/state')stateRequests++});
 await page.goto(process.env.BETTER_AUTH_URL||'http://localhost:3000');await page.getByLabel('Correo electrónico').fill(process.env.ADMIN_EMAIL);await page.getByLabel('Contraseña',{exact:true}).fill(process.env.ADMIN_PASSWORD);await page.getByRole('button',{name:'Entrar a mi empresa'}).click();await page.getByRole('heading',{name:'Todo bajo control.'}).waitFor();
 await page.locator('.topbar').evaluate(el=>el.dataset.benchmark='persistent-shell');const initial=stateRequests,results=[];
 for(const [link,heading] of [['Trabajos','Tus trabajos'],['Facturas','Facturas y documentos'],['Proveedores','Proveedores'],['Beneficios','Beneficios'],['Configuración','Configuración']]){const start=performance.now();await page.locator('.sidebar').getByRole('link',{name:link,exact:true}).click();await page.getByRole('heading',{name:heading,exact:true}).waitFor();results.push({section:link,ms:Math.round(performance.now()-start),shellPreserved:await page.locator('.topbar').getAttribute('data-benchmark')==='persistent-shell'});}
 const output={results,stateRequestsDuringNavigation:stateRequests-initial,medianMs:results.map(r=>r.ms).sort((a,b)=>a-b)[2]};await mkdir('data',{recursive:true});await writeFile(process.env.BENCHMARK_OUTPUT||'data/navigation-after.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output));
}finally{await browser.close()}
