-- CreateTable
CREATE TABLE "DiagnosticAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'START',
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DiagnosticAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DiagnosticAttempt_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DiagnosticAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attemptId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "selectedOptionIndex" INTEGER NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "answeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiagnosticAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "DiagnosticAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DiagnosticResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attemptId" TEXT NOT NULL,
    "overallCorrect" INTEGER NOT NULL,
    "overallTotal" INTEGER NOT NULL,
    "overallPercentage" REAL NOT NULL,
    "skillBreakdownJson" TEXT NOT NULL,
    "diagnosticRange" TEXT,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiagnosticResult_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "DiagnosticAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DiagnosticAttempt_studentId_idx" ON "DiagnosticAttempt"("studentId");

-- CreateIndex
CREATE INDEX "DiagnosticAttempt_groupId_idx" ON "DiagnosticAttempt"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticAttempt_studentId_groupId_kind_key" ON "DiagnosticAttempt"("studentId", "groupId", "kind");

-- CreateIndex
CREATE INDEX "DiagnosticAnswer_attemptId_idx" ON "DiagnosticAnswer"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticAnswer_attemptId_itemId_key" ON "DiagnosticAnswer"("attemptId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticResult_attemptId_key" ON "DiagnosticResult"("attemptId");

