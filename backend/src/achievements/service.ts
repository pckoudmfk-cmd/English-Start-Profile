// English Start Profile — Этап 8: доменная логика достижений —
// обнаружение возможных дублей (ТЗ п.3) и применение решения
// преподавателя (ТЗ п.10, 12, 13, 30, 31), вынесены из маршрутов, чтобы
// сама логика подтверждения/начисления балла существовала в ОДНОМ
// месте, а не дублировалась между "быстрыми" действиями (Подтвердить/
// Отклонить/…) и "Изменить статус".
import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../db";
import { normalizeForDuplicateCheck, TEACHER_OVERRIDE_FROM_STATUSES, TEACHER_REVIEWABLE_STATUSES, type AchievementStatus } from "./constants";

// --- Обнаружение возможных дублей (ТЗ п.3) -------------------------------
//
// "Совокупность" полей, требуемая ТЗ: название + дата + организатор +
// тип + группа. Дата и группа — точное совпадение (это факты, не текст);
// название — нормализованное сравнение (регистр/пробелы не должны
// давать ложноотрицательный результат); организатор — используется как
// дополнительный, не обязательный признак: два законных отдельных
// мероприятия в один день с совпадающим названием ("Конференция
// молодых учёных") у одного студента маловероятны, а требовать точного
// совпадения организатора рискует пропустить дубль из-за опечатки —
// поэтому предупреждение показывается по совпадению названия+даты, а
// организатор виден преподавателю в самой карточке для финального решения.
export interface DuplicateCandidate {
  id: string;
  eventName: string;
  eventDate: Date;
  status: string;
}

export async function findPossibleDuplicates(
  groupId: string,
  studentId: string,
  eventName: string,
  eventDate: Date,
  excludeAchievementId?: string
): Promise<DuplicateCandidate[]> {
  const dayStart = new Date(eventDate);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const candidates = await prisma.achievement.findMany({
    where: {
      groupId,
      studentId,
      eventDate: { gte: dayStart, lt: dayEnd },
      status: { not: "REJECTED" }, // отклонённое не занимает место "уже добавленного" мероприятия
      ...(excludeAchievementId ? { id: { not: excludeAchievementId } } : {}),
    },
    select: { id: true, eventName: true, eventDate: true, status: true },
  });

  const normalizedTarget = normalizeForDuplicateCheck(eventName);
  return candidates.filter((c) => normalizeForDuplicateCheck(c.eventName) === normalizedTarget);
}

// --- Решение преподавателя ------------------------------------------------

export type DecisionAction = "CONFIRM" | "CONFIRM_NO_POINT" | "REQUEST_CLARIFICATION" | "REJECT" | "CHANGE_STATUS";

export class DecisionError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const DECISION_TARGET_STATUS: Record<Exclude<DecisionAction, "CHANGE_STATUS">, AchievementStatus> = {
  CONFIRM: "CONFIRMED",
  CONFIRM_NO_POINT: "CONFIRMED_NO_POINT",
  REQUEST_CLARIFICATION: "NEEDS_CLARIFICATION",
  REJECT: "REJECTED",
};

// Словарь AuditLog.action (ТЗ п.31: "подтверждение; начисление балла;
// отклонение; ...") — глагол в форме свершившегося факта, а не имя
// самого действия/кнопки (DecisionAction), чтобы запись в истории
// читалась как "что произошло", а не как "какая кнопка была нажата".
const DECISION_AUDIT_ACTION: Record<Exclude<DecisionAction, "CHANGE_STATUS">, string> = {
  CONFIRM: "CONFIRMED",
  CONFIRM_NO_POINT: "CONFIRMED_NO_POINT",
  REQUEST_CLARIFICATION: "CLARIFICATION_REQUESTED",
  REJECT: "REJECTED",
};

// Комментарий обязателен для решений, где ТЗ явно требует объяснение
// (п.11: "запрос уточнения; отклонение; подтверждение без балла") и для
// любого "Изменить статус" (п.30: "с обязательной фиксацией причины").
// Только прямое "Подтвердить — 1 балл" не требует комментария.
function commentRequired(action: DecisionAction): boolean {
  return action !== "CONFIRM";
}

export interface ApplyDecisionInput {
  achievementId: string;
  teacherId: string;
  groupId: string; // владение уже проверено маршрутом — передаётся, чтобы не делать это дважды внутри транзакции
  action: DecisionAction;
  targetStatus?: AchievementStatus; // только для CHANGE_STATUS
  comment?: string;
}

export async function applyTeacherDecision(input: ApplyDecisionInput) {
  const { achievementId, teacherId, groupId, action, comment } = input;

  if (commentRequired(action) && !comment?.trim()) {
    throw new DecisionError("COMMENT_REQUIRED", "Для этого решения нужно указать комментарий.");
  }

  return prisma.$transaction(async (tx) => {
    const achievement = await tx.achievement.findFirst({ where: { id: achievementId, groupId } });
    if (!achievement) {
      throw new DecisionError("NOT_FOUND", "Достижение не найдено.");
    }

    let newStatus: AchievementStatus;
    let auditAction: string;

    if (action === "CHANGE_STATUS") {
      if (!TEACHER_OVERRIDE_FROM_STATUSES.includes(achievement.status as AchievementStatus)) {
        throw new DecisionError("INVALID_STATUS", "«Изменить статус» доступно только для уже проверенного достижения.");
      }
      if (!input.targetStatus || !TEACHER_OVERRIDE_FROM_STATUSES.concat("NEEDS_CLARIFICATION").includes(input.targetStatus)) {
        throw new DecisionError("INVALID_TARGET_STATUS", "Недопустимый новый статус.");
      }
      newStatus = input.targetStatus;
      auditAction = "STATUS_REVERTED";
    } else {
      if (!TEACHER_REVIEWABLE_STATUSES.includes(achievement.status as AchievementStatus)) {
        throw new DecisionError("INVALID_STATUS", "Достижение уже проверено или ещё не отправлено студентом.");
      }
      newStatus = DECISION_TARGET_STATUS[action];
      auditAction = DECISION_AUDIT_ACTION[action];
    }

    const hadPoint = achievement.status === "CONFIRMED";
    const willHavePoint = newStatus === "CONFIRMED";

    // ТЗ п.2 ("одно мероприятие → максимум 1 балл") и явный acceptance-
    // сценарий 6/38.5: даже если преподаватель подтверждает С БАЛЛОМ
    // запись, которая, судя по совпадению названия+даты+группы+студента,
    // относится к УЖЕ подтверждённому с баллом мероприятию — второй балл
    // не должен начислиться. Предупреждение при создании (ТЗ п.3) не
    // блокирует, но здесь, в момент реального начисления, это
    // критическая защита: решение блокируется явной ошибкой (не тихим
    // понижением до "без балла" — преподаватель должен осознанно
    // разобраться с дублем: отклонить его, подтвердить без балла, или
    // сначала отозвать балл у первой записи через "Изменить статус",
    // если ошиблись именно в ней).
    if (willHavePoint && !hadPoint) {
      const normalizedTarget = normalizeForDuplicateCheck(achievement.eventName);
      const dayStart = new Date(achievement.eventDate);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
      const siblingsWithPoint = await tx.achievement.findMany({
        where: {
          groupId,
          studentId: achievement.studentId,
          id: { not: achievement.id },
          qualificationPoint: 1,
          eventDate: { gte: dayStart, lt: dayEnd },
        },
        select: { id: true, eventName: true },
      });
      const duplicateWithPoint = siblingsWithPoint.find((s) => normalizeForDuplicateCheck(s.eventName) === normalizedTarget);
      if (duplicateWithPoint) {
        throw new DecisionError(
          "DUPLICATE_POINT_BLOCKED",
          `За это мероприятие уже начислен балл по другой записи («${duplicateWithPoint.eventName}», id ${duplicateWithPoint.id}). Одно мероприятие даёт максимум 1 балл — используйте «Подтвердить без балла» или «Отклонить», либо сначала отзовите балл у другой записи через «Изменить статус», если ошибка в ней.`
        );
      }
    }

    await tx.achievement.update({
      where: { id: achievement.id },
      data: {
        status: newStatus,
        teacherId,
        teacherComment: comment?.trim() || (action === "CONFIRM" ? achievement.teacherComment : null),
        verifiedAt: new Date(),
        qualificationPoint: willHavePoint ? 1 : 0,
      },
    });

    await tx.achievementAuditLog.create({
      data: {
        achievementId: achievement.id,
        actorId: teacherId,
        action: auditAction,
        fromValue: achievement.status,
        toValue: newStatus,
        reason: comment?.trim() || null,
      },
    });

    // Начисление/отзыв балла — строго в этой же транзакции, что и смена
    // статуса (ТЗ п.12, 13): нельзя оказаться в состоянии "статус
    // CONFIRMED, но балла нет" или наоборот.
    if (willHavePoint && !hadPoint) {
      await createQualificationPointSafely(tx, achievement.id, achievement.studentId, groupId, teacherId);
      await tx.achievementAuditLog.create({
        data: { achievementId: achievement.id, actorId: teacherId, action: "POINT_AWARDED", toValue: "1" },
      });
    } else if (!willHavePoint && hadPoint) {
      await tx.qualificationPoint.deleteMany({ where: { achievementId: achievement.id } });
      await tx.achievementAuditLog.create({
        data: { achievementId: achievement.id, actorId: teacherId, action: "POINT_REVOKED", fromValue: "1", toValue: "0" },
      });
    }

    return tx.achievement.findUniqueOrThrow({ where: { id: achievement.id } });
  });
}

// Защита от повторного начисления НА УРОВНЕ БД (ТЗ п.13): уникальный
// индекс на QualificationPoint.achievementId делает вторую вставку для
// того же достижения физически невозможной — даже если бы вызывающий
// код ошибочно попытался её создать (например, гонка двух одновременных
// запросов "Подтвердить"), P2002 здесь просто означает "балл уже есть",
// а не сбой.
async function createQualificationPointSafely(
  tx: Prisma.TransactionClient,
  achievementId: string,
  studentId: string,
  groupId: string,
  teacherId: string
) {
  try {
    await tx.qualificationPoint.create({ data: { achievementId, studentId, groupId, teacherId, value: 1 } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return; // уже начислено — не ошибка
    }
    throw err;
  }
}

export type { PrismaClient };
