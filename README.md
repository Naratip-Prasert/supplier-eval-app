# SPES — Supplier Performance Evaluation System

Internal web app for evaluating supplier/vendor performance. Buyers (GCP) and
business users (USER) score suppliers against weighted criteria, a supervisor
reviews and approves the result, and admins manage employees, suppliers, and
bulk task uploads.

## Tech stack

- **Frontend:** React 19 + Vite
- **Backend:** Express.js (Node)
- **Database:** PostgreSQL (tested against Neon)
- **Auth:** JWT (issued by the backend on login)
- **Email:** Resend.com (invitation/reminder/overdue/approval notifications)

## Roles

| Role | Can do |
|---|---|
| USER / GCP | Fill out assigned supplier evaluations, view own history |
| SUPERVISOR | Approve or return submitted evaluation results |
| ADMIN | Manage employees, bulk-upload evaluation tasks (Excel), view all results |

## Project structure

```
src/            React app (pages, shared components, constants)
server/         Express API (routes, middleware, cron jobs, email templates)
database/       schema.sql (current DB schema) + seed.sql
```

## Setup

Requires Node.js and a PostgreSQL database (e.g. a free Neon project).

```bash
# Frontend
cp .env.example .env          # set VITE_API_URL
npm install
npm run dev                   # http://localhost:5173

# Backend (separate terminal)
cd server
cp .env.example .env          # set DATABASE_URL, JWT_SECRET, RESEND_API_KEY, etc.
npm install
npm run dev                   # http://localhost:5000
```

See `server/.env.example` and `.env.example` for the full list of required
environment variables — nothing in this repo needs values beyond those
placeholders.

On first boot, the backend creates the database schema/seed data it needs and
provisions a default `ADMIN-001` account with a randomly generated password
printed once to the server console (there's currently no self-service
password reset, so save it).

## Scripts

| Command | Where | Does |
|---|---|---|
| `npm run dev` | root | Start the frontend dev server |
| `npm run build` | root | Production build |
| `npm run lint` | root | Lint the frontend |
| `npm run dev` | `server/` | Start the API with auto-restart |
| `npm start` | `server/` | Start the API |

## More detail

See [`TECHNICAL_SPEC.md`](./TECHNICAL_SPEC.md) for API reference, scoring
logic, and page-by-page flow (note: its stack section predates the move to
PostgreSQL — the schema/setup instructions in this README are current).
