import { AppError } from "./access";

const hits = new Map<string, number[]>();
// shortcut: contador en memoria de un solo proceso; si hay varias réplicas web, pasar a Redis.
export function limit(key: string, max: number, windowMs = 60_000, now = Date.now()) {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) throw new AppError("Demasiadas peticiones. Espera un minuto.", 429);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
}
