import { layoutRows, layoutText } from "../src/lib/ocr-layout";
import { numericColumns } from "./ocr-gaps";

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
/** Reassemble table columns by their printed positions, retaining only observed text. */
export function tabularText(tsv: string) {
  const rows = layoutRows(tsv);
  const lines = layoutText(tsv).split("\n");
  const index = rows.findIndex(r => r.words.some(w => /^CANT(?:IDAD|IDA)?$/.test(norm(w.text))) && r.words.some(w => norm(w.text)==="PRECIO") && r.words.some(w=>/^DESCRIPCI[OE]N$/.test(norm(w.text))));
  if(index < 0) return lines.join("\n");
  const header = rows[index].words.flatMap(w=>{
    const parts=w.text.split(/[|{}]/).filter(Boolean);
    return parts.map((text,i)=>({...w,text,left:w.left+w.width*i/parts.length,width:w.width/parts.length}));
  });
  const quantity = header.find(w=>/^CANT(?:IDAD|IDA)?$/.test(norm(w.text)))!;
  const price = header.find(w=>norm(w.text)==="PRECIO")!;
  const amount = header.find(w=>norm(w.text)==="IMPORTE");
  const discounts = header.filter(w=>/^(?:D|P)T[O0]0?[123]?$/.test(norm(w.text)) && w.left>price.left && (!amount || w.left<amount.left));
  const brand = header.find(w=>norm(w.text)==="MARCA");
  const description = header.find(w=>/^DESCRIPCI[OE]N$/.test(norm(w.text)))!;
  const codeHeader = header.find(w=>/^(CODIGO|CODARTICULO)$/.test(norm(w.text)));
  const numericHeaders = [quantity,price,...discounts,...(amount?[amount]:[])].sort((a,b)=>a.left-b.left);
  // Las columnas salen de donde están los números, no de los nombres de cabecera (que el OCR confunde: «Dio», «Bto»).
  const data = numericColumns(rows, index);
  const starts = data ? data.columns.map((c,i)=>i===0?c.left-20:(data.columns[i-1].right+c.left)/2) : numericHeaders.map((w,i)=>i===0?w.left-20:(numericHeaders[i-1].left+numericHeaders[i-1].width+w.left)/2);
  lines[index] = data ? `CODIGO  DESCRIPCION  CANTIDAD  PRECIO${"  DTO".repeat(data.size-3)}  IMPORTE` : `CODIGO  DESCRIPCION  CANTIDAD  PRECIO${discounts.map(()=>"  DTO").join("")}${amount?"  IMPORTE":""}`;
  for(let i=index+1;i<rows.length;i++) {
    const words=rows[i].words;
    if(/PRODUCTOR|BASE\s*IMP|IMP\.?\s*BRUTO|INFORMACI[OÓ]N|FORMA DE PAGO/i.test(words.map(w=>w.text).join(" "))) break;
    const auxiliary=words.findIndex(w=>/^ABB$/.test(norm(w.text)) || /^REFPROV$/.test(norm(w.text)));
    if(auxiliary>=0) { lines[i]=words.slice(auxiliary).map(w=>w.text).join(" ").replace(/\s*:\s*$/," ").trim(); continue; }
    const reference = words.filter(w=>w.left<description.left-10 && /^[A-Z0-9][A-Z0-9._/-]{3,24}$/.test(w.text) && /\d/.test(w.text)).sort((a,b)=>Math.abs(a.left-(codeHeader?.left??description.left-50))-Math.abs(b.left-(codeHeader?.left??description.left-50)))[0];
    if(!reference) continue;
    const values = starts.map((left,j)=>words.filter(w=>w.left+w.width/2>=left && (j===starts.length-1 || w.left+w.width/2<starts[j+1])).map(w=>w.text).join("").replace(/[€|{}():'’]/g,""));
    if(values.some(v=>!/^-?\d+(?:[.,]\d+)?$/.test(v))) continue;
    const end = header.find(w=>/^T?RAEE/.test(norm(w.text)))?.left ?? starts[0];
    const desc=words.filter(w=>w!==reference && w.left>reference.left+reference.width-3 && (!brand || w.left>=description.left-10) && w.left+w.width/2<end).map(w=>w.text).join(" ").replace(/^[|]+/,"").trim();
    if(desc.length<3) continue;
    const b = brand ? words.filter(w=>w.left>=brand.left-10 && w.left<description.left-10).map(w=>w.text).join(" ") : "";
    lines[i]=`${reference.text}  ${desc}  ${values.join("  ")}${b?`\nRef.Prov: ${reference.text} Marca: ${b}`:""}`;
  }
  const identity = lines.slice(Math.max(0,index-7),index).join(" ").replace(/\|/g," ");
  const dates=[...identity.matchAll(/\b\d{2}\/\d{2}\/\d{4}\b/g)];
  const numbers=[...identity.replace(/\d{2}\/\d{2}\/\d{4}/g,"").matchAll(/\b(?:\d{7,12}|\d{2,5}-\d{3,8})\b/g)];
  const datedRow=lines.slice(Math.max(0,index-7),index).find(l=>/\b\d{2}\/\d{2}\/\d{4}\b/.test(l));
  const datedNumber=datedRow?.match(/^\s*(\d{7,12})\s+(?:\S+\s+){0,2}\d{2}\/\d{2}\/\d{4}\b/)?.[1];
  if(dates.length===1) lines.unshift(`Fecha: ${dates[0][0]}`);
  if(datedNumber || numbers.length===1) lines.unshift(`Documento Nº ${datedNumber??numbers[0][0]}`);
  return lines.join("\n");
}
