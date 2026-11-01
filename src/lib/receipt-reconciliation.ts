import type { Doc } from "./workspace-types";
import type { OcrSuggestion } from "./ocr";
import { dec, sum } from "./money";

/** A quoted invoice price is copied only when one unambiguous line covers the selected quantities. */
export function receiptReconciliationLines(
  receipts: Doc[],
  proposal: OcrSuggestion["lines"] = [],
) {
  const lots = receipts.flatMap((receipt) =>
    (receipt.stockLots ?? []).map((lot) => ({
      ...lot,
      receiptNumber: receipt.number ?? receipt.originalName,
    })),
  );
  const identity = (line: {
    reference: string;
    description: string;
    unit: string;
  }) =>
    `${line.reference ? `ref:${line.reference.trim().toUpperCase()}` : `desc:${line.description.trim().toUpperCase()}`}|${line.unit}`;
  return lots.map((lot) => {
    const related = lots.filter((l) => identity(l) === identity(lot));
    const matches = proposal.filter(
      (p) => !p.financial && identity(p) === identity(lot),
    );
    const match =
      matches.length === 1 &&
      dec(matches[0].quantity).eq(sum(related.map((l) => l.received)))
        ? matches[0]
        : undefined;
    return {
      description: lot.description,
      reference: lot.reference,
      unit: lot.unit,
      quantity: lot.received,
      lotId: lot.id,
      receiptNumber: lot.receiptNumber,
      price: match?.price ?? "",
      discount: match?.discount ?? "0",
    };
  });
}
