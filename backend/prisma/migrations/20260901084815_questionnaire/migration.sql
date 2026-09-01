-- CreateTable
CREATE TABLE "QuestionnaireAttempt" (
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
    CONSTRAINT "QuestionnaireAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuestionnaireAttempt_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestionnaireAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attemptId" TEXT NOT NULL,
    "questionCode" TEXT NOT NULL,
    "valueJson" TEXT NOT NULL,
    "indexGroup" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QuestionnaireAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "QuestionnaireAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "QuestionnaireAttempt_studentId_idx" ON "QuestionnaireAttempt"("studentId");

-- CreateIndex
CREATE INDEX "QuestionnaireAttempt_groupId_idx" ON "QuestionnaireAttempt"("groupId");

-- CreateIndex
CREATE INDEX "QuestionnaireAnswer_attemptId_idx" ON "QuestionnaireAnswer"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionnaireAnswer_attemptId_questionCode_key" ON "QuestionnaireAnswer"("attemptId", "questionCode");
