// Prueba de subida real en empresa aislada creada por ocr-review-integration.ts -- KEEP_TEST_DATA=1.
import { chromium } from '@playwright/test';
import { readFile,readdir,mkdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const fixture=JSON.parse(await readFile('data/ocr-review-fixture.json','utf8'));
const expected=JSON.parse(await readFile('data/ocr-sonepar/lectura-humana.json','utf8'));
const images=process.argv.slice(2);assert.equal(images.length,2,'Indica las dos fotos del mismo albarán.');
const root=path.join(process.env.LOCALAPPDATA||'','ms-playwright');
const directories=(await readdir(root)).filter(d=>/^chromium-\d+$/.test(d)).sort();
const executablePath=process.env.PLAYWRIGHT_BROWSER_PATH||path.join(root,directories.at(-1),'chrome-win64','chrome.exe');
const browser=await chromium.launch({headless:true,executablePath});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage(),errors=[],results=[];
page.on('pageerror',e=>errors.push(e.message));
const canonical=s=>s.replace(/[^A-Z0-9]/gi,'').toUpperCase();
try{
  await page.goto('http://localhost:3000/login');
  await page.getByLabel('Correo electrónico').fill(fixture.email);
  await page.getByLabel('Contraseña',{exact:true}).fill(fixture.password);
  await page.getByRole('button',{name:'Entrar a mi empresa'}).click();
  await page.getByRole('heading',{name:'Todo bajo control.'}).waitFor();
  await page.goto('http://localhost:3000/facturas');
  for(const image of images){
    await page.getByRole('button',{name:'Subir albarán',exact:true}).click();
    const upload=page.getByRole('dialog',{name:'Subir albarán',exact:true});
    await upload.getByLabel('Elegir archivo').setInputFiles(image);
    const response=page.waitForResponse(r=>r.url().endsWith('/api/documents')&&r.request().method()==='POST');
    await upload.getByRole('button',{name:'Subir y leer datos',exact:true}).click();
    const r=await response;assert.equal(r.status(),201,await r.text());
    results.push({id:(await r.json()).id,image:path.basename(image)});
    await upload.waitFor({state:'hidden'});
  }
  for(const result of results){
    const start=Date.now();let document;
    while(Date.now()-start<240000){
      const r=await context.request.get(`http://localhost:3000/api/documents/${result.id}/review`);
      assert.equal(r.status(),200);document=await r.json();
      if(document.status==='FAILED')throw Error(document.error);
      if(document.status==='REVIEW')break;
      await new Promise(resolve=>setTimeout(resolve,2000));
    }
    assert.equal(document.status,'REVIEW','OCR debe terminar dentro del límite de la prueba.');
    const s=document.suggestion;
    for(const key of ['number','date','net','tax','total'])assert.equal(s[key],expected[key],`${result.image}: ${key}`);
    assert.equal(s.lines.length,4,`${result.image}: cuatro artículos`);
    for(const [i,line] of s.lines.entries()){
      const exp=expected.lines[i];
      assert.equal(line.reference,exp.reference,`${result.image}: referencia ${i+1}`);
      for(const key of ['quantity','price','discount'])assert.equal(Number(line[key]),Number(exp[key]),`${result.image}: ${key} artículo ${i+1}`);
      assert.equal(canonical(line.model??''),canonical(exp.manufacturerReference),`${result.image}: fabricante ${i+1}`);
      assert.equal(line.brand,expected.brand,`${result.image}: marca ${i+1}`);
    }
    result.suggestion=s;result.seconds=Math.round((Date.now()-start)/1000);
    await page.reload();
    await page.locator('.record').filter({hasText:result.image}).getByRole('button',{name:'Revisar',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Revisar albarán y recibir material'});
    for(const [label,key] of [['Número del documento','number'],['Fecha','date'],['Base neta (€)','net'],['Impuestos (€)','tax']])assert.equal(await dialog.getByLabel(label,{exact:true}).inputValue(),expected[key]);
    assert.equal(await dialog.locator('.stock-review-line').count(),4);
    for(const [i,line] of s.lines.entries()){
      const row=dialog.locator('.stock-review-line').nth(i);
      for(const [label,key] of [['Referencia del proveedor','reference'],['Cantidad recibida','quantity'],['Precio por unidad (€)','price'],['Descuento (%)','discount']])assert.equal(await row.getByLabel(label,{exact:true}).inputValue(),line[key]);
    }
    await mkdir('data/screenshots',{recursive:true});
    await dialog.locator('.stock-review-line').nth(2).scrollIntoViewIfNeeded();
    await page.screenshot({path:`data/screenshots/sonepar-${result.id}-articulos.png`});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:`data/screenshots/sonepar-${result.id}-movil.png`});
    await page.setViewportSize({width:1440,height:1000});
    await dialog.getByRole('button',{name:'Revisar más tarde'}).click();
    console.log(`OK ${result.image}: OCR real → cuatro artículos, cantidades, precios, descuento, fabricante, marca, cabecera y formulario móvil.`);
  }
  // Confirmar solo una recepción en la empresa de prueba y comprobar la segunda foto como duplicado.
  let supplierId;
  for(const [index,result] of results.entries()){
    await page.locator('.record').filter({hasText:result.image}).getByRole('button',{name:'Revisar',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Revisar albarán y recibir material'});
    if(!index){
      await dialog.getByRole('button',{name:'Crear proveedor',exact:true}).click();
      assert.equal(await dialog.getByLabel('Nombre del proveedor',{exact:true}).inputValue(),expected.supplier);
      assert.equal(await dialog.getByLabel('NIF / CIF',{exact:true}).inputValue(),'');
      await dialog.getByRole('button',{name:'Guardar y seleccionar proveedor'}).click();
      await dialog.getByRole('button',{name:'Crear proveedor',exact:true}).waitFor();
      supplierId=await dialog.getByLabel('Proveedor',{exact:true}).inputValue();
    }else await dialog.getByLabel('Proveedor',{exact:true}).selectOption(supplierId);
    await dialog.getByLabel('He revisado el original, las cantidades, las unidades y los datos de cada artículo.').check();
    const response=page.waitForResponse(r=>r.url().endsWith('/api/operations/stock-confirm')&&r.request().method()==='POST');
    await dialog.getByRole('button',{name:'Recibir material'}).click();
    const r=await response;assert.equal(r.status(),index?409:200,await r.text());
    if(!index){
      const body=await r.json();assert.equal(body.lots.length,4);
      await dialog.waitFor({state:'hidden'});
      const inv=await (await context.request.get('http://localhost:3000/api/inventory')).json();
      const lots=inv.lots.filter(l=>body.lots.some(created=>created.id===l.id));
      assert.equal(lots.length,4);assert.equal(lots.reduce((sum,l)=>sum+Number(l.received),0),6);
      await page.goto('http://localhost:3000/facturas');
    }else await dialog.getByRole('button',{name:'Revisar más tarde'}).click();
  }
  assert.deepEqual(errors,[]);
  await writeFile('data/ocr-sonepar/verificacion-app.json',JSON.stringify(results,null,2));
  console.log('OK recepción aislada: cuatro lotes y seis unidades. La segunda foto devuelve 409 y no duplica la recepción.');
}finally{await browser.close();}
