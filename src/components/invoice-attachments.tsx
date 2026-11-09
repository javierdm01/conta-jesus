"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Button } from "./ui/button";
import { uploadDocument } from "@/lib/optimize-upload";
import type { Doc, Sale } from "@/lib/workspace-types";
type Attachment = { createdAt:string; document:{id:string;originalName:string;number:string|null;kind:string} };
async function post(action:string, data:object){const r=await fetch(`/api/operations/${action}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});const body=await r.json();if(!r.ok)throw Error(body.error??"No se pudo guardar.");return body;}
export default function InvoiceAttachments({sale,documents,refresh}:{sale:Sale;documents:Doc[];refresh:()=>Promise<void>}){
 const [notes,setNotes]=useState(sale.internalNotes??""),[docId,setDocId]=useState(""),[query,setQuery]=useState(""),[term,setTerm]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 useEffect(()=>{const timer=setTimeout(()=>setTerm(query.trim()),250);return()=>clearTimeout(timer)},[query]);
 const {data,error:loadError,mutate}=useSWR<Attachment[]>(`/api/sales/${sale.id}/attachments`,async (url:string)=>{const r=await fetch(url);const body=await r.json();if(!r.ok)throw Error(body.error);return body;});
 const {data:found,error:searchError}=useSWR<{id:string;originalName:string;number?:string|null}[]>(term.length>=2?`/api/search?q=${encodeURIComponent(term)}`:null,async (url:string)=>{const r=await fetch(url);const body=await r.json();if(!r.ok)throw Error(body.error);return body;});
 const run=async(action:()=>Promise<unknown>,message:string)=>{setBusy(true);setError("");setNotice("");try{await action();await Promise.all([mutate(),refresh()]);setNotice(message);}catch(e){setError((e as Error).message)}finally{setBusy(false)}};
 const available=(term.length>=2?(found??[]):documents).filter(d=>!data?.some(a=>a.document.id===d.id));
 return <section className="inv-card invoice-attachments"><h2>Archivos y notas internas</h2><p className="small-note">Guarda albaranes, fotos o documentos relacionados. Las notas internas no aparecen en el PDF de la factura.</p>
  <label>Notas internas<textarea maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Datos que quieras recordar sobre esta factura" /></label>
  <Button type="button" variant="outline" disabled={busy||notes===(sale.internalNotes??"")} onClick={()=>run(()=>post('sale-notes',{saleId:sale.id,notes}),"Notas guardadas.")}>Guardar notas</Button>
  <div className="invoice-attachment-actions"><label>Adjuntar archivo (PDF o imagen, hasta 20 MB)<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";if(file)void run(()=>uploadDocument(file,{kind:'ATTACHMENT',saleId:sale.id}),"Archivo adjuntado.")}} /></label>
  <label>Buscar documento guardado<input type="search" value={query} onChange={e=>{setQuery(e.target.value);setDocId('')}} placeholder="Nombre, número o proveedor" /></label>
  <label>O elegir un documento ya guardado<select value={docId} onChange={e=>setDocId(e.target.value)} disabled={busy}><option value="">Selecciona un documento</option>{available.map(d=><option key={d.id} value={d.id}>{d.number?`${d.number} · `:''}{d.originalName}</option>)}</select></label>
  <Button type="button" variant="outline" disabled={busy||!docId} onClick={()=>run(async()=>{await post('sale-attach',{saleId:sale.id,documentId:docId});setDocId('')},"Documento adjuntado.")}>Adjuntar documento</Button></div>
  {error&&<p className="error" role="alert">{error} {error.includes('ya está registrado')&&'Búscalo y adjúntalo desde los documentos guardados.'}</p>}{loadError&&<p className="error" role="alert">No se pudieron cargar los archivos: {loadError.message}</p>}{searchError&&<p className="error" role="alert">No se pudieron buscar documentos: {searchError.message}</p>}{notice&&<p role="status" className="small-note">{notice}</p>}
  {data?.length ? <ul className="invoice-attachment-list">{data.map(({document:d})=><li key={d.id}><a href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer">{d.number?`${d.number} · `:''}{d.originalName}</a><button type="button" disabled={busy} aria-label={`Desvincular ${d.originalName}`} onClick={()=>run(()=>post('sale-detach',{saleId:sale.id,documentId:d.id}),"Documento desvinculado; se conserva en Documentos.")}>Desvincular</button></li>)}</ul> : data && <p className="small-note">Todavía no hay archivos adjuntos.</p>}
 </section>;
}
