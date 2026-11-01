export type PrinterSettings = {
  width: number;
  height: number;
  format: string;
  code: string;
  margin: number;
  gap: number;
};
export type PrinterProfile = {
  id: string;
  name: string;
  settings: PrinterSettings;
  showLocation: boolean;
  showSupplier: boolean;
};
export function printerSettings(value: unknown): PrinterSettings | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const within = (key: string, min: number, max: number) =>
    typeof v[key] === "number" &&
    Number.isFinite(v[key]) &&
    Number(v[key]) >= min &&
    Number(v[key]) <= max;
  if (
    !within("width", 25, 105) ||
    !within("height", 20, 150) ||
    !within("margin", 0, 20) ||
    !within("gap", 0, 10) ||
    !["roll", "a4"].includes(String(v.format)) ||
    !["qr", "barcode", "both"].includes(String(v.code))
  )
    return null;
  return {
    width: Number(v.width),
    height: Number(v.height),
    format: String(v.format),
    code: String(v.code),
    margin: Number(v.margin),
    gap: Number(v.gap),
  };
}
export function printerProfiles(value: unknown): PrinterProfile[] {
  if (!value || typeof value !== "object") return [];
  const v = value as { version?: number; profiles?: unknown };
  if (v.version !== 1 || !Array.isArray(v.profiles)) return [];
  const result: PrinterProfile[] = [];
  for (const p of v.profiles.slice(0, 12)) {
    if (
      !p ||
      typeof p !== "object" ||
      typeof p.id !== "string" ||
      p.id.length > 100 ||
      typeof p.name !== "string" ||
      !p.name.trim() ||
      p.name.length > 60 ||
      result.some((r) => r.id === p.id)
    )
      continue;
    const settings = printerSettings(p.settings);
    if (settings)
      result.push({
        id: p.id,
        name: p.name.trim(),
        settings,
        showLocation: p.showLocation !== false,
        showSupplier: p.showSupplier !== false,
      });
  }
  return result;
}
