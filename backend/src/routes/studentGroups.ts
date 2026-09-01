import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { normalizeJoinCode } from "../utils/joinCode";

const router = Router();

// Присоединение к группе — тоже действие студента: аутентификация +
// роль STUDENT обязательны для всех маршрутов ниже.
router.use(requireAuth, requireRole("STUDENT"));

const codeSchema = z.object({
  code: z.string().trim().min(1, "Введите код группы"),
});

type ResolvedCode =
  | { status: "NOT_FOUND" }
  | { status: "DISABLED" }
  | { status: "EXPIRED" }
  | { status: "OK"; group: any };

// Единая точка проверки кода для /preview и /join — чтобы оба маршрута
// одинаково отличали "код не найден" от "код отключён" от "код
// просрочен", а не дублировали эту логику по-разному.
async function resolveJoinCode(rawCode: string): Promise<ResolvedCode> {
  const code = normalizeJoinCode(rawCode);
  const joinCode = await prisma.groupJoinCode.findUnique({
    where: { code },
    include: {
      group: {
        include: {
          course: { include: { academicYear: true } },
          teacher: { include: { teacherProfile: true } },
        },
      },
    },
  });

  if (!joinCode) return { status: "NOT_FOUND" };
  if (!joinCode.active) return { status: "DISABLED" };
  if (joinCode.expiresAt && joinCode.expiresAt.getTime() < Date.now()) return { status: "EXPIRED" };
  // Защита в глубину: даже если бы у архивной группы остался активный
  // код (не должно происходить — см. routes/groups.ts archive), по нему
  // всё равно нельзя присоединиться.
  if (joinCode.group.status !== "ACTIVE") return { status: "DISABLED" };

  return { status: "OK", group: joinCode.group };
}

function codeErrorResponse(status: "NOT_FOUND" | "DISABLED" | "EXPIRED") {
  if (status === "NOT_FOUND") {
    return { httpStatus: 404, body: { error: "CODE_NOT_FOUND", message: "Код не найден. Проверьте правильность ввода." } };
  }
  if (status === "EXPIRED") {
    return { httpStatus: 410, body: { error: "CODE_EXPIRED", message: "Срок действия этого кода истёк. Обратитесь к преподавателю за новым кодом." } };
  }
  return { httpStatus: 410, body: { error: "CODE_DISABLED", message: "Этот код подключения отключён преподавателем." } };
}

function teacherDisplayName(teacher: { email: string; teacherProfile: { fullName: string | null } | null }) {
  return teacher.teacherProfile?.fullName || teacher.email;
}

function serializeGroupPreview(group: any) {
  return {
    id: group.id,
    name: group.name,
    specialty: group.specialty,
    course: group.course.name,
    academicYear: group.course.academicYear.name,
    teacherName: teacherDisplayName(group.teacher),
  };
}

router.post("/preview", async (req, res) => {
  const parsed = codeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
  }

  const resolved = await resolveJoinCode(parsed.data.code);
  if (resolved.status !== "OK") {
    const { httpStatus, body } = codeErrorResponse(resolved.status);
    return res.status(httpStatus).json(body);
  }

  const membership = await prisma.groupMembership.findUnique({
    where: { studentId_groupId: { studentId: req.user!.id, groupId: resolved.group.id } },
  });

  return res.json({
    group: serializeGroupPreview(resolved.group),
    alreadyMember: !!membership && membership.status === "ACTIVE",
  });
});

router.post("/join", async (req, res) => {
  const parsed = codeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
  }
  const normalizedCode = normalizeJoinCode(parsed.data.code);

  const resolved = await resolveJoinCode(normalizedCode);
  if (resolved.status !== "OK") {
    const { httpStatus, body } = codeErrorResponse(resolved.status);
    return res.status(httpStatus).json(body);
  }
  const { group } = resolved;

  const existing = await prisma.groupMembership.findUnique({
    where: { studentId_groupId: { studentId: req.user!.id, groupId: group.id } },
  });

  // Повторное присоединение — не ошибка и не повод создавать вторую
  // запись: возвращаем ту же (идемпотентно), с пометкой alreadyMember,
  // чтобы фронтенд показал "Вы уже состоите в этой группе.".
  if (existing && existing.status === "ACTIVE") {
    return res.status(200).json({
      alreadyMember: true,
      group: serializeGroupPreview(group),
      message: "Вы уже состоите в этой группе.",
    });
  }

  const membership = existing
    ? await prisma.groupMembership.update({
        where: { id: existing.id },
        data: { status: "ACTIVE", joinedAt: new Date(), removedAt: null, joinedViaCode: normalizedCode },
      })
    : await prisma.groupMembership.create({
        data: { studentId: req.user!.id, groupId: group.id, joinedViaCode: normalizedCode },
      });

  return res.status(201).json({
    alreadyMember: false,
    group: serializeGroupPreview(group),
    membership: { id: membership.id, joinedAt: membership.joinedAt },
  });
});

router.get("/", async (req, res) => {
  const memberships = await prisma.groupMembership.findMany({
    where: { studentId: req.user!.id, status: "ACTIVE" },
    include: {
      group: {
        include: {
          course: { include: { academicYear: true } },
          teacher: { include: { teacherProfile: true } },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  return res.json(
    memberships.map((m) => ({
      id: m.id,
      joinedAt: m.joinedAt,
      group: serializeGroupPreview(m.group),
      // Диагностика ещё не реализована (следующие этапы) — статус пока
      // всегда "не пройдена" для любого членства, честно и без
      // фиктивных чисел: это буквально так для каждого студента на
      // текущей стадии продукта.
      startDiagnosticStatus: "NOT_STARTED" as const,
    }))
  );
});

export default router;
