-- AlterTable
ALTER TABLE "Sketch" ADD COLUMN     "connectionId" TEXT;

-- CreateIndex
CREATE INDEX "Sketch_connectionId_idx" ON "Sketch"("connectionId");

-- AddForeignKey
ALTER TABLE "Sketch" ADD CONSTRAINT "Sketch_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "AwsConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
