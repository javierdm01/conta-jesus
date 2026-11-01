"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
export function Dialog({open,onOpenChange,title,children,wide=false}:{open:boolean,onOpenChange:(v:boolean)=>void,title:string,children:React.ReactNode,wide?:boolean}){
  return <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}><DialogPrimitive.Portal><DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm"/><DialogPrimitive.Content aria-describedby={undefined} className={`dialog ${wide?"dialog-wide":""}`}><div className="dialog-head"><DialogPrimitive.Title className="text-xl font-bold">{title}</DialogPrimitive.Title><DialogPrimitive.Close className="rounded-lg p-2 hover:bg-slate-100" aria-label="Cerrar"><X size={20}/></DialogPrimitive.Close></div>{children}</DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>
}
