/**
 * Этап 13 — сбрасывает состояние, которое накапливает `pilot:
 * scenarios` (достижения/баллы/допуск/тест зачёта Student A и B,
 * назначение Progress Check Student C), НЕ трогая сами тестовые
 * аккаунты, группу и пройденные Start Profile/Start Diagnostic (их
 * создаёт `pilot:setup`, они не сбрасываются здесь).
 *
 * Нужен потому, что `pilot:scenarios` — в отличие от `pilot:setup` —
 * НЕ рассчитан на бесконечный повторный запуск на тех же данных:
 * зачётный тест и Progress Check одноразовые (по бизнес-правилам, не
 * по ошибке), а мероприятия каждый прогон создавались бы заново.
 * Запустите этот скрипт перед повторным `npm run pilot:scenarios`,
 * если нужно снова продемонстрировать сценарий с чистого листа.
 *
 * Запуск: npm run pilot:reset-scenarios (backend должен быть запущен
 * — использует Prisma напрямую, не HTTP).
 */
import { PrismaClient } from "@prisma/client";
import { PILOT } from "./setup-pilot-test-kit";

const prisma = new PrismaClient();

async function main() {
  const [studentA, studentB, studentC, group] = await Promise.all([
    prisma.user.findUnique({ where: { email: PILOT.studentA.email } }),
    prisma.user.findUnique({ where: { email: PILOT.studentB.email } }),
    prisma.user.findUnique({ where: { email: PILOT.studentC.email } }),
    prisma.group.findFirst({ where: { name: PILOT.groupName } }),
  ]);
  if (!studentA || !studentB || !studentC || !group) {
    throw new Error("Пилотные фикстуры не найдены — сначала запустите `npm run pilot:setup`.");
  }

  for (const studentId of [studentA.id, studentB.id]) {
    const achievements = await prisma.achievement.findMany({ where: { studentId, groupId: group.id } });
    for (const a of achievements) {
      await prisma.achievementAuditLog.deleteMany({ where: { achievementId: a.id } });
      await prisma.qualificationPoint.deleteMany({ where: { achievementId: a.id } });
      await prisma.achievementEvidence.deleteMany({ where: { achievementId: a.id } });
    }
    await prisma.achievement.deleteMany({ where: { studentId, groupId: group.id } });

    const subs = await prisma.dictionarySubmission.findMany({ where: { studentId, groupId: group.id } });
    for (const s of subs) await prisma.dictionarySubmissionFile.deleteMany({ where: { submissionId: s.id } });
    await prisma.dictionarySubmission.deleteMany({ where: { studentId, groupId: group.id } });

    const attempts = await prisma.creditTestAttempt.findMany({ where: { studentId, groupId: group.id } });
    for (const at of attempts) await prisma.creditTestAnswer.deleteMany({ where: { attemptId: at.id } });
    await prisma.creditTestAttempt.deleteMany({ where: { studentId, groupId: group.id } });

    await prisma.oralAssessment.deleteMany({ where: { studentId, groupId: group.id } });
    await prisma.creditAuditLog.deleteMany({ where: { studentId, groupId: group.id } });
  }

  const progressDiagnostic = await prisma.diagnosticAttempt.findFirst({ where: { studentId: studentC.id, groupId: group.id, kind: "PROGRESS" } });
  if (progressDiagnostic) {
    await prisma.diagnosticAnswer.deleteMany({ where: { attemptId: progressDiagnostic.id } });
    await prisma.diagnosticResult.deleteMany({ where: { attemptId: progressDiagnostic.id } });
    await prisma.diagnosticAttempt.delete({ where: { id: progressDiagnostic.id } });
  }
  const progressQuestionnaire = await prisma.questionnaireAttempt.findFirst({ where: { studentId: studentC.id, groupId: group.id, kind: "PROGRESS" } });
  if (progressQuestionnaire) {
    await prisma.questionnaireAnswer.deleteMany({ where: { attemptId: progressQuestionnaire.id } });
    await prisma.questionnaireAttempt.delete({ where: { id: progressQuestionnaire.id } });
  }

  console.log("Состояние сценариев (достижения/зачёт Student A и B, Progress Check Student C) сброшено.");
  console.log("Аккаунты, группа и Start Profile/Start Diagnostic не тронуты — можно снова запускать `npm run pilot:scenarios`.");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("Сброс состояния пилотных сценариев завершился с ошибкой:", err);
  await prisma.$disconnect();
  process.exitCode = 1;
});
