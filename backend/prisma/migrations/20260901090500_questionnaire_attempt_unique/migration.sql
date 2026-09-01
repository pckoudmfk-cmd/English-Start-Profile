-- CreateIndex
CREATE UNIQUE INDEX "QuestionnaireAttempt_studentId_groupId_kind_key" ON "QuestionnaireAttempt"("studentId", "groupId", "kind");
