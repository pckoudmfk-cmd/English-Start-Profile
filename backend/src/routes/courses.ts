import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth, requireRole("TEACHER"));

router.get("/", async (req, res) => {
  const { academicYearId } = req.query;
  const courses = await prisma.course.findMany({
    where: {
      teacherId: req.user!.id,
      ...(typeof academicYearId === "string" ? { academicYearId } : {}),
    },
    include: { academicYear: true },
    orderBy: { createdAt: "desc" },
  });
  return res.json(courses);
});

const createSchema = z.object({
  name: z.string().trim().min(1, "Укажите название курса/дисциплины").max(150),
  academicYearId: z.string().trim().min(1, "Укажите учебный год"),
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
  }
  const { name, academicYearId } = parsed.data;

  // Проверяем владение годом ДО создания курса. 404 (а не 403) — чтобы
  // не подтверждать чужому преподавателю сам факт существования этого
  // academicYearId.
  const year = await prisma.academicYear.findFirst({
    where: { id: academicYearId, teacherId: req.user!.id },
  });
  if (!year) {
    return res.status(404).json({ error: "ACADEMIC_YEAR_NOT_FOUND", message: "Учебный год не найден." });
  }

  const course = await prisma.course.create({
    data: { teacherId: req.user!.id, academicYearId, name },
    include: { academicYear: true },
  });
  return res.status(201).json(course);
});

export default router;
