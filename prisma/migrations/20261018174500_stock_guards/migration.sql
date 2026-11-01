-- Invariantes físicas: una corrección requiere movimientos trazables.
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_quantity_check"
  CHECK ("received" > 0 AND "onHand" >= 0 AND "onHand" <= "received");
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_value_check"
  CHECK (("totalValue" IS NULL OR "totalValue" >= 0)
     AND ("remainingValue" IS NULL OR "remainingValue" >= 0));
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_kind_check"
  CHECK ("kind" IN ('RECEIVE','USE','RETURN','SUPPLIER_RETURN','RESERVE','RELEASE'));
ALTER TABLE "StockReservation" ADD CONSTRAINT "StockReservation_quantity_check" CHECK ("quantity" > 0);
CREATE INDEX "StockMovement_sourceId_idx" ON "StockMovement"("sourceId");
