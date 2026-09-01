import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../api/client";
import { Card, ErrorAlert, FieldLabel, PageTitle, PrimaryButton, SuccessAlert, TextInput } from "../../components/ui";

interface TeacherProfile {
  fullName: string;
  organization: string;
  department: string;
  position: string;
  workEmail: string;
}

const emptyProfile: TeacherProfile = {
  fullName: "",
  organization: "",
  department: "",
  position: "",
  workEmail: "",
};

export function TeacherProfilePage() {
  const [form, setForm] = useState<TeacherProfile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // Запрашивает /api/teacher/profile без какого-либо идентификатора —
    // backend сам определяет "чей" это профиль по сессии (см.
    // backend/src/routes/teacher.ts). Другой профиль получить нельзя.
    api
      .get<Partial<TeacherProfile> | null>("/api/teacher/profile")
      .then((data) => {
        if (data) {
          setForm({
            fullName: data.fullName || "",
            organization: data.organization || "",
            department: data.department || "",
            position: data.position || "",
            workEmail: data.workEmail || "",
          });
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Не удалось загрузить профиль."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSaving(true);
    try {
      await api.put("/api/teacher/profile", form);
      setMessage("Профиль сохранён.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить профиль.");
    } finally {
      setSaving(false);
    }
  }

  function set<K extends keyof TeacherProfile>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div>
      <PageTitle subtitle="Эти данные видите только вы. Преподаватели не видят профили друг друга.">
        Мой профиль
      </PageTitle>
      <Card className="max-w-2xl">
        {loading ? (
          <p className="text-sm text-slate-500">Загрузка…</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <ErrorAlert>{error}</ErrorAlert>
            <SuccessAlert>{message}</SuccessAlert>

            <div>
              <FieldLabel htmlFor="fullName">ФИО</FieldLabel>
              <TextInput
                id="fullName"
                required
                value={form.fullName}
                onChange={(e) => set("fullName", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="organization">Организация</FieldLabel>
                <TextInput
                  id="organization"
                  value={form.organization}
                  onChange={(e) => set("organization", e.target.value)}
                />
              </div>
              <div>
                <FieldLabel htmlFor="department">Кафедра / отделение</FieldLabel>
                <TextInput
                  id="department"
                  value={form.department}
                  onChange={(e) => set("department", e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="position">Должность</FieldLabel>
                <TextInput
                  id="position"
                  value={form.position}
                  onChange={(e) => set("position", e.target.value)}
                />
              </div>
              <div>
                <FieldLabel htmlFor="workEmail">Рабочий email</FieldLabel>
                <TextInput
                  id="workEmail"
                  type="email"
                  value={form.workEmail}
                  onChange={(e) => set("workEmail", e.target.value)}
                />
              </div>
            </div>

            <PrimaryButton type="submit" disabled={saving}>
              {saving ? "Сохраняем…" : "Сохранить"}
            </PrimaryButton>
          </form>
        )}
      </Card>
    </div>
  );
}
