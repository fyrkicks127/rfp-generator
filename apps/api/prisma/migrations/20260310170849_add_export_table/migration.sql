-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('PDF', 'PPTX', 'DOCX');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Export" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT,
    "userId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "fileUrl" TEXT,
    "status" "ExportStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Export_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Export_userId_idx" ON "Export"("userId");

-- CreateIndex
CREATE INDEX "Export_proposalId_idx" ON "Export"("proposalId");

-- CreateIndex
CREATE INDEX "Export_status_idx" ON "Export"("status");

-- AddForeignKey
ALTER TABLE "Export" ADD CONSTRAINT "Export_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Export" ADD CONSTRAINT "Export_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
