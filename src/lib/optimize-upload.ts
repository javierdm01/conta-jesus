// Reduce las fotos en el navegador antes de subirlas: menos datos por la red y subida mucho más rápida.
// Los PDF y los archivos pequeños pasan tal cual. Si algo falla se sube el original.
const MAX_SIDE = { document: 3000, photo: 2000 };

export async function optimizeFile(file: File, kind: "document" | "photo" = "document"): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  const limit = MAX_SIDE[kind];
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, limit / Math.max(bitmap.width, bitmap.height));
    // Una foto ya ligera y de tamaño correcto no se vuelve a comprimir.
    if (scale === 1 && file.size < 600_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", kind === "photo" ? 0.8 : 0.88));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export async function uploadDocument(file: File, fields: Record<string, string>) {
  const form = new FormData();
  form.set("file", await optimizeFile(file, fields.kind === "PHOTO" || fields.kind === "EXPENSE" ? "photo" : "document"));
  for (const [k, v] of Object.entries(fields)) if (v) form.set(k, v);
  const res = await fetch("/api/documents", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw Error(data.error ?? "No se pudo subir el archivo.");
  return data as { id: string };
}
