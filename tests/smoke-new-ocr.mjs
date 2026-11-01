// Subida, proceso OCR y formulario real; solo en una empresa temporal de pruebas.
import { chromium } from '@playwright/test';
import { readFile,readdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const fixture=JSON.parse(await readFile('data/ocr-review-fixture.json','utf8'));
const expected=JSON.parse(await readFile('data/ocr-sonepar/nuevos-lectura-humana.json','utf8')).documents;
const directory='C:/Users/javie/Descargas/FACTURAS PRUEBA';
const root=path.join(process.env.LOCALAPPDATA||'','ms-playwright');
const directories=(await readdir(root)).filter(d=>/^chromium-\d+$/.test(d)).sort();
const executablePath=process.env.PLAYWRIGHT_BROWSER_PATH||path.join(root,directories.at(-1),'chrome-win64','chrome.exe');
const browser=await chromium.launch({headless:true,executablePath});
const context=await browser.newContext({viewport:{width:1440,height:1000}}), page=await context.newPage(), results=[];
const base='http://localhost:3000';
try {
  await page.goto(`${base}/login`);
  await page.getByLabel('Correo electrónico').fill(fixture.email);
  await page.getByLabel('Contraseña',{exact:true}).fill(fixture.password);
  await page.getByRole('button',{name:'Entrar a mi empresa'}).click();
  await page.getByRole('heading',{name:'Todo bajo control.'}).waitFor();
  for(const exp of expected) {
    const name=(await readdir(directory)).find(n=>n.endsWith(`${exp.suffix}.jpg`));
    const upload=await context.request.post(`${base}/api/documents`,{headers:{Origin:base},multipart:{kind:'DELIVERY',file:{name,mimeType:'image/jpeg',buffer:await readFile(path.join(directory,name))}}});
    assert.equal(upload.status(),201,await upload.text());
    results.push({id:(await upload.json()).id,name,expected:exp});
  }
  for(const result of results) {
    let document;const start=Date.now();
    while(Date.now()-start<360000) {
      const response=await context.request.get(`${base}/api/documents/${result.id}/review`);
      assert.equal(response.status(),200);document=await response.json();
      if(['REVIEW','FAILED'].includes(document.status)) break;
      await new Promise(resolve=>setTimeout(resolve,2000));
    }
    assert.equal(document.status,'REVIEW',document.error??'El OCR no finalizó.');
    const s=document.suggestion, exp=result.expected;
    for(const key of ['number','date','net','tax','total']) assert.equal(s[key]??null,exp[key],`${result.name}: ${key}`);
    assert.equal(s.lines.length,exp.lines.length,`${result.name}: líneas`);
    for(const [i,line] of s.lines.entries()) {
      assert.equal(line.reference,exp.lines[i].reference);
      assert.equal(Number(line.quantity),Number(exp.lines[i].quantity));
      for(const key of ['price','discount']) if(exp.lines[i][key]!==undefined) assert.equal(Number(line[key]),Number(exp.lines[i][key]));
      if(exp.suffix==='9467') assert.equal(line.price,'');
    }
    await page.goto(`${base}/facturas`);
    await page.locator('.record').filter({hasText:result.name}).getByRole('button',{name:'Revisar',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Revisar albarán y recibir material'});
    assert.equal(await dialog.getByLabel('Número del documento',{exact:true}).inputValue(),exp.number);
    assert.equal(await dialog.getByLabel('Fecha',{exact:true}).inputValue(),exp.date);
    assert.equal(await dialog.locator('.stock-review-line').count(),exp.lines.length);
    for(const [i,line] of s.lines.entries()) {
      const row=dialog.locator('.stock-review-line').nth(i);
      assert.equal(await row.getByLabel('Referencia del proveedor',{exact:true}).inputValue(),line.reference);
      assert.equal(Number(await row.getByLabel('Cantidad recibida',{exact:true}).inputValue()),Number(line.quantity));
    }
    if(exp.net) for(const [label,key] of [['Base neta (€)','net'],['Impuestos (€)','tax']]) assert.equal(await dialog.getByLabel(label,{exact:true}).inputValue(),exp[key]);
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:`data/ocr-sonepar/movil-${exp.suffix}.png`});
    await page.setViewportSize({width:1440,height:1000});
    await dialog.getByRole('button',{name:'Revisar más tarde'}).click();
    result.suggestion=s;delete result.expected;
    console.log(`OK ${result.name}: subida, OCR, cabecera, artículos y formulario móvil.`);
  }
  await writeFile('data/ocr-sonepar/verificacion-nuevos-app.json',JSON.stringify(results,null,2));
} finally { await browser.close(); }
