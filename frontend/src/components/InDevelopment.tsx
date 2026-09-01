import { PageTitle, Card } from "./ui";

// Заглушка для разделов, ещё не реализованных на текущем этапе.
// Осознанно не содержит никаких фиктивных данных, графиков или таблиц —
// только честный статус, чтобы не создавать у преподавателя/студента
// ложное впечатление о готовности функциональности.
export function InDevelopment({ title }: { title: string }) {
  return (
    <div>
      <PageTitle>{title}</PageTitle>
      <Card className="flex flex-col items-center gap-2 py-16 text-center">
        <div className="text-4xl">🛠️</div>
        <p className="text-base font-medium text-slate-700">Раздел находится в разработке</p>
        <p className="max-w-md text-sm text-slate-500">
          Этот раздел появится на одном из следующих этапов разработки English Start Profile.
        </p>
      </Card>
    </div>
  );
}
