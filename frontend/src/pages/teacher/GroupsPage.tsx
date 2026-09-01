import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../api/client";
import { workspaceApi, type Course, type Group } from "../../api/workspace";
import {
  Badge,
  Card,
  EmptyState,
  ErrorAlert,
  FieldLabel,
  PageTitle,
  PrimaryButton,
  Select,
  SecondaryButton,
  TextInput,
} from "../../components/ui";

export function GroupsPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [courseId, setCourseId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([workspaceApi.listCourses(), workspaceApi.listGroups()])
      .then(([c, g]) => {
        setCourses(c);
        setGroups(g);
        setCourseId((prev) => prev || c[0]?.id || "");
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить группы."))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      await workspaceApi.createGroup({ name, courseId, specialty: specialty || undefined });
      setName("");
      setSpecialty("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось создать группу.");
    } finally {
      setCreating(false);
    }
  }

  const visibleGroups = groups.filter((g) => (showArchived ? g.status === "ARCHIVED" : g.status === "ACTIVE"));

  return (
    <div>
      <PageTitle subtitle="Группа принадлежит курсу. У каждой активной группы есть код подключения.">Группы</PageTitle>

      <Card className="mb-6 max-w-2xl">
        {!loading && courses.length === 0 ? (
          <EmptyState
            title="Сначала создайте курс"
            hint={
              <>
                Группа должна относиться к курсу.{" "}
                <Link to="/teacher/courses" className="text-brand-600 hover:underline">
                  Перейти к курсам
                </Link>
                .
              </>
            }
          />
        ) : (
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <FieldLabel htmlFor="groupName">Название группы</FieldLabel>
                <TextInput
                  id="groupName"
                  placeholder="1ФИН-24"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel htmlFor="groupSpecialty">Специальность</FieldLabel>
                <TextInput
                  id="groupSpecialty"
                  placeholder="Финансы"
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel htmlFor="groupCourse">Курс</FieldLabel>
                <Select id="groupCourse" required value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.academicYear.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <PrimaryButton type="submit" disabled={creating}>
              {creating ? "Создаём…" : "Создать группу"}
            </PrimaryButton>
          </form>
        )}
        <ErrorAlert>{error}</ErrorAlert>
      </Card>

      <div className="mb-3 flex items-center gap-2">
        <SecondaryButton
          type="button"
          onClick={() => setShowArchived(false)}
          className={!showArchived ? "border-brand-500 text-brand-700" : ""}
        >
          Активные
        </SecondaryButton>
        <SecondaryButton
          type="button"
          onClick={() => setShowArchived(true)}
          className={showArchived ? "border-brand-500 text-brand-700" : ""}
        >
          Архивные
        </SecondaryButton>
      </div>

      <Card>
        {loading ? (
          <p className="text-sm text-slate-500">Загрузка…</p>
        ) : visibleGroups.length === 0 ? (
          <EmptyState title={showArchived ? "Архивных групп нет" : "Активных групп пока нет"} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {visibleGroups.map((g) => (
              <li key={g.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Link to={`/teacher/groups/${g.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                      {g.name}
                    </Link>
                    {g.status === "ARCHIVED" && <Badge>Архив</Badge>}
                  </div>
                  <div className="text-xs text-slate-400">
                    {g.course?.name} · {g.course?.academicYear.name}
                    {g.specialty ? ` · ${g.specialty}` : ""}
                  </div>
                </div>
                <div className="text-right">
                  {g.joinCode ? (
                    <Badge tone="brand">{g.joinCode.code}</Badge>
                  ) : (
                    <Badge>Код деактивирован</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
