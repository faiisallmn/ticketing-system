-- AlterTable
ALTER TABLE "comments" ADD COLUMN     "externalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "comments_externalId_key" ON "comments"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_emailThreadId_key" ON "tickets"("emailThreadId");
