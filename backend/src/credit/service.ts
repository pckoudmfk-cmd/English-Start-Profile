// English Start Profile — Этап 9: доменная логика зачёта, вынесенная из
// маршрутов (тот же принцип, что и achievements/service.ts на Этапе 8):
// решения преподавателя и завершение попытки теста живут в ОДНОМ месте,
// а не дублируются между маршрутами.
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import {
  DICTIONARY_DECISION_AUDIT_ACTION,
  DICTIONARY_DECISION_TARGET_STATUS,
  DICTIONARY_REVIEWABLE_STATUSES,
  dictionaryCommentRequired,
  type DictionaryDecisionAction,
} from "./constants";

export class CreditError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

// --- Допуск: решение преподавателя (ТЗ п.5, 7) ----------------------------

export async function applyDictionaryDecision(input: {
  submissionId: string;
  teacherId: string;
  groupId: string;
  action: DictionaryDecisionAction;
  comment?: string;
}) {
  const { submissionId, teacherId, groupId, action, comment } = input;
  if (dictionaryCommentRequired(action) && !comment?.trim()) {
    throw new CreditError("COMMENT_REQUIRED", "Для этого решения нужно указать комментарий.");
  }

  return prisma.$transaction(async (tx) => {
    const submission = await tx.dictionarySubmission.findFirst({ where: { id: submissionId, groupId } });
    if (!submission) {
      throw new CreditError("NOT_FOUND", "Заявка на допуск не найдена.");
    }
    // Решение допустимо только для САМОЙ ПОСЛЕДНЕЙ отправки студента —
    // решение по устаревшей (уже перекрытой повторной отправкой) записи
    // не должно менять текущий допуск задним числом.
    const latest = await tx.dictionarySubmission.findFirst({
      where: { studentId: submission.studentId, groupId },
      orderBy: { createdAt: "desc" },
    });
    if (latest?.id !== submission.id) {
      throw new CreditError("NOT_LATEST", "Это не последняя отправка студента — решение принимается по актуальной заявке.");
    }
    if (!DICTIONARY_REVIEWABLE_STATUSES.includes(submission.status as any) && action !== "OPEN") {
      // "Открыть" допустимо и повторно (просто фиксирует, что
      // преподаватель ещё раз просматривает), остальные решения — только
      // из "На проверке" (после "Открыть") либо прямо из "Предоставлен".
      if (!DICTIONARY_REVIEWABLE_STATUSES.includes(submission.status as any)) {
        throw new CreditError("INVALID_STATUS", "Решение уже принято по этой заявке.");
      }
    }

    const targetStatus = DICTIONARY_DECISION_TARGET_STATUS[action];
    const updated = await tx.dictionarySubmission.update({
      where: { id: submission.id },
      data: {
        status: targetStatus,
        teacherId,
        teacherComment: comment?.trim() || (action === "CONFIRM" ? submission.teacherComment : null),
        reviewedAt: new Date(),
      },
    });
    await tx.creditAuditLog.create({
      data: {
        studentId: submission.studentId,
        groupId,
        entityType: "DICTIONARY",
        entityId: submission.id,
        actorId: teacherId,
        action: DICTIONARY_DECISION_AUDIT_ACTION[action],
        fromValue: submission.status,
        toValue: targetStatus,
        reason: comment?.trim() || null,
      },
    });
    return updated;
  });
}

// --- Тест: сохранение ответа и завершение попытки (ТЗ п.12-16) -----------

export async function saveCreditTestAnswer(input: { attemptId: string; studentId: string; itemId: string; selectedOptionIndex: number }) {
  const attempt = await prisma.creditTestAttempt.findFirst({ where: { id: input.attemptId, studentId: input.studentId } });
  if (!attempt) throw new CreditError("NOT_FOUND", "Попытка не найдена.");
  if (attempt.status === "COMPLETED") {
    throw new CreditError("ATTEMPT_COMPLETED", "Тест уже завершён — изменить ответы нельзя.");
  }
  const answer = await prisma.creditTestAnswer.findUnique({ where: { attemptId_itemId: { attemptId: attempt.id, itemId: input.itemId } } });
  if (!answer) throw new CreditError("UNKNOWN_ITEM", "Задание не найдено в этой попытке.");

  const options: string[] = JSON.parse(answer.optionsSnapshotJson);
  if (input.selectedOptionIndex < 0 || input.selectedOptionIndex >= options.length) {
    throw new CreditError("INVALID_ANSWER", "Недопустимый вариант ответа.");
  }

  // ТЗ п.12: ответ можно менять свободно до завершения теста — здесь
  // именно ОБНОВЛЕНИЕ уже существующей строки-снимка, а не создание
  // новой (в отличие от диагностики, где ответ фиксируется один раз).
  const correct = input.selectedOptionIndex === answer.correctOptionIndexSnapshot;
  return prisma.creditTestAnswer.update({
    where: { id: answer.id },
    data: { selectedOptionIndex: input.selectedOptionIndex, correct, answeredAt: new Date() },
  });
}

export async function completeCreditTestAttempt(attemptId: string, studentId: string) {
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.creditTestAttempt.findFirst({ where: { id: attemptId, studentId }, include: { answers: true } });
    if (!attempt) throw new CreditError("NOT_FOUND", "Попытка не найдена.");
    if (attempt.status === "COMPLETED") return attempt; // идемпотентно — повторный вызов не пересчитывает

    const unanswered = attempt.answers.filter((a) => a.selectedOptionIndex === null);
    if (unanswered.length > 0) {
      throw new CreditError("INCOMPLETE", `Отвечены не все задания (осталось ${unanswered.length}).`);
    }

    const correctCount = attempt.answers.filter((a) => a.correct).length;
    const updated = await tx.creditTestAttempt.update({
      where: { id: attempt.id },
      data: { status: "COMPLETED", completedAt: new Date(), correctCount, totalCount: attempt.answers.length },
    });
    await tx.creditAuditLog.create({
      data: {
        studentId,
        groupId: attempt.groupId,
        entityType: "TEST",
        entityId: attempt.id,
        actorId: studentId,
        action: "TEST_COMPLETED",
        toValue: `${correctCount}/${attempt.answers.length}`,
      },
    });
    return updated;
  });
}

// --- Устная часть: назначение темы, черновик оценки, подтверждение -------

export async function assignOralTopic(input: {
  studentId: string;
  groupId: string;
  courseId: string;
  academicYearId: string;
  teacherId: string;
  topicId: string;
  comment?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.oralAssessment.findUnique({
      where: { studentId_groupId: { studentId: input.studentId, groupId: input.groupId } },
    });
    if (existing?.status === "EXEMPTED") {
      throw new CreditError("EXEMPTED", "Студент освобождён от устной части по квалификационным баллам — назначение темы не требуется.");
    }
    if (existing?.status === "CONFIRMED") {
      throw new CreditError("ALREADY_CONFIRMED", "Оценка по устной части уже подтверждена.");
    }

    const record = existing
      ? await tx.oralAssessment.update({
          where: { id: existing.id },
          data: { topicId: input.topicId, assignedByTeacherId: input.teacherId, assignedAt: new Date(), assignedComment: input.comment?.trim() || null, status: existing.status === "GRADED_DRAFT" ? "GRADED_DRAFT" : "ASSIGNED" },
        })
      : await tx.oralAssessment.create({
          data: {
            studentId: input.studentId,
            groupId: input.groupId,
            courseId: input.courseId,
            academicYearId: input.academicYearId,
            status: "ASSIGNED",
            topicId: input.topicId,
            assignedByTeacherId: input.teacherId,
            assignedAt: new Date(),
            assignedComment: input.comment?.trim() || null,
          },
        });
    await tx.creditAuditLog.create({
      data: {
        studentId: input.studentId,
        groupId: input.groupId,
        entityType: "ORAL",
        entityId: record.id,
        actorId: input.teacherId,
        action: existing ? "TOPIC_REASSIGNED" : "TOPIC_ASSIGNED",
        toValue: input.topicId,
      },
    });
    return record;
  });
}

export async function saveOralCriteria(input: {
  studentId: string;
  groupId: string;
  teacherId: string;
  criteria: {
    taskCompletion?: string;
    errorCount?: string;
    errorNature?: string[];
    logic?: string;
    activeVocabulary?: string;
    questionResponses?: string;
  };
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.oralAssessment.findUnique({
      where: { studentId_groupId: { studentId: input.studentId, groupId: input.groupId } },
    });
    if (!existing) throw new CreditError("NOT_FOUND", "Тема устной части ещё не назначена.");
    if (existing.status === "EXEMPTED") throw new CreditError("EXEMPTED", "Студент освобождён от устной части.");
    if (existing.status === "CONFIRMED") throw new CreditError("ALREADY_CONFIRMED", "Оценка уже подтверждена.");

    const c = input.criteria;
    const updated = await tx.oralAssessment.update({
      where: { id: existing.id },
      data: {
        ...(c.taskCompletion !== undefined ? { criteriaTaskCompletion: c.taskCompletion } : {}),
        ...(c.errorCount !== undefined ? { criteriaErrorCount: c.errorCount } : {}),
        ...(c.errorNature !== undefined ? { criteriaErrorNatureJson: JSON.stringify(c.errorNature) } : {}),
        ...(c.logic !== undefined ? { criteriaLogic: c.logic } : {}),
        ...(c.activeVocabulary !== undefined ? { criteriaActiveVocabulary: c.activeVocabulary } : {}),
        ...(c.questionResponses !== undefined ? { criteriaQuestionResponses: c.questionResponses } : {}),
        status: "GRADED_DRAFT",
      },
    });
    await tx.creditAuditLog.create({
      data: { studentId: input.studentId, groupId: input.groupId, entityType: "ORAL", entityId: existing.id, actorId: input.teacherId, action: "CRITERIA_SAVED" },
    });
    return updated;
  });
}

export async function confirmOralGrade(input: { studentId: string; groupId: string; teacherId: string; finalGrade: string; comment?: string }) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.oralAssessment.findUnique({
      where: { studentId_groupId: { studentId: input.studentId, groupId: input.groupId } },
    });
    if (!existing) throw new CreditError("NOT_FOUND", "Устная часть ещё не назначена.");
    if (existing.status === "EXEMPTED") throw new CreditError("EXEMPTED", "Студент освобождён от устной части.");
    if (existing.status === "CONFIRMED") throw new CreditError("ALREADY_CONFIRMED", "Оценка уже подтверждена.");
    if (existing.status !== "GRADED_DRAFT") {
      throw new CreditError("CRITERIA_REQUIRED", "Сначала заполните критерии оценки, прежде чем подтверждать итоговую оценку.");
    }
    const updated = await tx.oralAssessment.update({
      where: { id: existing.id },
      data: {
        status: "CONFIRMED",
        finalGrade: input.finalGrade,
        teacherComment: input.comment?.trim() || null,
        gradedByTeacherId: input.teacherId,
        confirmedAt: new Date(),
      },
    });
    await tx.creditAuditLog.create({
      data: { studentId: input.studentId, groupId: input.groupId, entityType: "ORAL", entityId: existing.id, actorId: input.teacherId, action: "GRADE_CONFIRMED", toValue: input.finalGrade },
    });
    return updated;
  });
}

export type { Prisma };
