import {chromium,expect} from '@playwright/test';import {readFile,readdir} from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
const f=JSON.parse(await readFile('data/products-fixture.json','utf8'));const root=path.join(process.env.LOCALAPPDATA,'ms-playwright');const dirs=(await readdir(root)).filter(d=>/^chromium-\d+$/.test(d)).sort();const browser=await chromium.launch({headless:true,executablePath:path.join(root,dirs.at(-1),'chrome-win64','chrome.exe')});const context=await browser.newContext({storageState:f.storageState});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
try{
 for(const [w,h] of [[390,844],[768,1024],[1440,1000]]){await page.setViewportSize({width:w,height:h});await page.goto('http://localhost:3000/inventario');await expect(page.locator('.stock-card').first()).toBeVisible();const box=await page.locator('.stock-card').first().boundingBox();assert.ok(box.height<300,`tarjeta ${w}: ${box.height}`);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 await page.goto(`http://localhost:3000/inventario/${f.code}`);await page.getByRole('heading',{name:f.alias,exact:true}).waitFor();
 await page.getByRole('button',{name:'Retirar',exact:true}).first().click();await page.waitForURL('**/inventario');
 await page.getByLabel('Estado de existencias').selectOption('archived');await page.getByLabel('Buscar material o código').fill('salon');await expect(page.locator('.stock-card')).toHaveCount(1);
 await page.getByRole('button',{name:`Recuperar ${f.alias}`}).click();await expect(page.locator('.stock-card')).toHaveCount(0);
 await page.goto(`http://localhost:3000/inventario/${f.code}`);await page.getByRole('button',{name:'Editar',exact:true}).first().click();const d=page.getByRole('dialog',{name:'Ficha y ubicación del material'});await d.getByLabel('Nombre del artículo').fill('Artículo PRUEBA editado');await d.getByRole('button',{name:'Guardar ficha'}).click();await d.waitFor({state:'hidden'});await page.reload();await expect(page.getByText('Artículo PRUEBA editado').first()).toBeVisible();
 assert.deepEqual(errors,[]);console.log('OK tarjetas compactas, editar, retirar y recuperar en móvil/tablet/PC.');
}finally{await browser.close()}

