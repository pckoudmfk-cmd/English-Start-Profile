import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../api/client";
import { workspaceApi, type AcademicYear, type Course } from "../../api/workspace";
import {
  Card,
  EmptyState,
  ErrorAlert,
  FieldLabel,
  PageTitle,
  PrimaryButton,
  Select,
  TextInput,
} from "../../components/ui";

export function CoursesPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [academicYearId, setAcademicYearId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([workspaceApi.listAcademicYears(), workspaceApi.listCourses()])
      .then(([y, c]) => {
        setYears(y);
        setCourses(c);
        setAcademicYearId((prev) => prev || y[0]?.id || "");
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить курсы."))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      await workspaceApi.createCourse({ name, academicYearId });
      setName("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось создать курс.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <PageTitle subtitle="Курс/дисциплина принадлежит учебному году и объединяет группы.">Курсы</PageTitle>

      <Card className="mb-6 max-w-xl">
        {!loading && years.length === 0 ? (
          <EmptyState
            title="Сначала создайте учебный год"
            hint={
              <>
                Курс должен относиться к учебному году.{" "}
                <Link to="/teacher/academic-years" className="text-brand-600 hover:underline">
                  Перейти к учебным годам
                </Link>
                .
              </>
            }
          />
        ) : (
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="courseName">Название курса/дисциплины</FieldLabel>
                <TextInput
                  id="courseName"
                  placeholder="Английский язык"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel htmlFor="courseYear">Учебный год</FieldLabel>
                <Select
                  id="courseYear"
                  required
                  value={academicYearId}
                  onChange={(e) => setAcademicYearId(e.target.value)}
                >
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <PrimaryButton type="submit" disabled={creating}>
              {creating ? "Создаём…" : "Создать курс"}
            </PrimaryButton>
          </form>
        )}
        <ErrorAlert>{error}</ErrorAlert>
      </Card>

      <Card>
        {loading ? (
          <p className="text-sm text-slate-500">Загрузка…</p>
        ) : courses.length === 0 ? (
          <EmptyState title="Курсов пока нет" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {courses.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-sm font-medium text-slate-800">{c.name}</div>
                  <div className="text-xs text-slate-400">{c.academicYear.name}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
