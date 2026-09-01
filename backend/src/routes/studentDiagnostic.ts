import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { DIAGNOSTIC_ITEMS, TOTAL_DIAGNOSTIC_ITEMS, findItem } from "../diagnostic/itemBank";
import { getPublicBlocks, getPublicPassages } from "../diagnostic/publicView";
import { computeResult } from "../diagnostic/scoring";

const router = Router();

router.use(requireAuth, requireRole("STUDENT"));

function serializeAttempt(attempt: { id: string; status: string; startedAt: Date; completedAt: Date | null }, answers: { itemId: string; selectedOptionIndex: number; correct: boolean }[]) {
  return {
    id: attempt.id,
    status: attempt.status,
    startedAt: attempt.startedAt,
    completedAt: attempt.completedAt,
    blocks: getPublicBlocks(),
    passages: getPublicPassages(),
    totalItems: TOTAL_DIAGNOSTIC_ITEMS,
    answers: Object.fromEntries(answers.map((a) => [a.itemId, { selectedOptionIndex: a.selectedOptionIndex, correct: a.correct }])),
  };
}

// Найти-или-создать с защитой от гонки — тот же приём, что и у
// анкетирования (@@unique + обработка P2002), см. комментарий в
// routes/studentQuestionnaire.ts и docs/STAGE_4_REPORT.md.
router.post("/attempts", async (req, res) => {
  const parsed = z.object({ groupId: z.string().trim().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
  }
  const { groupId } = parsed.data;

  const membership = await prisma.groupMembership.findFirst({
    where: { studentId: req.user!.id, groupId, status: "ACTIVE" },
    include: { group: { include: { course: true } } },
  });
  if (!membership) {
    return res.status(404).json({ error: "MEMBERSHIP_NOT_FOUND", message: "Вы не состоите в этой группе." });
  }

  const existing = await prisma.diagnosticAttempt.findFirst({
    where: { studentId: req.user!.id, groupId, kind: "START" },
    include: { answers: true },
  });
  if (existing) {
    return res.status(200).json(serializeAttempt(existing, existing.answers));
  }

  try {
    const attempt = await prisma.diagnosticAttempt.create({
      data: {
        studentId: req.user!.id,
        groupId,
        courseId: membership.group.courseId,
        academicYearId: membership.group.course.academicYearId,
      },
      include: { answers: true },
    });
    return res.status(201).json(serializeAttempt(attempt, []));
  } catch (err: any) {
    if (err?.code === "P2002") {
      const raceWinner = await prisma.diagnosticAttempt.findFirst({
        where: { studentId: req.user!.id, groupId, kind: "START" },
        include: { answers: true },
      });
      if (raceWinner) {
        return res.status(200).json(serializeAttempt(raceWinner, raceWinner.answers));
      }
    }
    throw err;
  }
});

router.get("/attempts/:id", async (req, res) => {
  const attempt = await prisma.diagnosticAttempt.findFirst({
    where: { id: req.params.id, studentId: req.user!.id },
    include: { answers: true },
  });
  if (!attempt) {
    return res.status(404).json({ error: "ATTEMPT_NOT_FOUND", message: "Диагностика не найдена." });
  }
  return res.json(serializeAttempt(attempt, attempt.answers));
});

const answerSchema = z.object({
  selectedOptionIndex: z.number().int().min(0),
});

router.post("/attempts/:id/items/:itemId/answer", async (req, res) => {
  const parsed = answerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
  }

  const attempt = await prisma.diagnosticAttempt.findFirst({
    where: { id: req.params.id, studentId: req.user!.id },
  });
  if (!attempt) {
    return res.status(404).json({ error: "ATTEMPT_NOT_FOUND", message: "Диагностика не найдена." });
  }
  if (attempt.status === "COMPLETED") {
    return res.status(409).json({
      error: "ATTEMPT_COMPLETED",
      message: "Эта диагностика уже завершена, ответы изменить нельзя.",
    });
  }

  const item = findItem(req.params.itemId);
  if (!item) {
    return res.status(400).json({ error: "UNKNOWN_ITEM", message: "Неизвестное задание." });
  }
  if (parsed.data.selectedOptionIndex >= item.optionsEn.length) {
    return res.status(400).json({ error: "INVALID_ANSWER", message: "Недопустимый вариант ответа." });
  }

  // Диагностический тест — не анкета: ответ фиксируется один раз.
  // Повторная отправка (двойной клик, повтор сети) возвращает уже
  // сохранённый результат идемпотентно, а не позволяет "переотвечать"
  // и не создаёт вторую запись (уникальный индекс на attemptId+itemId).
  const existingAnswer = await prisma.diagnosticAnswer.findUnique({
    where: { attemptId_itemId: { attemptId: attempt.id, itemId: item.id } },
  });
  if (existingAnswer) {
    return res.status(200).json({
      correct: existingAnswer.correct,
      correctOptionIndex: item.correctOptionIndex,
      feedbackRu: existingAnswer.correct ? "Верно!" : `Неверно. Правильный ответ: «${item.optionsEn[item.correctOptionIndex]}».`,
    });
  }

  const correct = parsed.data.selectedOptionIndex === item.correctOptionIndex;
  await prisma.diagnosticAnswer.create({
    data: {
      attemptId: attempt.id,
      itemId: item.id,
      skill: item.skill,
      selectedOptionIndex: parsed.data.selectedOptionIndex,
      correct,
    },
  });

  return res.status(201).json({
    correct,
    correctOptionIndex: item.correctOptionIndex,
    feedbackRu: correct ? "Верно!" : `Неверно. Правильный ответ: «${item.optionsEn[item.correctOptionIndex]}».`,
  });
});

router.post("/attempts/:id/complete", async (req, res) => {
  const attempt = await prisma.diagnosticAttempt.findFirst({
    where: { id: req.params.id, studentId: req.user!.id },
    include: { answers: true, result: true },
  });
  if (!attempt) {
    return res.status(404).json({ error: "ATTEMPT_NOT_FOUND", message: "Диагностика не найдена." });
  }
  if (attempt.status === "COMPLETED" && attempt.result) {
    return res.json(serializeResult(attempt.result));
  }

  const answeredIds = new Set(attempt.answers.map((a) => a.itemId));
  const missing = DIAGNOSTIC_ITEMS.filter((i) => !answeredIds.has(i.id)).map((i) => i.id);
  if (missing.length > 0) {
    return res.status(400).json({
      error: "INCOMPLETE",
      message: "Отвечены не все задания диагностики.",
      missing,
    });
  }

  const computed = computeResult(attempt.answers.map((a) => ({ itemId: a.itemId, correct: a.correct })));

  const [, result] = await prisma.$transaction([
    prisma.diagnosticAttempt.update({ where: { id: attempt.id }, data: { status: "COMPLETED", completedAt: new Date() } }),
    prisma.diagnosticResult.create({
      data: {
        attemptId: attempt.id,
        overallCorrect: computed.overallCorrect,
        overallTotal: computed.overallTotal,
        overallPercentage: computed.overallPercentage,
        skillBreakdownJson: JSON.stringify(computed.skillBreakdown),
        // diagnosticRange остаётся null — см. комментарий в schema.prisma
        // и docs/STAGE_5_REPORT.md: нет утверждённой матрицы порогов.
      },
    }),
  ]);

  return res.json(serializeResult(result));
});

function serializeResult(result: { overallCorrect: number; overallTotal: number; overallPercentage: number; skillBreakdownJson: string; diagnosticRange: string | null; computedAt: Date }) {
  return {
    overallCorrect: result.overallCorrect,
    overallTotal: result.overallTotal,
    overallPercentage: result.overallPercentage,
    skillBreakdown: JSON.parse(result.skillBreakdownJson),
    diagnosticRange: result.diagnosticRange,
    computedAt: result.computedAt,
  };
}

router.get("/attempts/:id/result", async (req, res) => {
  const attempt = await prisma.diagnosticAttempt.findFirst({
    where: { id: req.params.id, studentId: req.user!.id },
    include: { result: true },
  });
  if (!attempt) {
    return res.status(404).json({ error: "ATTEMPT_NOT_FOUND", message: "Диагностика не найдена." });
  }
  if (!attempt.result) {
    return res.status(404).json({ error: "RESULT_NOT_READY", message: "Диагностика ещё не завершена." });
  }
  return res.json(serializeResult(attempt.result));
});

export default router;
