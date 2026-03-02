-- AlterTable
ALTER TABLE "User" ADD COLUMN     "periodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "tier" TEXT NOT NULL DEFAULT 'free',
ADD COLUMN     "tokenBudget" INTEGER NOT NULL DEFAULT 50000,
ADD COLUMN     "tokensUsed" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "country" TEXT,
ADD COLUMN     "preferredLength" TEXT,
ADD COLUMN     "questionTypes" TEXT,
ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "UserSettings" ALTER COLUMN "voiceType" SET DEFAULT 'en-US-Standard-C',
ALTER COLUMN "ttsProvider" SET DEFAULT 'google';

-- CreateTable
CREATE TABLE "UserInteractionHistory" (
    "id" SERIAL NOT NULL,
    "profileId" INTEGER NOT NULL,
    "query" TEXT NOT NULL,
    "category" TEXT,
    "responseLength" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserInteractionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenUsageLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "queryType" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserInteractionHistory_profileId_idx" ON "UserInteractionHistory"("profileId");

-- CreateIndex
CREATE INDEX "UserInteractionHistory_timestamp_idx" ON "UserInteractionHistory"("timestamp");

-- CreateIndex
CREATE INDEX "TokenUsageLog_userId_idx" ON "TokenUsageLog"("userId");

-- CreateIndex
CREATE INDEX "TokenUsageLog_timestamp_idx" ON "TokenUsageLog"("timestamp");

-- CreateIndex
CREATE INDEX "TokenUsageLog_userId_timestamp_idx" ON "TokenUsageLog"("userId", "timestamp");

-- AddForeignKey
ALTER TABLE "UserInteractionHistory" ADD CONSTRAINT "UserInteractionHistory_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenUsageLog" ADD CONSTRAINT "TokenUsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
