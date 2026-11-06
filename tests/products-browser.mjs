import { chromium,expect } from '@playwright/test';
import { readFile,readdir,mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const f=JSON.parse(await readFile('data/products-fixture.json','utf8')),base='http://localhost:3000';
const root=path.join(process.env.LOCALAPPDATA||'','ms-playwright');const dirs=(await readdir(root)).filter(d=>/^chromium-\d+$/.test(d)).sort();
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_BROWSER_PATH||path.join(root,dirs.at(-1),'chrome-win64','chrome.exe')});
const context=await browser.newContext({storageState:f.storageState}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));await mkdir('data/screenshots/products',{recursive:true});
try{
  for(const [width,height] of [[390,844],[768,1024],[1024,768],[1440,1000]]){
    await page.setViewportSize({width,height});await page.goto(`${base}/inventario`);
    const search=page.getByLabel('Buscar material o código',{exact:true});await search.waitFor();await search.fill('SALON niessen');
    await expect(page.locator('.stock-card')).toHaveCount(3);
    assert.equal(await page.getByLabel('Estado de existencias').inputValue(),'all');
    await page.getByLabel('Estado de existencias').selectOption('empty');await expect(page.locator('.stock-card')).toHaveCount(1);
    await page.getByRole('button',{name:'Limpiar filtros',exact:true}).click();await expect(page.locator('.stock-card')).toHaveCount(3);
    await search.fill('conmutador doble');await expect(page.locator('.stock-card')).toHaveCount(3);
    await page.locator('.inventory-more-filters > summary').click();await page.getByLabel('Ubicación del material',{exact:true}).selectOption('Cajón 3');await expect(page.locator('.stock-card')).toHaveCount(1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`almacén ${width}`);
    await page.screenshot({path:`data/screenshots/products/almacen-${width}.png`});
    const global=page.getByLabel('Buscar en la empresa',{exact:true});await global.fill('salon NIESSEN');await expect(page.locator('.global-product-result')).toHaveCount(3);
    await page.getByLabel('Buscar en',{exact:true}).selectOption('products');
    await page.screenshot({path:`data/screenshots/products/busqueda-${width}.png`});
    await page.locator(`.global-product-result[href="/inventario/${f.code}"]`).click();
    await page.getByRole('heading',{name:f.alias,exact:true}).waitFor();await expect(page.locator('.product-pricing')).toContainText('13,00');
    await page.getByRole('button',{name:'Añadir a factura',exact:true}).click();
    const invoice=page.getByRole('dialog',{name:'Registrar factura de cliente'});await invoice.waitFor();
    assert.equal(await invoice.getByLabel('Concepto en factura',{exact:true}).inputValue(),f.alias);
    assert.equal(Number(await invoice.getByLabel('Precio de venta sin IVA (€)',{exact:true}).inputValue()),13);
    await invoice.getByLabel('Cantidad (ud)',{exact:true}).fill('2');await expect(invoice.locator('input[name=net]')).toHaveValue('26.00');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`factura ${width}`);
    await invoice.getByLabel('Concepto en factura',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:`data/screenshots/products/factura-${width}.png`});
    if(width===1440){
      await invoice.getByLabel('Número de factura',{exact:true}).fill(`F-UI-${Date.now()}`);
      await invoice.getByLabel('Impuestos (€)',{exact:true}).fill('5.46');
      const response=page.waitForResponse(r=>r.url().endsWith('/api/operations/sale')&&r.request().method()==='POST');await invoice.getByRole('button',{name:'Guardar',exact:true}).click();const r=await response;assert.equal(r.status(),200,await r.text());await invoice.waitFor({state:'hidden'});
    }else await invoice.getByRole('button',{name:'Cancelar',exact:true}).click();
    console.log(`OK ${width}px: búsqueda por alias/nombre, filtros, buscador general y factura con alias y precio +30 %.`);
  }
  await page.goto(`${base}/inventario/${f.code}`);await page.getByRole('button',{name:'Editar',exact:true}).click();
  const edit=page.getByRole('dialog',{name:'Ficha y ubicación del material'});await edit.waitFor();await edit.getByLabel('Alias del producto',{exact:true}).fill('Enchufe salón editado UI');await edit.getByRole('button',{name:'Guardar ficha',exact:true}).click();await edit.waitFor({state:'hidden'});
  await page.getByRole('heading',{name:'Enchufe salón editado UI',exact:true}).waitFor();
  await page.getByLabel('Buscar en la empresa',{exact:true}).fill('editado UI salon');await expect(page.locator('.global-product-result')).toHaveCount(3);await expect(page.locator('.global-product-result').first()).toContainText('Enchufe salón editado UI');
  await page.reload();await page.getByRole('heading',{name:'Enchufe salón editado UI',exact:true}).waitFor();
  const state=await(await context.request.get(`${base}/api/state`)).json();
  const sales=state.sales.filter(s=>s.number.startsWith('F-UI-'));assert.ok(sales.length);assert.equal(sales.at(-1).lines[0].description,f.alias);
  assert.deepEqual(errors,[]);
  await writeFile('data/products-browser-result.json',JSON.stringify({sizes:[390,768,1024,1440],aliasSaved:true,invoiceSnapshot:true,errors},null,2));
}finally{await browser.close();}
