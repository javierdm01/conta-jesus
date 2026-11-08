import { Queue, type ConnectionOptions } from "bullmq";

// Cola de avisos en Redis: la web avisa al worker al instante de que hay un documento nuevo.
// La fuente de verdad sigue siendo la tabla Document (con bloqueo y reintentos), así que si Redis
// no está disponible nada se pierde: el worker sigue sondeando la base de datos.
export function redisConnection(): ConnectionOptions | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  const u = new URL(url);
  return { host: u.hostname, port: Number(u.port || 6379), password: u.password || undefined };
}

let queue: Queue | null | undefined;

export function wakeOcr() {
  try {
    if (queue === undefined) {
      const connection = redisConnection();
      queue = connection ? new Queue("ocr", { connection: { ...connection, enableOfflineQueue: false } }) : null;
      queue?.on("error", () => {});
    }
    // Sin esperar: la subida no debe depender de Redis.
    queue?.add("scan", {}, { removeOnComplete: true, removeOnFail: true }).catch(() => {});
  } catch {}
}
