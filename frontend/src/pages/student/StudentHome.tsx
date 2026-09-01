import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Card, PageTitle } from "../../components/ui";

// Главная страница студента. Так же, как и у преподавателя — без
// фиктивных результатов диагностики, целей или достижений: их ещё нет.
export function StudentHome() {
  const { user } = useAuth();

  return (
    <div>
      <PageTitle subtitle={user?.email}>Главная</PageTitle>
      <Card>
        <p className="text-sm text-slate-600">
          Добро пожаловать в English Start Profile. Сейчас доступны вход и заполнение профиля.
          Присоединение к группе, анкетирование и диагностика появятся на следующих этапах.
        </p>
        <Link
          to="/student/profile"
          className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline"
        >
          Заполнить «Мой профиль» →
        </Link>
      </Card>
    </div>
  );
}
