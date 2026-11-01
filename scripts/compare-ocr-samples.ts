// Comparación de resultados reales con una lectura visual independiente. No modifica la BD.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { dec } from "../src/lib/money";

async function main() {
  const directory=process.argv[2]??"data/ocr-sonepar";
  const expected=JSON.parse(await readFile(path.join(directory,"nuevos-lectura-humana.json"),"utf8"));
  const reports=[];
  for(const document of expected.documents) {
    const file=path.join(directory,`${document.suffix==="9468"?"final":"verificado"}-${document.suffix}.json`);
    const {suggestion:s}=JSON.parse(await readFile(file,"utf8"));
    const issues:string[]=[];
    for(const field of ["number","date","net","tax","total"])
      if((s[field]??null)!==document[field]) issues.push(`${field}: esperado ${document[field]}, obtenido ${s[field]??"vacío"}`);
    if(s.lines.length!==document.lines.length) issues.push(`Artículos: ${s.lines.length}/${document.lines.length}`);
    for(const [i,line] of document.lines.entries()) {
      const actual=s.lines[i];
      if(!actual) continue;
      if(actual.reference!==line.reference) issues.push(`Referencia ${i+1}: ${actual.reference} / ${line.reference}`);
      for(const field of ["quantity","price","discount"]) {
        if(line[field]!==undefined && (!actual[field] || !dec(actual[field]).eq(line[field]))) issues.push(`${field} del artículo ${i+1}: ${actual[field]} / ${line[field]}`);
      }
      if(document.suffix==="9467" && actual.price!=="") issues.push(`Artículo ${i+1}: se ha aplicado un precio neto sin descuento impreso`);
      if(line.description && !actual.description.includes(line.description)) issues.push(`Descripción ${i+1}: ${actual.description}`);
      for(const field of ["model","brand"]) if(line[field] && (actual[field]??"").replace(/\s/g,"")!==line[field].replace(/\s/g,"")) issues.push(`${field} del artículo ${i+1}: ${actual[field]??"vacío"} / ${line[field]}`);
    }
    if(document.taxId && s.supplier?.taxId!==document.taxId) issues.push(`CIF emisor: ${s.supplier?.taxId??"vacío"}`);
    reports.push({image:document.suffix,type:document.type,number:s.number,date:s.date,articles:s.lines.length,units:s.lines.reduce((n:number,l:{quantity:string})=>n+Number(l.quantity),0),net:s.net??null,tax:s.tax??null,total:s.total??null,issues,source:file});
  }
  await writeFile(path.join(directory,"comparacion-nuevos.json"),JSON.stringify({generatedAt:new Date().toISOString(),reports},null,2));
  console.log(JSON.stringify(reports,null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
