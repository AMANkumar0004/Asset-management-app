# AssetFlow

**Enterprise Asset & Resource Management System**

AssetFlow is a full-stack ERP module that helps organizations — offices, schools, hospitals, factories, agencies — track, allocate, and maintain physical assets and shared resources from one centralized platform. It replaces spreadsheets and paper logs with structured asset lifecycles, conflict-free resource booking, and real-time visibility into who holds what, where it is, and its condition.

---

## ✨ Key Features

- **Full asset lifecycle tracking** — `Available → Allocated → Reserved → Under Maintenance → Lost → Retired → Disposed`, enforced as a strict, backend-validated state machine
- **Conflict-free allocation** — the system blocks double-allocation of a single asset and offers a Transfer Request flow instead
- **Overlap-safe resource booking** — time-slot booking for shared rooms/vehicles/equipment with server-side overlap validation
- **Structured maintenance workflow** — requests must be approved before an asset flips to Under Maintenance, and resolved before it returns to Available
- **Audit cycles** — assign auditors, mark assets Verified/Missing/Damaged, and auto-generate discrepancy reports; closing a cycle atomically updates affected asset statuses (e.g. confirmed-missing → Lost)
- **Role-based access control** — Admin, Asset Manager, Department Head, and Employee roles, with realistic account creation (signup always creates an Employee; only an Admin can promote roles)
- **Live dashboard** — KPI cards, overdue-item highlighting, and real-time notifications
- **Reports & analytics** — utilization trends, maintenance frequency, department allocation summaries, booking heatmaps

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript, Tailwind CSS, React Router, TanStack Query |
| Backend | Node.js + Express (TypeScript), single combined server |
| Auth | JWT (bearer token) + bcrypt password hashing |
| Charts | Recharts |
| Build | Vite (dev), esbuild (server bundle for production) |
| AI | Google Gemini API (`@google/genai`) |

The app ships as **one Express server** that serves both the API (`/api/*`) and the built React frontend — no separate frontend/backend deployments needed.

---

## 👥 User Roles

| Role | Capabilities |
|---|---|
| **Admin** | Manages departments, categories, audit cycles, and role assignment; views org-wide analytics |
| **Asset Manager** | Registers/allocates assets; approves transfers, maintenance requests, and audit discrepancies |
| **Department Head** | Views/manages department assets; approves department-level allocation/transfer requests; books resources for the department |
| **Employee** | Views own allocations; books resources; raises maintenance requests; initiates returns/transfers |

> Signup **always** creates an Employee account. Roles are only ever changed by an Admin from the Employee Directory — never self-assigned.

---

## 🔒 Core Business Rules

1. **State machine enforcement** — asset status transitions are validated server-side against a fixed table of legal moves; illegal transitions are rejected with a clear error.
2. **Allocation conflicts** — an asset with an active allocation cannot be allocated again; the requester is shown the current holder and offered a Transfer Request instead.
3. **Booking overlaps** — two bookings for the same resource can never overlap in time; a booking starting exactly when another ends is valid.
4. **Maintenance approval gate** — an asset only becomes `Under Maintenance` once its request is Approved, and only returns to `Available` on Resolved.
5. **Audit closure cascade** — closing an audit cycle is atomic: it locks findings and updates every affected asset's status in one operation (e.g. `Missing` → `Lost`, `Damaged` → auto-raises a maintenance request).

---

## 📂 Project Structure

```
.
├── server.ts              # Express API + production static serving + dev Vite middleware
├── server/
│   └── db.ts               # Data layer, state-machine validation, overlap checks
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── types.ts
│   ├── context/
│   │   └── AppContext.tsx
│   ├── lib/
│   │   └── api.ts
│   ├── components/
│   │   ├── Modal.tsx
│   │   └── Navigation.tsx
│   └── screens/
│       ├── LoginScreen.tsx
│       ├── DashboardScreen.tsx
│       ├── OrganizationScreen.tsx
│       ├── AssetDirectoryScreen.tsx
│       ├── AllocationScreen.tsx
│       ├── BookingScreen.tsx
│       ├── MaintenanceScreen.tsx
│       ├── AuditScreen.tsx
│       ├── AnalyticsScreen.tsx
│       └── LogsScreen.tsx
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## 🚀 Getting Started (Local Development)

### Prerequisites
- Node.js 18+
- npm

### Setup

```bash
git clone https://github.com/AMANkumar0004/Asset-management-app.git
cd Asset-management-app
npm install
```

### Environment Variables

Create a `.env` file in the project root (see `.env.example`):

```dotenv
JWT_SECRET=replace_with_a_long_random_string
GEMINI_API_KEY=your_gemini_api_key
PORT=3000
```

> ⚠️ Never ship the hardcoded fallback JWT secret to production — always set `JWT_SECRET` explicitly.

### Run in development

```bash
npm run dev
```

This starts the Express server with Vite in middleware mode (HMR enabled) at `http://localhost:3000`.

---

## 📦 Build & Production

```bash
npm run build   # builds the frontend (Vite) and bundles the server (esbuild)
npm start       # runs the production server from dist/server.cjs
```

In production, the same Express server serves the compiled frontend from `dist/` and handles all `/api/*` routes — a single deployable unit.

---

## ☁️ Deployment (Render)

This project runs as a single persistent Node service, which fits Render's Web Service model directly (not a serverless/static host like Vercel, since the API needs a long-running process).

1. Push your code to GitHub
2. On [Render](https://render.com) → **New +** → **Web Service** → connect this repo
3. Configure:
   - **Build Command:** `npm run build`
   - **Start Command:** `npm start`
4. Add environment variables: `NODE_ENV=production`, `JWT_SECRET`, `GEMINI_API_KEY`
5. Deploy — Render provides a single live URL serving both frontend and API, avoiding cross-origin/cookie issues entirely

---

## 🧭 Screens

1. **Login / Signup** — email/password auth, Employee-only signup, session validation
2. **Dashboard** — KPI cards, overdue highlighting, quick actions
3. **Organization Setup** (Admin) — Departments, Asset Categories, Employee Directory & role promotion
4. **Asset Registration & Directory** — register assets, search/filter, per-asset lifecycle & history
5. **Asset Allocation & Transfer** — allocate, conflict handling, transfer approval, returns
6. **Resource Booking** — calendar view, overlap-validated time-slot booking
7. **Maintenance Management** — raise/approve/track repair requests
8. **Asset Audit** — audit cycles, auditor checklists, discrepancy reports, cycle closure
9. **Reports & Analytics** — utilization, maintenance, department, and booking insights
10. **Activity Logs & Notifications** — full audit trail and real-time alerts

---

## 📝 License

This project was built for hackathon submission purposes.

---

## 🤝 Contributors

- [AMANkumar0004](https://github.com/AMANkumar0004)
- Add your teammates here
