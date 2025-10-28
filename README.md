# Affiliate Offer EPC Monitor

A production-ready prototype for tracking PartnerMatic offer EPC trends. The stack is FastAPI + SQLite on the backend with a React + Vite + Tailwind dashboard frontend.

## Features

- Fetches PartnerMatic Monetization API data and stores daily EPC snapshots.
- Highlights top EPC movers across configurable lookback windows (7/15/30/60/90 days).
- Search, sort, and inspect offer metadata in a responsive dashboard.
- Detailed modal with EPC history line chart (30/60/90 days) powered by Recharts.
- Mock data fallback so the prototype works without live PartnerMatic access.

---

## Backend (FastAPI)

### Requirements

- Python 3.10+

Install dependencies:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
```

### Configuration

The PartnerMatic Monetization API token is read from the `PARTNERMATIC_TOKEN` environment variable. The prototype defaults to the demo token from the brief, but you should set your own in production.

```bash
export PARTNERMATIC_TOKEN=LSfjexThROKxRRkQ
# Optional overrides
# export DATABASE_URL=sqlite:///./epc_monitor.db
# export PARTNERMATIC_BASE_URL=https://api.partnermatic.com/api/monetization
```

### Run the API

```bash
uvicorn app.main:app --reload
```

The server listens on `http://localhost:8000`.

### Seed data / daily snapshots

1. Start the FastAPI server.
2. Trigger the snapshot endpoint (run once per day). The endpoint will call PartnerMatic, upsert offers, and add today’s EPC snapshot.

```bash
curl -X POST http://localhost:8000/api/fetch-and-snapshot
```

If the PartnerMatic API is unreachable the backend falls back to bundled mock offers so the workflow still functions.

3. Repeat the call on different days to build history (you can temporarily change your system date or adjust the code for testing).

### Smoke-test endpoints

Fetch the top movers for a 30-day window:

```bash
curl "http://localhost:8000/api/top-movers?window=30"
```

Fetch EPC history for a specific offer:

```bash
curl "http://localhost:8000/api/offer/128541/history?window=90"
```

Health check:

```bash
curl http://localhost:8000/api/health
```

---

## Frontend (React + Vite + Tailwind)

### Requirements

- Node.js 18+

Install dependencies and launch the dev server:

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server defaults to `http://localhost:5173` and expects the FastAPI API on `http://localhost:8000`. To target a different backend, create a `.env` file in `frontend/`:

```bash
VITE_API_BASE_URL=http://localhost:8000
```

Open the dashboard in your browser, choose a window/sort/search, and click any offer to view its EPC history chart.

---

## Project structure

```
backend/
  app/
    main.py              # FastAPI app with endpoints
    models.py            # SQLAlchemy models for offers & snapshots
    schemas.py           # Pydantic response schemas
    partnermatic.py      # Monetization API client + mock data
    database.py          # Engine/session helpers
    config.py            # Environment settings
  requirements.txt
frontend/
  src/
    App.jsx              # Dashboard shell
    components/          # FilterBar, OffersTable, OfferDetailModal, EpcHistoryChart
  index.html
  vite.config.js
  tailwind.config.cjs
  postcss.config.cjs
README.md
```

---

## Seeding strategy tips

- During development you can call `/api/fetch-and-snapshot` multiple times per day. Because snapshots are keyed by `(offer_id, date)`, only the latest value for that day is kept.
- To simulate historical data quickly, adjust the snapshot code to accept a custom date or temporarily modify the system date before calling the endpoint.
- Once historical data exists, the dashboard will highlight the largest EPC jumps based on the selected lookback window.

---

## Notes

- CORS is enabled in the API so the Vite dev server can communicate with FastAPI.
- SQLite is used for simplicity; swap `DATABASE_URL` for PostgreSQL/MySQL in production.
- The Monetization API helper is structured for easy replacement of the mock data with real HTTP calls.
