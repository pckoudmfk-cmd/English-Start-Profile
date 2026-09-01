# English Start Profile

Цифровая система стартовой диагностики, педагогического профилирования,
отслеживания прогресса, портфолио достижений и сопровождения зачёта.
Полная спецификация продукта — [`docs/SPEC.md`](docs/SPEC.md).

Разработка ведётся поэтапно. Статус текущего этапа и отчёт по нему —
[`docs/STAGE_1_REPORT.md`](docs/STAGE_1_REPORT.md).

## Реализовано (Этап 1)

- регистрация, вход, выход, восстановление доступа;
- роли: преподаватель, студент, администратор (архитектурно);
- разграничение доступа к данным на уровне backend (не только UI);
- профиль преподавателя и профиль студента;
- русскоязычная навигация с честными заглушками "в разработке" для
  ещё не реализованных разделов.

## Технологический стек

- **Backend:** Node.js + Express + TypeScript, Prisma ORM (SQLite в
  разработке), JWT в httpOnly-cookie, bcrypt для паролей, zod для
  валидации.
- **Frontend:** React + TypeScript, Vite, React Router, Tailwind CSS.

## Структура репозитория

```
backend/    — API-сервер, схема БД (Prisma), скрипт проверки доступа
frontend/   — веб-приложение (React + Vite)
docs/       — спецификация продукта и отчёты по этапам разработки
```

## Быстрый старт (локальная разработка)

### Backend

```bash
cd backend
cp .env.example .env      # при необходимости отредактируйте JWT_SECRET
npm install
npm run prisma:migrate    # создаст SQLite-базу backend/prisma/dev.db
npm run dev                # http://localhost:4000
```

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev                # http://localhost:5173
```

Откройте `http://localhost:5173` — попадёте на страницу входа.

### Проверка разграничения доступа

После запуска backend (`npm run dev` в каталоге `backend`) выполните в
соседнем терминале:

```bash
cd backend
npm run verify:access
```

Скрипт создаёт двух преподавателей и двух студентов, реальными HTTP-
запросами проверяет, что каждый видит только свои данные и не может
получить доступ к чужому разделу напрямую (см.
[`backend/scripts/verify-access-control.ts`](backend/scripts/verify-access-control.ts)).

## Переменные окружения

См. `backend/.env.example` и `frontend/.env.example`. `.env` файлы не
коммитятся в репозиторий.
