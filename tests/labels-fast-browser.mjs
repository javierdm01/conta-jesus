import { chromium, expect } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const f=JSON.parse(await readFile('data/products-fixture.json','utf8'));
const root=path.join(process.env.LOCALAPPDATA,'ms-playwright');
const dirs=(await readdir(root)).filter(d=>/^chromium-\d+$/.test(d)).sort();
const browser=await chromium.launch({headless:true,executablePath:path.join(root,dirs.at(-1),'chrome-win64','chrome.exe')});
const context=await browser.newContext({storageState:f.storageState});
await context.addInitScript(()=>{window.printCalls=0;window.print=()=>{window.printCalls++}});
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
 for(const [width,height] of [[390,844],[768,1024],[1440,1000]]){
  await page.setViewportSize({width,height});
  await page.goto(`http://localhost:3000/etiquetas?items=${f.code}:2&print=1`);
  await page.waitForFunction(()=>window.printCalls===1);
  await expect(page.getByRole('button',{name:'Imprimir 2 etiquetas'})).toBeVisible();
  await expect(page.getByText('Configuración de impresora')).toBeVisible();
  await expect(page.getByLabel('Ancho (mm)')).toBeHidden();
  await expect(page.locator('[data-testid=printed-label]')).toHaveCount(2);
  assert.equal(await page.locator('[data-testid=printed-label]').first().evaluate(e=>e.style.width),'48mm');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`ancho ${width}`);
  await page.emulateMedia({media:'print'});
  await expect(page.locator('[data-testid=printed-label]').first()).toBeVisible();
  await page.emulateMedia({media:'screen'});
  await page.getByText('Configuración de impresora').click();
  await expect(page.getByLabel('Ancho (mm)')).toHaveValue('48');
  await page.getByRole('button',{name:'Imprimir 2 etiquetas'}).click();
  assert.equal(await page.evaluate(()=>window.printCalls),2);
  assert.equal(new URL(page.url()).searchParams.has('print'), false);
  await page.reload();
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(()=>window.printCalls),0);
 }
 assert.deepEqual(errors,[]);
 console.log('OK impresión: llamada automática, 2 etiquetas, 48 mm, ajustes y vista de impresión en móvil/tablet/PC.');
}finally{await browser.close()}
