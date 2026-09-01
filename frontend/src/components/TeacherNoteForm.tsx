import { useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import { teacherDashboardApi } from "../api/teacherDashboard";
import { ErrorAlert, PrimaryButton } from "./ui";

// Общая форма добавления заметки преподавателя — используется и с
// панели Dashboard ("Добавить заметку" прямо в строке таблицы, без
// перехода в профиль — ТЗ Этапа 6, п.15), и на странице профиля
// студента. Один компонент, а не два похожих, чтобы поведение не
// разошлось.
export function TeacherNoteForm({
  groupId,
  studentId,
  onAdded,
}: {
  groupId: string;
  studentId: string;
  onAdded: (note: { id: string; text: string; createdAt: string }) => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const note = await teacherDashboardApi.addNote(groupId, studentId, text.trim());
      onAdded(note);
      setText("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось сохранить заметку.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Например: стоит предложить дополнительную практику говорения."
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
      <ErrorAlert>{error}</ErrorAlert>
      <PrimaryButton type="submit" disabled={saving || !text.trim()}>
        {saving ? "Сохраняем…" : "Сохранить заметку"}
      </PrimaryButton>
    </form>
  );
}
