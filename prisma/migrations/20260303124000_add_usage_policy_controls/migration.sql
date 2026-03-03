-- AlterTable
ALTER TABLE "User"
ADD COLUMN     "serviceLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sessionResponseLimit" INTEGER,
ADD COLUMN     "disabledTools" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "disabledModels" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Session"
ADD COLUMN     "aiResponsesUsed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "GlobalUsagePolicy" (
    "id" SERIAL NOT NULL,
    "lockAllUsers" BOOLEAN NOT NULL DEFAULT false,
    "defaultSessionResponseLimit" INTEGER,
    "disabledTools" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "disabledModels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalUsagePolicy_pkey" PRIMARY KEY ("id")
);

-- Seed a default policy row
INSERT INTO "GlobalUsagePolicy" ("lockAllUsers", "disabledTools", "disabledModels", "createdAt", "updatedAt")
VALUES (false, ARRAY[]::TEXT[], ARRAY[]::TEXT[], CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
