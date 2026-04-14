-- CreateTable: ApprovalMessage for INFO_REQUESTED back-and-forth thread
CREATE TABLE "approval_messages" (
    "id" TEXT NOT NULL,
    "approvalId" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "approval_messages_approvalId_idx" ON "approval_messages"("approvalId");

-- AddForeignKey
ALTER TABLE "approval_messages" ADD CONSTRAINT "approval_messages_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "approval_queue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
