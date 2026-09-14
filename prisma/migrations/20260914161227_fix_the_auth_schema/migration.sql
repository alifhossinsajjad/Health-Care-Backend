/*
  Warnings:

  - You are about to drop the column `needsPasswordReset` on the `user` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "user" DROP COLUMN "needsPasswordReset",
ADD COLUMN     "needsPasswordChange" BOOLEAN NOT NULL DEFAULT false;
