import { test } from "node:test";
import assert from "node:assert/strict";
import {
  downloadSoneparDocument,
  soneparDocumentRequest,
  SoneparConnectorError,
  SONEPAR_DOCUMENT_URL,
} from "../src/lib/connectors/sonepar";
const ref = {
  accountId: "00001234",
  documentDownloadId: "opaque-document-id",
  createdAt: "2026-10-15T00:00:00Z",
};
test("Sonepar reproduce operación observada, conserva cuenta y referencia opaca, sin credenciales embebidas", () => {
  const init = soneparDocumentRequest(ref),
    body = JSON.parse(init.body as string);
  assert.equal(init.method, "POST");
  assert.equal(init.credentials, "include");
  assert.equal(init.redirect, "error");
  assert.deepEqual(body.variables, {
    accountId: ref.accountId,
    document: {
      documentDownloadId: ref.documentDownloadId,
      createdAt: ref.createdAt,
    },
  });
  assert.equal(body.operationName, "orderDocumentsV2");
  assert.equal(new Headers(init.headers).has("cookie"), false);
  assert.equal(new Headers(init.headers).has("authorization"), false);
});
test("Sonepar rechaza referencias incompletas y fechas imposibles antes de consultar", async () => {
  for (const reference of [
    { ...ref, accountId: "" },
    { ...ref, documentDownloadId: " " },
    { ...ref, createdAt: "2026-02-30T00:00:00Z" },
  ]) {
    await assert.rejects(
      () =>
        downloadSoneparDocument(reference, async () => {
          throw Error("No debe llamar");
        }),
      (e) => e instanceof SoneparConnectorError && e.reason === "input",
    );
  }
});
test("Sonepar devuelve el contenido tal como viene, sin inventar formato ni seguir enlaces", async () => {
  let calls = 0;
  const result = await downloadSoneparDocument(ref, async (url, init) => {
    calls++;
    assert.equal(url, SONEPAR_DOCUMENT_URL);
    assert.ok(init.signal);
    return Response.json({
      data: {
        orderDocumentsV2: {
          content: "unverified-content",
          contentType: "application/pdf",
          __typename: "DocumentContent",
        },
      },
    });
  });
  assert.deepEqual(result, {
    content: "unverified-content",
    contentType: "application/pdf",
  });
  assert.equal(calls, 1);
});
test("Sonepar distingue sesión, límite y GraphQL HTTP 200, y no filtra errores del proveedor", async () => {
  for (const [status, reason] of [
    [401, "session"],
    [403, "session"],
    [429, "rate-limit"],
    [500, "provider"],
  ] as const) {
    await assert.rejects(
      () =>
        downloadSoneparDocument(
          ref,
          async () => new Response("dato privado", { status }),
        ),
      (e) =>
        e instanceof SoneparConnectorError &&
        e.reason === reason &&
        !e.message.includes("dato privado"),
    );
  }
  for (const [payload, reason] of [
    [
      {
        errors: [
          { message: "dato privado", extensions: { code: "UNAUTHENTICATED" } },
        ],
      },
      "session",
    ],
    [
      {
        errors: [{ message: "dato privado" }],
        data: {
          orderDocumentsV2: {
            content: "parcial",
            contentType: "application/pdf",
          },
        },
      },
      "provider",
    ],
    [{ data: { orderDocumentsV2: null } }, "response"],
  ] as const) {
    await assert.rejects(
      () => downloadSoneparDocument(ref, async () => Response.json(payload)),
      (e) =>
        e instanceof SoneparConnectorError &&
        e.reason === reason &&
        !e.message.includes("dato privado"),
    );
  }
  await assert.rejects(
    () =>
      downloadSoneparDocument(
        ref,
        async () => new Response("<html>Login</html>"),
      ),
    (e) => e instanceof SoneparConnectorError && e.reason === "response",
  );
});
