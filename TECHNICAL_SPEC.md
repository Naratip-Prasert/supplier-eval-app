# Technical Specification
## Supplier Performance Evaluation System (SPE)

> Version 1.0 | Last Updated: June 2026
> Stack: React + Vite · Express.js · MongoDB Atlas · Mongoose

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Tech Stack](#2-tech-stack)
3. [System Architecture](#3-system-architecture)
4. [Database Design & Advice](#4-database-design--advice)
5. [API Reference](#5-api-reference)
6. [Application Flow & Pages](#6-application-flow--pages)
7. [Frontend Components](#7-frontend-components)
8. [Scoring Logic](#8-scoring-logic)
9. [Export Features](#9-export-features)
10. [Environment Configuration](#10-environment-configuration)
11. [Local Development Setup](#11-local-development-setup)
12. [Security Considerations](#12-security-considerations)
13. [Known Limitations & Roadmap](#13-known-limitations--roadmap)

---

## 1. System Overview

### Purpose
A web-based internal tool for evaluating supplier/vendor performance. Staff fill out structured scoring forms; the system calculates weighted scores, assigns grades, and stores results in the database.

### Users
| Role | Thai Label | Capabilities |
|---|---|---|
| **User** | ผู้ใช้งานทั่วไป | Fill form, score supplier, view result, save & export |
| **GCP** | เจ้าหน้าที่จัดซื้อ | Same as User, but UI emphasizes procurement context. Read-only on non-GCP sections (planned) |

### Evaluation Types
| Type | Description |
|---|---|
| `pre-Evaluation` | Evaluate a supplier **before** engagement |
| `post-Evaluation` | Evaluate a supplier **after** a completed period |

---

## 2. Tech Stack

### Frontend
| Item | Value |
|---|---|
| Framework | React 19.2.6 |
| Build Tool | Vite 8.0.12 |
| Language | JavaScript (JSX / ES Modules) |
| Styling | Inline styles (no CSS framework) |
| State Management | React `useState` / `useRef` / `useEffect` (no Redux) |
| Routing | Page state machine in `App.jsx` (no React Router) |
| Font | Sarabun (Google Fonts — Thai language support) |

### Backend
| Item | Value |
|---|---|
| Runtime | Node.js v24 |
| Framework | Express.js 5.2.1 |
| ODM | Mongoose 9.7.0 |
| Middleware | cors, express.json, dotenv |
| Entry Point | `server/server.js` |

### Database
| Item | Value |
|---|---|
| Database | MongoDB Atlas (cloud-hosted) |
| Cluster | InternCEDTBJC (shared, free tier) |
| Database Name | `supplier-eval` |
| Collection | `evaluations` |
| ODM | Mongoose 9.7.0 |

### Export Libraries
| Library | Version | Purpose |
|---|---|---|
| jsPDF | latest | Generate PDF from canvas image |
| html2canvas | latest | Capture DOM node as canvas |
| xlsx (SheetJS) | latest | Generate Excel (.xlsx) files |

### Dev Tools
| Tool | Purpose |
|---|---|
| ESLint 10.3.0 | Code linting |
| Vite HMR | Hot module replacement during development |
| Git + GitHub | Version control |

---

## 3. System Architecture

```
Browser (localhost:5173)
        │
        │  HTTP (fetch)
        ▼
Express API (localhost:5000)
        │
        │  Mongoose ODM
        ▼
MongoDB Atlas (cloud)
  └─ Database: supplier-eval
       └─ Collection: evaluations
```

### Request Flow (Save Evaluation)
```
1. User completes form → clicks "บันทึกผล"
2. ResultPage.jsx calls fetch POST http://localhost:5000/api/evaluations
3. Express receives request, passes body to Mongoose
4. Mongoose validates against schema
5. MongoDB Atlas stores the document
6. Server returns 201 + saved document
7. Frontend sets saveStatus = "saved"
```

### Port Map
| Service | Port | Command |
|---|---|---|
| Frontend (Vite) | 5173 | `npm run dev` (project root) |
| Backend (Express) | 5000 | `npm start` (server/) |

---

## 4. Database Design & Advice

### 4.1 Current Schema (`server/models/Evaluation.js`)

```javascript
{
  // Evaluator info
  role:         String,   // "user" | "gcp"
  empId:        String,   // required — employee ID
  dept:         String,   // department
  job:          String,   // job title
  evalType:     String,   // "pre-Evaluation" | "post-Evaluation"

  // Supplier info
  vendorCode:   String,   // e.g. "SUP-001"
  supplierName: String,
  productType:  String,   // "สินค้า" | "บริการ" | "สินค้าและบริการ"
  period:       String,   // "Monthly / รายเดือน" | "Annual / รายปี" | ...

  // Scores (Mixed — plain object, keys = criterion IDs)
  scores: Mixed,          // { "1.1": 4, "1.2": 3, "2.1": 5, ... }
  notes:  Mixed,          // { "1.1": "comment", "2.1": "note" }

  // Result
  totalScore:   Number,   // 0–100 (weighted)
  grade:        String,   // "A" | "B" | "C" | "D"

  // Auto
  createdAt:    Date,
  updatedAt:    Date,
}
```

**Indexes defined:**
```javascript
{ supplierName: 1, createdAt: -1 }  // supplier history queries
{ empId: 1 }                         // evaluator queries
{ vendorCode: 1 }                    // vendor lookup
{ grade: 1 }                         // filter by grade
```

---

### 4.2 Is MongoDB a Good Choice? — Analysis

#### ✅ Why MongoDB works here
- **Flexible scores object** — each evaluation can have different criteria keys without needing to change a table schema
- **No joins needed** — each evaluation document is self-contained (no foreign key lookups)
- **Easy to scale** — MongoDB Atlas handles horizontal scaling automatically
- **Rapid prototyping** — no migration scripts needed when adding fields
- **Matches data shape** — one evaluation = one document (natural fit)

#### ⚠️ Current Concerns

| Concern | Detail |
|---|---|
| **`scores` is Mixed type** | The object `{"1.1": 4, "2.1": 3}` cannot be efficiently indexed or queried per criterion. You cannot ask: *"find all evaluations where criterion 1.1 scored below 3"* |
| **No Supplier master collection** | Supplier name and vendor code are stored as plain strings inside every evaluation. If a supplier changes their name, old records become inconsistent |
| **No Employee master collection** | `empId` is just a string. No validation that the employee exists |
| **Dot-notation keys** | Keys like `"1.1"` in MongoDB documents can cause issues with path-based queries (MongoDB uses `.` as a field separator) |
| **No audit/history for edits** | Once saved, no version history exists |

#### 🆚 MongoDB vs. PostgreSQL for this system

| Factor | MongoDB (current) | PostgreSQL (alternative) |
|---|---|---|
| Schema flexibility | High — add fields freely | Low — requires migration for changes |
| Query power on scores | Poor — Mixed type is a black box | High — each score is a row, fully queryable |
| Reporting (e.g. avg score per supplier over 12 months) | Hard — requires `$unwind` on Mixed | Easy — standard SQL GROUP BY |
| Referential integrity | None — supplier/employee are strings | Strong — foreign keys enforce consistency |
| Setup complexity | Low (Atlas free tier) | Higher (need managed PostgreSQL or local) |
| Best for | Flexible, document-shaped data | Relational, analytical, reporting-heavy data |

**Verdict:** MongoDB is acceptable for this system at its current scale and complexity. However, as soon as you need reporting (trend analysis, supplier comparison over time, average scores per criterion), you will hit the limits of the current `Mixed` schema.

---

### 4.3 Recommended Schema Improvement (Still MongoDB)

Replace `scores: Mixed` with a **structured array**. This keeps MongoDB but makes each criterion score queryable and indexable.

**Current (problematic):**
```json
{
  "scores": { "1.1": 4, "1.2": 3, "2.1": 5 },
  "notes":  { "1.1": "No claim", "2.1": "On time" }
}
```

**Recommended:**
```json
{
  "criteriaScores": [
    { "no": "1.1", "section": 1, "weight": 14, "score": 4, "note": "No claim" },
    { "no": "1.2", "section": 1, "weight": 8,  "score": 3, "note": "" },
    { "no": "2.1", "section": 2, "weight": 15, "score": 5, "note": "On time" }
  ]
}
```

**Why this is better:**
```javascript
// Can now query: "find all evals where criterion 1.1 scored below 3"
db.evaluations.find({ "criteriaScores": { $elemMatch: { no: "1.1", score: { $lt: 3 } } } })

// Can index per criterion for performance
db.evaluations.createIndex({ "criteriaScores.no": 1, "criteriaScores.score": 1 })

// Can aggregate: average score per criterion across all suppliers
db.evaluations.aggregate([
  { $unwind: "$criteriaScores" },
  { $group: { _id: "$criteriaScores.no", avgScore: { $avg: "$criteriaScores.score" } } }
])
```

**Recommended full improved schema:**
```javascript
const criteriaScoreSchema = new mongoose.Schema({
  no:      { type: String, required: true },  // "1.1", "2.1"
  section: { type: Number },                  // 1, 2
  weight:  { type: Number },                  // 14, 8, 15 ...
  score:   { type: Number, min: 1, max: 5 },
  note:    { type: String, default: "" },
}, { _id: false });

const evaluationSchema = new mongoose.Schema({
  role:           { type: String, enum: ["user", "gcp"] },
  empId:          { type: String, required: true, trim: true },
  dept:           { type: String, trim: true },
  job:            { type: String, trim: true },
  evalType:       { type: String, enum: ["pre-Evaluation", "post-Evaluation"] },
  vendorCode:     { type: String, trim: true },
  supplierName:   { type: String, trim: true },
  productType:    { type: String, enum: ["สินค้า", "บริการ", "สินค้าและบริการ"] },
  period:         { type: String },
  criteriaScores: [criteriaScoreSchema],      // ← replaces scores + notes Mixed
  totalScore:     { type: Number, min: 0, max: 100 },
  grade:          { type: String, enum: ["A", "B", "C", "D"] },
}, { timestamps: true });
```

---

## 5. API Reference

**Base URL:** `http://localhost:5000`

---

### POST `/api/evaluations`
Save a new evaluation result.

**Request Body:**
```json
{
  "role": "user",
  "empId": "123456",
  "dept": "ฝ่ายจัดซื้อ",
  "job": "JB-001 จัดซื้อวัสดุสำนักงาน",
  "evalType": "post-Evaluation",
  "vendorCode": "SUP-001",
  "supplierName": "ABC Supply Co.,Ltd.",
  "productType": "สินค้า",
  "period": "Annual / รายปี",
  "scores": { "1.1": 4, "1.2": 3, "2.1": 5, "2.2": 4 },
  "notes": { "1.1": "No claim this year", "2.1": "" },
  "totalScore": 78.5,
  "grade": "B"
}
```

**Success Response `201`:**
```json
{
  "message": "บันทึกสำเร็จ",
  "data": {
    "_id": "665f2a3b...",
    "empId": "123456",
    "supplierName": "ABC Supply Co.,Ltd.",
    "totalScore": 78.5,
    "grade": "B",
    "createdAt": "2026-06-12T08:00:00.000Z",
    "updatedAt": "2026-06-12T08:00:00.000Z"
  }
}
```

**Error Response `400`:**
```json
{
  "message": "บันทึกไม่สำเร็จ",
  "error": "Evaluation validation failed: empId: Path `empId` is required."
}
```

---

### GET `/api/evaluations`
Retrieve all evaluations, sorted newest first.

**Response `200`:**
```json
[
  {
    "_id": "665f2a3b...",
    "supplierName": "ABC Supply Co.,Ltd.",
    "grade": "B",
    "totalScore": 78.5,
    "createdAt": "2026-06-12T08:00:00.000Z"
  },
  { ... }
]
```

---

### GET `/api/evaluations/:id`
Retrieve a single evaluation by its MongoDB ObjectId.

**URL Param:** `id` — MongoDB `_id` (24-char hex string)

**Success Response `200`:** Full evaluation document

**Error Response `404`:**
```json
{ "message": "ไม่พบข้อมูล" }
```

---

## 6. Application Flow & Pages

### Page State Machine (`App.jsx`)

```
[landing] ──onSelect(role)──► [form] ──onSubmit(data)──► [eval] ──onDone(result)──► [result]
    ▲                           │                            │                           │
    └───────────────────────────┴────────────────────────────┴──────────onBack───────────┘
```

### Pages

| Page | File | Props In | Props Out |
|---|---|---|---|
| **LandingPage** | `LandingPage.jsx` | — | `onSelect(role)` |
| **UserForm** | `Userform.jsx` | `role` | `onSubmit(formData)` |
| **EvalForm** | `Evalform.jsx` | `formData` | `onDone({ scores, notes, totalScore, grade })` |
| **ResultPage** | `Resultpage.jsx` | `formData`, `result` | `onBack()` |

### Data Passed Between Pages

```
formData = {
  role, empId, dept, job,
  evalType, vendorCode, supplierName, productType, period
}

result = {
  scores: { "1.1": 4, ... },
  notes:  { "1.1": "comment", ... },
  totalScore: 78.5,
  grade: "B"
}
```

---

## 7. Frontend Components

All shared components are in `src/components/index.jsx`.

| Component | Props | Description |
|---|---|---|
| `<Header>` | `titleOverride`, `subtitle`, `backLabel`, `onBack` | Top navigation bar with clock |
| `<Clock>` | — | Live real-time clock (HH:MM:SS) rendered inside Header |
| `<CustomSelect>` | `label`, `required`, `options[]`, `value`, `onChange`, `disabled` | Styled dropdown (green border) |
| `<GreenInput>` | `label`, `required`, `value`, `onChange`, `placeholder`, `disabled` | Styled text input (green border) |
| `<GreenButton>` | `onClick`, `fullWidth`, `color`, `disabled`, `style` | Primary action button |

---

## 8. Scoring Logic

### Formula

Each criterion has a `weight` (integer, represents percentage contribution).

```
weightedScore(item) = (selectedLevel / 5) × item.weight

totalRawScore = Σ weightedScore(item) for all items with a selection

totalScore = (totalRawScore / totalPossibleWeight) × 100
```

### Example

| Criterion | Weight | Selected Level | Weighted Score |
|---|---|---|---|
| 1.1 | 14 | 4 | (4/5) × 14 = 11.2 |
| 1.2 | 8  | 3 | (3/5) × 8  = 4.8  |
| 2.1 | 15 | 5 | (5/5) × 15 = 15.0 |
| 2.2 | 15 | 4 | (4/5) × 15 = 12.0 |
| **Total** | **52** | — | **43.0** |

`totalScore = (43.0 / 70) × 100 = 61.4` → **Grade B**

> Note: `totalPossibleWeight` = sum of weights of **all** defined criteria (not just answered ones). Unanswered criteria contribute 0.

### Grade Thresholds

| Grade | Score Range | Thai Label |
|---|---|---|
| **A** | 81 – 100 | ดีมาก (Excellent) |
| **B** | 61 – 80  | ดี (Good) |
| **C** | 51 – 60  | พอใช้ (Acceptable) |
| **D** | < 50     | ต้องปรับปรุง (Needs Improvement) |

### Criteria Structure (`src/constants.js`)

```
CRITERIA
├── Section 1: ด้านคุณภาพสินค้า/Quality Performance (น้ำหนักรวม 40%)
│   ├── 1.1  อัตราการ Reject/Claim          weight: 14
│   ├── 1.2  ความสมบูรณ์ของเอกสาร           weight:  8
│   ├── 1.3  ความรวดเร็วในการแก้ไขปัญหา     weight:  8
│   └── 1.4  อัตราการ Reject/Claim (ซ้ำ)    weight: 10
│
└── Section 2: ด้านการส่งมอบ/Delivery Performance (น้ำหนักรวม 30%)
    ├── 2.1  ความตรงต่อเวลาในการส่งมอบ      weight: 15
    └── 2.2  ความครบถ้วนของปริมาณสินค้า     weight: 15
```

> Total defined weight = 70 (not 100). The scoring formula normalises to 100 via `(rawScore / 70) × 100`.

---

## 9. Export Features

All three export types are triggered from the **Export Result ▾** dropdown on the Result page.

| Format | Library | Output | File Name |
|---|---|---|---|
| **PDF** | jsPDF + html2canvas | Image-based multi-page A4 PDF | `SPE-{supplierName}-{YYYYMMDD}.pdf` |
| **Excel** | xlsx (SheetJS) | 2-sheet `.xlsx` workbook | `SPE-{supplierName}-{YYYYMMDD}.xlsx` |
| **Print** | `window.open` + `window.print()` | Browser print dialog (supports Save as PDF, physical printer) | — |

### Excel Workbook Structure

**Sheet 1 — Summary**
- Supplier info (name, vendor code, evaluator, department, type, period, date)
- Overall score and grade
- Per-section score vs. max weight

**Sheet 2 — Detail**
- Every criterion: No. / Criteria / Detail / Weight / Score (1–5) / Weighted Score / Note

---

## 10. Environment Configuration

### Backend (`server/.env`)

| Variable | Required | Example | Description |
|---|---|---|---|
| `MONGODB_URI` | ✅ Yes | `mongodb+srv://user:pass@cluster.net/supplier-eval?...` | Full MongoDB connection string including database name |
| `PORT` | No | `5000` | Express server port (default: 5000) |

> ⚠️ `server/.env` is listed in `.gitignore` and must **never** be committed to version control.

### Frontend
No `.env` file required. The API base URL is hardcoded in `Resultpage.jsx`:
```javascript
fetch("http://localhost:5000/api/evaluations", ...)
```
For production deployment, this should be moved to `VITE_API_URL` environment variable.

---

## 11. Local Development Setup

### Prerequisites
| Tool | Minimum Version | Check |
|---|---|---|
| Node.js | v18+ | `node --version` |
| npm | v9+ | `npm --version` |
| Git | any | `git --version` |
| MongoDB Atlas account | — | Free tier at mongodb.com/atlas |

### Steps

**1. Clone the repository**
```bash
git clone https://github.com/Naratip-Prasert/supplier-eval-app.git
cd supplier-eval-app
git checkout march
```

**2. Install frontend dependencies** (project root)
```bash
npm install
```

**3. Install backend dependencies**
```bash
cd server
npm install
```

**4. Create `server/.env`**
```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/supplier-eval?retryWrites=true&w=majority
PORT=5000
```

**5. Start backend** (Terminal 1)
```bash
cd server
npm start
# Expected: ✅ MongoDB connected
#           🚀 Server running on http://localhost:5000
```

**6. Start frontend** (Terminal 2)
```bash
cd ..         # back to project root
npm run dev
# Expected: ➜  Local: http://localhost:5173/
```

**7. Open browser** → `http://localhost:5173`

---

## 12. Security Considerations

### Current Gaps (No Authentication)

| Risk | Detail | Recommendation |
|---|---|---|
| **No login/auth** | Anyone who can reach port 5173 can submit evaluations as any employee ID | Add JWT-based authentication or SSO (e.g., Azure AD) |
| **No input sanitisation** | `empId`, `supplierName` etc. are stored as-is from the request body | Mongoose `trim: true` helps, but add server-side validation with Joi or Zod |
| **Hardcoded API URL** | `http://localhost:5000` is hardcoded in the frontend | Move to `VITE_API_URL` environment variable |
| **CORS open** | `app.use(cors())` allows all origins | Lock down to specific origin in production: `cors({ origin: "https://your-domain.com" })` |
| **`.env` in repo risk** | If `.env` is accidentally committed, credentials are exposed | Add pre-commit hook to block `.env` commits; rotate credentials if leaked |
| **MongoDB credentials in `.env`** | Password is plain text | Use MongoDB Atlas network access controls to restrict allowed IPs |

---

## 13. Known Limitations & Roadmap

### Current Limitations

| Area | Limitation |
|---|---|
| **Scoring** | If user skips a criterion, it counts as 0 (score drops unfairly) |
| **GCP role** | Read-only restriction for non-GCP sections is not yet enforced in code |
| **Evaluation History** | History panel on Result page is a placeholder (no data rendered) |
| **Export Result** | PDF is image-based (not text-searchable); Thai fonts may vary by OS |
| **No validation on submit** | UserForm has no required-field check before proceeding to EvalForm |
| **Single collection** | All roles and evaluation types share one flat collection (harder to query by role) |
| **No edit/delete** | Once saved, evaluations cannot be corrected |

### Suggested Roadmap

| Priority | Feature |
|---|---|
| 🔴 High | Add required-field validation before UserForm submit |
| 🔴 High | Implement GCP read-only mode on non-procurement criteria |
| 🟡 Medium | Implement Evaluation History panel (fetch from `GET /api/evaluations` filtered by vendorCode) |
| 🟡 Medium | Add `VITE_API_URL` env variable (remove hardcoded localhost URL) |
| 🟡 Medium | Migrate `scores/notes: Mixed` to `criteriaScores: Array` for queryability |
| 🟢 Low | Add authentication (at minimum, employee ID + PIN) |
| 🟢 Low | Add supplier master data collection |
| 🟢 Low | Add dashboard/analytics page (average grade per supplier over time) |
| 🟢 Low | Move CORS to environment-specific origin whitelist |
