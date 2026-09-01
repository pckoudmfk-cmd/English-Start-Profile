import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../api/client";
import { Card, ErrorAlert, FieldLabel, PageTitle, PrimaryButton, SuccessAlert, TextInput } from "../../components/ui";

interface StudentProfile {
  fullName: string;
  email: string;
  specialty: string;
  course: string;
  academicYear: string;
}

const emptyProfile: StudentProfile = {
  fullName: "",
  email: "",
  specialty: "",
  course: "",
  academicYear: "",
};

export function StudentProfilePage() {
  const [form, setForm] = useState<StudentProfile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // Как и у преподавателя: id не передаётся, backend берёт владельца
    // профиля из проверенной сессии (см. backend/src/routes/student.ts).
    api
      .get<Partial<StudentProfile> | null>("/api/student/profile")
      .then((data) => {
        if (data) {
          setForm({
            fullName: data.fullName || "",
            email: data.email || "",
            specialty: data.specialty || "",
            course: data.course || "",
            academicYear: data.academicYear || "",
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
      await api.put("/api/student/profile", form);
      setMessage("Профиль сохранён.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить профиль.");
    } finally {
      setSaving(false);
    }
  }

  function set<K extends keyof StudentProfile>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div>
      <PageTitle subtitle="Эти данные видите только вы и ваш преподаватель после присоединения к группе.">
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

            <div>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <TextInput
                id="email"
                type="email"
                required
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <FieldLabel htmlFor="specialty">Специальность</FieldLabel>
                <TextInput
                  id="specialty"
                  value={form.specialty}
                  onChange={(e) => set("specialty", e.target.value)}
                />
              </div>
              <div>
                <FieldLabel htmlFor="course">Курс</FieldLabel>
                <TextInput id="course" value={form.course} onChange={(e) => set("course", e.target.value)} />
              </div>
              <div>
                <FieldLabel htmlFor="academicYear">Учебный год</FieldLabel>
                <TextInput
                  id="academicYear"
                  placeholder="2026/2027"
                  value={form.academicYear}
                  onChange={(e) => set("academicYear", e.target.value)}
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
