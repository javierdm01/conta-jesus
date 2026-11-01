import { redirect } from "next/navigation";
import QRCode from "qrcode";
import bwipjs from "bwip-js/node";
import { z } from "zod";
import { currentUser, AppError } from "@/lib/access";
import { db } from "@/lib/db";
import LabelPreview from "@/components/inventory/label-preview";
export const dynamic = "force-dynamic";
export default async function LabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ items?: string }>;
}) {
  let u;
  try {
    u = await currentUser();
  } catch (e) {
    if (e instanceof AppError && e.status === 401) redirect("/login");
    throw e;
  }
  const raw = (await searchParams).items ?? "";
  const schema = z
    .array(
      z.object({
        code: z.string().regex(/^LT-[A-F0-9]{14}$/),
        count: z.coerce.number().int().min(1).max(500),
      }),
    )
    .min(1)
    .max(100)
    .refine(
      (items) => items.reduce((a, l) => a + l.count, 0) <= 500,
      "Máximo 500 etiquetas por tanda.",
    );
  const parsed = schema.safeParse(
    raw.length < 8000
      ? raw.split(",").map((s) => {
          const [code, count] = s.split(":");
          return { code, count };
        })
      : [],
  );
  if (!parsed.success)
    return (
      <main className="p-10 max-w-xl mx-auto">
        <h1>Selecciona las etiquetas en Almacén</h1>
        <p className="my-5">
          Puedes preparar hasta 500 etiquetas por tanda, indicando la cantidad
          de cada lote.
        </p>
        <a className="text-button" href="/inventario">
          Volver al almacén
        </a>
      </main>
    );
  const codes = [...new Set(parsed.data.map((l) => l.code))];
  const lots = await db.stockLot.findMany({
    where: { companyId: u.companyId, code: { in: codes } },
    include: {
      document: {
        select: { number: true, supplier: { select: { name: true } } },
      },
    },
  });
  if (lots.length !== codes.length)
    return (
      <main className="p-10">
        <h1>Hay artículos que no están disponibles en tu empresa</h1>
        <a className="text-button" href="/inventario">
          Volver al almacén
        </a>
      </main>
    );
  const origin = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").origin;
  const labels = await Promise.all(
    codes.map(async (code) => {
      const lot = lots.find((l) => l.code === code)!;
      return {
        code,
        description: lot.description,
        reference: lot.reference,
        location: lot.location,
        brand: lot.brand,
        model: lot.model,
        received: lot.received.toString(),
        unit: lot.unit,
        supplier: lot.document?.supplier?.name ?? "",
        document: lot.document?.number ?? "",
        count: parsed.data
          .filter((l) => l.code === code)
          .reduce((a, l) => a + l.count, 0),
        qr: await QRCode.toString(`${origin}/inventario/${code}`, {
          type: "svg",
          errorCorrectionLevel: "M",
          margin: 2,
          width: 200,
        }),
        barcode: bwipjs.toSVG({
          bcid: "code128",
          text: code,
          scale: 2,
          height: 10,
          includetext: false,
          paddingwidth: 10,
          paddingheight: 2,
        }),
      };
    }),
  );
  return <LabelPreview labels={labels} />;
}
