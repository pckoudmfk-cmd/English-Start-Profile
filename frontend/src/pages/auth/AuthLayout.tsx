import type { ReactNode } from "react";

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-sky-50 to-brand-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          {subtitle && <div className="text-sm font-medium uppercase tracking-wide text-brand-600">{subtitle}</div>}
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{title}</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
