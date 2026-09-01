// Общие для Dashboard (Этап 6) и профиля студента (Этап 7) хелперы:
// проверка владения группой, ростер группы, сбор StudentMetrics по
// ростеру. Вынесены из routes/teacherDashboard.ts, когда тот же код
// понадобился ещё и в routes/teacherStudentProfile.ts — единственное
// место, где эта логика теперь живёт, вместо двух почти одинаковых
// копий в разных файлах маршрутов.
import { prisma } from "../db";
import {
  DASHBOARD_QUESTION_CODES,
  computeAutonomy,
  computeMotivation,
  computeSelfAssessment,
  round1,
  type SkillBreakdownEntry,
} from "./scoring";
import type { AttemptStatus, StudentMetrics } from "./insights";

// Та же проверка владения, что и в groups.ts (findOwnedGroup) — 404 на
// чужую/несуществующую группу, а не 403, чтобы нельзя было по коду
// ответа отличить "не ваша группа" от "такой группы вообще нет".
export async function findOwnedGroupHeader(teacherId: string, groupId: string) {
  return prisma.group.findFirst({
    where: { id: groupId, teacherId },
    include: { course: { include: { academicYear: true } } },
  });
}

export function studentDisplayName(student: { email: string; studentProfile: { fullName: string | null } | null }) {
  return student.studentProfile?.fullName || student.email;
}

export interface RosterEntry {
  studentId: string;
  fullName: string;
}

export async function loadRoster(groupId: string): Promise<RosterEntry[]> {
  const memberships = await prisma.groupMembership.findMany({
    where: { groupId, status: "ACTIVE" },
    include: { student: { include: { studentProfile: true } } },
    orderBy: { joinedAt: "asc" },
  });
  return memberships.map((m) => ({ studentId: m.studentId, fullName: studentDisplayName(m.student) }));
}

// Строит StudentMetrics для каждого студента переданного ростера —
// один запрос на модель на весь переданный набор id, не N+1. Дашборд
// вызывает это на весь ростер группы; профиль студента вызывает это же
// с ростером из одного человека — та же функция, тот же результат,
// без дублирования расчёта.
export async function buildMetricsForRoster(groupId: string, roster: RosterEntry[]): Promise<StudentMetrics[]> {
  const studentIds = roster.map((r) => r.studentId);
  if (studentIds.length === 0) return [];

  const [questionnaireAttempts, diagnosticAttempts] = await Promise.all([
    prisma.questionnaireAttempt.findMany({
      where: { groupId, kind: "START", studentId: { in: studentIds } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.diagnosticAttempt.findMany({
      where: { groupId, kind: "START", studentId: { in: studentIds } },
      include: { result: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const questionnaireByStudent = new Map<string, (typeof questionnaireAttempts)[number]>();
  for (const a of questionnaireAttempts) {
    if (!questionnaireByStudent.has(a.studentId)) questionnaireByStudent.set(a.studentId, a);
  }
  const diagnosticByStudent = new Map<string, (typeof diagnosticAttempts)[number]>();
  for (const a of diagnosticAttempts) {
    if (!diagnosticByStudent.has(a.studentId)) diagnosticByStudent.set(a.studentId, a);
  }

  const completedAttemptIds = [...questionnaireByStudent.values()]
    .filter((a) => a.status === "COMPLETED")
    .map((a) => a.id);
  const rawAnswers = completedAttemptIds.length
    ? await prisma.questionnaireAnswer.findMany({
        where: { attemptId: { in: completedAttemptIds }, questionCode: { in: DASHBOARD_QUESTION_CODES } },
      })
    : [];
  const answersByAttempt = new Map<string, Record<string, unknown>>();
  for (const a of rawAnswers) {
    if (!answersByAttempt.has(a.attemptId)) answersByAttempt.set(a.attemptId, {});
    answersByAttempt.get(a.attemptId)![a.questionCode] = JSON.parse(a.valueJson);
  }

  return roster.map(({ studentId, fullName }) => {
    const qAttempt = questionnaireByStudent.get(studentId);
    const dAttempt = diagnosticByStudent.get(studentId);
    const answers = qAttempt && qAttempt.status === "COMPLETED" ? answersByAttempt.get(qAttempt.id) ?? {} : {};
    const skillBreakdown: SkillBreakdownEntry[] | null =
      dAttempt?.status === "COMPLETED" && dAttempt.result ? JSON.parse(dAttempt.result.skillBreakdownJson) : null;

    return {
      studentId,
      fullName,
      questionnaireStatus: (qAttempt?.status ?? "NOT_STARTED") as AttemptStatus,
      diagnosticStatus: (dAttempt?.status ?? "NOT_STARTED") as AttemptStatus,
      diagnosticPercentage: dAttempt?.status === "COMPLETED" && dAttempt.result ? Math.round(dAttempt.result.overallPercentage) : null,
      skillBreakdown,
      selfAssessment: computeSelfAssessment(answers),
      motivation: computeMotivation(answers),
      autonomy: computeAutonomy(answers),
      answers,
    };
  });
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return round1(values.reduce((a, b) => a + b, 0) / values.length);
}
