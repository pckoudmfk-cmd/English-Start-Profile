import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

// Общая оболочка с боковой навигацией для преподавателя и студента.
// Названия ролей и пунктов меню — на русском (см. ТЗ, п.6-7).
export function AppShell({ navItems, roleLabel }: { navItems: NavItem[]; roleLabel: string }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-5">
          <div className="text-lg font-semibold text-brand-700">English Start Profile</div>
          <div className="mt-0.5 text-xs uppercase tracking-wide text-slate-400">{roleLabel}</div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
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
      <main className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
