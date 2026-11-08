// Spinner: solo para botones y servicios pequeños dentro de una pantalla. Las cargas de pantalla usan skeletons.
export function Spinner({ className = "" }: { className?: string }) {
  return <span className={`spinner ${className}`} role="status" aria-label="Cargando" />;
}
