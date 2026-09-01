// English Start Profile — Этап 9: «Зачёт» (роль преподавателя) —
// проверка словарей, банк заданий теста, настройки, назначение и
// оценка устной части, сводный экран группы. Виден только преподавателю,
// владеющему группой/курсом (тот же принцип защиты в глубину, что и
// everywhere else в проекте — 404, не 403).
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { findOwnedGroupHeader, loadRoster, studentDisplayName } from "../analytics/teacherAccess";
import { getStudentCreditSummary, getGroupCreditSummary, getCreditSettings } from "../analytics/credit";
import { computePreliminaryGrade } from "../analytics/oralGrading";
import { CreditError, applyDictionaryDecision, assignOralTopic, confirmOralGrade, saveOralCriteria } from "../credit/service";
import { dictionaryFilePath } from "../uploads/dictionaryStorage";
import {
  CREDIT_TEST_DIFFICULTIES,
  FINAL_GRADES,
  GRAMMAR_TOPICS,
  ORAL_TOPICS,
  ACTIVE_VOCABULARY_VALUES,
  ERROR_COUNT_VALUES,
  ERROR_NATURE_VALUES,
  LOGIC_VALUES,
  QUESTION_RESPONSE_VALUES,
  TASK_COMPLETION_VALUES,
} from "../credit/constants";

const router = Router();
router.use(requireAuth, requireRole("TEACHER"));

async function requireOwnedCourse(teacherId: string, courseId: string) {
  return prisma.course.findFirst({ where: { id: courseId, teacherId } });
}

// --- Сводный экран группы (ТЗ п.29-31) ------------------------------------

router.get("/groups/:groupId/dashboard", async (req, res) => {
  const group = await findOwnedGroupHeader(req.user!.id, req.params.groupId);
  if (!group) return res.status(404).json({ error: "GROUP_NOT_FOUND" });

  const roster = await loadRoster(group.id);
  const { summary, rows } = await getGroupCreditSummary(group.id, roster.map((r) => r.studentId));

  const { dictionaryFilter, testFilter, pointsFilter, oralFilter, overallFilter } = req.query;
  const studentsTable = roster
    .map((r) => {
      const s = rows.get(r.studentId);
      if (!s) return null;
      return {
        studentId: r.studentId,
        fullName: r.fullName,
        dictionaryStatus: s.dictionary.status,
        dictionaryStatusLabel: s.dictionary.statusLabel,
        testStatus: s.test.status,
        testResult: s.test.status === "COMPLETED" ? { correctCount: s.test.latestAttempt?.correctCount, totalCount: s.test.latestAttempt?.totalCount } : null,
        qualificationPoints: s.qualification.points,
        oralStatus: s.oral.status,
        overallStatus: s.overallStatus,
        overallStatusLabel: s.overallStatusLabel,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .filter((r) => (typeof dictionaryFilter === "string" && dictionaryFilter ? r.dictionaryStatus === dictionaryFilter : true))
    .filter((r) => (typeof testFilter === "string" && testFilter ? r.testStatus === testFilter : true))
    .filter((r) => (pointsFilter === "5plus" ? r.qualificationPoints >= 5 : true))
    .filter((r) => (typeof oralFilter === "string" && oralFilter ? r.oralStatus === oralFilter : true))
    .filter((r) => (typeof overallFilter === "string" && overallFilter ? r.overallStatus === overallFilter : true));

  return res.json({
    group: { id: group.id, name: group.name, course: { id: group.course.id, name: group.course.name }, academicYear: { id: group.course.academicYear.id, name: group.course.academicYear.name } },
    kpi: summary,
    students: studentsTable,
  });
});

router.get("/groups/:groupId/students/:studentId/summary", async (req, res) => {
  const group = await findOwnedGroupHeader(req.user!.id, req.params.groupId);
  if (!group) return res.status(404).json({ error: "GROUP_NOT_FOUND" });
  const membership = await prisma.groupMembership.findFirst({ where: { groupId: group.id, studentId: req.params.studentId, status: "ACTIVE" } });
  if (!membership) return res.status(404).json({ error: "STUDENT_NOT_FOUND" });

  const summary = await getStudentCreditSummary({ studentId: req.params.studentId, groupId: group.id, courseId: group.courseId, academicYearId: group.course.academicYearId });
  const assessment = summary.oral.assessment;
  const oralTopic = assessment?.topicId ? ORAL_TOPICS.find((t) => t.id === assessment.topicId) ?? null : null;
  return res.json({
    ...summary,
    oral: {
      // Тот же приём "плоских" полей, что и в routes/studentCredit.ts —
      // finalGrade/teacherComment/exemptionReason лежат внутри
      // assessment (сырой ряд OralAssessment), но и студенческий, и
      // преподавательский экран читают их на верхнем уровне oral.*
      // (см. api/credit.ts::StudentCreditFullSummary/StudentCreditOverview).
      status: summary.oral.status,
      topic: oralTopic,
      assignedComment: assessment?.assignedComment ?? null,
      finalGrade: assessment?.status === "CONFIRMED" ? assessment.finalGrade : null,
      teacherComment: assessment?.status === "CONFIRMED" ? assessment.teacherComment : null,
      exemptionReason: assessment?.status === "EXEMPTED" ? assessment.exemptionReason : null,
      preliminaryGrade: summary.oral.preliminaryGrade,
      // Критерии — только преподавателю (не часть студенческого
      // контракта), для предзаполнения формы оценки.
      criteriaTaskCompletion: assessment?.criteriaTaskCompletion ?? null,
      criteriaErrorCount: assessment?.criteriaErrorCount ?? null,
      criteriaLogic: assessment?.criteriaLogic ?? null,
      criteriaActiveVocabulary: assessment?.criteriaActiveVocabulary ?? null,
      criteriaQuestionResponses: assessment?.criteriaQuestionResponses ?? null,
      errorNature: assessment?.criteriaErrorNatureJson ? JSON.parse(assessment.criteriaErrorNatureJson) : [],
    },
  });
});

// --- Проверка словарей (ТЗ п.7) -------------------------------------------

function serializeDictionaryRow(s: any) {
  return {
    id: s.id,
    studentId: s.studentId,
    studentName: studentDisplayName(s.student),
    groupId: s.groupId,
    wordCount: s.wordCount,
    status: s.status,
    createdAt: s.createdAt,
    hasFiles: s.files.length > 0,
  };
}

router.get("/groups/:groupId/dictionary", async (req, res) => {
  const group = await findOwnedGroupHeader(req.user!.id, req.params.groupId);
  if (!group) return res.status(404).json({ error: "GROUP_NOT_FOUND" });

  // Показывается только САМАЯ ПОСЛЕДНЯЯ отправка каждого студента —
  // очередь на проверку, не полная история (история — отдельный
  // маршрут ниже).
  const roster = await loadRoster(group.id);
  const latestByStudent = await Promise.all(
    roster.map((r) => prisma.dictionarySubmission.findFirst({ where: { groupId: group.id, studentId: r.studentId }, orderBy: { createdAt: "desc" }, include: { student: { include: { studentProfile: true } }, files: true } }))
  );
  const rows = latestByStudent.filter((s): s is NonNullable<typeof s> => s !== null);
  const { status } = req.query;
  const filtered = typeof status === "string" && status ? rows.filter((r) => r.status === status) : rows;
  return res.json(filtered.map(serializeDictionaryRow));
});

router.get("/dictionary/:id", async (req, res) => {
  const submission = await prisma.dictionarySubmission.findFirst({
    where: { id: req.params.id, group: { teacherId: req.user!.id } },
    include: { student: { include: { studentProfile: true } }, files: true },
  });
  if (!submission) return res.status(404).json({ error: "SUBMISSION_NOT_FOUND" });
  const history = await prisma.dictionarySubmission.findMany({
    where: { studentId: submission.studentId, groupId: submission.groupId },
    orderBy: { createdAt: "desc" },
    select: { id: true, wordCount: true, status: true, createdAt: true },
  });
  return res.json({
    id: submission.id,
    student: { id: submission.studentId, fullName: studentDisplayName(submission.student) },
    groupId: submission.groupId,
    wordCount: submission.wordCount,
    description: submission.description,
    link: submission.link,
    status: submission.status,
    teacherComment: submission.teacherComment,
    createdAt: submission.createdAt,
    reviewedAt: submission.reviewedAt,
    files: submission.files.map((f) => ({ id: f.id, fileName: f.fileName, mimeType: f.mimeType, size: f.size, uploadedAt: f.uploadedAt })),
    isLatest: history[0]?.id === submission.id,
    history: history.map((h) => ({ id: h.id, wordCount: h.wordCount, status: h.status, createdAt: h.createdAt })),
  });
});

router.get("/dictionary/:id/files/:fileId", async (req, res) => {
  const submission = await prisma.dictionarySubmission.findFirst({ where: { id: req.params.id, group: { teacherId: req.user!.id } }, include: { files: true } });
  if (!submission) return res.status(404).json({ error: "SUBMISSION_NOT_FOUND" });
  const file = submission.files.find((f) => f.id === req.params.fileId);
  if (!file) return res.status(404).json({ error: "FILE_NOT_FOUND" });
  return res.sendFile(dictionaryFilePath(submission.id, file.storedName), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "FILE_NOT_FOUND" });
  });
});

const dictionaryDecisionSchema = z.object({
  action: z.enum(["OPEN", "CONFIRM", "REQUEST_CLARIFICATION", "REJECT"]),
  comment: z.string().trim().max(2000).optional(),
});

router.patch("/dictionary/:id/decision", async (req, res) => {
  const parsed = dictionaryDecisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
  const submission = await prisma.dictionarySubmission.findFirst({ where: { id: req.params.id, group: { teacherId: req.user!.id } } });
  if (!submission) return res.status(404).json({ error: "SUBMISSION_NOT_FOUND" });

  try {
    const updated = await applyDictionaryDecision({ submissionId: submission.id, teacherId: req.user!.id, groupId: submission.groupId, action: parsed.data.action, comment: parsed.data.comment });
    return res.json({ id: updated.id, status: updated.status, teacherComment: updated.teacherComment, reviewedAt: updated.reviewedAt });
  } catch (err) {
    if (err instanceof CreditError) {
      return res.status(err.code === "NOT_FOUND" ? 404 : 400).json({ error: err.code, message: err.message });
    }
    throw err;
  }
});

// --- Настройки зачёта на курс (ТЗ п.14, 16) -------------------------------

router.get("/courses/:courseId/settings", async (req, res) => {
  const course = await requireOwnedCourse(req.user!.id, req.params.courseId);
  if (!course) return res.status(404).json({ error: "COURSE_NOT_FOUND" });
  const settings = await getCreditSettings(course.id);
  return res.json({
    maxTestAttempts: settings?.maxTestAttempts ?? 1,
    revealCorrectAnswers: settings?.revealCorrectAnswers ?? false,
  });
});

const settingsSchema = z.object({
  maxTestAttempts: z.number().int().min(1).max(10),
  revealCorrectAnswers: z.boolean(),
});

router.put("/courses/:courseId/settings", async (req, res) => {
  const course = await requireOwnedCourse(req.user!.id, req.params.courseId);
  if (!course) return res.status(404).json({ error: "COURSE_NOT_FOUND" });
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });

  const settings = await prisma.creditSettings.upsert({
    where: { courseId: course.id },
    create: { courseId: course.id, teacherId: req.user!.id, ...parsed.data },
    update: parsed.data,
  });
  return res.json({ maxTestAttempts: settings.maxTestAttempts, revealCorrectAnswers: settings.revealCorrectAnswers });
});

// --- Банк заданий теста (ТЗ п.10-11) --------------------------------------

function serializeTestItem(i: any) {
  return {
    id: i.id,
    question: i.question,
    options: JSON.parse(i.optionsJson) as string[],
    correctOptionIndex: i.correctOptionIndex,
    grammarTopic: i.grammarTopic,
    vocabularyTopic: i.vocabularyTopic,
    difficulty: i.difficulty,
    active: i.active,
    explanationRu: i.explanationRu,
    createdAt: i.createdAt,
  };
}

router.get("/courses/:courseId/test-items", async (req, res) => {
  const course = await requireOwnedCourse(req.user!.id, req.params.courseId);
  if (!course) return res.status(404).json({ error: "COURSE_NOT_FOUND" });
  const items = await prisma.creditTestItem.findMany({ where: { courseId: course.id }, orderBy: { createdAt: "desc" } });
  return res.json(items.map(serializeTestItem));
});

const testItemSchema = z.object({
  question: z.string().trim().min(1).max(1000),
  options: z.array(z.string().trim().min(1).max(300)).min(2).max(6),
  correctOptionIndex: z.number().int().min(0),
  grammarTopic: z.enum(GRAMMAR_TOPICS),
  vocabularyTopic: z.string().trim().min(1).max(200),
  difficulty: z.enum(CREDIT_TEST_DIFFICULTIES).optional(),
  explanationRu: z.string().trim().max(1000).optional().nullable(),
});

router.post("/courses/:courseId/test-items", async (req, res) => {
  const course = await requireOwnedCourse(req.user!.id, req.params.courseId);
  if (!course) return res.status(404).json({ error: "COURSE_NOT_FOUND" });
  const parsed = testItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
  if (parsed.data.correctOptionIndex >= parsed.data.options.length) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "Индекс правильного ответа выходит за пределы списка вариантов." });
  }

  const item = await prisma.creditTestItem.create({
    data: {
      teacherId: req.user!.id,
      courseId: course.id,
      academicYearId: course.academicYearId,
      question: parsed.data.question,
      optionsJson: JSON.stringify(parsed.data.options),
      correctOptionIndex: parsed.data.correctOptionIndex,
      grammarTopic: parsed.data.grammarTopic,
      vocabularyTopic: parsed.data.vocabularyTopic,
      difficulty: parsed.data.difficulty ?? "MEDIUM",
      explanationRu: parsed.data.explanationRu?.trim() || null,
    },
  });
  return res.status(201).json(serializeTestItem(item));
});

router.put("/test-items/:id", async (req, res) => {
  const item = await prisma.creditTestItem.findFirst({ where: { id: req.params.id, teacherId: req.user!.id } });
  if (!item) return res.status(404).json({ error: "ITEM_NOT_FOUND" });
  const parsed = testItemSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
  const options = parsed.data.options ?? JSON.parse(item.optionsJson);
  const correctOptionIndex = parsed.data.correctOptionIndex ?? item.correctOptionIndex;
  if (correctOptionIndex >= options.length) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "Индекс правильного ответа выходит за пределы списка вариантов." });
  }
  const updated = await prisma.creditTestItem.update({
    where: { id: item.id },
    data: {
      ...(parsed.data.question !== undefined ? { question: parsed.data.question } : {}),
      ...(parsed.data.options !== undefined ? { optionsJson: JSON.stringify(parsed.data.options) } : {}),
      ...(parsed.data.correctOptionIndex !== undefined ? { correctOptionIndex: parsed.data.correctOptionIndex } : {}),
      ...(parsed.data.grammarTopic !== undefined ? { grammarTopic: parsed.data.grammarTopic } : {}),
      ...(parsed.data.vocabularyTopic !== undefined ? { vocabularyTopic: parsed.data.vocabularyTopic } : {}),
      ...(parsed.data.difficulty !== undefined ? { difficulty: parsed.data.difficulty } : {}),
      ...(parsed.data.explanationRu !== undefined ? { explanationRu: parsed.data.explanationRu?.trim() || null } : {}),
    },
  });
  return res.json(serializeTestItem(updated));
});

// Деактивация вместо удаления (ТЗ п.33 — история попыток не должна
// "потерять" вопрос, на который уже отвечали; снимок в CreditTestAnswer
// не зависит от банка, но сам банк остаётся как управляемый список, а
// не безвозвратно теряет строки).
router.patch("/test-items/:id/active", async (req, res) => {
  const item = await prisma.creditTestItem.findFirst({ where: { id: req.params.id, teacherId: req.user!.id } });
  if (!item) return res.status(404).json({ error: "ITEM_NOT_FOUND" });
  const parsed = z.object({ active: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR" });
  const updated = await prisma.creditTestItem.update({ where: { id: item.id }, data: { active: parsed.data.active } });
  return res.json(serializeTestItem(updated));
});

// --- Попытки теста студента (только просмотр, ТЗ п.16 "Подробнее") -------

router.get("/groups/:groupId/students/:studentId/test-attempts", async (req, res) => {
  const group = await findOwnedGroupHeader(req.user!.id, req.params.groupId);
  if (!group) return res.status(404).json({ error: "GROUP_NOT_FOUND" });
  const attempts = await prisma.creditTestAttempt.findMany({
    where: { groupId: group.id, studentId: req.params.studentId },
    include: { answers: { orderBy: { orderIndex: "asc" } } },
    orderBy: { attemptNumber: "desc" },
  });
  return res.json(
    attempts.map((a) => ({
      id: a.id,
      attemptNumber: a.attemptNumber,
      status: a.status,
      startedAt: a.startedAt,
      completedAt: a.completedAt,
      correctCount: a.correctCount,
      totalCount: a.totalCount,
      items: a.answers.map((ans) => ({
        question: ans.questionSnapshot,
        options: JSON.parse(ans.optionsSnapshotJson) as string[],
        selectedOptionIndex: ans.selectedOptionIndex,
        correctOptionIndex: ans.correctOptionIndexSnapshot,
        correct: ans.correct,
        grammarTopic: ans.grammarTopicSnapshot,
      })),
    }))
  );
});

// --- Устная часть (ТЗ п.17-22) ---------------------------------------------

router.get("/oral/topics", async (_req, res) => res.json(ORAL_TOPICS));
router.get("/oral/criteria-options", async (_req, res) =>
  res.json({
    taskCompletion: TASK_COMPLETION_VALUES,
    errorCount: ERROR_COUNT_VALUES,
    errorNature: ERROR_NATURE_VALUES,
    logic: LOGIC_VALUES,
    activeVocabulary: ACTIVE_VOCABULARY_VALUES,
    questionResponses: QUESTION_RESPONSE_VALUES,
    finalGrades: FINAL_GRADES,
  })
);

const assignSchema = z.object({ topicId: z.string().trim().min(1), comment: z.string().trim().max(1000).optional() });

router.post("/groups/:groupId/students/:studentId/oral/assign", async (req, res) => {
  const group = await findOwnedGroupHeader(req.user!.id, req.params.groupId);
  if (!group) return res.status(404).json({ error: "GROUP_NOT_FOUND" });
  const membership = await prisma.groupMembership.findFirst({ where: { groupId: group.id, studentId: req.params.studentId, status: "ACTIVE" } });
  if (!membership) return res.status(404).json({ error: "STUDENT_NOT_FOUND" });
  const parsed = assignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
  if (!ORAL_TOPICS.some((t) => t.id === parsed.data.topicId)) {
    return res.status(400).json({ error: "UNKNOWN_TOPIC", message: "Тема не входит в утверждённый список." });
  }

  try {
    const record = await assignOralTopic({
      studentId: req.params.studentId,
      groupId: group.id,
      courseId: group.courseId,
      academicYearId: group.course.academicYearId,
      teacherId: req.user!.id,
      topicId: parsed.data.topicId,
      comment: parsed.data.comment,
    });
    return res.status(201).json({ id: record.id, status: record.status, topicId: record.topicId });
  } catch (err) {
    if (err instanceof CreditError) return res.status(err.code === "NOT_FOUND" ? 404 : 409).json({ error: err.code, message: err.message });
    throw err;
  }
});

const criteriaSchema = z.object({
  taskCompletion: z.enum(TASK_COMPLETION_VALUES).optional(),
  errorCount: z.enum(ERROR_COUNT_VALUES).optional(),
  errorNature: z.array(z.enum(ERROR_NATURE_VALUES)).optional(),
  logic: z.enum(LOGIC_VALUES).optional(),
  activeVocabulary: z.enum(ACTIVE_VOCABULARY_VALUES).optional(),
  questionResponses: z.enum(QUESTION_RESPONSE_VALUES).optional(),
});

router.put("/groups/:groupId/students/:studentId/oral/criteria", async (req, res) => {
  const group = await findOwnedGroupHeader(req.user!.id, req.params.groupId);
  if (!group) return res.status(404).json({ error: "GROUP_NOT_FOUND" });
  const parsed = criteriaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });

  try {
    const record = await saveOralCriteria({ studentId: req.params.studentId, groupId: group.id, teacherId: req.user!.id, criteria: parsed.data });
    const preliminaryGrade = computePreliminaryGrade({
      taskCompletion: (record.criteriaTaskCompletion as any) ?? null,
      errorCount: (record.criteriaErrorCount as any) ?? null,
      logic: (record.criteriaLogic as any) ?? null,
      activeVocabulary: (record.criteriaActiveVocabulary as any) ?? null,
      questionResponses: (record.criteriaQuestionResponses as any) ?? null,
    });
    return res.json({
      status: record.status,
      criteriaTaskCompletion: record.criteriaTaskCompletion,
      criteriaErrorCount: record.criteriaErrorCount,
      errorNature: record.criteriaErrorNatureJson ? JSON.parse(record.criteriaErrorNatureJson) : [],
      criteriaLogic: record.criteriaLogic,
      criteriaActiveVocabulary: record.criteriaActiveVocabulary,
      criteriaQuestionResponses: record.criteriaQuestionResponses,
      // ТЗ п.22: предварительный результат — не итог, сопровождается
      // явной пометкой на frontend, никогда не пишется в finalGrade.
      preliminaryGrade,
    });
  } catch (err) {
    if (err instanceof CreditError) return res.status(err.code === "NOT_FOUND" ? 404 : 409).json({ error: err.code, message: err.message });
    throw err;
  }
});

const confirmSchema = z.object({ finalGrade: z.enum(FINAL_GRADES), comment: z.string().trim().max(2000).optional() });

router.post("/groups/:groupId/students/:studentId/oral/confirm", async (req, res) => {
  const group = await findOwnedGroupHeader(req.user!.id, req.params.groupId);
  if (!group) return res.status(404).json({ error: "GROUP_NOT_FOUND" });
  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });

  try {
    const record = await confirmOralGrade({ studentId: req.params.studentId, groupId: group.id, teacherId: req.user!.id, finalGrade: parsed.data.finalGrade, comment: parsed.data.comment });
    return res.json({ status: record.status, finalGrade: record.finalGrade, confirmedAt: record.confirmedAt });
  } catch (err) {
    if (err instanceof CreditError) {
      const statusCode = err.code === "NOT_FOUND" ? 404 : err.code === "CRITERIA_REQUIRED" ? 400 : 409;
      return res.status(statusCode).json({ error: err.code, message: err.message });
    }
    throw err;
  }
});

// --- История решений (ТЗ п.33) --------------------------------------------

router.get("/groups/:groupId/students/:studentId/audit-log", async (req, res) => {
  const group = await findOwnedGroupHeader(req.user!.id, req.params.groupId);
  if (!group) return res.status(404).json({ error: "GROUP_NOT_FOUND" });
  const log = await prisma.creditAuditLog.findMany({ where: { groupId: group.id, studentId: req.params.studentId }, orderBy: { createdAt: "desc" } });
  return res.json(log);
});

export default router;
