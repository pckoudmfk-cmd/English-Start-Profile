import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

// Общая оболочка с боковой навигацией для преподавателя и студента.
// Названия ролей и пунктов меню — на русском (см. ТЗ, п.6-7).
//
// Мобильная адаптация: полная боковая панель (w-64) показывается
// только от breakpoint md и выше. На узких экранах вместо неё —
// компактная верхняя панель с кнопкой-«гамбургером», открывающей то же
// меню как выезжающую панель поверх контента. Один и тот же список
// пунктов меню используется в обоих случаях — не два разных набора,
// которые могут разойтись.
export function AppShell({ navItems, roleLabel }: { navItems: NavItem[]; roleLabel: string }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Закрывать мобильное меню при переходе на другую страницу.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  const navList = (onNavigate?: () => void) => (
    <nav className="flex-1 space-y-1 px-3 py-4">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `block rounded-lg px-3 py-2 text-sm font-medium transition ${
              isActive
                ? "bg-brand-50 text-brand-700"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 md:flex-row">
      {/* Верхняя панель — только на узких экранах */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <div>
          <div className="text-base font-semibold text-brand-700">English Start Profile</div>
          <div className="text-xs uppercase tracking-wide text-slate-400">{roleLabel}</div>
        </div>
        <button
          type="button"
          aria-label="Открыть меню"
          onClick={() => setMobileNavOpen((v) => !v)}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600"
        >
          <span className="text-xl leading-none">{mobileNavOpen ? "✕" : "☰"}</span>
        </button>
      </div>

      {/* Выезжающее мобильное меню */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileNavOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            {navList(() => setMobileNavOpen(false))}
            <div className="border-t border-slate-100 px-5 py-4">
              <div className="mb-2 truncate text-xs text-slate-500">{user?.email}</div>
              <button
                onClick={handleLogout}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Выйти
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Полная боковая панель — от md и выше */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="border-b border-slate-100 px-5 py-5">
          <div className="text-lg font-semibold text-brand-700">English Start Profile</div>
          <div className="mt-0.5 text-xs uppercase tracking-wide text-slate-400">{roleLabel}</div>
        </div>
        {navList()}
        <div className="border-t border-slate-100 px-5 py-4">
          <div className="mb-2 truncate text-xs text-slate-500">{user?.email}</div>
          <button
            onClick={handleLogout}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Выйти
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
