import type { Metadata,Viewport } from "next";
import "./globals.css";
export const metadata:Metadata={title:"Instala · Gestión sencilla",description:"Trabajos, materiales y rentabilidad para empresas instaladoras",manifest:"/manifest.webmanifest",appleWebApp:{capable:true,title:"Instala"},icons:{icon:"/icon.svg"}};
export const viewport:Viewport={themeColor:"#115e59",width:"device-width",initialScale:1,viewportFit:"cover"};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="es"><body>{children}</body></html>}
