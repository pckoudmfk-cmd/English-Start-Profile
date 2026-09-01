// English Start Profile — Этап 8: «Мои достижения» (роль студента).
//
// Студент может создавать/редактировать/удалять достижение ТОЛЬКО пока
// оно ещё "его": статусы DRAFT и NEEDS_CLARIFICATION (ТЗ п.4, 30).
// После отправки на проверку (PENDING) и тем более после решения
// преподавателя — редактирование и удаление запрещены на уровне
// backend, а не только скрытием кнопки в интерфейсе.
import { Router } from "express";
import fs from "fs";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  CLAIMED_RESULTS,
  EVENT_TYPES,
  STUDENT_DELETABLE_STATUSES,
  STUDENT_EDITABLE_STATUSES,
  type AchievementStatus,
} from "../achievements/constants";
import { findPossibleDuplicates } from "../achievements/service";
import { achievementEvidenceUpload, deleteEvidenceFile, evidenceFilePath } from "../uploads/achievementStorage";

const router = Router();

router.use(requireAuth, requireRole("STUDENT"));

function serializeAchievement(a: any) {
  return {
    id: a.id,
    groupId: a.groupId,
    eventName: a.eventName,
    eventDate: a.eventDate,
    organizer: a.organizer,
    eventType: a.eventType,
    claimedResult: a.claimedResult,
    claimedResultOther: a.claimedResultOther,
    resultPlace: a.resultPlace,
    resultNomination: a.resultNomination,
    description: a.description,
    status: a.status,
    qualificationPoint: a.qualificationPoint,
    teacherComment: a.teacherComment,
    createdAt: a.createdAt,
    submittedAt: a.submittedAt,
    verifiedAt: a.verifiedAt,
    evidence: (a.evidence ?? []).map((e: any) => ({ id: e.id, fileName: e.fileName, mimeType: e.mimeType, size: e.size, uploadedAt: e.uploadedAt })),
  };
}

async function findOwnedAchievement(studentId: string, achievementId: string) {
  return prisma.achievement.findFirst({ where: { id: achievementId, studentId }, include: { evidence: true } });
}

router.get("/", async (req, res) => {
  const { groupId } = req.query;
  const achievements = await prisma.achievement.findMany({
    where: { studentId: req.user!.id, ...(typeof groupId === "string" ? { groupId } : {}) },
    include: { evidence: true },
    orderBy: { createdAt: "desc" },
  });
  return res.json(achievements.map(serializeAchievement));
});

router.get("/:id", async (req, res) => {
  const achievement = await findOwnedAchievement(req.user!.id, req.params.id);
  if (!achievement) {
    return res.status(404).json({ error: "ACHIEVEMENT_NOT_FOUND", message: "Достижение не найдено." });
  }
  return res.json(serializeAchievement(achievement));
});

const upsertSchema = z.object({
  groupId: z.string().trim().min(1),
  eventName: z.string().trim().min(1, "Укажите название мероприятия").max(300),
  eventDate: z.coerce.date({ errorMap: () => ({ message: "Укажите дату мероприятия" }) }),
  organizer: z.string().trim().min(1, "Укажите организатора").max(200),
  eventType: z.enum(EVENT_TYPES),
  claimedResult: z.enum(CLAIMED_RESULTS),
  claimedResultOther: z.string().trim().max(300).optional().nullable(),
  resultPlace: z.string().trim().max(100).optional().nullable(),
  resultNomination: z.string().trim().max(200).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
});

router.post("/", async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
  }
  const data = parsed.data;
  if (data.claimedResult === "OTHER" && !data.claimedResultOther?.trim()) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "Укажите результат для варианта «Другое»." });
  }

  const membership = await prisma.groupMembership.findFirst({
    where: { studentId: req.user!.id, groupId: data.groupId, status: "ACTIVE" },
    include: { group: { include: { course: true } } },
  });
  if (!membership) {
    return res.status(404).json({ error: "MEMBERSHIP_NOT_FOUND", message: "Вы не состоите в этой группе." });
  }

  const achievement = await prisma.achievement.create({
    data: {
      studentId: req.user!.id,
      groupId: data.groupId,
      courseId: membership.group.courseId,
      academicYearId: membership.group.course.academicYearId,
      eventName: data.eventName,
      eventDate: data.eventDate,
      organizer: data.organizer,
      eventType: data.eventType,
      claimedResult: data.claimedResult,
      claimedResultOther: data.claimedResult === "OTHER" ? data.claimedResultOther?.trim() : null,
      resultPlace: data.resultPlace?.trim() || null,
      resultNomination: data.resultNomination?.trim() || null,
      description: data.description?.trim() || null,
      status: "DRAFT",
    },
    include: { evidence: true },
  });
  await prisma.achievementAuditLog.create({
    data: { achievementId: achievement.id, actorId: req.user!.id, action: "CREATED", toValue: "DRAFT" },
  });

  const duplicates = await findPossibleDuplicates(data.groupId, req.user!.id, data.eventName, data.eventDate, achievement.id);
  return res.status(201).json({ ...serializeAchievement(achievement), possibleDuplicates: duplicates });
});

router.put("/:id", async (req, res) => {
  const achievement = await findOwnedAchievement(req.user!.id, req.params.id);
  if (!achievement) {
    return res.status(404).json({ error: "ACHIEVEMENT_NOT_FOUND", message: "Достижение не найдено." });
  }
  if (!STUDENT_EDITABLE_STATUSES.includes(achievement.status as AchievementStatus)) {
    return res.status(409).json({ error: "NOT_EDITABLE", message: "Это достижение уже отправлено или проверено — изменить его нельзя." });
  }

  const parsed = upsertSchema.omit({ groupId: true }).partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
  }
  const data = parsed.data;
  if ((data.claimedResult ?? achievement.claimedResult) === "OTHER" && !(data.claimedResultOther ?? achievement.claimedResultOther)?.trim()) {
    return res.status(400).json({ error: "VALIDATION_ERROR", message: "Укажите результат для варианта «Другое»." });
  }

  const wasNeedsClarification = achievement.status === "NEEDS_CLARIFICATION";
  const updated = await prisma.achievement.update({
    where: { id: achievement.id },
    data: {
      ...(data.eventName !== undefined ? { eventName: data.eventName } : {}),
      ...(data.eventDate !== undefined ? { eventDate: data.eventDate } : {}),
      ...(data.organizer !== undefined ? { organizer: data.organizer } : {}),
      ...(data.eventType !== undefined ? { eventType: data.eventType } : {}),
      ...(data.claimedResult !== undefined ? { claimedResult: data.claimedResult } : {}),
      claimedResultOther: (data.claimedResult ?? achievement.claimedResult) === "OTHER" ? (data.claimedResultOther ?? achievement.claimedResultOther)?.trim() : null,
      ...(data.resultPlace !== undefined ? { resultPlace: data.resultPlace?.trim() || null } : {}),
      ...(data.resultNomination !== undefined ? { resultNomination: data.resultNomination?.trim() || null } : {}),
      ...(data.description !== undefined ? { description: data.description?.trim() || null } : {}),
      // Правка после запроса уточнения — не решение преподавателя,
      // студент дополнил данные и заново ждёт проверки; предыдущий
      // комментарий преподавателя остаётся видимым в истории (audit
      // log), но со статуса снимается, только когда достижение реально
      // переотправляется через /submit — здесь просто фиксируем правку.
    },
    include: { evidence: true },
  });
  await prisma.achievementAuditLog.create({
    data: { achievementId: achievement.id, actorId: req.user!.id, action: "EDITED", fromValue: achievement.status, toValue: achievement.status },
  });
  void wasNeedsClarification;

  return res.json(serializeAchievement(updated));
});

router.post("/:id/submit", async (req, res) => {
  const achievement = await findOwnedAchievement(req.user!.id, req.params.id);
  if (!achievement) {
    return res.status(404).json({ error: "ACHIEVEMENT_NOT_FOUND", message: "Достижение не найдено." });
  }
  if (!STUDENT_EDITABLE_STATUSES.includes(achievement.status as AchievementStatus)) {
    return res.status(409).json({ error: "ALREADY_SUBMITTED", message: "Достижение уже отправлено на проверку." });
  }

  const now = new Date();
  const updated = await prisma.achievement.update({
    where: { id: achievement.id },
    data: { status: "PENDING", submittedAt: achievement.submittedAt ?? now, teacherComment: null },
    include: { evidence: true },
  });
  await prisma.achievementAuditLog.create({
    data: { achievementId: achievement.id, actorId: req.user!.id, action: "SUBMITTED", fromValue: achievement.status, toValue: "PENDING" },
  });

  const duplicates = await findPossibleDuplicates(achievement.groupId, req.user!.id, achievement.eventName, achievement.eventDate, achievement.id);
  return res.json({ ...serializeAchievement(updated), possibleDuplicates: duplicates });
});

router.delete("/:id", async (req, res) => {
  const achievement = await findOwnedAchievement(req.user!.id, req.params.id);
  if (!achievement) {
    return res.status(404).json({ error: "ACHIEVEMENT_NOT_FOUND", message: "Достижение не найдено." });
  }
  if (!STUDENT_DELETABLE_STATUSES.includes(achievement.status as AchievementStatus)) {
    return res.status(409).json({ error: "NOT_DELETABLE", message: "Удалить можно только черновик." });
  }
  for (const e of achievement.evidence) deleteEvidenceFile(achievement.id, e.storedName);
  await prisma.achievement.delete({ where: { id: achievement.id } });
  return res.status(204).send();
});

// --- Подтверждающие документы --------------------------------------------

router.post("/:id/evidence", (req, res, next) => {
  achievementEvidenceUpload(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        error: err.message === "UNSUPPORTED_FILE_TYPE" ? "UNSUPPORTED_FILE_TYPE" : "UPLOAD_ERROR",
        message: err.message === "UNSUPPORTED_FILE_TYPE" ? "Поддерживаются только PDF и изображения (JPEG/PNG/WebP)." : "Не удалось загрузить файл.",
      });
    }
    next();
  });
}, async (req, res) => {
  const achievement = await findOwnedAchievement(req.user!.id, req.params.id);
  if (!achievement) {
    if (req.file) fs.rm(req.file.path, { force: true }, () => {});
    return res.status(404).json({ error: "ACHIEVEMENT_NOT_FOUND", message: "Достижение не найдено." });
  }
  if (!STUDENT_EDITABLE_STATUSES.includes(achievement.status as AchievementStatus)) {
    if (req.file) fs.rm(req.file.path, { force: true }, () => {});
    return res.status(409).json({ error: "NOT_EDITABLE", message: "Загружать документы можно только к черновику или достижению, требующему уточнения." });
  }
  if (!req.file) {
    return res.status(400).json({ error: "NO_FILE", message: "Файл не получен." });
  }

  const evidence = await prisma.achievementEvidence.create({
    data: {
      achievementId: achievement.id,
      fileName: req.file.originalname,
      storedName: req.file.filename,
      mimeType: req.file.mimetype,
      size: req.file.size,
    },
  });
  await prisma.achievementAuditLog.create({
    data: { achievementId: achievement.id, actorId: req.user!.id, action: "EVIDENCE_ADDED", toValue: req.file.originalname },
  });
  return res.status(201).json({ id: evidence.id, fileName: evidence.fileName, mimeType: evidence.mimeType, size: evidence.size, uploadedAt: evidence.uploadedAt });
});

router.get("/:id/evidence/:evidenceId", async (req, res) => {
  const achievement = await findOwnedAchievement(req.user!.id, req.params.id);
  if (!achievement) {
    return res.status(404).json({ error: "ACHIEVEMENT_NOT_FOUND" });
  }
  const evidence = achievement.evidence.find((e) => e.id === req.params.evidenceId);
  if (!evidence) {
    return res.status(404).json({ error: "EVIDENCE_NOT_FOUND" });
  }
  return res.sendFile(evidenceFilePath(achievement.id, evidence.storedName), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "FILE_NOT_FOUND" });
  });
});

router.delete("/:id/evidence/:evidenceId", async (req, res) => {
  const achievement = await findOwnedAchievement(req.user!.id, req.params.id);
  if (!achievement) {
    return res.status(404).json({ error: "ACHIEVEMENT_NOT_FOUND" });
  }
  if (!STUDENT_EDITABLE_STATUSES.includes(achievement.status as AchievementStatus)) {
    return res.status(409).json({ error: "NOT_EDITABLE", message: "Удалять документы можно только у черновика или достижения, требующего уточнения." });
  }
  const evidence = achievement.evidence.find((e) => e.id === req.params.evidenceId);
  if (!evidence) {
    return res.status(404).json({ error: "EVIDENCE_NOT_FOUND" });
  }
  await prisma.achievementEvidence.delete({ where: { id: evidence.id } });
  deleteEvidenceFile(achievement.id, evidence.storedName);
  await prisma.achievementAuditLog.create({
    data: { achievementId: achievement.id, actorId: req.user!.id, action: "EVIDENCE_REMOVED", fromValue: evidence.fileName },
  });
  return res.status(204).send();
});

export default router;
