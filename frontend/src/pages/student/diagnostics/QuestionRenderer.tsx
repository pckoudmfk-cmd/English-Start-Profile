import type { QuestionDef } from "../../../questionnaire/definition";
import { FieldLabel, TextInput } from "../../../components/ui";

interface Props {
  question: QuestionDef;
  value: unknown;
  onChange: (value: unknown) => void;
}

const SCALE_VALUES = [1, 2, 3, 4, 5];

export function QuestionRenderer({ question, value, onChange }: Props) {
  return (
    <div data-question-code={question.code}>
      <FieldLabel htmlFor={question.code} className="text-base font-semibold text-slate-800">
        {question.label}
        {!question.required && <span className="ml-2 text-xs font-normal text-slate-400">необязательно</span>}
      </FieldLabel>
      {question.helperText && <p className="mb-3 text-xs text-slate-500">{question.helperText}</p>}

      {question.type === "TEXT" && (
        <TextInput
          id={question.code}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {question.type === "TEXTAREA" && (
        <textarea
          id={question.code}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
      )}

      {question.type === "SINGLE_CHOICE" && (
        <div className="space-y-2">
          {question.options!.map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition ${
                value === opt.value
                  ? "border-brand-500 bg-brand-50 text-brand-800"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name={question.code}
                checked={value === opt.value}
                onChange={() => onChange(opt.value)}
                className="h-4 w-4 shrink-0 accent-brand-600"
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}

      {question.type === "MULTI_CHOICE" && (
        <MultiChoiceInput question={question} value={(value as string[]) ?? []} onChange={onChange} />
      )}

      {question.type === "SCALE_1_5" && (
        <ScaleInput value={value as number | undefined} onChange={onChange} />
      )}

      {question.type === "MATRIX_SCALE_1_5" && (
        <MatrixInput question={question} value={(value as Record<string, number>) ?? {}} onChange={onChange} />
      )}
    </div>
  );
}

function MultiChoiceInput({
  question,
  value,
  onChange,
}: {
  question: QuestionDef;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const max = question.maxSelections;
  function toggle(optValue: string) {
    const isSelected = value.includes(optValue);
    if (isSelected) {
      onChange(value.filter((v) => v !== optValue));
      return;
    }
    if (max && value.length >= max) return; // лимит достигнут, молча игнорируем клик
    onChange([...value, optValue]);
  }

  return (
    <div className="space-y-2">
      {question.options!.map((opt) => {
        const checked = value.includes(opt.value);
        const disabled = !checked && !!max && value.length >= max;
        return (
          <label
            key={opt.value}
            className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm transition ${
              checked
                ? "border-brand-500 bg-brand-50 text-brand-800"
                : disabled
                  ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400"
                  : "cursor-pointer border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => toggle(opt.value)}
              className="h-4 w-4 shrink-0 accent-brand-600"
            />
            {opt.label}
          </label>
        );
      })}
    </div>
  );
}

function ScaleInput({ value, onChange }: { value: number | undefined; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-2">
      {SCALE_VALUES.map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`h-12 w-12 rounded-lg border text-base font-semibold transition ${
            value === n
              ? "border-brand-500 bg-brand-600 text-white"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function MatrixInput({
  question,
  value,
  onChange,
}: {
  question: QuestionDef;
  value: Record<string, number>;
  onChange: (v: Record<string, number>) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-separate border-spacing-y-2 text-sm">
        <tbody>
          {question.matrixItems!.map((item) => (
            <tr key={item.value}>
              <td className="pr-3 text-slate-700">{item.label}</td>
              {SCALE_VALUES.map((n) => (
                <td key={n} className="px-0.5 text-center">
                  <button
                    type="button"
                    onClick={() => onChange({ ...value, [item.value]: n })}
                    className={`h-10 w-10 rounded-lg border text-sm font-semibold transition ${
                      value[item.value] === n
                        ? "border-brand-500 bg-brand-600 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {n}
                  </button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
