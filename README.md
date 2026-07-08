# SPES — Supplier Performance Evaluation System

Internal web app for evaluating supplier/vendor performance. Buyers (GCP) and
business users (USER) score suppliers against weighted criteria, a supervisor
reviews and approves the result, and admins manage employees, suppliers, and
bulk task uploads.

## Tech stack

- **Frontend:** React 19 + Vite
- **Backend:** Express.js (Node)
- **Database:** PostgreSQL (tested against Neon)
- **Auth:** JWT, issued by the backend on login and stored in an httpOnly
  cookie (never touched by frontend JS — the frontend calls `GET /api/auth/me`
  to restore its session)
- **Email:** Resend.com (invitation/reminder/overdue/approval notifications)

## Roles

| Role | Can do |
|---|---|
| USER / GCP | Fill out assigned supplier evaluations, view own history |
| SUPERVISOR | Approve or return submitted evaluation results |
| ADMIN | Manage employees, bulk-upload evaluation tasks (Excel), view all results |

## Project structure

```
frontend/       React app (src/ pages, shared components, constants), own package.json
backend/        Express API (routes, middleware, cron jobs, email templates), own package.json
shared/         criteria-data.json — PRE/POST/FUNCTION criteria data read by both sides
database/       schema.sql (current DB schema) + seed.sql
```

## Setup

Requires Node.js and a PostgreSQL database (e.g. a free Neon project).

```bash
# Frontend
cd frontend
cp .env.example .env          # set VITE_API_URL
npm install
npm run dev                   # http://localhost:5173

# Backend (separate terminal)
cd backend
cp .env.example .env          # set DATABASE_URL, JWT_SECRET, RESEND_API_KEY, etc.
npm install
npm run dev                   # http://localhost:5000
```

See `backend/.env.example` and `frontend/.env.example` for the full list of
required environment variables — nothing in this repo needs values beyond
those placeholders.

On first boot, the backend creates the database schema/seed data it needs and
provisions a default `ADMIN-001` account with a randomly generated password
printed once to the server console (there's currently no self-service
password reset, so save it).

## Scripts

| Command | Where | Does |
|---|---|---|
| `npm run dev` | `frontend/` | Start the frontend dev server |
| `npm run build` | `frontend/` | Production build |
| `npm run lint` | `frontend/` | Lint the frontend |
| `npm run dev` | `backend/` | Start the API with auto-restart |
| `npm start` | `backend/` | Start the API |

## More detail

See [`TECHNICAL_SPEC.md`](./TECHNICAL_SPEC.md) for API reference, scoring
logic, and page-by-page flow (note: its stack section predates the move to
PostgreSQL — the schema/setup instructions in this README are current).
