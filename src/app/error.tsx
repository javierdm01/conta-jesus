"use client";
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="p-10 max-w-xl mx-auto"><h1 className="text-2xl font-bold">No se pudo cargar la aplicación</h1><p className="my-4">Comprueba que la base de datos esté iniciada y que se hayan aplicado las migraciones.</p><button className="underline" onClick={reset}>Volver a intentar</button></main>}
