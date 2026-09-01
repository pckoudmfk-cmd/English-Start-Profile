-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DiagnosticAttempt" (
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
    "assignedByTeacherId" TEXT,
    "assignedAt" DATETIME,
    "periodStartAt" DATETIME,
    "periodEndAt" DATETIME,
    CONSTRAINT "DiagnosticAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DiagnosticAttempt_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DiagnosticAttempt_assignedByTeacherId_fkey" FOREIGN KEY ("assignedByTeacherId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DiagnosticAttempt" ("academicYearId", "completedAt", "courseId", "createdAt", "groupId", "id", "kind", "startedAt", "status", "studentId", "updatedAt") SELECT "academicYearId", "completedAt", "courseId", "createdAt", "groupId", "id", "kind", "startedAt", "status", "studentId", "updatedAt" FROM "DiagnosticAttempt";
DROP TABLE "DiagnosticAttempt";
ALTER TABLE "new_DiagnosticAttempt" RENAME TO "DiagnosticAttempt";
CREATE INDEX "DiagnosticAttempt_studentId_idx" ON "DiagnosticAttempt"("studentId");
CREATE INDEX "DiagnosticAttempt_groupId_idx" ON "DiagnosticAttempt"("groupId");
CREATE UNIQUE INDEX "DiagnosticAttempt_studentId_groupId_kind_key" ON "DiagnosticAttempt"("studentId", "groupId", "kind");
CREATE TABLE "new_QuestionnaireAttempt" (
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
    "assignedByTeacherId" TEXT,
    "assignedAt" DATETIME,
    "periodStartAt" DATETIME,
    "periodEndAt" DATETIME,
    CONSTRAINT "QuestionnaireAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuestionnaireAttempt_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuestionnaireAttempt_assignedByTeacherId_fkey" FOREIGN KEY ("assignedByTeacherId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_QuestionnaireAttempt" ("academicYearId", "completedAt", "courseId", "createdAt", "groupId", "id", "kind", "startedAt", "status", "studentId", "updatedAt") SELECT "academicYearId", "completedAt", "courseId", "createdAt", "groupId", "id", "kind", "startedAt", "status", "studentId", "updatedAt" FROM "QuestionnaireAttempt";
DROP TABLE "QuestionnaireAttempt";
ALTER TABLE "new_QuestionnaireAttempt" RENAME TO "QuestionnaireAttempt";
CREATE INDEX "QuestionnaireAttempt_studentId_idx" ON "QuestionnaireAttempt"("studentId");
CREATE INDEX "QuestionnaireAttempt_groupId_idx" ON "QuestionnaireAttempt"("groupId");
CREATE UNIQUE INDEX "QuestionnaireAttempt_studentId_groupId_kind_key" ON "QuestionnaireAttempt"("studentId", "groupId", "kind");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

