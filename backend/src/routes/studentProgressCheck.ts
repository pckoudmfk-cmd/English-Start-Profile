// English Start Profile — Этап 10: ПРОМЕЖУТОЧНАЯ ДИАГНОСТИКА (роль
// студента). В отличие от Start Diagnostic, здесь НЕТ маршрута
// "создать попытку" — попытки (и теста, и анкеты) создаёт только
// преподаватель при назначении (routes/teacherProgressCheck.ts).
// Студент может лишь открыть уже назначенную попытку, и только начиная
// с periodStartAt — "пройти её раньше назначенного срока" запрещено ТЗ.
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { TOTAL_DIAGNOSTIC_ITEMS_B } from "../diagnostic/itemBankB";
import { getPublicBlocks, getPublicPassages } from "../diagnostic/publicView";
import { DiagnosticAnswerError, answerDiagnosticItem } from "../diagnostic/answering";
import { DiagnosticCompletionError, finalizeDiagnosticAttempt, serializeDiagnosticResult } from "../diagnostic/completion";
import { QUESTIONNAIRE_BLOCKS, findQuestion, getVisibleQuestions, hasAnswer } from "../questionnaire/definition";
import { validateAnswerValue } from "../questionnaire/validate";
import { getStudentProgressComparison } from "../analytics/progressCheck";

const FORM = "B" as const;

const router = Router();
router.use(requireAuth, requireRole("STUDENT"));

async function findOwnedDiagnostic(studentId: string, groupId: string) {
  return prisma.diagnosticAttempt.findFirst({ where: { studentId, groupId, kind: "PROGRESS" }, include: { answers: true, result: true } });
}
async function findOwnedQuestionnaire(studentId: string, groupId: string) {
  return prisma.questionnaireAttempt.findFirst({ where: { studentId, groupId, kind: "PROGRESS" }, include: { answers: true } });
}

// Открыть до срока (periodStartAt) нельзя ни для теста, ни для анкеты —
// одна и та же проверка для обеих частей Промежуточной диагностики.
function periodError(attempt: { periodStartAt: Date | null; periodEndAt: Date | null } | null): { code: string; message: string } | null {
  if (!attempt) return { code: "NOT_ASSIGNED", message: "Промежуточная диагностика вам ещё не назначена." };
  if (attempt.periodStartAt && new Date() < attempt.periodStartAt) {
    return {
      code: "TOO_EARLY",
      message: `Промежуточная диагностика станет доступна ${attempt.periodStartAt.toLocaleDateString("ru-RU")}.`,
    };
  }
  return null;
}

// --- Общий обзор (для хаба "Промежуточная диагностика") ------------------

router.get("/:groupId", async (req, res) => {
  const { groupId } = req.params;
  const membership = await prisma.groupMembership.findFirst({ where: { studentId: req.user!.id, groupId, status: "ACTIVE" } });
  if (!membership) return res.status(404).json({ error: "MEMBERSHIP_NOT_FOUND" });

  const [diagnostic, questionnaire] = await Promise.all([
    findOwnedDiagnostic(req.user!.id, groupId),
    findOwnedQuestionnaire(req.user!.id, groupId),
  ]);

  const openNow = diagnostic ? !periodError(diagnostic) : false;
  return res.json({
    assigned: diagnostic !== null,
    periodStartAt: diagnostic?.periodStartAt ?? null,
    periodEndAt: diagnostic?.periodEndAt ?? null,
    openNow,
    test: { status: diagnostic?.status ?? "NOT_ASSIGNED", attemptId: diagnostic?.id ?? null },
    questionnaire: { status: questionnaire?.status ?? "NOT_ASSIGNED", attemptId: questionnaire?.id ?? null },
  });
});

// --- Тест (Form B) ----------------------------------------------------

function serializeDiagnosticAttempt(attempt: { id: string; status: string; startedAt: Date; completedAt: Date | null }, answers: { itemId: string; selectedOptionIndex: number; correct: boolean }[]) {
  return {
    id: attempt.id,
    status: attempt.status,
    startedAt: attempt.startedAt,
    completedAt: attempt.completedAt,
    blocks: getPublicBlocks(FORM),
    passages: getPublicPassages(FORM),
    totalItems: TOTAL_DIAGNOSTIC_ITEMS_B,
    answers: Object.fromEntries(answers.map((a) => [a.itemId, { selectedOptionIndex: a.selectedOptionIndex, correct: a.correct }])),
  };
}

router.get("/:groupId/test", async (req, res) => {
  const attempt = await findOwnedDiagnostic(req.user!.id, req.params.groupId);
  const err = periodError(attempt);
  if (err) return res.status(err.code === "NOT_ASSIGNED" ? 404 : 403).json(err);

  // Первое открытие в разрешённый период — фиксируем реальный момент
  // начала (ASSIGNED → IN_PROGRESS): startedAt по умолчанию равен
  // моменту НАЗНАЧЕНИЯ (см. schema.prisma), а не моменту, когда студент
  // реально приступил — здесь это исправляется один раз.
  let current = attempt!;
  if (current.status === "ASSIGNED") {
    current = await prisma.diagnosticAttempt.update({
      where: { id: current.id },
      data: { status: "IN_PROGRESS", startedAt: new Date() },
      include: { answers: true, result: true },
    });
  }
  return res.json(serializeDiagnosticAttempt(current, current.answers));
});

const answerSchema = z.object({ selectedOptionIndex: z.number().int().min(0) });

router.patch("/:groupId/test/items/:itemId/answer", async (req, res) => {
  const parsed = answerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });

  const attempt = await findOwnedDiagnostic(req.user!.id, req.params.groupId);
  const err = periodError(attempt);
  if (err) return res.status(err.code === "NOT_ASSIGNED" ? 404 : 403).json(err);
  if (attempt!.status === "COMPLETED") {
    return res.status(409).json({ error: "ATTEMPT_COMPLETED", message: "Эта диагностика уже завершена, ответы изменить нельзя." });
  }

  try {
    const feedback = await answerDiagnosticItem(attempt!.id, req.params.itemId, parsed.data.selectedOptionIndex, FORM);
    return res.status(201).json(feedback);
  } catch (e) {
    if (e instanceof DiagnosticAnswerError) return res.status(400).json({ error: e.code, message: e.message });
    throw e;
  }
});

router.post("/:groupId/test/complete", async (req, res) => {
  const attempt = await findOwnedDiagnostic(req.user!.id, req.params.groupId);
  const err = periodError(attempt);
  if (err) return res.status(err.code === "NOT_ASSIGNED" ? 404 : 403).json(err);

  try {
    const result = await finalizeDiagnosticAttempt(attempt!, FORM);
    return res.json(serializeDiagnosticResult(result));
  } catch (e) {
    if (e instanceof DiagnosticCompletionError) return res.status(400).json({ error: e.code, message: e.message, missing: e.missing });
    throw e;
  }
});

router.get("/:groupId/test/result", async (req, res) => {
  const attempt = await prisma.diagnosticAttempt.findFirst({ where: { studentId: req.user!.id, groupId: req.params.groupId, kind: "PROGRESS" }, include: { result: true } });
  if (!attempt) return res.status(404).json({ error: "NOT_ASSIGNED" });
  if (!attempt.result) return res.status(404).json({ error: "RESULT_NOT_READY", message: "Диагностика ещё не завершена." });
  return res.json(serializeDiagnosticResult(attempt.result));
});

// --- Анкета (повторная, тот же список вопросов) ---------------------------

function parseAnswers(rows: { questionCode: string; valueJson: string }[]): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      answers[row.questionCode] = JSON.parse(row.valueJson);
    } catch {
      // повреждённая запись — пропускаем
    }
  }
  return answers;
}
function serializeQuestionnaireAttempt(attempt: { id: string; status: string; startedAt: Date; completedAt: Date | null }, answers: Record<string, unknown>) {
  return {
    id: attempt.id,
    status: attempt.status,
    startedAt: attempt.startedAt,
    completedAt: attempt.completedAt,
    blocks: QUESTIONNAIRE_BLOCKS.map((b) => ({ id: b.id, title: b.title })),
    answers,
  };
}

router.get("/:groupId/questionnaire", async (req, res) => {
  const attempt = await findOwnedQuestionnaire(req.user!.id, req.params.groupId);
  const diagnostic = await findOwnedDiagnostic(req.user!.id, req.params.groupId); // period хранится на обеих попытках одинаково — берём с любой
  const err = periodError(attempt ?? diagnostic);
  if (err) return res.status(err.code === "NOT_ASSIGNED" ? 404 : 403).json(err);

  let current = attempt!;
  if (current.status === "ASSIGNED") {
    current = await prisma.questionnaireAttempt.update({ where: { id: current.id }, data: { status: "IN_PROGRESS", startedAt: new Date() }, include: { answers: true } });
  }
  return res.json(serializeQuestionnaireAttempt(current, parseAnswers(current.answers)));
});

const questionnaireAnswerSchema = z.object({ code: z.string().trim().min(1), value: z.unknown() });

router.put("/:groupId/questionnaire/answers", async (req, res) => {
  const parsed = questionnaireAnswerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
  const { code, value } = parsed.data;

  const attempt = await findOwnedQuestionnaire(req.user!.id, req.params.groupId);
  const err = periodError(attempt);
  if (err) return res.status(err.code === "NOT_ASSIGNED" ? 404 : 403).json(err);
  if (attempt!.status === "COMPLETED") {
    return res.status(409).json({ error: "ATTEMPT_COMPLETED", message: "Эта анкета уже завершена, изменить ответы нельзя." });
  }

  const question = findQuestion(code);
  if (!question) return res.status(400).json({ error: "UNKNOWN_QUESTION", message: "Неизвестный вопрос." });
  const validation = validateAnswerValue(question, value);
  if (!validation.ok) return res.status(400).json({ error: "INVALID_ANSWER", message: validation.message });

  await prisma.questionnaireAnswer.upsert({
    where: { attemptId_questionCode: { attemptId: attempt!.id, questionCode: code } },
    create: { attemptId: attempt!.id, questionCode: code, valueJson: JSON.stringify(value), indexGroup: question.indexGroup },
    update: { valueJson: JSON.stringify(value), indexGroup: question.indexGroup },
  });
  return res.status(204).send();
});

router.post("/:groupId/questionnaire/complete", async (req, res) => {
  const attempt = await findOwnedQuestionnaire(req.user!.id, req.params.groupId);
  const err = periodError(attempt);
  if (err) return res.status(err.code === "NOT_ASSIGNED" ? 404 : 403).json(err);
  if (attempt!.status === "COMPLETED") {
    return res.json(serializeQuestionnaireAttempt(attempt!, parseAnswers(attempt!.answers)));
  }

  const answers = parseAnswers(attempt!.answers);
  const visible = getVisibleQuestions(answers);
  const missing = visible.filter((q) => q.required && !hasAnswer(q, answers[q.code])).map((q) => q.code);
  if (missing.length > 0) {
    return res.status(400).json({ error: "INCOMPLETE", message: "Заполнены не все обязательные вопросы.", missing });
  }

  const updated = await prisma.questionnaireAttempt.update({
    where: { id: attempt!.id },
    data: { status: "COMPLETED", completedAt: new Date() },
    include: { answers: true },
  });
  return res.json(serializeQuestionnaireAttempt(updated, parseAnswers(updated.answers)));
});

// --- Сравнение "Старт → Сейчас → Что изменилось" (собственный результат) --

router.get("/:groupId/summary", async (req, res) => {
  const membership = await prisma.groupMembership.findFirst({ where: { studentId: req.user!.id, groupId: req.params.groupId, status: "ACTIVE" } });
  if (!membership) return res.status(404).json({ error: "MEMBERSHIP_NOT_FOUND" });
  const summary = await getStudentProgressComparison(req.params.groupId, req.user!.id);
  return res.json(summary);
});

export default router;
