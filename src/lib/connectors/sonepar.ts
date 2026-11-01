/** Contrato observado en el portal Sonepar; no equivale a una API pública con soporte.
 * El transporte lo aporta una sesión autorizada. Node fetch no hereda cookies del navegador.
 * No se guardan credenciales ni se confirman compras desde este módulo.
 */
export type SoneparDocumentReference = {
  accountId: string;
  documentDownloadId: string;
  createdAt: string;
};
export type SoneparDocumentContent = { content: string; contentType: string };
export type SoneparTransport = (
  url: string,
  init: RequestInit,
) => Promise<Response>;
export class SoneparConnectorError extends Error {
  constructor(
    public readonly reason:
      "input" | "session" | "rate-limit" | "provider" | "response" | "network",
    message: string,
  ) {
    super(message);
    this.name = "SoneparConnectorError";
  }
}
export const SONEPAR_DOCUMENT_URL =
  "https://sonepar.es/graphql?orderDocumentsV2";
const query = `query orderDocumentsV2($accountId: ID!, $document: DocumentToExport!) {
  orderDocumentsV2(accountId: $accountId, document: $document) {
    content
    contentType
    __typename
  }
}`;

export function soneparDocumentRequest(
  reference: SoneparDocumentReference,
): RequestInit {
  const { accountId, documentDownloadId, createdAt } = reference;
  const date = new Date(createdAt);
  if (
    !/^\d{1,20}$/.test(accountId) ||
    !documentDownloadId.trim() ||
    documentDownloadId.length > 8192 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(createdAt) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 19) !== createdAt.slice(0, 19)
  ) {
    throw new SoneparConnectorError(
      "input",
      "Referencia de documento Sonepar no válida.",
    );
  }
  return {
    method: "POST",
    credentials: "include",
    redirect: "error",
    cache: "no-store",
    headers: {
      accept: "*/*",
      "accept-language": "es-ES",
      "content-type": "application/json",
      "apollographql-client-name": "spark-account",
      "x-opco": "esp-sonesp",
      "x-opco-id": "ESP-SONESP",
    },
    body: JSON.stringify({
      operationName: "orderDocumentsV2",
      variables: {
        accountId,
        document: { documentDownloadId, createdAt },
      },
      query,
    }),
  };
}

/** El identificador se trata como opaco: no se fabrica ni se cambian sus campos internos. */
export async function downloadSoneparDocument(
  reference: SoneparDocumentReference,
  transport: SoneparTransport,
): Promise<SoneparDocumentContent> {
  const init = soneparDocumentRequest(reference);
  let response: Response;
  try {
    response = await transport(SONEPAR_DOCUMENT_URL, {
      ...init,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new SoneparConnectorError(
      "network",
      "No se pudo contactar con Sonepar. Comprueba la conexión y la sesión.",
    );
  }
  if ([401, 403].includes(response.status))
    throw new SoneparConnectorError(
      "session",
      "Sonepar requiere iniciar sesión de nuevo.",
    );
  if (response.status === 429)
    throw new SoneparConnectorError(
      "rate-limit",
      "Sonepar ha limitado las consultas. Espera antes de reintentar.",
    );
  if (!response.ok)
    throw new SoneparConnectorError(
      "provider",
      "Sonepar no ha podido entregar el documento.",
    );
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new SoneparConnectorError(
      "response",
      "La respuesta no contiene datos GraphQL. Puede haber caducado la sesión.",
    );
  }
  if (!payload || typeof payload !== "object")
    throw new SoneparConnectorError("response", "Respuesta Sonepar no válida.");
  const result = payload as {
    errors?: unknown;
    data?: { orderDocumentsV2?: unknown };
  };
  if (
    result.errors !== undefined &&
    (!Array.isArray(result.errors) || result.errors.length)
  ) {
    const session =
      Array.isArray(result.errors) &&
      result.errors.some(
        (e) =>
          e &&
          typeof e === "object" &&
          ["UNAUTHENTICATED", "FORBIDDEN"].includes(
            (e as { extensions?: { code?: string } }).extensions?.code ?? "",
          ),
      );
    throw new SoneparConnectorError(
      session ? "session" : "provider",
      session
        ? "Sonepar requiere iniciar sesión de nuevo."
        : "Sonepar ha rechazado la consulta del documento.",
    );
  }
  const doc = result.data?.orderDocumentsV2;
  if (
    !doc ||
    typeof doc !== "object" ||
    !("content" in doc) ||
    !("contentType" in doc) ||
    typeof doc.content !== "string" ||
    !doc.content.trim() ||
    typeof doc.contentType !== "string" ||
    !doc.contentType.trim()
  ) {
    throw new SoneparConnectorError(
      "response",
      "Sonepar no ha devuelto el contenido del documento.",
    );
  }
  // No se interpreta como PDF/base64/URL hasta comprobar una respuesta real.
  return { content: doc.content, contentType: doc.contentType };
}
