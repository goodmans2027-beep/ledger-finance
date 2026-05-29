# Ledger — Personal Finance Dashboard

A clean, privacy-first personal finance planning tool.
No bank linking. No subscriptions. Your data stays yours.

## Structure

```
finance_dashboard/
├── index.html              # App entry point, sidebar, page shells
├── css/
│   ├── main.css            # Base styles, CSS variables, dark/light themes, layout
│   └── components.css      # Cards, tables, buttons, modals, charts, badges
├── js/
│   ├── app.js              # Navigation, init, page routing
│   ├── theme.js            # Dark/light toggle, persists preference
│   ├── data.js             # All read/write to localStorage, data schema
│   ├── export.js           # JSON, CSV, and PDF export logic
│   ├── charts.js           # Reusable chart rendering (Canvas/Chart.js)
│   ├── dashboard.js        # Dashboard page logic
│   ├── car-loan.js         # Car loan calculator + amortization
│   ├── mortgage.js         # Mortgage calculator + equity tracking
│   ├── budget.js           # Monthly budget planner
│   ├── investments.js      # Investment holdings + growth projections
│   ├── networth.js         # Aggregated net worth from all pages
│   └── tax.js              # Federal, state, local tax estimator
├── data/
│   └── user-data.json      # Reference schema / blank data template
├── exports/                # Generated CSV and PDF files land here
└── assets/
    └── icons/              # Any SVG icons used in the UI
```

## How Each File Communicates

- Every page JS file reads/writes ONLY through `data.js`
- `data.js` is the single source of truth (localStorage)
- `networth.js` and `dashboard.js` call read functions from other modules via `data.js`
- `export.js` pulls from `data.js` to generate all export formats
- `charts.js` is purely visual — receives data, returns rendered canvas

## Running Locally

Open `index.html` in a browser directly, or use VS Code Live Server for the best experience.

## Roadmap

- Phase 1: Local browser app (current)
- Phase 2: Supabase auth + cloud sync
- Phase 3: Stripe payments, Vercel hosting, public launch
