import { chromium, expect } from '@playwright/test';
import { readFile,readdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const f=JSON.parse(await readFile('data/inventory-fixture.json','utf8')),base='http://localhost:3000';
const root=path.join(process.env.LOCALAPPDATA||'','ms-playwright');
const dirs=(await readdir(root)).filter(d=>/^chromium-\d+$/.test(d)).sort();
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_BROWSER_PATH||path.join(root,dirs.at(-1),'chrome-win64','chrome.exe')});
const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[],results=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto(`${base}/login`);await page.getByLabel('Correo electrónico').fill(f.email);await page.getByLabel('Contraseña',{exact:true}).fill(f.password);await page.getByRole('button',{name:'Entrar a mi empresa'}).click();await page.getByRole('heading',{name:'Todo bajo control.'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Subir albarán',exact:true}).count(),1);
  await page.goto(`${base}/facturas`);
  await page.getByRole('heading',{name:'Albaranes y facturas',exact:true}).waitFor();
  for(const label of ['Subir albarán','Subir factura de proveedor'])assert.equal(await page.getByRole('button',{name:label,exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:'Subir documento',exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'data/ocr-sonepar/documentos-sencillos-movil.png'});
  await page.getByRole('button',{name:'Más acciones',exact:true}).click();
  const menu=page.getByRole('dialog',{name:'¿Qué necesitas hacer?'});await menu.waitFor();
  assert.equal(await menu.getByRole('button',{name:'Crear proveedor',exact:true}).isVisible(),false);
  await menu.locator('summary').filter({hasText:'Trabajos, contactos y otras acciones'}).click();
  assert.equal(await menu.getByRole('button',{name:'Crear proveedor',exact:true}).isVisible(),true);
  await menu.getByRole('button',{name:'Cerrar',exact:true}).click();
  for(const item of [
    {kind:'DELIVERY',button:'Subir albarán',dialog:'Subir albarán',file:'C:/Users/javie/Descargas/FACTURAS PRUEBA/26-10-27 22-15-09 9468.jpg',lines:2,number:'27-69173'},
    {kind:'PURCHASE',button:'Subir factura de proveedor',dialog:'Subir factura de proveedor',file:'data/ocr-debug/invoice-original.jpg',lines:5,number:'28-95151'},
  ]){
    await page.getByRole('button',{name:item.button,exact:true}).click();
    const dialog=page.getByRole('dialog',{name:item.dialog,exact:true});await dialog.waitFor();
    assert.equal(await dialog.locator('select[name=kind]').inputValue(),item.kind);
    assert.equal(await dialog.locator('select[name=jobId]').isVisible(),false);
    assert.equal(await dialog.getByRole('button',{name:'Subir y leer datos',exact:true}).isDisabled(),true);
    assert.equal(await dialog.getByLabel('Hacer foto',{exact:true}).getAttribute('capture'),'environment');
    await dialog.getByLabel('Elegir archivo',{exact:true}).setInputFiles(item.file);
    await page.screenshot({path:`data/ocr-sonepar/subir-${item.kind.toLowerCase()}-movil.png`});
    const response=page.waitForResponse(r=>r.url().endsWith('/api/documents')&&r.request().method()==='POST');
    await dialog.getByRole('button',{name:'Subir y leer datos',exact:true}).click();
    const r=await response;let id;
    if(r.status()===409){
      assert.match(await r.text(),/ya está registrado/);
      const state=await(await context.request.get(`${base}/api/state`)).json();id=state.documents.find(d=>d.originalName===path.basename(item.file)&&d.kind===item.kind)?.id;assert.ok(id);
      await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();await page.getByRole('button',{name:/Pendientes de revisar/}).click();
    }else{assert.equal(r.status(),201,await r.text());id=(await r.json()).id;}
    results.push({id,...item});await dialog.waitFor({state:'hidden'});
    await expect(page.getByRole('button',{name:/Pendientes de revisar/})).toHaveAttribute('aria-pressed','true');
  }
  for(const item of results){
    let doc;const start=Date.now();while(Date.now()-start<300000){doc=await(await context.request.get(`${base}/api/documents/${item.id}/review`)).json();if(['REVIEW','FAILED'].includes(doc.status))break;await new Promise(r=>setTimeout(r,1500));}
    assert.equal(doc.status,'REVIEW',doc.error);assert.equal(doc.kind,item.kind);assert.equal(doc.suggestion.lines.length,item.lines);assert.equal(doc.suggestion.number,item.number);
    await page.reload();await page.locator('.record').filter({hasText:path.basename(item.file)}).getByRole('button',{name:'Revisar',exact:true}).click();
    const review=page.getByRole('dialog');await review.waitFor();await review.locator('.stock-review-line').first().waitFor();
    assert.equal(await review.locator('.stock-review-line').count(),item.lines);
    assert.equal(await review.locator('.review-original').getAttribute('open'),null);
    assert.equal(await review.getByLabel('Número del documento',{exact:true}).inputValue(),item.number);
    if(item.kind==='DELIVERY')assert.equal(await review.getByRole('button',{name:'Recibir material',exact:true}).count(),1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:`data/ocr-sonepar/revisar-${item.kind.toLowerCase()}-movil.png`});
    await review.getByRole('button',{name:'Revisar más tarde',exact:true}).click();
    console.log(`OK ${item.kind}: entrada directa → archivo → subida → lectura real → revisión móvil (${item.lines} líneas).`);
  }
  await page.setViewportSize({width:1440,height:1000});await page.goto(`${base}/facturas`);await page.screenshot({path:'data/ocr-sonepar/documentos-sencillos-escritorio.png'});
  assert.deepEqual(errors,[]);await writeFile('data/ocr-sonepar/interfaz-verificada-29.json',JSON.stringify(results,null,2));
}finally{await browser.close();}
