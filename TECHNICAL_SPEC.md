# Technical Specification
## Supplier Performance Evaluation System (SPES)

> Version 1.0 | Last updated: June 2026
> Stack: React + Vite · Express.js · PostgreSQL (Neon)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Tech Stack](#2-tech-stack)
3. [System Architecture](#3-system-architecture)
4. [Database Schema](#4-database-schema)
5. [API Reference](#5-api-reference)
6. [Application Flow & Pages](#6-application-flow--pages)
7. [Frontend Components](#7-frontend-components)
8. [Scoring Logic](#8-scoring-logic)
9. [Email & Scheduled Jobs](#9-email--scheduled-jobs)
10. [Export Features](#10-export-features)
11. [Environment Configuration](#11-environment-configuration)
12. [Local Development Setup](#12-local-development-setup)
13. [Security Considerations](#13-security-considerations)
14. [Known Limitations & Roadmap](#14-known-limitations--roadmap)

---

## 1. System Overview

### Purpose
An internal tool for evaluating supplier/vendor performance. Buyers (GCP) and
business users (USER) fill out weighted scoring forms for an assigned
supplier; the system computes a weighted total score and grade, a supervisor
reviews and approves the result, and admins manage employees, suppliers, and
bulk-upload evaluation rounds via Excel.

### Roles
| Role | Capabilities |
|---|---|
| **USER** | Fill assigned evaluation tasks, view own submission history |
| **GCP** | Same as USER — represents the buyer/procurement side of an evaluation pair |
| **SUPERVISOR** | Approve or return submitted evaluation results once both USER + GCP have submitted |
| **ADMIN** | Manage employees, bulk-upload evaluation rounds (Excel), view all sessions/history |

### Evaluation Types
| `eval_type` | When it happens | Criteria set used |
|---|---|---|
| `pre_eval` | Before onboarding a new supplier | `PRE_CRITERIA` |
| `post_eval` | 90 days after PTA approval | `POST_CRITERIA` |
| `half_year` | Periodic, ~June | `POST_CRITERIA` |
| `yearly` | Periodic, ~December | `POST_CRITERIA` |

Each evaluation round produces one **session** (`evaluation_sessions`) that
holds one USER submission + one GCP submission; the session's `final_score`
is the average of the two once both are in.

---

## 2. Tech Stack

### Frontend
| Item | Value |
|---|---|
| Framework | React 19 |
| Build tool | Vite |
| Language | JavaScript (JSX) |
| Styling | Inline styles + scoped `<style>` media queries (no CSS framework) |
| State | React `useState`/`useEffect` only — no Redux |
| Routing | Page state machine in `App.jsx` (no React Router) |
| Font | Sarabun (Thai-language support) |

### Backend
| Item | Value |
|---|---|
| Runtime | Node.js |
| Framework | Express 5 |
| Driver | `pg` (raw SQL, no ORM) |
| Auth | JWT (`jsonwebtoken`), `bcrypt` for password hashing |
| Middleware | `cors`, `express.json`, `express-rate-limit`, `dotenv` |
| Scheduled jobs | `node-cron` |
| Entry point | `server/server.js` |

### Database
| Item | Value |
|---|---|
| Engine | PostgreSQL (developed against Neon, a managed Postgres) |
| Schema source of truth | [`database/schema.sql`](./database/schema.sql) |
| Migrations | Idempotent `ALTER TABLE ... IF NOT EXISTS` blocks run on every server boot (`server/server.js`) — there is no separate migration runner/history table |

### Other libraries
| Library | Purpose |
|---|---|
| `xlsx` (SheetJS) | Parse uploaded Excel files (admin bulk upload) and generate the Excel export on the Result page |
| `resend` | Transactional email (invitation/reminder/overdue/approval) |
| `lucide-react` | Icon set |

> `jspdf` and `html2canvas` are listed in `package.json` but are not actually
> imported anywhere in the current code — the "PDF" export is the browser's
> native print dialog (`window.print()`), not a generated PDF file. See
> [Known Limitations](#14-known-limitations--roadmap).

---

## 3. System Architecture

```
Browser (localhost:5173)
        │
        │  fetch + Bearer JWT
        ▼
Express API (localhost:5000)
        │
        │  pg (parameterized SQL)
        ▼
PostgreSQL (Neon)
```

### Auth flow
1. `POST /api/auth/login` with `{ identifier, password }` (`identifier` = employee_id or email)
2. Server looks up the employee, verifies the password with bcrypt, signs a JWT containing `{ empId, fullName, role, email, department, jobTitle }`
3. Frontend stores the token in `localStorage` (`spe_token`) and decodes it client-side (base64url, see `App.jsx#getStoredUser`) to restore the session on reload
4. Every subsequent request goes through `server/middleware/authMiddleware.js`, which verifies the JWT signature and attaches `req.user`
5. There is currently no self-service registration or password reset — accounts are provisioned by an ADMIN (or the one-time bootstrap `ADMIN-001` account created on first server boot)

### Request flow (submit an evaluation)
1. `EvalForm` collects scores → `Resultpage.jsx` calls `POST /api/evaluations` with `{ vendorCode, evalType, period, productType, sessionId, scores }` (the acting employee is taken from the JWT, not the request body)
2. Server validates the employee/supplier/session, computes `totalScore`/`grade` server-side, inserts `evaluations` + `evaluation_scores` rows
3. A DB trigger (`trg_recalculate_score`) fires on insert: once both USER and GCP rows exist for the session, it averages their scores and flips the session to `pending_review`
4. Supervisor approves/returns via `server/routes/supervisor.js`, flipping the session to `completed` or `returned`

### Port map
| Service | Port | Command |
|---|---|---|
| Frontend (Vite) | 5173 | `npm run dev` (project root) |
| Backend (Express) | 5000 | `npm run dev` or `npm start` (`server/`) |

---

## 4. Database Schema

Full DDL lives in [`database/schema.sql`](./database/schema.sql) — keep that
file in sync with any future `ALTER TABLE` added to `server/server.js`'s boot
migration block. Summary of the core tables:

| Table | Purpose |
|---|---|
| `employees` | Login accounts (`employee_id`, `email`, `password_hash`, `role`) |
| `suppliers` | Vendor master data, including the full pre/post-eval upload template fields (tax ID, buyer/evaluator contacts, job value, PTA date) |
| `evaluation_sessions` | One evaluation round for one supplier+period. `status`: `pending → in_progress → pending_review → completed \| returned` |
| `evaluation_tasks` | One assignment (USER or GCP) within a session; tracks the invitation/reminder/overdue/thank-you email lifecycle |
| `evaluations` | One person's submitted scoring (`status`: `draft` \| `saved`), one row per session per role |
| `evaluation_scores` | Per-criterion score + weight backing each `evaluations` row |
| `evaluation_sub_criteria` / `score_level_descriptions` | The scoring rubric, seeded from `src/constants.js` on every boot |
| `supervisor_reviews` | One row per approve/return decision — a session can have several across return→resubmit cycles |
| `supplier_upload_batches` | One row per admin Excel upload |
| `email_logs` | Send-status record for every email the app sends |
| `grade_thresholds` | Configurable A–F score boundaries |

Notable constraints:
- `evaluation_sessions` has a **partial unique index** on `(supplier_id, eval_type, period) WHERE status != 'completed'` — prevents two open rounds existing for the same supplier+period at once. `period` for `half_year`/`yearly` always includes the calendar year (e.g. `"Half-Year 2026"`) precisely so next year's round doesn't collide with this one.
- `evaluations` has `UNIQUE (session_id, role)` — one USER + one GCP submission per session.

---

## 5. API Reference

**Base URL:** `http://localhost:5000` · all routes except `POST /api/auth/login` require `Authorization: Bearer <token>`.

### Auth (`/api/auth`)
| Method | Path | Notes |
|---|---|---|
| POST | `/login` | Rate-limited; body `{ identifier, password }` |
| POST | `/verify-password` | Re-confirms the *current* user's own password (used before granting ADMIN role) |

### Evaluations (`/api/evaluations`)
| Method | Path | Notes |
|---|---|---|
| POST | `/` | Submit a scoring form. Acting employee resolved from JWT, not the body |
| GET | `/my` | Current user's own submitted evaluations |
| GET | `/all` | ADMIN only — every evaluation |
| GET | `/my-tasks` | Current user's pending/in-progress/returned tasks |
| GET | `/my-timeline` | Every task ever assigned to the current user, including completed ones, for the stage-tracker UI |
| GET | `/:id` | Single evaluation with its per-criterion scores |

### Sessions (`/api/sessions`)
| Method | Path | Notes |
|---|---|---|
| GET | `/` | List sessions (ADMIN results/history view) |
| GET | `/:id` | Session detail — both evaluators' full breakdown |

### Supervisor (`/api/supervisor`) — SUPERVISOR or ADMIN only
| Method | Path | Notes |
|---|---|---|
| GET | `/queue` | Sessions awaiting this supervisor's decision |
| GET | `/history` | Past approve/return decisions |
| POST | `/sessions/:id/approve` | Body `{ notes }` |
| POST | `/sessions/:id/return` | Body `{ notes }` (required) — deletes the rejected evaluations and reopens both tasks |
| PATCH | `/reviews/:id/notes` | Edit a note on a past decision — keyed by review id, not session id, since a session can have multiple review rows |

### Admin (`/api/admin`) — ADMIN only
| Method | Path | Notes |
|---|---|---|
| POST | `/upload/pre-post` | multipart Excel upload — creates pre_eval/post_eval sessions+tasks |
| POST | `/upload/periodic` | multipart Excel upload — body also needs `evalType: half_year \| yearly` |
| GET | `/tasks` | All evaluation tasks, filterable by `status`/`role`/`vendorCode` |
| PATCH | `/tasks/:id` | Edit a task's assignee/due date |
| POST | `/tasks/:id/remind` / `/tasks/remind-all` | Manually trigger reminder email(s) |
| DELETE | `/sessions/:sessionId` | Delete a session |
| POST | `/sessions/bulk-delete` | Delete multiple sessions |
| GET | `/batches` | Upload history |

### Employees (`/api/employees`)
| Method | Path | Notes |
|---|---|---|
| GET | `/` | ADMIN only — employee list |
| GET / PATCH | `/me` | Current user's own profile |
| GET / PATCH | `/:employeeId` | ADMIN only |

### Suppliers (`/api/suppliers`)
| Method | Path | Notes |
|---|---|---|
| GET | `/` | List |
| GET | `/validate` | Check a vendor code exists (used by the manual-entry form) |
| GET / POST / PATCH | `/`, `/:vendorCode` | ADMIN only for create/update |
| GET | `/:vendorCode/permission` | Permission check for a USER employee (currently unenforced — see [Limitations](#14-known-limitations--roadmap)) |

### Criteria (`/api/criteria`)
| Method | Path | Notes |
|---|---|---|
| GET | `/` | Read-only — the scoring rubric as stored in the DB |

---

## 6. Application Flow & Pages

`App.jsx` is a hand-rolled page state machine (no React Router) keyed off a
`page` string and a decoded JWT in `user` state.

| Page | File | Used by |
|---|---|---|
| LoginPage | `LoginPage.jsx` | Everyone, unauthenticated |
| PortalPage | `PortalPage.jsx` | Everyone — module picker after login |
| LandingPage | `LandingPage.jsx` | USER/GCP (task list + start evaluation) and ADMIN (manual vendor-code entry) |
| EvalForm | `Evalform.jsx` | USER/GCP — the scoring form |
| ResultPage | `Resultpage.jsx` | USER/GCP — summary after submit, also used read-only from History |
| HistoryPage | `HistoryPage.jsx` | USER/GCP (own history) and ADMIN (everyone's) |
| ProfilePage | `ProfilePage.jsx` | Everyone |
| AdminPage | `AdminPage.jsx` | ADMIN — employees, evaluation tasks (embeds `TasksPage`), results & history |
| TasksPage | `TasksPage.jsx` | ADMIN — upload/manage evaluation tasks |
| UploadHistoryPage | `UploadHistoryPage.jsx` | ADMIN — past Excel upload batches |
| SupervisorPage | `SupervisorPage.jsx` | SUPERVISOR/ADMIN — approval queue + history |

---

## 7. Frontend Components

Shared components live in `src/components/index.jsx` (plus `FilterChips.jsx`
and `TimelineStepper.jsx` alongside it).

| Component | Description |
|---|---|
| `<Logo>` | SVG brand mark (bar-chart + trend line) |
| `<Header>` | Top nav bar — logo + title, live clock, back button, logged-in user info. Stacks into two rows below 640px |
| `<Clock>` | Live HH:MM:SS + date, rendered inside `Header` |
| `<GreenInput>` / `<PasswordInput>` / `<CustomSelect>` | Styled form inputs |
| `<GreenButton>` | Primary action button |
| `useModal()` → `{ showAlert, showConfirm, ModalEl }` | Promise-based alert/confirm dialogs (render `{ModalEl}` once per page) |
| `<FilterChips>` / `toggleInSet` | Multi-select filter chip group, used by Admin/Tasks/History filter panels |
| `<TimelineStepper>` | Pending → In Process → Submitted → Approved/Returned stage tracker |

---

## 8. Scoring Logic

### Formula (`computeScoreAndGrade`, `server/routes/evaluations.js`)

```
weightedScore(item) = (selectedLevel / maxLevel) × item.weight

totalRawScore       = Σ weightedScore(item) over criteria that exist in the DB
totalPossibleWeight = Σ item.weight over those same criteria

totalScore = (totalRawScore / totalPossibleWeight) × 100
```

The total is computed **only** from criteria that actually get persisted to
`evaluation_scores` — this guarantees `total_score` is always reconstructable
from `SUM(weighted_score)/SUM(weight)*100` over the stored rows.

### Grade thresholds (`grade_thresholds` table / `getGrade()` in `src/constants.js`)

| Grade | Score range |
|---|---|
| A | ≥ 90 |
| B | 80 – 89.9 |
| C | 70 – 79.9 |
| D | 60 – 69.9 |
| F | < 60 |

### Criteria sets (`src/constants.js`)
- `PRE_CRITERIA` — 5 sections (Quality, Cost, Delivery, Financial Stability, ESG), used for `pre_eval`
- `POST_CRITERIA` — 6 sections (Pricing & Value, Quality, Delivery, Service & Responsiveness, Financial Standing, ESG), used for `post_eval`/`half_year`/`yearly`
- `getCriteria(evalType)` picks the right set; `isPostEvalType(evalType)` is the switch
- Some items use a 1–5 level scale; a few use a restricted `levelValues` subset (e.g. `[1,3,5]`) or a `capital-ratio` calculator (`CapitalRatioCalc` in `Evalform.jsx`) that auto-selects a level from a financial ratio

---

## 9. Email & Scheduled Jobs

`server/utils/cronJobs.js` runs daily at 08:00 Asia/Bangkok via `node-cron`:

| Job | Trigger |
|---|---|
| Reminders | Task due within 7 days, not yet reminded |
| Overdue notices | Task ≥3 days past due, still pending |
| Thank-you | Task completed, not yet thanked (also sent immediately on submit) |
| Supervisor notify | New `pending_review` session, supervisor not yet notified |
| Pre/post-eval invitation retry | Catches invitations that failed at upload time |

All date checks use `<=`/`>=` ranges guarded by a `*_sent_at IS NULL` column,
not exact-date equality — a missed cron run self-heals on the next run
instead of permanently skipping a notification. Every send (success or
failure) is logged to `email_logs` via `server/utils/emailService.js`.

---

## 10. Export Features

Triggered from the **Export ▾** dropdown on the Result page (`Resultpage.jsx`):

| Format | How | Notes |
|---|---|---|
| **Excel** | `xlsx` (SheetJS), `exportExcel()` | 2-sheet workbook: summary + full per-criterion detail |
| **"PDF" / Print** | `window.print()`, `printPDF()` | Opens the browser's native print dialog with a print-only stylesheet (`@media print` in `Resultpage.jsx`) — user saves as PDF or prints physically. There is no server-generated PDF file |

---

## 11. Environment Configuration

See `.env.example` (frontend) and `server/.env.example` (backend) for the
full, current list of variables — both are placeholders only, safe to copy.

| File | Key variables |
|---|---|
| `.env` | `VITE_API_URL` |
| `server/.env` | `DATABASE_URL`, `DATABASE_SSL`, `PORT`, `FRONTEND_URL`, `JWT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM` |

`server/.env` is gitignored and must never be committed.

---

## 12. Local Development Setup

```bash
# 1. Frontend deps (project root)
npm install
cp .env.example .env          # set VITE_API_URL

# 2. Backend deps
cd server
npm install
cp .env.example .env          # set DATABASE_URL, JWT_SECRET, RESEND_API_KEY, ...

# 3. Start backend (terminal 1)
npm run dev                   # http://localhost:5000 — schema/seed run automatically on boot

# 4. Start frontend (terminal 2, project root)
npm run dev                   # http://localhost:5173
```

On first boot with no ADMIN account in the database, the server creates
`ADMIN-001` with a randomly generated password printed once to the console —
save it, there is no self-service reset.

---

## 13. Security Considerations

### In place
- JWT auth on every route except login; password hashing via bcrypt
- Acting-employee identity for evaluation submission is resolved from the
  verified JWT, never from client-supplied request data
- Rate limiting on `/api/auth/login`
- All SQL is parameterized (no string-concatenated queries)
- Email templates HTML-escape interpolated values (supplier name, notes,
  etc.) sourced from uploaded Excel data or free-text input
- `UNIQUE`/partial-unique DB constraints back up the app-level duplicate
  checks (evaluation submission, open-session creation)

### Known gaps
| Gap | Detail |
|---|---|
| No self-service password reset | Removed pending future SSO integration — until then, a lost admin password has no recovery path |
| `JWT_SECRET` strength | Not enforced/rotated automatically — use a long random value in any real deployment |
| `xlsx` dependency vulnerability | `npm audit` reports a known prototype-pollution/ReDoS issue in SheetJS with no upstream fix yet; mitigated only by trusting the admin uploader |
| Supplier permission check unenforced | `employee_supplier_permissions` exists but `evaluations.js` explicitly skips the check ("USER permission check — disabled for now") |
| `evaluation_tasks`/`supervisor_reviews` FKs are `NO ACTION`, not `CASCADE` | Deleting a session requires deleting its tasks/reviews first (the admin delete routes already do this) |

---

## 14. Known Limitations & Roadmap

| Area | Limitation |
|---|---|
| Mobile responsiveness | Audited and fixed for USER/GCP-facing pages (Landing, Evalform, Resultpage, Portal, History, Profile, Login). ADMIN/SUPERVISOR pages (dense data tables) have not been audited for mobile yet |
| `jspdf`/`html2canvas` | Listed as dependencies but unused — the PDF export is actually browser print. Either wire them up for a real generated PDF or remove the dependencies |
| ADMIN can submit as USER/GCP | An ADMIN account filling in for a buyer/evaluator records `evaluations.role` as USER/GCP, which is correct for the scoring trigger but means that column can't be used to reliably report "who holds which role" without joining back to `employees.role` |
| No autosave / draft recovery | `EvalForm` warns before navigating away, but a hard refresh or browser crash loses all entered scores |
| Score-math duplication | The (level/maxLevel)×weight formula is implemented independently in `Evalform.jsx`, `Resultpage.jsx` (×2 call sites), and the backend — no single shared helper, so a future change to one `levelValues` shape needs updating all four |
| `period` for half_year/yearly | Now includes the calendar year (fixed) — if the business ever needs more granular cycles (e.g. two "Yearly" rounds in one year), the format will need revisiting |

### Suggested priorities
1. Mobile-audit the ADMIN/SUPERVISOR pages (large data tables, upload modal)
2. Decide on the SSO integration approach, then reintroduce account
   provisioning/recovery accordingly
3. Extract the score-weight formula into one shared helper used by both
   frontend display and the backend's authoritative calculation
4. Remove or actually use `jspdf`/`html2canvas`
