// Solo lectura: verifica el acceso del responsable y captura la instalación actual.
import {chromium} from '@playwright/test';
import {readdir,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.join(process.env.LOCALAPPDATA||'', 'ms-playwright');
const directories=(await readdir(root)).filter(d=>/^chromium-\d+$/.test(d)).sort();
const executablePath=process.env.PLAYWRIGHT_BROWSER_PATH||path.join(root,directories.at(-1),'chrome-win64','chrome.exe');
const browser=await chromium.launch({headless:true,executablePath,args:['--host-resolver-rules=MAP localhost 127.0.0.1']});
try {
  const context=await browser.newContext({viewport:{width:1440,height:960}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.BETTER_AUTH_URL||'http://localhost:3000');
  await page.getByRole('heading',{name:'Vamos a poner orden.'}).waitFor();
  await page.getByLabel('Correo electrónico').fill(process.env.ADMIN_EMAIL);
  await page.getByLabel('Contraseña',{exact:true}).fill(process.env.ADMIN_PASSWORD);
  const loginResponse=page.waitForResponse(r=>r.url().endsWith('/api/auth/sign-in/email')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Entrar a mi empresa'}).click();
  assert.equal((await loginResponse).status(),200,'El inicio de sesión debe responder 200; comprueba también el límite de intentos si se han repetido pruebas.');
  await page.getByRole('heading',{name:'Todo bajo control.'}).waitFor();
  await mkdir('data/screenshots',{recursive:true});
  await page.screenshot({path:'data/screenshots/instalacion-desktop.png',fullPage:true});
  for(const [route,title] of [['/trabajos','Tus trabajos'],['/facturas','Facturas y documentos'],['/inventario','Tu almacén, al día'],['/pedidos','Pedidos a proveedores'],['/trimestres','Trimestres'],['/proveedores','Proveedores'],['/beneficios','Beneficios'],['/configuracion','Configuración']]) {
    await page.goto(new URL(route,process.env.BETTER_AUTH_URL||'http://localhost:3000').href);
    await page.getByRole('heading',{name:title,exact:true}).waitFor();
  }
  await page.setViewportSize({width:390,height:844});
  await page.goto(process.env.BETTER_AUTH_URL||'http://localhost:3000');
  await page.getByRole('heading',{name:'Todo bajo control.'}).waitFor();
  await page.screenshot({path:'data/screenshots/instalacion-movil.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  console.log('OK instalación: acceso, nueve secciones, escritorio y móvil sin errores JavaScript.');
} finally {await browser.close();}
