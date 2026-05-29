-- AlterTable
ALTER TABLE "InventoryReservation" ADD COLUMN     "warehouseId" TEXT;

-- CreateIndex
CREATE INDEX "InventoryReservation_warehouseId_status_idx" ON "InventoryReservation"("warehouseId", "status");

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
