import { test } from "node:test";
import assert from "node:assert/strict";
import { printerProfiles, printerSettings } from "../src/lib/label-profiles";
const settings = {
  width: 62,
  height: 40,
  format: "roll",
  code: "both",
  margin: 0,
  gap: 0,
};
test("perfiles rechazan medidas fuera de rango y formatos desconocidos", () => {
  assert.deepEqual(printerSettings(settings), settings);
  assert.equal(printerSettings({ ...settings, width: Infinity }), null);
  assert.equal(printerSettings({ ...settings, code: "unknown" }), null);
  assert.equal(printerSettings({ ...settings, height: 1 }), null);
});
test("carga de perfiles limita datos, elimina duplicados y no conserva campos ajenos", () => {
  const profile = {
    id: "one",
    name: "Rollo",
    settings,
    showLocation: true,
    showSupplier: false,
    secret: "no",
  };
  const result = printerProfiles({
    version: 1,
    profiles: [
      profile,
      profile,
      { ...profile, id: "bad", settings: { width: 4 } },
    ],
  });
  assert.equal(result.length, 1);
  assert.equal("secret" in result[0], false);
  assert.equal(printerProfiles({ version: 2, profiles: [profile] }).length, 0);
});
