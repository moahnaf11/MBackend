/*
  Warnings:

  - Added the required column `objectKey` to the `ProductImage` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ProductImage" ADD COLUMN     "objectKey" TEXT NOT NULL;
