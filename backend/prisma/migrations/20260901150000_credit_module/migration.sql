-- CreateTable
CREATE TABLE "CreditSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "maxTestAttempts" INTEGER NOT NULL DEFAULT 1,
    "revealCorrectAnswers" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreditSettings_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DictionarySubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "description" TEXT,
    "link" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "teacherId" TEXT,
    "teacherComment" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DictionarySubmission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DictionarySubmission_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DictionarySubmission_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DictionarySubmissionFile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "submissionId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DictionarySubmissionFile_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "DictionarySubmission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CreditTestItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teacherId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "optionsJson" TEXT NOT NULL,
    "correctOptionIndex" INTEGER NOT NULL,
    "grammarTopic" TEXT NOT NULL,
    "vocabularyTopic" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'MEDIUM',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "explanationRu" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreditTestItem_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CreditTestAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "correctCount" INTEGER,
    "totalCount" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreditTestAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CreditTestAttempt_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CreditTestAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "attemptId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "questionSnapshot" TEXT NOT NULL,
    "optionsSnapshotJson" TEXT NOT NULL,
    "correctOptionIndexSnapshot" INTEGER NOT NULL,
    "grammarTopicSnapshot" TEXT NOT NULL,
    "selectedOptionIndex" INTEGER,
    "correct" BOOLEAN,
    "answeredAt" DATETIME,
    CONSTRAINT "CreditTestAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "CreditTestAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OralAssessment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "topicId" TEXT,
    "assignedByTeacherId" TEXT,
    "assignedAt" DATETIME,
    "assignedComment" TEXT,
    "criteriaTaskCompletion" TEXT,
    "criteriaErrorCount" TEXT,
    "criteriaErrorNatureJson" TEXT,
    "criteriaLogic" TEXT,
    "criteriaActiveVocabulary" TEXT,
    "criteriaQuestionResponses" TEXT,
    "finalGrade" TEXT,
    "teacherComment" TEXT,
    "gradedByTeacherId" TEXT,
    "confirmedAt" DATETIME,
    "exemptionReason" TEXT,
    "exemptedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OralAssessment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OralAssessment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OralAssessment_assignedByTeacherId_fkey" FOREIGN KEY ("assignedByTeacherId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OralAssessment_gradedByTeacherId_fkey" FOREIGN KEY ("gradedByTeacherId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CreditAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditSettings_courseId_key" ON "CreditSettings"("courseId");

-- CreateIndex
CREATE INDEX "DictionarySubmission_studentId_groupId_idx" ON "DictionarySubmission"("studentId", "groupId");

-- CreateIndex
CREATE INDEX "DictionarySubmission_groupId_idx" ON "DictionarySubmission"("groupId");

-- CreateIndex
CREATE INDEX "DictionarySubmission_status_idx" ON "DictionarySubmission"("status");

-- CreateIndex
CREATE INDEX "DictionarySubmissionFile_submissionId_idx" ON "DictionarySubmissionFile"("submissionId");

-- CreateIndex
CREATE INDEX "CreditTestItem_courseId_idx" ON "CreditTestItem"("courseId");

-- CreateIndex
CREATE INDEX "CreditTestItem_active_idx" ON "CreditTestItem"("active");

-- CreateIndex
CREATE INDEX "CreditTestAttempt_studentId_groupId_idx" ON "CreditTestAttempt"("studentId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditTestAttempt_studentId_groupId_attemptNumber_key" ON "CreditTestAttempt"("studentId", "groupId", "attemptNumber");

-- CreateIndex
CREATE INDEX "CreditTestAnswer_attemptId_idx" ON "CreditTestAnswer"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditTestAnswer_attemptId_itemId_key" ON "CreditTestAnswer"("attemptId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "OralAssessment_studentId_groupId_key" ON "OralAssessment"("studentId", "groupId");

-- CreateIndex
CREATE INDEX "CreditAuditLog_studentId_groupId_idx" ON "CreditAuditLog"("studentId", "groupId");

-- CreateIndex
CREATE INDEX "CreditAuditLog_groupId_entityType_idx" ON "CreditAuditLog"("groupId", "entityType");

