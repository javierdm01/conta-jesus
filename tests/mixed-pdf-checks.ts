import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { APIRequestContext } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";
export async function checkMixedPdf(a: APIRequestContext, db: PrismaClient) {
  const token = randomUUID().slice(0, 8);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="650"><rect width="1600" height="650" fill="white"/><g font-family="Arial" font-size="42"><text x="60" y="90">MARCADOR ESCANEADO ${token}</text><text x="60" y="180">Magnetotermico 20 ud 5,00 0 % 100,00</text><text x="60" y="270">Base imponible: 150,00</text><text x="60" y="360">Total IVA: 31,50</text></g></svg>`;
  const jpg = await sharp(Buffer.from(svg))
    .flatten({ background: "white" })
    .toColourspace("srgb")
    .jpeg({ quality: 95 })
    .toBuffer();
  const native = `BT /F1 16 Tf 40 790 Td (FACTURA N: MIXTA-${token}) Tj 0 -35 Td (MARCADOR NATIVO DOCUMENTO DE PRUEBA) Tj 0 -35 Td (Proveedor de prueba B12345678) Tj 0 -35 Td (Fecha: 19/10/2026) Tj 0 -35 Td (Cable H07 100 m 0,50 0 % 50,00) Tj 0 -35 Td (La segunda pagina contiene una imagen escaneada con mas material.) Tj ET`;
  const scan = "q 530 0 0 215 30 550 cm /Im1 Do Q";
  const stream = (data: Buffer, dict = "") =>
    Buffer.concat([
      Buffer.from(`<< ${dict} /Length ${data.length} >>\nstream\n`),
      data,
      Buffer.from("\nendstream"),
    ]);
  const objects: (string | Buffer)[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>",
    stream(Buffer.from(native)),
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im1 8 0 R >> >> /Contents 6 0 R >>",
    stream(Buffer.from(scan)),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    stream(
      jpg,
      "/Type /XObject /Subtype /Image /Width 1600 /Height 650 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode",
    ),
  ];
  const chunks = [Buffer.from("%PDF-1.4\n")],
    offsets = [0];
  let size = chunks[0].length;
  objects.forEach((object, i) => {
    offsets.push(size);
    const chunk = Buffer.concat([
      Buffer.from(`${i + 1} 0 obj\n`),
      Buffer.isBuffer(object) ? object : Buffer.from(object),
      Buffer.from("\nendobj\n"),
    ]);
    chunks.push(chunk);
    size += chunk.length;
  });
  chunks.push(
    Buffer.from(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
        .join(
          "",
        )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF`,
    ),
  );
  const r = await a.post("/api/documents", {
    multipart: {
      kind: "PURCHASE",
      file: {
        name: `PRUEBA-mixta-${token}.pdf`,
        mimeType: "application/pdf",
        buffer: Buffer.concat(chunks),
      },
    },
  });
  assert.equal(r.status(), 201, await r.text());
  const { id } = await r.json();
  for (let i = 0; i < 120; i++) {
    const doc = await db.document.findUniqueOrThrow({ where: { id } });
    if (doc.status === "FAILED") throw Error(doc.error ?? "OCR fallido");
    if (doc.status === "REVIEW") {
      assert.match(doc.text, /MARCADOR NATIVO/);
      assert.match(doc.text, /MARCADOR ESCANEADO/);
      assert.ok(
        doc.text.indexOf("MARCADOR NATIVO") <
          doc.text.indexOf("MARCADOR ESCANEADO"),
      );
      const review = await a.get(`/api/documents/${id}/review`);
      assert.equal(review.status(), 200);
      const data = await review.json();
      assert.equal(data.suggestion.net, "150.00");
      assert.ok(
        data.suggestion.lines.some(
          (l: { quantity: string; unit: string }) =>
            l.quantity === "100" && l.unit === "m",
        ),
      );
      assert.ok(
        data.suggestion.lines.some(
          (l: { quantity: string; unit: string }) =>
            l.quantity === "20" && l.unit === "ud",
        ),
      );
      console.log(
        "OK PDF mixto real: primera página con texto nativo y segunda escaneada, ambas líneas y total extraídos en orden",
      );
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw Error("La lectura del PDF mixto no terminó a tiempo.");
}
