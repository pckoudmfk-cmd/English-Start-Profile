import { useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import { teacherStudentProfileApi, type NoteEntry, type NoteType } from "../api/teacherStudentProfile";
import { ErrorAlert, PrimaryButton, Select } from "./ui";

// Общая форма добавления заметки преподавателя — используется и с
// панели Dashboard ("Добавить заметку" прямо в строке таблицы, без
// перехода в профиль — ТЗ Этапа 6, п.15), и на странице профиля
// студента (вкладка «Заметки», Этап 7). Один компонент, а не два
// похожих, чтобы поведение не разошлось.
const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  OBSERVATION: "Наблюдение",
  RECOMMENDATION: "Рекомендация",
  AGREEMENT: "Договорённость",
  IMPORTANT: "Важная информация",
  EVENT_PREP: "Подготовка к мероприятию",
};
export const NOTE_TYPES = Object.keys(NOTE_TYPE_LABELS) as NoteType[];
export function noteTypeLabel(type: NoteType | null): string {
  return type ? NOTE_TYPE_LABELS[type] : "Без типа";
}

export function TeacherNoteForm({
  groupId,
  studentId,
  onAdded,
}: {
  groupId: string;
  studentId: string;
  onAdded: (note: NoteEntry) => void;
}) {
  const [text, setText] = useState("");
  const [noteType, setNoteType] = useState<NoteType | "">("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const note = await teacherStudentProfileApi.addNote(groupId, studentId, text.trim(), noteType || undefined);
      onAdded(note);
      setText("");
      setNoteType("");
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
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-500">Тип заметки (необязательно)</label>
        <Select value={noteType} onChange={(e) => setNoteType(e.target.value as NoteType | "")}>
          <option value="">Без типа</option>
          {NOTE_TYPES.map((t) => (
            <option key={t} value={t}>
              {NOTE_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
      </div>
      <ErrorAlert>{error}</ErrorAlert>
      <PrimaryButton type="submit" disabled={saving || !text.trim()}>
        {saving ? "Сохраняем…" : "Сохранить заметку"}
      </PrimaryButton>
    </form>
  );
}
