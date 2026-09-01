// English Start Profile — Этап 10: ПРОМЕЖУТОЧНАЯ ДИАГНОСТИКА — доменная
// логика назначения (ТЗ: "запустить может только преподаватель").
//
// Одно действие преподавателя — назначение диагностики выбранным
// студентам на выбранный период — создаёт СРАЗУ ДВЕ попытки на
// студента: DiagnosticAttempt(kind="PROGRESS") и
// QuestionnaireAttempt(kind="PROGRESS"), обе status="ASSIGNED", обе
// привязаны к одному и тому же периоду. Это решение (см. отчёт по
// этапу): ТЗ описывает "Промежуточную диагностику" как ОДИН workflow
// назначения, а раздел "Результат" явно требует показывать изменение
// самооценки/мотивации/самостоятельности/целей — эти показатели
// вычисляются из данных анкеты (analytics/scoring.ts), а не
// диагностического теста, поэтому без повторного анкетирования их
// показать нечестно (пришлось бы выдумывать данные). Анкета и тест
// остаются двумя отдельными сущностями/маршрутами (тот же принцип "не
// смешивать модули", что и у Start), просто назначаются одним
// действием и одним периодом.
import { prisma } from "../db";

export interface AssignProgressCheckInput {
  teacherId: string;
  groupId: string;
  courseId: string;
  academicYearId: string;
  studentIds: string[];
  periodStartAt: Date;
  periodEndAt: Date | null;
}

export type AssignOutcome = "ASSIGNED" | "ALREADY_ASSIGNED";

export async function assignProgressCheck(input: AssignProgressCheckInput): Promise<{ studentId: string; outcome: AssignOutcome }[]> {
  const results: { studentId: string; outcome: AssignOutcome }[] = [];
  for (const studentId of input.studentIds) {
    const assignedAt = new Date();
    const shared = {
      studentId,
      groupId: input.groupId,
      courseId: input.courseId,
      academicYearId: input.academicYearId,
      kind: "PROGRESS",
      status: "ASSIGNED",
      assignedByTeacherId: input.teacherId,
      assignedAt,
      periodStartAt: input.periodStartAt,
      periodEndAt: input.periodEndAt,
    };
    try {
      // Обе попытки — в одной транзакции: назначение либо целиком
      // состоялось (и тест, и анкета), либо не состоялось вовсе —
      // никогда не бывает "анкета назначена, а тест — нет".
      await prisma.$transaction([prisma.diagnosticAttempt.create({ data: shared }), prisma.questionnaireAttempt.create({ data: shared })]);
      results.push({ studentId, outcome: "ASSIGNED" });
    } catch (err: any) {
      // Уникальный индекс (studentId, groupId, kind) — студенту уже
      // назначена Промежуточная диагностика в этой группе (повторное
      // назначение не переиспользуется, тот же принцип "исторические
      // данные не переписывать"; изменить период уже назначенной
      // попытки эта версия не поддерживает — см. отчёт по этапу).
      if (err?.code === "P2002") {
        results.push({ studentId, outcome: "ALREADY_ASSIGNED" });
        continue;
      }
      throw err;
    }
  }
  return results;
}
