import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  QUESTIONNAIRE_BLOCKS,
  findQuestion,
  getVisibleQuestions,
  hasAnswer,
} from "../questionnaire/definition";
import { validateAnswerValue } from "../questionnaire/validate";

const router = Router();

router.use(requireAuth, requireRole("STUDENT"));

function parseAnswers(rows: { questionCode: string; valueJson: string }[]): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      answers[row.questionCode] = JSON.parse(row.valueJson);
    } catch {
      // Повреждённая запись — пропускаем, не роняем весь запрос.
    }
  }
  return answers;
}

function serializeAttempt(attempt: { id: string; status: string; startedAt: Date; completedAt: Date | null }, answers: Record<string, unknown>) {
  return {
    id: attempt.id,
    status: attempt.status,
    startedAt: attempt.startedAt,
    completedAt: attempt.completedAt,
    blocks: QUESTIONNAIRE_BLOCKS.map((b) => ({ id: b.id, title: b.title })),
    answers,
  };
}

// Находит попытку и проверяет владение (studentId = req.user.id) одним
// прямым условием — тот же принцип, что и everywhere else в проекте.
async function findOwnedAttempt(studentId: string, attemptId: string) {
  return prisma.questionnaireAttempt.findFirst({
    where: { id: attemptId, studentId },
    include: { answers: true },
  });
}

// Получить-или-создать: если для этой пары (студент, группа) уже есть
// попытка (в процессе или завершённая) — возвращаем её, новую не
// создаём. Это и есть "исторические ответы не перезаписывать": вторая
// попытка Start Profile для той же группы не появится сама по себе.
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

  const existing = await prisma.questionnaireAttempt.findFirst({
    where: { studentId: req.user!.id, groupId, kind: "START" },
    include: { answers: true },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    return res.status(200).json(serializeAttempt(existing, parseAnswers(existing.answers)));
  }

  // Гонка (двойной клик, две вкладки, повторный запрос сети — на
  // практике реально воспроизводится двойным вызовом React StrictMode
  // эффекта монтирования): два параллельных запроса могут оба пройти
  // проверку "existing === null" выше ДО того, как любой из них
  // вставит строку. Без защиты это создало бы два разных ряда
  // QuestionnaireAttempt для одной и той же пары (студент, группа) —
  // именно то, что запрещает "исторические ответы не перезаписывать"
  // (одна попытка START должна быть ровно одна). Уникальный индекс
  // @@unique([studentId, groupId, kind]) в схеме превращает вторую
  // попытку INSERT в ошибку P2002, которую здесь ловим и отвечаем уже
  // существующей (только что созданной параллельным запросом) попыткой
  // — вместо 500 или тихого создания дубликата.
  try {
    const attempt = await prisma.questionnaireAttempt.create({
      data: {
        studentId: req.user!.id,
        groupId,
        courseId: membership.group.courseId,
        academicYearId: membership.group.course.academicYearId,
      },
      include: { answers: true },
    });
    return res.status(201).json(serializeAttempt(attempt, {}));
  } catch (err: any) {
    if (err?.code === "P2002") {
      const raceWinner = await prisma.questionnaireAttempt.findFirst({
        where: { studentId: req.user!.id, groupId, kind: "START" },
        include: { answers: true },
      });
      if (raceWinner) {
        return res.status(200).json(serializeAttempt(raceWinner, parseAnswers(raceWinner.answers)));
      }
    }
    throw err;
  }
});

router.get("/attempts/:id", async (req, res) => {
  const attempt = await findOwnedAttempt(req.user!.id, req.params.id);
  if (!attempt) {
    return res.status(404).json({ error: "ATTEMPT_NOT_FOUND", message: "Анкета не найдена." });
  }
  return res.json(serializeAttempt(attempt, parseAnswers(attempt.answers)));
});

const answerSchema = z.object({
  code: z.string().trim().min(1),
  value: z.unknown(),
});

router.put("/attempts/:id/answers", async (req, res) => {
  const parsed = answerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
  }
  const { code, value } = parsed.data;

  const attempt = await prisma.questionnaireAttempt.findFirst({
    where: { id: req.params.id, studentId: req.user!.id },
  });
  if (!attempt) {
    return res.status(404).json({ error: "ATTEMPT_NOT_FOUND", message: "Анкета не найдена." });
  }
  if (attempt.status === "COMPLETED") {
    return res.status(409).json({
      error: "ATTEMPT_COMPLETED",
      message: "Эта анкета уже завершена, изменить ответы нельзя.",
    });
  }

  const question = findQuestion(code);
  if (!question) {
    return res.status(400).json({ error: "UNKNOWN_QUESTION", message: "Неизвестный вопрос." });
  }

  const validation = validateAnswerValue(question, value);
  if (!validation.ok) {
    return res.status(400).json({ error: "INVALID_ANSWER", message: validation.message });
  }

  await prisma.questionnaireAnswer.upsert({
    where: { attemptId_questionCode: { attemptId: attempt.id, questionCode: code } },
    create: {
      attemptId: attempt.id,
      questionCode: code,
      valueJson: JSON.stringify(value),
      indexGroup: question.indexGroup,
    },
    update: { valueJson: JSON.stringify(value), indexGroup: question.indexGroup },
  });

  return res.status(204).send();
});

router.post("/attempts/:id/complete", async (req, res) => {
  const attempt = await prisma.questionnaireAttempt.findFirst({
    where: { id: req.params.id, studentId: req.user!.id },
    include: { answers: true },
  });
  if (!attempt) {
    return res.status(404).json({ error: "ATTEMPT_NOT_FOUND", message: "Анкета не найдена." });
  }
  if (attempt.status === "COMPLETED") {
    return res.json(serializeAttempt(attempt, parseAnswers(attempt.answers)));
  }

  const answers = parseAnswers(attempt.answers);
  const visible = getVisibleQuestions(answers);
  const missing = visible.filter((q) => q.required && !hasAnswer(q, answers[q.code])).map((q) => q.code);

  if (missing.length > 0) {
    return res.status(400).json({
      error: "INCOMPLETE",
      message: "Заполнены не все обязательные вопросы.",
      missing,
    });
  }

  const updated = await prisma.questionnaireAttempt.update({
    where: { id: attempt.id },
    data: { status: "COMPLETED", completedAt: new Date() },
    include: { answers: true },
  });

  return res.json(serializeAttempt(updated, parseAnswers(updated.answers)));
});

export default router;
