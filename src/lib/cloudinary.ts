import { createHash } from "node:crypto";
import { AppError } from "./access";

// Credenciales: CLOUDINARY_URL (cloudinary://clave:secreto@nombre) o las tres variables sueltas.
function credentials() {
  const url = process.env.CLOUDINARY_URL?.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);
  const cloud = url?.[3] ?? process.env.CLOUDINARY_CLOUD_NAME;
  const key = url?.[1] ?? process.env.CLOUDINARY_API_KEY;
  const secret = url?.[2] ?? process.env.CLOUDINARY_API_SECRET;
  if (!cloud || !key || !secret) throw new AppError("Cloudinary no está configurado (CLOUDINARY_URL en .env).", 503);
  return { cloud, key, secret };
}

/** Sube una imagen (ya reducida) a Cloudinary con firma y devuelve su URL https. */
export async function uploadImage(bytes: Uint8Array, folder = "almacen") {
  const { cloud, key, secret } = credentials();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHash("sha1").update(`folder=${folder}&timestamp=${timestamp}${secret}`).digest("hex");
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(bytes)], { type: "image/webp" }), "foto.webp");
  form.set("api_key", key);
  form.set("timestamp", timestamp);
  form.set("folder", folder);
  form.set("signature", signature);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/image/upload`, { method: "POST", body: form });
  const body = (await res.json().catch(() => ({}))) as { secure_url?: string; error?: { message?: string } };
  if (!res.ok || !body.secure_url) throw new AppError(`No se pudo subir la imagen${body.error?.message ? `: ${body.error.message}` : "."}`, 502);
  return body.secure_url;
}
