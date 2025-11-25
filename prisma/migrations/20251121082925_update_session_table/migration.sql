/*
  Warnings:

  - The primary key for the `Session` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `expiresAt` on the `Session` table. All the data in the column will be lost.
  - The `id` column on the `Session` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `accessToken` to the `Session` table without a default value. This is not possible if the table is not empty.
  - Added the required column `accessTokenExpiresAt` to the `Session` table without a default value. This is not possible if the table is not empty.
  - Added the required column `refreshToken` to the `Session` table without a default value. This is not possible if the table is not empty.
  - Added the required column `refreshTokenExpiresAt` to the `Session` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Session" DROP CONSTRAINT "Session_pkey",
DROP COLUMN "expiresAt",
ADD COLUMN     "accessToken" VARCHAR(36) NOT NULL,
ADD COLUMN     "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "refreshToken" VARCHAR(36) NOT NULL,
ADD COLUMN     "refreshTokenExpiresAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "Session_pkey" PRIMARY KEY ("id");
