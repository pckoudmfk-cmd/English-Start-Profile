import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../../api/client";
import { workspaceApi, type AcademicYear } from "../../api/workspace";
import { Card, EmptyState, ErrorAlert, FieldLabel, PageTitle, PrimaryButton, TextInput } from "../../components/ui";

export function AcademicYearsPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function load() {
    setLoading(true);
    workspaceApi
      .listAcademicYears()
      .then(setYears)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить учебные годы."))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      await workspaceApi.createAcademicYear(name);
      setName("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось создать учебный год.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <PageTitle subtitle="Учебный год — верхний уровень для курсов и групп.">Учебные годы</PageTitle>

      <Card className="mb-6 max-w-lg">
        <form onSubmit={handleCreate} className="flex items-end gap-3">
          <div className="flex-1">
            <FieldLabel htmlFor="yearName">Новый учебный год</FieldLabel>
            <TextInput
              id="yearName"
              placeholder="2026–2027"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <PrimaryButton type="submit" disabled={creating}>
            {creating ? "Создаём…" : "Создать"}
          </PrimaryButton>
        </form>
        <ErrorAlert>{error}</ErrorAlert>
      </Card>

      <Card>
        {loading ? (
          <p className="text-sm text-slate-500">Загрузка…</p>
        ) : years.length === 0 ? (
          <EmptyState
            title="Учебных годов пока нет"
            hint="Создайте первый учебный год, чтобы затем добавить курс и группу."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {years.map((y) => (
              <li key={y.id} className="flex items-center justify-between py-3">
                <span className="text-sm font-medium text-slate-800">{y.name}</span>
                <span className="text-xs text-slate-400">
                  создан {new Date(y.createdAt).toLocaleDateString("ru-RU")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
