-- AlterTable
ALTER TABLE "TeacherNote" ADD COLUMN "noteType" TEXT;

-- CreateTable
CREATE TABLE "StudentGoalStatus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teacherId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "goalCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StudentGoalStatus_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudentGoalStatus_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudentGoalStatus_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StudentGoalStatusEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teacherId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "goalCode" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "StudentGoalStatus_groupId_studentId_idx" ON "StudentGoalStatus"("groupId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentGoalStatus_groupId_studentId_goalCode_key" ON "StudentGoalStatus"("groupId", "studentId", "goalCode");

-- CreateIndex
CREATE INDEX "StudentGoalStatusEvent_groupId_studentId_goalCode_idx" ON "StudentGoalStatusEvent"("groupId", "studentId", "goalCode");

