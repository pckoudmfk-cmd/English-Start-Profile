import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import authRouter from "./routes/auth";
import teacherRouter from "./routes/teacher";
import studentRouter from "./routes/student";
import academicYearsRouter from "./routes/academicYears";
import coursesRouter from "./routes/courses";
import groupsRouter from "./routes/groups";
import teacherDashboardRouter from "./routes/teacherDashboard";
import teacherStudentProfileRouter from "./routes/teacherStudentProfile";
import teacherAchievementsRouter from "./routes/teacherAchievements";
import studentGroupsRouter from "./routes/studentGroups";
import studentQuestionnaireRouter from "./routes/studentQuestionnaire";
import studentDiagnosticRouter from "./routes/studentDiagnostic";
import studentAchievementsRouter from "./routes/studentAchievements";
import studentCreditRouter from "./routes/studentCredit";
import teacherCreditRouter from "./routes/teacherCredit";

const app = express();

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5173";

app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
// Более специфичные подпути /api/teacher/* регистрируются ДО общего
// teacherRouter (у которого есть "перехватывающий" router.use(requireAuth,
// requireRole(...)) на "/profile"), чтобы запросы к ним не проходили через
// проверки teacherRouter вхолостую и обрабатывались напрямую своим роутером.
app.use("/api/teacher/academic-years", academicYearsRouter);
app.use("/api/teacher/courses", coursesRouter);
app.use("/api/teacher/groups", groupsRouter);
// Этап 6/7: Dashboard группы и профиль студента (Обзор/Анкета/
// Диагностика/Цели/Заметки) — два отдельных роутера на том же префиксе
// /api/teacher/groups, что и groupsRouter выше. Пути не пересекаются
// друг с другом ("/:id/dashboard" vs "/:id/students/..."), поэтому
// порядок между этими тремя роутерами друг для друга не важен; важно
// лишь то, что все они смонтированы ДО общего teacherRouter.
app.use("/api/teacher/groups", teacherDashboardRouter);
app.use("/api/teacher/groups", teacherStudentProfileRouter);
// Этап 8: «Проверка достижений» — отдельный, НЕ вложенный в /groups
// префикс (список фильтруется по группе как один из фильтров, а не
// принадлежит одной группе URL-ом, см. ТЗ п.27).
app.use("/api/teacher/achievements", teacherAchievementsRouter);
// Этап 9: «Зачёт» — тоже отдельный, не вложенный в /groups префикс (у
// части маршрутов групповой контекст, у части — курс/банк заданий,
// общего с groupsRouter/teacherDashboardRouter пересечения путей нет).
app.use("/api/teacher/credit", teacherCreditRouter);
app.use("/api/teacher", teacherRouter);
// Аналогично /api/teacher/* выше: /api/student/groups регистрируется до
// общего studentRouter (у которого есть перехватывающий router.use на
// "/profile"), чтобы не проходить через его middleware вхолостую.
app.use("/api/student/groups", studentGroupsRouter);
app.use("/api/student/questionnaire", studentQuestionnaireRouter);
app.use("/api/student/diagnostic", studentDiagnosticRouter);
app.use("/api/student/achievements", studentAchievementsRouter);
app.use("/api/student/credit", studentCreditRouter);
app.use("/api/student", studentRouter);

// Единый обработчик 404 для несуществующих API-маршрутов.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "NOT_FOUND" });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: "INTERNAL_ERROR", message: "Внутренняя ошибка сервера." });
});

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`English Start Profile API listening on http://localhost:${PORT}`);
});
