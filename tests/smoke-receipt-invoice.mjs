import { chromium } from '@playwright/test';
import { readFile,readdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const f=JSON.parse(await readFile('data/inventory-fixture.json','utf8')), m=f.multiReceipt;
const base='http://localhost:3000', root=path.join(process.env.LOCALAPPDATA||'','ms-playwright');
const dirs=(await readdir(root)).filter(d=>/^chromium-\d+$/.test(d)).sort();
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_BROWSER_PATH||path.join(root,dirs.at(-1),'chrome-win64','chrome.exe')});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto(`${base}/login`);
  await page.getByLabel('Correo electrónico').fill(f.email);await page.getByLabel('Contraseña',{exact:true}).fill(f.password);
  await page.getByRole('button',{name:'Entrar a mi empresa'}).click();await page.getByRole('heading',{name:'Todo bajo control.'}).waitFor();
  const before=await (await context.request.get(`${base}/api/inventory`)).json();
  await page.goto(`${base}/facturas`);
  await page.locator('.record').filter({hasText:'PRUEBA-FACTURA-UI-DOS-ALBARANES.png'}).filter({has:page.getByRole('button',{name:'Revisar',exact:true})}).first().getByRole('button',{name:'Revisar',exact:true}).click();
  let dialog=page.getByRole('dialog',{name:'Revisar factura de compra'});
  assert.equal(await dialog.getByLabel('Destino del material').inputValue(),'RECONCILE');
  assert.equal((await dialog.getByLabel('Número del documento',{exact:true}).inputValue()).toUpperCase(),m.invoiceNumber.toUpperCase());
  for(const r of [m.first,m.second]) await dialog.locator('label').filter({hasText:r.number}).locator('input[type=checkbox]').check();
  assert.equal(await dialog.locator('.stock-review-line').count(),2);
  for(const [receipt,q] of [[m.first,3],[m.second,2]]) {
    const row=dialog.locator('.stock-review-line').filter({hasText:receipt.number});
    assert.equal(Number(await row.getByLabel('Cantidad recibida',{exact:true}).inputValue()),q);
    assert.equal(await row.getByLabel('Precio por unidad (€)',{exact:true}).inputValue(),'4');
    assert.ok(await row.getByLabel('Cantidad recibida',{exact:true}).getAttribute('readonly')!==null);
  }
  await page.setViewportSize({width:390,height:844});
  await dialog.locator('.stock-review-line').first().scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'data/ocr-sonepar/factura-dos-albaranes-movil.png'});
  await page.setViewportSize({width:1440,height:1000});
  await dialog.getByLabel('He revisado el original, las cantidades, las unidades y los datos de cada artículo.').check();
  const response=page.waitForResponse(r=>r.url().endsWith('/api/operations/stock-reconcile')&&r.request().method()==='POST');
  await dialog.getByRole('button',{name:'Guardar factura',exact:true}).click();const confirmed=await response;assert.equal(confirmed.status(),200,await confirmed.text());
  await dialog.waitFor({state:'hidden'});
  const after=await (await context.request.get(`${base}/api/inventory`)).json();
  assert.equal(after.lots.length,before.lots.length);
  for(const r of [m.first,m.second]) {
    const previous=before.lots.find(l=>l.id===r.lotId),current=after.lots.find(l=>l.id===r.lotId);
    assert.equal(current.code,previous.code);assert.equal(current.onHand,previous.onHand);
    assert.equal(Number(current.totalValue),Number(current.received)*4);
  }
  await page.goto(`${base}/facturas`);
  const invoice=page.locator('.record').filter({hasText:m.invoiceNumber});
  await invoice.waitFor();assert.match(await invoice.textContent(),new RegExp(m.first.number,'i'));assert.match(await invoice.textContent(),new RegExp(m.second.number,'i'));
  assert.equal(await page.locator('.record').filter({hasText:m.first.number}).filter({has:page.getByRole('link',{name:'Ver factura',exact:true})}).count(),1);
  console.log('OK navegador: dos albaranes → una factura, precios y cantidades repartidos, mismos códigos y existencias, asociación visible en ambos sentidos.');

  // La foto real comprueba que una tarifa OCR se muestra como provisional sin coste definitivo.
  const name='26-10-27 22-15-05 9467.jpg';
  const state=await (await context.request.get(`${base}/api/state`)).json();
  let id=state.documents.find(d=>d.originalName===name)?.id;
  if(!id){const upload=await context.request.post(`${base}/api/documents`,{headers:{Origin:base},multipart:{kind:'DELIVERY',file:{name,mimeType:'image/jpeg',buffer:await readFile(path.join('C:/Users/javie/Descargas/FACTURAS PRUEBA',name))}}});assert.equal(upload.status(),201,await upload.text());id=(await upload.json()).id;}
  let document;const start=Date.now();
  while(Date.now()-start<240000){document=await (await context.request.get(`${base}/api/documents/${id}/review`)).json();if(['REVIEW','FAILED'].includes(document.status))break;await new Promise(r=>setTimeout(r,1500));}
  assert.equal(document.status,'REVIEW',document.error);
  await page.reload();await page.locator('.record').filter({hasText:name}).getByRole('button',{name:'Revisar',exact:true}).click();
  dialog=page.getByRole('dialog',{name:'Revisar albarán y recibir material'});
  await dialog.waitFor();await dialog.locator('.stock-review-line').first().waitFor();
  assert.equal(await dialog.locator('.stock-review-line').count(),4);
  assert.equal(await dialog.getByLabel(/Coste pendiente de factura/).isChecked(),true);
  for(const [i,price] of [21.92,11.73,8.93,11.79].entries()) assert.equal(Number(await dialog.locator('.stock-review-line').nth(i).getByLabel('Precio unitario indicado (opcional)').inputValue()),price);
  console.log('OK foto Sonepar real: cuatro tarifas OCR conservadas y visibles como provisionales; no se confirma una nueva entrada.');
  assert.deepEqual(errors,[]);
  await writeFile('data/ocr-sonepar/verificacion-conciliacion-app.json',JSON.stringify({invoiceId:m.invoiceId,receiptIds:[m.first.id,m.second.id],stockUnchanged:true,observedPrices:document.suggestion.lines.map(l=>l.observedUnitPrice)},null,2));
} finally {await browser.close();}
