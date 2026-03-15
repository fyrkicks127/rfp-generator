/*
  Warnings:

  - The values [DOCX] on the enum `ExportFormat` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ExportFormat_new" AS ENUM ('PDF', 'PPTX');
ALTER TABLE "Export" ALTER COLUMN "format" TYPE "ExportFormat_new" USING ("format"::text::"ExportFormat_new");
ALTER TYPE "ExportFormat" RENAME TO "ExportFormat_old";
ALTER TYPE "ExportFormat_new" RENAME TO "ExportFormat";
DROP TYPE "ExportFormat_old";
COMMIT;
