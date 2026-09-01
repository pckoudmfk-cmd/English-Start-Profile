import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Card, PageTitle } from "../../components/ui";

// Главная страница преподавателя. На этом этапе намеренно не содержит
// никакой аналитики, списков групп/студентов или показателей — эти
// данные ещё не существуют в системе, а показывать нули/заглушки вместо
// реальных цифр запрещено требованиями этапа ("не создавай фиктивную
// аналитику или тестовые результаты").
export function TeacherHome() {
  const { user } = useAuth();

  return (
    <div>
      <PageTitle subtitle={user?.email}>Главная</PageTitle>
      <Card>
        <p className="text-sm text-slate-600">
          Добро пожаловать в English Start Profile. Сейчас реализованы вход, роли и профиль
          преподавателя. Работа с группами, студентами, диагностикой и зачётом появится на
          следующих этапах.
        </p>
        <Link
          to="/teacher/profile"
          className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline"
        >
          Заполнить «Мой профиль» →
        </Link>
      </Card>
    </div>
  );
}
