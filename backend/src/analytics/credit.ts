// English Start Profile — Этап 9: единая точка расчёта статусов модуля
// «Дифференцированный зачёт» (по аналогии с analytics/qualification.ts
// на Этапе 8 — "не дублировать расчёт в нескольких местах приложения").
// Используется и student-, и teacher-маршрутами — нигде в routes/*
// статус зачёта не пересчитывается заново.
//
// --- Как согласованы два разных списка статусов из ТЗ --------------------
//
// ТЗ содержит ДВЕ формулировки словаря статусов, которые на первый
// взгляд противоречат друг другу:
//   §3  (шапка страницы студента, "ровно один из"): Требования не
//       выполнены / В процессе / Допущен / Тест выполнен / Устная часть
//       обязательна / Устная часть выполнена / Освобождён от устной
//       части / Зачёт завершён — 8 значений.
//   §27-28 (расчёт "Итог", IF/ELSE-дерево): Не допущен / Допущен /
//       Тест выполнен / Устная часть обязательна / Устная часть
//       выполнена / Освобождён от устной части / Зачёт завершён — тоже
//       выглядит как список, но IF/ELSE-дерево п.28 реально порождает
//       только 4 разных терминальных значения (Не допущен / Допущен /
//       Устная часть обязательна / Зачёт завершён).
//
// Ключ к согласованию — сама таблица преподавателя (ТЗ п.30): у неё
// ОТДЕЛЬНЫЕ колонки Словарь | Тест | Квалификационные баллы | Устная
// часть | Итог. То есть "Тест выполнен"/"Устная часть выполнена"/
// "Освобождён от устной части" — это значения ПОДСТАТУСОВ (колонок
// "Тест" и "Устная часть"), а не альтернативные значения "Итога".
// "Итог" — ровно 4 значения дерева п.28, дословно.
//
// Студенческая шапка (§3) — более дружелюбная витрина этих же данных:
// её 8 значений получены как "Итог" + два уточнения (когда "Итог" =
// "Не допущен", различить "ничего не отправлено" и "отправлено, ждём
// решения"; когда "Итог" = "Устная часть обязательна", различить "тема
// ещё не назначена" и "тема назначена/оценка в черновике"). Это
// решение задокументировано и в docs/STAGE_9_REPORT.md — ТЗ не
// расписывает это буква в букву.
import { prisma } from "../db";
import { getStudentQualificationSummary } from "./qualification";
import { computePreliminaryGrade } from "./oralGrading";
import {
  DICTIONARY_STATUS_LABELS_RU,
  DICTIONARY_NOT_SUBMITTED_LABEL_RU,
  ORAL_EXEMPTION_REASON_RU,
  type DictionaryStatus,
} from "../credit/constants";

export type CreditTestStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
export type OralSubStatus = "NOT_ASSIGNED" | "ASSIGNED" | "GRADED_DRAFT" | "CONFIRMED" | "EXEMPTED";

// "Итог" (ТЗ п.27-28) — РОВНО 4 значения дерева, буквально.
export type CreditOverallStatus = "NOT_ADMITTED" | "ADMITTED" | "ORAL_REQUIRED" | "COMPLETED";
export const CREDIT_OVERALL_STATUS_LABELS_RU: Record<CreditOverallStatus, string> = {
  NOT_ADMITTED: "Не допущен",
  ADMITTED: "Допущен",
  ORAL_REQUIRED: "Устная часть обязательна",
  COMPLETED: "Зачёт завершён",
};

// Витрина для студенческой шапки "Мой зачёт" (ТЗ п.3) — 8 значений.
export type StudentTopStatus =
  | "REQUIREMENTS_NOT_MET"
  | "IN_PROGRESS"
  | "ADMITTED"
  | "TEST_COMPLETED"
  | "ORAL_REQUIRED"
  | "ORAL_DONE"
  | "COMPLETED";
export const STUDENT_TOP_STATUS_LABELS_RU: Record<StudentTopStatus, string> = {
  REQUIREMENTS_NOT_MET: "Требования не выполнены",
  IN_PROGRESS: "В процессе",
  ADMITTED: "Допущен",
  TEST_COMPLETED: "Тест выполнен",
  ORAL_REQUIRED: "Устная часть обязательна",
  ORAL_DONE: "Устная часть выполнена",
  COMPLETED: "Зачёт завершён",
};

export interface CreditStatusInputs {
  dictionaryEverSubmitted: boolean;
  dictionaryStatus: DictionaryStatus | null; // null = ничего не отправлено
  testStatus: CreditTestStatus;
  qualificationPoints: number;
  oralStatus: OralSubStatus;
}

// Единая функция расчёта "Итога" (ТЗ п.28) — используется ВЕЗДЕ, где
// нужен общий статус зачёта.
export function computeOverallCreditStatus(input: CreditStatusInputs): CreditOverallStatus {
  if (input.dictionaryStatus !== "CONFIRMED") return "NOT_ADMITTED";
  if (input.testStatus !== "COMPLETED") return "ADMITTED";
  if (input.qualificationPoints >= 5) return "COMPLETED";
  if (input.oralStatus === "CONFIRMED") return "COMPLETED";
  return "ORAL_REQUIRED";
}

export function computeStudentTopStatus(input: CreditStatusInputs): StudentTopStatus {
  const overall = computeOverallCreditStatus(input);
  if (overall === "NOT_ADMITTED") {
    return input.dictionaryEverSubmitted ? "IN_PROGRESS" : "REQUIREMENTS_NOT_MET";
  }
  if (overall === "COMPLETED") return "COMPLETED";
  if (overall === "ADMITTED") {
    return input.testStatus === "IN_PROGRESS" ? "ADMITTED" : "ADMITTED";
  }
  // overall === "ORAL_REQUIRED": уточняем по подстатусу устной части.
  if (input.oralStatus === "GRADED_DRAFT") return "ORAL_DONE";
  if (input.oralStatus === "ASSIGNED") return "ORAL_REQUIRED";
  return "TEST_COMPLETED"; // тема ещё не назначена
}

async function getDictionaryLatest(groupId: string, studentId: string) {
  return prisma.dictionarySubmission.findFirst({
    where: { groupId, studentId },
    orderBy: { createdAt: "desc" },
    include: { files: true },
  });
}

async function getCreditTestLatest(groupId: string, studentId: string) {
  return prisma.creditTestAttempt.findFirst({
    where: { groupId, studentId },
    orderBy: { attemptNumber: "desc" },
  });
}

function testStatusOf(attempt: { status: string } | null): CreditTestStatus {
  if (!attempt) return "NOT_STARTED";
  return attempt.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS";
}

function oralSubStatusOf(oral: { status: string } | null): OralSubStatus {
  if (!oral) return "NOT_ASSIGNED";
  return oral.status as OralSubStatus;
}

// Материализует запись OralAssessment(status=EXEMPTED) при первом
// достижении порога (ТЗ п.26 — "запись должна сохраниться для
// истории"), если у студента ещё вообще нет строки устной части.
// Идемпотентно (уникальный индекс studentId+groupId — защита от гонки
// на уровне БД). Если преподаватель уже вручную начал устную часть
// (ASSIGNED/GRADED_DRAFT/CONFIRMED) — не перезаписываем его решение
// автоматическим освобождением; это решение задокументировано в отчёте.
export async function ensureOralExemptionRecorded(params: {
  studentId: string;
  groupId: string;
  courseId: string;
  academicYearId: string;
}): Promise<void> {
  const existing = await prisma.oralAssessment.findUnique({
    where: { studentId_groupId: { studentId: params.studentId, groupId: params.groupId } },
  });
  if (existing) return;
  try {
    await prisma.oralAssessment.create({
      data: {
        studentId: params.studentId,
        groupId: params.groupId,
        courseId: params.courseId,
        academicYearId: params.academicYearId,
        status: "EXEMPTED",
        exemptionReason: ORAL_EXEMPTION_REASON_RU,
        exemptedAt: new Date(),
      },
    });
    await prisma.creditAuditLog.create({
      data: {
        studentId: params.studentId,
        groupId: params.groupId,
        entityType: "ORAL",
        actorId: "SYSTEM",
        action: "EXEMPTED",
        toValue: "EXEMPTED",
        reason: ORAL_EXEMPTION_REASON_RU,
      },
    });
  } catch (err: any) {
    if (err?.code === "P2002") return; // гонка — кто-то уже создал запись
    throw err;
  }
}

export interface StudentCreditSummary {
  dictionary: {
    status: DictionaryStatus | null;
    statusLabel: string;
    everSubmitted: boolean;
    latest: Awaited<ReturnType<typeof getDictionaryLatest>>;
  };
  test: {
    status: CreditTestStatus;
    latestAttempt: Awaited<ReturnType<typeof getCreditTestLatest>>;
    attemptsUsed: number;
    maxAttempts: number;
  };
  qualification: { points: number; oralPartExempt: boolean; pointsUntilExemption: number };
  oral: {
    status: OralSubStatus;
    assessment: Awaited<ReturnType<typeof getOralAssessmentRaw>>;
    preliminaryGrade: ReturnType<typeof computePreliminaryGrade>;
  };
  overallStatus: CreditOverallStatus;
  overallStatusLabel: string;
  topStatus: StudentTopStatus;
  topStatusLabel: string;
}

async function getOralAssessmentRaw(groupId: string, studentId: string) {
  return prisma.oralAssessment.findUnique({ where: { studentId_groupId: { studentId, groupId } } });
}

export async function getCreditSettings(courseId: string) {
  return prisma.creditSettings.findUnique({ where: { courseId } });
}

export async function getStudentCreditSummary(params: {
  studentId: string;
  groupId: string;
  courseId: string;
  academicYearId: string;
}): Promise<StudentCreditSummary> {
  const { studentId, groupId, courseId, academicYearId } = params;

  const [dictionaryLatest, testLatest, allAttemptsCount, qualification, oral, settings] = await Promise.all([
    getDictionaryLatest(groupId, studentId),
    getCreditTestLatest(groupId, studentId),
    prisma.creditTestAttempt.count({ where: { groupId, studentId } }),
    getStudentQualificationSummary(groupId, studentId),
    getOralAssessmentRaw(groupId, studentId),
    getCreditSettings(courseId),
  ]);

  // Освобождение материализуется здесь же (при чтении статуса), а не
  // только в отдельном фоновом задании — см. комментарий у функции.
  if (qualification.points >= 5 && !oral) {
    await ensureOralExemptionRecorded({ studentId, groupId, courseId, academicYearId });
  }
  const oralFresh = qualification.points >= 5 && !oral ? await getOralAssessmentRaw(groupId, studentId) : oral;

  const dictionaryStatus = (dictionaryLatest?.status as DictionaryStatus | undefined) ?? null;
  const testStatus = testStatusOf(testLatest);
  const oralStatus = oralSubStatusOf(oralFresh);

  const inputs: CreditStatusInputs = {
    dictionaryEverSubmitted: dictionaryLatest !== null,
    dictionaryStatus,
    testStatus,
    qualificationPoints: qualification.points,
    oralStatus,
  };
  const overallStatus = computeOverallCreditStatus(inputs);
  const topStatus = computeStudentTopStatus(inputs);

  return {
    dictionary: {
      status: dictionaryStatus,
      statusLabel: dictionaryStatus ? DICTIONARY_STATUS_LABELS_RU[dictionaryStatus] : DICTIONARY_NOT_SUBMITTED_LABEL_RU,
      everSubmitted: dictionaryLatest !== null,
      latest: dictionaryLatest,
    },
    test: {
      status: testStatus,
      latestAttempt: testLatest,
      attemptsUsed: allAttemptsCount,
      maxAttempts: settings?.maxTestAttempts ?? 1,
    },
    qualification: {
      points: qualification.points,
      oralPartExempt: qualification.oralPartStatus === "EXEMPTED",
      pointsUntilExemption: qualification.pointsUntilExemption,
    },
    oral: {
      status: oralStatus,
      assessment: oralFresh,
      preliminaryGrade: oralFresh
        ? computePreliminaryGrade({
            taskCompletion: (oralFresh.criteriaTaskCompletion as any) ?? null,
            errorCount: (oralFresh.criteriaErrorCount as any) ?? null,
            logic: (oralFresh.criteriaLogic as any) ?? null,
            activeVocabulary: (oralFresh.criteriaActiveVocabulary as any) ?? null,
            questionResponses: (oralFresh.criteriaQuestionResponses as any) ?? null,
          })
        : null,
    },
    overallStatus,
    overallStatusLabel: CREDIT_OVERALL_STATUS_LABELS_RU[overallStatus],
    topStatus,
    topStatusLabel: STUDENT_TOP_STATUS_LABELS_RU[topStatus],
  };
}

// --- Групповая сводка для Teacher Dashboard (ТЗ п.29-31) ------------------

export interface GroupCreditSummary {
  totalStudents: number;
  admissionConfirmed: number;
  dictionaryUnderReview: number;
  testCompleted: number;
  fivePlusPoints: number;
  oralExempted: number;
  oralPending: number;
  creditCompleted: number;
}

export async function getGroupCreditSummary(groupId: string, studentIds: string[]): Promise<{ summary: GroupCreditSummary; rows: Map<string, StudentCreditSummary> }> {
  const rows = new Map<string, StudentCreditSummary>();
  // Групповой размер обычно небольшой (учебная группа) — последовательный
  // расчёт по каждому студенту через уже проверенную единую функцию
  // (не дублируем логику отдельным batch-запросом, тот же принцип
  // "единая точка расчёта", что и выше).
  for (const studentId of studentIds) {
    const membershipCourse = await prisma.groupMembership
      .findFirst({ where: { groupId, studentId, status: "ACTIVE" }, include: { group: { include: { course: true } } } })
      .then((m) => m && { courseId: m.group.courseId, academicYearId: m.group.course.academicYearId });
    if (!membershipCourse) continue;
    const summary = await getStudentCreditSummary({ studentId, groupId, ...membershipCourse });
    rows.set(studentId, summary);
  }

  const summary: GroupCreditSummary = {
    totalStudents: rows.size,
    admissionConfirmed: 0,
    dictionaryUnderReview: 0,
    testCompleted: 0,
    fivePlusPoints: 0,
    oralExempted: 0,
    oralPending: 0,
    creditCompleted: 0,
  };
  for (const r of rows.values()) {
    if (r.dictionary.status === "CONFIRMED") summary.admissionConfirmed++;
    if (r.dictionary.status === "SUBMITTED" || r.dictionary.status === "UNDER_REVIEW") summary.dictionaryUnderReview++;
    if (r.test.status === "COMPLETED") summary.testCompleted++;
    if (r.qualification.points >= 5) summary.fivePlusPoints++;
    if (r.oral.status === "EXEMPTED") summary.oralExempted++;
    if (r.overallStatus === "ORAL_REQUIRED") summary.oralPending++;
    if (r.overallStatus === "COMPLETED") summary.creditCompleted++;
  }
  return { summary, rows };
}
