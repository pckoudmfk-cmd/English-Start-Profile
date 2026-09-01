// English Start Profile — Этап 8: единая точка расчёта квалификационных
// баллов и связанного с ними статуса устной части зачёта (ТЗ п.23:
// "Не дублировать расчёт в нескольких местах приложения. Создай единую
// функцию/сервис расчёта qualification_points.").
//
// Используется отовсюду, где нужны эти числа: Student Profile,
// Teacher Dashboard, будущий полноценный модуль "Зачёт". Источник
// истины — таблица QualificationPoint (по одной строке на
// подтверждённое результативное достижение, с уникальным
// achievementId — см. schema.prisma), а не поле Achievement.status.
import { prisma } from "../db";

// ТЗ п.23: qualification_points >= 5 → oral_part = exempted.
export const ORAL_PART_EXEMPTION_THRESHOLD = 5;

export type OralPartStatus = "EXEMPTED" | "REQUIRED";

export function computeOralPartStatus(qualificationPoints: number): OralPartStatus {
  return qualificationPoints >= ORAL_PART_EXEMPTION_THRESHOLD ? "EXEMPTED" : "REQUIRED";
}

export async function getStudentQualificationPoints(groupId: string, studentId: string): Promise<number> {
  return prisma.qualificationPoint.count({ where: { groupId, studentId } });
}

export interface StudentQualificationSummary {
  points: number;
  oralPartStatus: OralPartStatus;
  pointsUntilExemption: number; // 0, если уже освобождён
}

export async function getStudentQualificationSummary(groupId: string, studentId: string): Promise<StudentQualificationSummary> {
  const points = await getStudentQualificationPoints(groupId, studentId);
  const oralPartStatus = computeOralPartStatus(points);
  return {
    points,
    oralPartStatus,
    pointsUntilExemption: Math.max(0, ORAL_PART_EXEMPTION_THRESHOLD - points),
  };
}

// Батч-версия для целой группы — один запрос вместо N (та же логика
// "не грузить лишнее", что и в analytics/teacherAccess.ts).
export async function getGroupQualificationPointsByStudent(groupId: string, studentIds: string[]): Promise<Map<string, number>> {
  if (studentIds.length === 0) return new Map();
  const rows = await prisma.qualificationPoint.groupBy({
    by: ["studentId"],
    where: { groupId, studentId: { in: studentIds } },
    _count: { _all: true },
  });
  const map = new Map<string, number>();
  for (const id of studentIds) map.set(id, 0);
  for (const row of rows) map.set(row.studentId, row._count._all);
  return map;
}

export interface GroupAchievementsSummary {
  // Общее число подтверждённых результативных мероприятий в группе
  // (= число строк QualificationPoint для группы = totalPoints при
  // текущем правиле "1 мероприятие = максимум 1 балл", но считаются
  // независимо: правило может измениться в будущем, см. ТЗ п.37).
  resultfulAchievementsCount: number;
  totalQualificationPoints: number;
  studentsWithFivePlus: number;
  pendingReviewCount: number;
}

// Для Teacher Dashboard (ТЗ п.24).
export async function getGroupAchievementsSummary(groupId: string): Promise<GroupAchievementsSummary> {
  const [resultfulCount, pendingCount, pointsByStudent] = await Promise.all([
    prisma.qualificationPoint.count({ where: { groupId } }),
    prisma.achievement.count({ where: { groupId, status: "PENDING" } }),
    prisma.qualificationPoint.groupBy({ by: ["studentId"], where: { groupId }, _count: { _all: true } }),
  ]);
  const studentsWithFivePlus = pointsByStudent.filter((r) => r._count._all >= ORAL_PART_EXEMPTION_THRESHOLD).length;
  return {
    resultfulAchievementsCount: resultfulCount,
    totalQualificationPoints: resultfulCount, // 1 балл на результативное мероприятие — см. комментарий у поля выше
    studentsWithFivePlus,
    pendingReviewCount: pendingCount,
  };
}
