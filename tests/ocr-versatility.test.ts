import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ocrCellCandidates,
  reconcileOcrCells,
  reconcileOcrTable,
} from "../src/lib/ocr-numbers";
import { numberInkBounds, visibleDecimal } from "../worker/ocr-ink";
import { parseOcr } from "../src/lib/ocr";
import { tabularText } from "../worker/ocr-tabular";
test("una celda no inventa separadores ni importes para hacer cuadrar una línea", () => {
  assert.equal(reconcileOcrCells([["1"], ["8.93"], ["50"], ["447"]]), null);
  assert.deepEqual(
    reconcileOcrCells([["1,00", "4,00"], ["8,930000"], ["50,00"], ["4,47"]]),
    ["1", "8.93", "50", "4.47"],
  );
  assert.equal(
    reconcileOcrCells([["1"], ["8.930001"], ["50"], ["4.47"]]),
    null,
  );
});
test("conciliación global descarta perder la coma en cantidad/total aunque cuadre esa fila", () => {
  const rows = [
    ocrCellCandidates(
      [["200", "200", "2.00"], ["21.92"], ["50"], ["2192", "2192"]],
      true,
    ),
    ocrCellCandidates([["2"], ["11.73"], ["50"], ["11.73"]]),
    ocrCellCandidates([["1"], ["8.93"], ["50"], ["4.47"]]),
    ocrCellCandidates([["1"], ["11.79"], ["50"], ["5.90"]]),
  ];
  const selected = reconcileOcrTable(rows, "44.02");
  assert.equal(selected?.[0][0], "2");
  assert.equal(selected?.[0][3], "21.92");
  assert.equal(reconcileOcrTable(rows, "44.03"), null);
});
test("lecturas igualmente respaldadas no se resuelven a ciegas", () => {
  const choices = ocrCellCandidates([["1", "2"], ["10", "5"], ["0"], ["10"]]);
  assert.equal(reconcileOcrTable([choices], "10"), null);
});
test("la geometría detecta una coma visible, sin añadirla cuando no hay tinta", () => {
  const w = 150,
    h = 100,
    g = new Uint8Array(w * h).fill(255);
  const rect = (x: number, y: number, ww: number, hh: number, tone = 20) => {
    for (let yy = y; yy < y + hh; yy++)
      for (let xx = x; xx < x + ww; xx++) g[yy * w + xx] = tone;
  };
  rect(10, 15, 20, 60);
  rect(60, 15, 20, 60);
  rect(110, 15, 20, 60);
  assert.equal(visibleDecimal(g, w, h), null);
  rect(40, 65, 6, 12, 200);
  assert.deepEqual(visibleDecimal(g, w, h), { after: 1, digits: 3 });
  assert.ok(numberInkBounds(g, w, h));
  assert.equal(numberInkBounds(new Uint8Array(w * h).fill(255), w, h), null);
});
test("tabla de albarán admite seis decimales exactos, referencias auxiliares y redondeo de céntimos", () => {
  const r = parseOcr(
    `Albarán Nº TEST-001\nFecha: 26/10/2026\nCOD ARTICULO  DE SCRIPCION  CANTIDAD  PRECIO  %DTO  IMPORTE\n11513  DOBLE CONMUTADOR  2,00  21,920000  50,00  21,92\nABB 8122\nRef.Prov: 8122 Marca: NIESSEN\n11502  SALIDA DE CABLE  1,00  8,930000  50,00  4,47\nABB 8107\nRef.Prov: 8107 Marca: NIESSEN\nBASE IMPON  %IVA  IMP.%IVA\n26,39  21,00  5,54\nTOTAL ALBARAN 31,93`,
    [],
    "DELIVERY",
  );
  assert.equal(r.lines.length, 2);
  assert.equal(r.lines[0].model, "8122");
  assert.equal(r.lines[0].brand, "NIESSEN");
  assert.equal(r.lines[1].family, "Mecanismos eléctricos");
  assert.equal(r.net, "26.39");
  assert.equal(r.tax, "5.54");
});
test("una fila rechazada no atribuye su referencia de fabricante al artículo anterior", () => {
  const r = parseOcr(
    "Descripción  Cantidad  Precio  Dto  Importe\nCable  1  10,000000  0  10,00\nOtra pieza  1  8,000000  0  9,00\nRef.Prov: OTRA Marca: OTRA",
    [],
    "PURCHASE",
  );
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].model, undefined);
});

test("albarán con tarifa y sin importes conserva cantidades sin inventar coste ni descuento", () => {
  const s=parseOcr("Documento Nº 413361976\nFecha: 26/10/2026\nCODIGO  DESCRIPCION  CANTIDAD  PRECIO\n11513  DOBLE CONMUTADOR  2,00  21,920000\nABB 8122\nRef.Prov: 8122 Marca: NIESSEN\nNº PRODUCTOR RII-PYA 3380\nRD 7821,998 Articulo 18",[],"DELIVERY");
  assert.equal(s.lines.length,1);
  assert.equal(s.lines[0].reference,"11513");
  assert.equal(s.lines[0].quantity,"2.00");
  assert.equal(s.lines[0].price,"");
  assert.equal(s.lines[0].model,"8122");
  assert.equal(s.lines[0].brand,"NIESSEN");
  assert.equal(s.total,undefined);
  assert.equal(s.number,"413361976");
  assert.ok(s.warnings.some(w=>w.startsWith("Tabla sin importes")));
});

test("resumen con total separado no se convierte en número de documento",()=>{
  const s=parseOcr("Base imponible: 34,56\nCuota IVA: 7,26\nTotal documento: 41,82",[],"DELIVERY");
  assert.equal(s.number,undefined);
  assert.equal(s.total,"41.82");
});

test("descuentos consecutivos con barras OCR conservan dimensiones y redondeo",()=>{
  const s=parseOcr("CODIGO  DESCRIPCION  CANT  PRECIO  PTO1|PTO2|DTO3  IMPORTE\n25950X45X1  500 X 450 X 1.5 MM CE-450S JUEGO SOPORTE  4,00  8,00€}  0,00  0 ,00|  0,00  32,00€",[],"DELIVERY");
  assert.equal(s.lines.length,1);
  assert.equal(s.lines[0].description,"500 X 450 X 1.5 MM CE-450S JUEGO SOPORTE");
  assert.equal(s.lines[0].price,"8.00");
});

test("emisor legal se busca antes del CIF sin usar el nombre del cliente de la columna contigua",()=>{
  const s=parseOcr("SPLITMANIA TOLEDO S.L\njesus\n70348621Q  CIF:B45390671\nTelef:925 586 927 Email:split.toledo@splitmania.net",[],"DELIVERY");
  assert.equal(s.supplier?.name,"SPLITMANIA TOLEDO S.L");
  assert.equal(s.supplier?.taxId,"B45390671");
  assert.equal(s.supplier?.email,"split.toledo@splitmania.net");
});

test("coordenadas de tabla preservan la referencia y las dimensiones antes de tres descuentos",()=>{
  const words: [string,number,number,number][]=[
    ["CODIGO",10,10,60],["DESCRIPCION",200,10,100],["CANT",600,10,40],["PRECIO",700,10,50],
    ["PTO1|PTO2|DTO3",800,10,150],["IMPORTE",1000,10,70],
    ["25950X45X1",10,50,100],["500",140,50,30],["X",175,50,10],["450",190,50,30],["SOPORTE",230,50,80],
    ["4,00",600,50,40],["8,00€}",700,50,50],["0,00",800,50,40],["0,00",850,50,40],["0,00",900,50,40],["32,00€",1000,50,60],
  ];
  const tsv="level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n"+words.map(([text,left,top,width],i)=>`5\t1\t1\t1\t1\t${i+1}\t${left}\t${top}\t${width}\t20\t95\t${text}`).join("\n");
  const result=parseOcr(tabularText(tsv),[],"DELIVERY");
  assert.equal(result.lines.length,1);
  assert.equal(result.lines[0].reference,"25950X45X1");
  assert.equal(result.lines[0].description,"500 X 450 SOPORTE");
  assert.equal(result.lines[0].price,"8.00");
});
