// English Start Profile — Этап 9: «Мой зачёт» (роль студента).
import { Router } from "express";
import fs from "fs";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { getStudentCreditSummary, getCreditSettings } from "../analytics/credit";
import { CreditError, completeCreditTestAttempt, saveCreditTestAnswer } from "../credit/service";
import { CREDIT_TEST_ITEM_COUNT, ORAL_TOPICS } from "../credit/constants";
import { dictionaryFileUpload, dictionaryFilePath, deleteDictionaryFile } from "../uploads/dictionaryStorage";

const router = Router();
router.use(requireAuth, requireRole("STUDENT"));

async function requireMembership(studentId: string, groupId: string) {
  const membership = await prisma.groupMembership.findFirst({
    where: { studentId, groupId, status: "ACTIVE" },
    include: { group: { include: { course: true } } },
  });
  if (!membership) return null;
  return { courseId: membership.group.courseId, academicYearId: membership.group.course.academicYearId };
}

function serializeDictionarySubmission(s: any) {
  return {
    id: s.id,
    wordCount: s.wordCount,
    description: s.description,
    link: s.link,
    status: s.status,
    teacherComment: s.teacherComment,
    createdAt: s.createdAt,
    reviewedAt: s.reviewedAt,
    files: (s.files ?? []).map((f: any) => ({ id: f.id, fileName: f.fileName, mimeType: f.mimeType, size: f.size, uploadedAt: f.uploadedAt })),
  };
}

// --- Общая сводка ("Мой зачёт") ------------------------------------------

router.get("/:groupId", async (req, res) => {
  const scope = await requireMembership(req.user!.id, req.params.groupId);
  if (!scope) return res.status(404).json({ error: "MEMBERSHIP_NOT_FOUND", message: "Вы не состоите в этой группе." });

  const summary = await getStudentCreditSummary({ studentId: req.user!.id, groupId: req.params.groupId, ...scope });
  const oralTopic = summary.oral.assessment?.topicId ? ORAL_TOPICS.find((t) => t.id === summary.oral.assessment!.topicId) ?? null : null;

  return res.json({
    topStatus: summary.topStatus,
    topStatusLabel: summary.topStatusLabel,
    dictionary: {
      status: summary.dictionary.status,
      statusLabel: summary.dictionary.statusLabel,
      latest: summary.dictionary.latest ? serializeDictionarySubmission(summary.dictionary.latest) : null,
    },
    test: {
      status: summary.test.status,
      attemptsUsed: summary.test.attemptsUsed,
      maxAttempts: summary.test.maxAttempts,
      canStartNewAttempt: summary.dictionary.status === "CONFIRMED" && summary.test.attemptsUsed < summary.test.maxAttempts && summary.test.status !== "IN_PROGRESS",
      latestAttemptId: summary.test.latestAttempt?.id ?? null,
      latestAttemptStatus: summary.test.latestAttempt?.status ?? null,
      latestResult:
        summary.test.latestAttempt?.status === "COMPLETED"
          ? { correctCount: summary.test.latestAttempt.correctCount, totalCount: summary.test.latestAttempt.totalCount }
          : null,
    },
    qualification: summary.qualification,
    oral: {
      status: summary.oral.status,
      topic: oralTopic,
      assignedComment: summary.oral.assessment?.assignedComment ?? null,
      finalGrade: summary.oral.assessment?.status === "CONFIRMED" ? summary.oral.assessment.finalGrade : null,
      teacherComment: summary.oral.assessment?.status === "CONFIRMED" ? summary.oral.assessment.teacherComment : null,
      exemptionReason: summary.oral.assessment?.status === "EXEMPTED" ? summary.oral.assessment.exemptionReason : null,
    },
  });
});

// --- Допуск (словарь), ТЗ п.4-6 -------------------------------------------

router.get("/:groupId/dictionary", async (req, res) => {
  const scope = await requireMembership(req.user!.id, req.params.groupId);
  if (!scope) return res.status(404).json({ error: "MEMBERSHIP_NOT_FOUND" });
  const submissions = await prisma.dictionarySubmission.findMany({
    where: { studentId: req.user!.id, groupId: req.params.groupId },
    include: { files: true },
    orderBy: { createdAt: "desc" },
  });
  return res.json(submissions.map(serializeDictionarySubmission));
});

const dictionarySchema = z.object({
  wordCount: z.coerce.number().int().min(1, "Укажите количество слов"),
  description: z.string().trim().max(4000).optional().nullable(),
  link: z.string().trim().max(500).optional().nullable(),
});

router.post("/:groupId/dictionary", async (req, res) => {
  const scope = await requireMembership(req.user!.id, req.params.groupId);
  if (!scope) return res.status(404).json({ error: "MEMBERSHIP_NOT_FOUND", message: "Вы не состоите в этой группе." });

  const parsed = dictionarySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });

  // Не позволяем отправить новую заявку, пока предыдущая ещё
  // рассматривается (SUBMITTED/UNDER_REVIEW) или уже подтверждена —
  // повторная отправка имеет смысл только после отклонения/запроса
  // уточнения (ТЗ не описывает этот случай явно — решение
  // задокументировано в отчёте).
  const latest = await prisma.dictionarySubmission.findFirst({
    where: { studentId: req.user!.id, groupId: req.params.groupId },
    orderBy: { createdAt: "desc" },
  });
  if (latest && (latest.status === "SUBMITTED" || latest.status === "UNDER_REVIEW" || latest.status === "CONFIRMED")) {
    return res.status(409).json({
      error: "SUBMISSION_IN_PROGRESS",
      message:
        latest.status === "CONFIRMED"
          ? "Допуск уже подтверждён — повторная отправка не требуется."
          : "Предыдущая заявка ещё рассматривается преподавателем.",
    });
  }

  const submission = await prisma.dictionarySubmission.create({
    data: {
      studentId: req.user!.id,
      groupId: req.params.groupId,
      courseId: scope.courseId,
      academicYearId: scope.academicYearId,
      wordCount: parsed.data.wordCount,
      description: parsed.data.description?.trim() || null,
      link: parsed.data.link?.trim() || null,
    },
    include: { files: true },
  });
  await prisma.creditAuditLog.create({
    data: { studentId: req.user!.id, groupId: req.params.groupId, entityType: "DICTIONARY", entityId: submission.id, actorId: req.user!.id, action: "SUBMITTED", toValue: String(parsed.data.wordCount) },
  });
  return res.status(201).json(serializeDictionarySubmission(submission));
});

router.post(
  "/:groupId/dictionary/:id/files",
  (req, res, next) => {
    dictionaryFileUpload(req, res, (err) => {
      if (err) {
        return res
          .status(400)
          .json({ error: err.message === "UNSUPPORTED_FILE_TYPE" ? "UNSUPPORTED_FILE_TYPE" : "UPLOAD_ERROR", message: err.message === "UNSUPPORTED_FILE_TYPE" ? "Неподдерживаемый формат файла." : "Не удалось загрузить файл." });
      }
      next();
    });
  },
  async (req, res) => {
    const submission = await prisma.dictionarySubmission.findFirst({ where: { id: req.params.id, studentId: req.user!.id, groupId: req.params.groupId } });
    if (!submission) {
      if (req.file) fs.rm(req.file.path, { force: true }, () => {});
      return res.status(404).json({ error: "SUBMISSION_NOT_FOUND" });
    }
    if (submission.status === "CONFIRMED" || submission.status === "REJECTED") {
      if (req.file) fs.rm(req.file.path, { force: true }, () => {});
      return res.status(409).json({ error: "NOT_EDITABLE", message: "Эта заявка уже проверена — приложить файл нельзя." });
    }
    if (!req.file) return res.status(400).json({ error: "NO_FILE" });

    const file = await prisma.dictionarySubmissionFile.create({
      data: { submissionId: submission.id, fileName: req.file.originalname, storedName: req.file.filename, mimeType: req.file.mimetype, size: req.file.size },
    });
    return res.status(201).json({ id: file.id, fileName: file.fileName, mimeType: file.mimeType, size: file.size, uploadedAt: file.uploadedAt });
  }
);

router.get("/:groupId/dictionary/:id/files/:fileId", async (req, res) => {
  const submission = await prisma.dictionarySubmission.findFirst({
    where: { id: req.params.id, studentId: req.user!.id, groupId: req.params.groupId },
    include: { files: true },
  });
  if (!submission) return res.status(404).json({ error: "SUBMISSION_NOT_FOUND" });
  const file = submission.files.find((f) => f.id === req.params.fileId);
  if (!file) return res.status(404).json({ error: "FILE_NOT_FOUND" });
  return res.sendFile(dictionaryFilePath(submission.id, file.storedName), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "FILE_NOT_FOUND" });
  });
});

router.delete("/:groupId/dictionary/:id/files/:fileId", async (req, res) => {
  const submission = await prisma.dictionarySubmission.findFirst({
    where: { id: req.params.id, studentId: req.user!.id, groupId: req.params.groupId },
    include: { files: true },
  });
  if (!submission) return res.status(404).json({ error: "SUBMISSION_NOT_FOUND" });
  if (submission.status === "CONFIRMED" || submission.status === "REJECTED") {
    return res.status(409).json({ error: "NOT_EDITABLE" });
  }
  const file = submission.files.find((f) => f.id === req.params.fileId);
  if (!file) return res.status(404).json({ error: "FILE_NOT_FOUND" });
  await prisma.dictionarySubmissionFile.delete({ where: { id: file.id } });
  deleteDictionaryFile(submission.id, file.storedName);
  return res.status(204).send();
});

// --- Лексико-грамматический тест, ТЗ п.8-16 -------------------------------

function serializeTestAnswerForStudent(a: any, revealAnswers: boolean, completed: boolean) {
  return {
    itemId: a.itemId,
    orderIndex: a.orderIndex,
    question: a.questionSnapshot,
    options: JSON.parse(a.optionsSnapshotJson) as string[],
    selectedOptionIndex: a.selectedOptionIndex,
    // Правильный ответ никогда не отдаётся до завершения попытки; после
    // завершения — только если политика курса разрешает показ (ТЗ п.16).
    correctOptionIndex: completed && revealAnswers ? a.correctOptionIndexSnapshot : null,
    correct: completed && revealAnswers ? a.correct : null,
  };
}

router.post("/:groupId/test/attempts", async (req, res) => {
  const scope = await requireMembership(req.user!.id, req.params.groupId);
  if (!scope) return res.status(404).json({ error: "MEMBERSHIP_NOT_FOUND" });

  // Допуск должен быть подтверждён, прежде чем открывать тест (ТЗ п.1 —
  // "Допуск → Часть 1 → Часть 2", тест — часть 1, доступна только после
  // допуска).
  const latestDictionary = await prisma.dictionarySubmission.findFirst({ where: { studentId: req.user!.id, groupId: req.params.groupId }, orderBy: { createdAt: "desc" } });
  if (latestDictionary?.status !== "CONFIRMED") {
    return res.status(409).json({ error: "NOT_ADMITTED", message: "Тест доступен только после подтверждения допуска." });
  }

  const inProgress = await prisma.creditTestAttempt.findFirst({ where: { studentId: req.user!.id, groupId: req.params.groupId, status: "IN_PROGRESS" } });
  if (inProgress) return res.status(200).json({ id: inProgress.id, resumed: true });

  const settings = await getCreditSettings(scope.courseId);
  const maxAttempts = settings?.maxTestAttempts ?? 1;
  const usedAttempts = await prisma.creditTestAttempt.count({ where: { studentId: req.user!.id, groupId: req.params.groupId } });
  if (usedAttempts >= maxAttempts) {
    return res.status(409).json({ error: "NO_ATTEMPTS_LEFT", message: `Использованы все доступные попытки (${maxAttempts}).` });
  }

  const bank = await prisma.creditTestItem.findMany({ where: { courseId: scope.courseId, active: true } });
  if (bank.length < CREDIT_TEST_ITEM_COUNT) {
    return res.status(409).json({ error: "BANK_TOO_SMALL", message: `В банке заданий этого курса меньше ${CREDIT_TEST_ITEM_COUNT} активных вопросов — преподаватель ещё не наполнил банк.` });
  }
  const shuffled = [...bank].sort(() => Math.random() - 0.5).slice(0, CREDIT_TEST_ITEM_COUNT);

  try {
    const attempt = await prisma.creditTestAttempt.create({
      data: {
        studentId: req.user!.id,
        groupId: req.params.groupId,
        courseId: scope.courseId,
        academicYearId: scope.academicYearId,
        attemptNumber: usedAttempts + 1,
        answers: {
          create: shuffled.map((item, idx) => ({
            itemId: item.id,
            orderIndex: idx,
            questionSnapshot: item.question,
            optionsSnapshotJson: item.optionsJson,
            correctOptionIndexSnapshot: item.correctOptionIndex,
            grammarTopicSnapshot: item.grammarTopic,
          })),
        },
      },
    });
    return res.status(201).json({ id: attempt.id, resumed: false });
  } catch (err: any) {
    if (err?.code === "P2002") {
      // Гонка — попытка с этим номером уже создана параллельным
      // запросом; вернём актуальную незавершённую попытку.
      const raceWinner = await prisma.creditTestAttempt.findFirst({ where: { studentId: req.user!.id, groupId: req.params.groupId, status: "IN_PROGRESS" } });
      if (raceWinner) return res.status(200).json({ id: raceWinner.id, resumed: true });
    }
    throw err;
  }
});

router.get("/:groupId/test/attempts/:attemptId", async (req, res) => {
  const attempt = await prisma.creditTestAttempt.findFirst({
    where: { id: req.params.attemptId, studentId: req.user!.id, groupId: req.params.groupId },
    include: { answers: { orderBy: { orderIndex: "asc" } } },
  });
  if (!attempt) return res.status(404).json({ error: "ATTEMPT_NOT_FOUND" });
  const settings = await getCreditSettings(attempt.courseId);
  const reveal = settings?.revealCorrectAnswers ?? false;
  return res.json({
    id: attempt.id,
    status: attempt.status,
    startedAt: attempt.startedAt,
    completedAt: attempt.completedAt,
    totalItems: attempt.answers.length,
    answeredCount: attempt.answers.filter((a) => a.selectedOptionIndex !== null).length,
    items: attempt.answers.map((a) => serializeTestAnswerForStudent(a, reveal, attempt.status === "COMPLETED")),
    result: attempt.status === "COMPLETED" ? { correctCount: attempt.correctCount, totalCount: attempt.totalCount } : null,
  });
});

const answerSchema = z.object({ selectedOptionIndex: z.number().int().min(0) });

router.patch("/:groupId/test/attempts/:attemptId/items/:itemId/answer", async (req, res) => {
  const parsed = answerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
  try {
    await saveCreditTestAnswer({ attemptId: req.params.attemptId, studentId: req.user!.id, itemId: req.params.itemId, selectedOptionIndex: parsed.data.selectedOptionIndex });
    return res.status(204).send();
  } catch (err) {
    if (err instanceof CreditError) {
      const statusCode = err.code === "NOT_FOUND" || err.code === "UNKNOWN_ITEM" ? 404 : err.code === "ATTEMPT_COMPLETED" ? 409 : 400;
      return res.status(statusCode).json({ error: err.code, message: err.message });
    }
    throw err;
  }
});

router.post("/:groupId/test/attempts/:attemptId/complete", async (req, res) => {
  try {
    const attempt = await completeCreditTestAttempt(req.params.attemptId, req.user!.id);
    if (attempt.groupId !== req.params.groupId) return res.status(404).json({ error: "ATTEMPT_NOT_FOUND" });
    const settings = await getCreditSettings(attempt.courseId);
    return res.json({ correctCount: attempt.correctCount, totalCount: attempt.totalCount, revealCorrectAnswers: settings?.revealCorrectAnswers ?? false });
  } catch (err) {
    if (err instanceof CreditError) {
      const statusCode = err.code === "NOT_FOUND" ? 404 : err.code === "INCOMPLETE" ? 400 : 409;
      return res.status(statusCode).json({ error: err.code, message: err.message });
    }
    throw err;
  }
});

export default router;
