-- CreateEnum
CREATE TYPE "SellerDocumentType" AS ENUM ('PASSPORT', 'BUSINESS_LICENSE', 'TAX_CERTIFICATE', 'BANK_STATEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "SellerDocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SellerStatus" ADD VALUE 'UNDER_REVIEW';
ALTER TYPE "SellerStatus" ADD VALUE 'NEEDS_DOCUMENTS';
ALTER TYPE "SellerStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "SellerProfile" ADD COLUMN     "bannerUrl" TEXT,
ADD COLUMN     "cancellationRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "fulfillmentScore" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "rating" DECIMAL(3,2) NOT NULL DEFAULT 0,
ADD COLUMN     "returnPolicy" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "shippingPolicy" TEXT,
ADD COLUMN     "statusReason" TEXT,
ADD COLUMN     "totalSales" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SellerVerificationDocument" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "type" "SellerDocumentType" NOT NULL,
    "status" "SellerDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT,
    "contentType" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerVerificationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerStatusEvent" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "fromStatus" "SellerStatus",
    "toStatus" "SellerStatus" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellerStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerSlugHistory" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellerSlugHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SellerVerificationDocument_sellerId_status_idx" ON "SellerVerificationDocument"("sellerId", "status");

-- CreateIndex
CREATE INDEX "SellerVerificationDocument_type_idx" ON "SellerVerificationDocument"("type");

-- CreateIndex
CREATE INDEX "SellerStatusEvent_sellerId_createdAt_idx" ON "SellerStatusEvent"("sellerId", "createdAt");

-- CreateIndex
CREATE INDEX "SellerStatusEvent_actorUserId_idx" ON "SellerStatusEvent"("actorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "SellerSlugHistory_slug_key" ON "SellerSlugHistory"("slug");

-- CreateIndex
CREATE INDEX "SellerSlugHistory_sellerId_idx" ON "SellerSlugHistory"("sellerId");

-- CreateIndex
CREATE INDEX "SellerProfile_rating_idx" ON "SellerProfile"("rating");

-- AddForeignKey
ALTER TABLE "SellerVerificationDocument" ADD CONSTRAINT "SellerVerificationDocument_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "SellerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerStatusEvent" ADD CONSTRAINT "SellerStatusEvent_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "SellerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerStatusEvent" ADD CONSTRAINT "SellerStatusEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerSlugHistory" ADD CONSTRAINT "SellerSlugHistory_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "SellerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
