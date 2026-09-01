import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

// Как и остальные разделы Teacher Workspace — только TEACHER, и только
// свои записи (везде фильтр по teacherId: req.user.id).
router.use(requireAuth, requireRole("TEACHER"));

router.get("/", async (req, res) => {
  const years = await prisma.academicYear.findMany({
    where: { teacherId: req.user!.id },
    orderBy: { createdAt: "desc" },
  });
  return res.json(years);
});

const createSchema = z.object({
  name: z.string().trim().min(1, "Укажите название учебного года").max(100),
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
  }

  const existing = await prisma.academicYear.findUnique({
    where: { teacherId_name: { teacherId: req.user!.id, name: parsed.data.name } },
  });
  if (existing) {
    return res.status(409).json({ error: "DUPLICATE_NAME", message: "Учебный год с таким названием уже существует." });
  }

  const year = await prisma.academicYear.create({
    data: { teacherId: req.user!.id, name: parsed.data.name },
  });
  return res.status(201).json(year);
});

export default router;
