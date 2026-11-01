import type { inventoryState } from "./inventory";
type Serialized<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Serialized<U>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;
export type InventoryData = Serialized<
  Awaited<ReturnType<typeof inventoryState>>
>;
export type InventoryLot = InventoryData["lots"][number];
