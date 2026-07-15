# Cross-Evaluation Spec — Supplier↔Staff feedback (เชิงบริการ)

Status: **Phases 1-3 implemented and tested.** Not yet done: real end-to-end browser walkthrough (build + lint + all API paths verified; UI not visually driven in an actual browser), and seeding a fuller "service" criteria set (currently 4 starter items — SVC1.1-1.4 — meant to be edited/expanded via the existing Criteria Editor).

## 1. Background

The existing system only implements two of four evaluation directions between suppliers and staff:

| # | Evaluator | Target | Group | Status |
|---|---|---|---|---|
| 1 | USER | Supplier | เชิงคุณภาพ (quality) | ✅ existing (`evaluations.role = 'USER'`) |
| 2 | Buyer (GCP) | Supplier | เชิงคุณภาพ (quality) | ✅ existing (`evaluations.role = 'GCP'`) |
| 3 | **Supplier** | User, Buyer | เชิงบริการ (service) | ❌ new |
| 4 | User | Buyer | เชิงบริการ (service) | ❌ new |

This spec covers adding #3 and #4.

## 2. Decisions made

- **No new `SUPPLIER` role.** Suppliers never log into the main app. Access for #3 is via a **magic-link emailed to them**, no password, no session in the normal auth sense.
- **#4 reuses the existing `USER` role** — no new role needed, it's an in-app flow for an already-logged-in employee.
- **Trigger point for both #3 and #4: when a Supervisor approves a session** (`POST /api/supervisor/sessions/:id/approve`, the point `evaluation_sessions.status` actually becomes `'completed'` — not the earlier `'pending_review'` state right after USER+GCP submit).
- **No PRE/POST split for #3/#4.** One evaluation form each, independent of whether the underlying supplier session was pre_eval/post_eval/half_year/yearly.
- **`suppliers.contact_email` sourced from the existing Excel bulk-upload flow** (add a column to the upload template), with manual correction via the existing `PATCH /api/suppliers/:vendorCode` for one-offs. No live integration with an external company database for now — that's an explicit future phase if this becomes a real pain point.
- **Resolved during Phase 3:** Supplier rating User and Buyer is one combined form/link (both people, same page), not two separate emails.

## 3. Database changes

### 3.1 `suppliers.contact_email` (new column)

```sql
ALTER TABLE suppliers ADD COLUMN contact_email VARCHAR(200);
```

Nullable — a supplier without an email on file simply never gets a #3 magic-link (no hard failure).

### 3.2 `supplier_eval_tokens` (new table)

One-time, expiring tokens for the public magic-link flow. Same pattern as a typical password-reset-token table.

```sql
CREATE TABLE supplier_eval_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token       VARCHAR(64) UNIQUE NOT NULL,
  session_id  UUID        NOT NULL REFERENCES evaluation_sessions(id) ON DELETE CASCADE,
  supplier_id UUID        NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_supplier_eval_tokens_token ON supplier_eval_tokens(token);
```

- `expires_at`: suggest 14 days from creation (open question for later — easy to tune).
- `used_at IS NOT NULL` → token already redeemed, reject on second use.

### 3.3 `service_evaluations` (new table)

Deliberately **not** reusing `evaluations` — that table's `employee_id` (the evaluator) is `NOT NULL REFERENCES employees`, which can't represent a Supplier as evaluator. Rather than loosen that table's constraints (risk of breaking the #1/#2 flow and its trigger), this is a separate table for the new "person rates person" shape — same reasoning as why `supervisor_reviews` is its own table instead of being bolted onto `evaluations`.

```sql
CREATE TABLE service_evaluations (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id             UUID        NOT NULL REFERENCES evaluation_sessions(id) ON DELETE CASCADE,
  direction              VARCHAR(20) NOT NULL
                            CHECK (direction IN ('supplier_to_user', 'supplier_to_gcp', 'user_to_gcp')),
  evaluator_supplier_id  UUID        REFERENCES suppliers(id),   -- set for direction LIKE 'supplier_%'
  evaluator_employee_id  UUID        REFERENCES employees(id),   -- set for direction = 'user_to_gcp'
  target_employee_id     UUID        NOT NULL REFERENCES employees(id),
  total_score            DECIMAL(5,2),
  grade                  VARCHAR(5),
  raw_scores             JSONB,
  submitted_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (session_id, direction, target_employee_id)
);
```

`direction` covers both halves of #3 (`supplier_to_user`, `supplier_to_gcp`) and #4 (`user_to_gcp`) in one table rather than three.

### 3.4 Criteria

New `criteria_set` value: **`service`** — one shared set of "เชิงบริการ" criteria used by both #3 and #4 (rating dimensions like responsiveness, communication, professionalism apply the same way regardless of who's rating whom). Seeded the same way existing criteria are (`evaluation_main_criteria` / `evaluation_sub_criteria` rows with `criteria_set = 'service'`), no schema changes needed beyond using the existing tables with a new set value.

If UI design later shows Supplier-rating-User needs different questions than User-rating-Buyer, split into `service_supplier` / `service_peer` at that point — the schema doesn't need to change for that, just the seed data and which `criteria_set` gets queried per direction.

## 4. Backend (Phase 2 — done)

- `backend/routes/supervisor.js`: after `POST /sessions/:id/approve` commits, fire-and-forget — if `suppliers.contact_email` is set, insert a `supplier_eval_tokens` row (14-day expiry) and email the magic-link via the new `sendSupplierEvalInviteEmail` (`utils/emailService.js`). #4 needs no write at approval time — it's a live query (`GET /pending`) instead of a pre-created task.
- `backend/routes/publicSupplierEval.js` (new, not behind `requireAuth`): `GET/POST /api/public/supplier-eval/:token`, rate-limited (20/15min/IP) like `/login`. Token must be unused and unexpired; POST accepts ratings for both targets in one call and marks the token used.
- `backend/routes/serviceEvaluations.js` (new, behind `requireAuth`): `GET /pending`, `GET /criteria`, `POST /` — the POST re-derives from the DB that the requester really was the session's USER evaluator and the target really was its GCP evaluator, never trusting the request body's IDs alone. Duplicate submission → `409`, not a silent no-op (an actual bug hit and fixed during testing — `ON CONFLICT DO NOTHING` was returning 200 on a second submit that saved nothing).

Both new route files mounted in `server.js`; the public one deliberately has no `requireAuth` in front of it.

## 5. Frontend (Phase 3 — done)

- `frontend/src/pages/SupplierFeedbackPage.jsx` (new): standalone, no `Header`/sidebar. Reached via `main.jsx` matching `window.location.pathname` against `/supplier-feedback/:token` *before* `<App/>` mounts at all (no router in this app; doing the check inside `App` itself would violate the Rules of Hooks once the two paths' hook calls diverge). Shows both targets (User + Buyer) on one page with a shared 1-5 `ScorePicker` per criterion — resolves the "one form or two" open question from section 2 in favor of one.
- `frontend/src/pages/ServiceEvalPage.jsx` (new): normal authenticated page, added as a `PortalPage` module tile ("ประเมิน Buyer", USER role only, badge count = pending list length) → `App.jsx` `page === "serviceEval"`.

## 6. Explicitly out of scope for now

- Live integration with any external/company vendor-master database for supplier contact info.
- Reminder/nag emails for unanswered supplier links (can reuse the existing `evaluation_tasks` reminder cron pattern later if needed).
