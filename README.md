# PrithviNet 1.0

**National Environmental Monitoring System — Chhattisgarh**

A real-time pollution monitoring platform for the Chhattisgarh Environment Conservation Board (CECB). PrithviNet ingests continuous sensor telemetry from air, water, and noise stations across the state, visualizes it on an interactive map, and surfacing AI-powered forecasts and compliance reporting — all in a PARIVESH 2.0-styled government interface.

---

## Features

| Module | Description |
|---|---|
| **Live Telemetry Dashboard** | Real-time sensor readings for Air (PM2.5, PM10, SO2, NO2, CO, O3), Water (pH, DO, BOD, COD, TSS, TDS, Turbidity), and Noise — smooth random-walk updates every 5 s |
| **Interactive Pollution Map** | Leaflet heatmap with station popups; stable per-location values seeded once at mount |
| **72-h AI Forecast** | Prophet + scikit-learn ML forecasts with an AI-generated narrative insight (Claude / GPT-4o) |
| **AI CoPilot** | Streaming SSE-based assistant for querying sensor data, generating compliance summaries, and explaining alerts |
| **Compliance Dashboard** | Industry tracker, regulatory limit management, and PDF-report generation (ReportLab) |
| **Alerts System** | Threshold-breach detection with severity levels; real-time WebSocket delivery via Redis pub/sub |
| **Role-Based Access** | Three roles — `admin` (super_admin), `regulator` (regional_officer), `industry` — with route-level guards |
| **Public Portal** | Unauthenticated `/public` overview showing current state-wide air quality |
| **Demo Mode** | Full frontend runs entirely off mock data — no backend required (toggle `DEMO_MODE` in `src/lib/api.ts`) |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Browser (React 19)                │
│  Vite 6 · TypeScript · Tailwind CSS 4 · Zustand 5  │
│  Leaflet heatmap · Recharts · Lucide icons          │
└────────────────────┬────────────────────────────────┘
                     │  REST /api/v1  &  WebSocket /ws
┌────────────────────▼────────────────────────────────┐
│              FastAPI (Python 3.11)                  │
│  Alembic migrations · Celery task queue             │
│  Prophet + scikit-learn ML services                 │
│  OpenRouter / OpenAI / Gemini AI copilot            │
└───────┬─────────────────────────┬───────────────────┘
        │                         │
┌───────▼──────────┐   ┌──────────▼──────────────────┐
│  TimescaleDB 14  │   │   Redis (pub/sub + cache)   │
│  (PostgreSQL)    │   └─────────────────────────────┘
└──────────────────┘
        ▲
┌───────┴──────────────────────────────────────────┐
│  IoT Simulator (asyncio)                         │
│  Persistent state file — values never jump back  │
│  30-second tick with TOD/seasonal/spike factors  │
└──────────────────────────────────────────────────┘
```

---

## Tech Stack

**Frontend**
- React 19 · TypeScript · Vite 6
- Tailwind CSS 4 (PARIVESH 2.0 gov theme)
- Zustand 5 (state), React Router 7, Axios
- Recharts (charts), React-Leaflet + leaflet.heat (maps)
- Lucide React (icons), Motion (animations)
- Bytez.js / `@google/genai` (frontend AI calls)

**Backend**
- FastAPI 0.104 · Python 3.11 · Uvicorn
- SQLAlchemy 2 async (asyncpg) · Alembic migrations
- TimescaleDB (PostgreSQL 14) time-series storage
- Redis 5 (pub/sub, session cache)
- Celery 5 + APScheduler (background tasks)
- Prophet 1.1 + scikit-learn 1.3 (ML forecasting)
- OpenAI 1.3 / OpenRouter / Gemini (AI copilot + forecast insight)
- ReportLab (PDF compliance reports)

---

## Quick Start — Demo Mode (No Backend Required)

The frontend ships with `DEMO_MODE = true` in `src/lib/api.ts`. All API calls return fixture data from `src/lib/mockData.ts`, so you can run the full UI with a single command.

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

Open `http://localhost:3000` and log in with any of the demo credentials below.

> To disable demo mode and connect to a real backend, set `DEMO_MODE = false` in `src/lib/api.ts` and configure `.env.local`.

---

## Full Stack Setup

### Prerequisites

- Node.js 20+
- Python 3.11+
- Docker + Docker Compose (for database and Redis)
- (Optional) TimescaleDB locally if not using Docker

### 1. Clone and install frontend

```bash
git clone https://github.com/AdityaaTyagi56/Prithvinet-1.0.git
cd Prithvinet-1.0
npm install
```

### 2. Start infrastructure (TimescaleDB + Redis)

```bash
docker-compose up -d db redis
```

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local` with your values (see [Environment Variables](#environment-variables) below).

### 4. Set up and seed the backend database

```bash
cd backend
pip install -r requirements.txt
alembic upgrade head        # run migrations
python seed.py              # seed locations, parameters, and demo users
```

### 5. Start the backend

```bash
uvicorn app.main:app --reload --port 8000
```

### 6. (Optional) Start the IoT simulator

```bash
cd backend/iot_simulator
python main.py
```

The simulator generates sensor readings every 30 seconds with realistic time-of-day, weekday, and seasonal patterns. State is persisted to a JSON file so values never jump back on restart.

### 7. Start the frontend

```bash
npm run dev
```

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the required values.

### Frontend (Vite — prefix `VITE_`)

| Variable | Default | Required | Description |
|---|---|---|---|
| `VITE_API_URL` | `http://localhost:8000` | No | Backend REST API base URL |
| `VITE_WS_URL` | `ws://localhost:8000` | No | WebSocket base URL |
| `VITE_BYTEZ_API_KEY` | — | For AI features | Bytez API key (proxies Claude) |
| `VITE_BYTEZ_MODEL` | `anthropic/claude-opus-4-5` | No | LLM model for frontend AI |
| `VITE_BYTEZ_LOCAL_DEV` | `false` | No | Point Bytez to local Docker |
| `GEMINI_API_KEY` | — | For Gemini features | Google Gemini API key |

### Backend (`.env` at repo root)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Async PostgreSQL URL (`postgresql+asyncpg://...`) |
| `SYNC_DATABASE_URL` | Yes | Sync PostgreSQL URL (`postgresql+psycopg2://...`) |
| `REDIS_URL` | Yes | Redis URL (`redis://localhost:6379`) |
| `CELERY_BROKER_URL` | Yes | Celery broker (same as Redis URL) |
| `CELERY_RESULT_BACKEND` | Yes | Celery result backend (same as Redis URL) |
| `JWT_SECRET_KEY` | Yes | Secret key for JWT signing |
| `JWT_ALGORITHM` | No (HS256) | JWT algorithm |
| `OPENAI_API_KEY` | No | OpenAI key for AI copilot |
| `OPENROUTER_API_KEY` | No | OpenRouter key for forecast AI insight |
| `GEMINI_API_KEY` | No | Gemini key for alternative AI backend |

---

## Demo Credentials

| Role | Email | Password | Access |
|---|---|---|---|
| **Admin** | `admin@cecb.gov.in` | `cecb@2024` | Full access — compliance dashboard, user management, all stations |
| **Regulator** | `officer@cecb.gov.in` | `officer@2024` | Dashboard, forecasts, regional analytics |
| **Industry** | `industry@company.in` | `industry@2024` | Own station readings and compliance status |

---

## API Overview

All routes are mounted under `/api/v1`.

| Endpoint | Method | Description |
|---|---|---|
| `/auth/register` | POST | Register a new user |
| `/auth/login` | POST | Login — returns JWT access + refresh tokens |
| `/auth/me` | GET | Get current user profile |
| `/readings/` | GET/POST | Sensor readings (query by location, parameter, time range) |
| `/locations/` | GET/POST | Monitoring stations (filter by `?type=air\|water\|noise`) |
| `/alerts/` | GET/POST | Pollution alerts (threshold breaches) |
| `/forecast/{location_id}` | GET | 72-hour ML forecast for a station |
| `/copilot/chat` | POST | AI CoPilot chat (streaming SSE) |
| `/industries/` | GET | Industry compliance tracker |
| `/limits/` | GET/PUT | Regulatory pollutant thresholds |
| `/public/overview` | GET | Unauthenticated public air quality summary |
| `/ws/readings/{location_id}` | WS | WebSocket feed — live readings for a station |
| `/ws/alerts` | WS | WebSocket feed — real-time alerts |
| `/health` | GET | Health check |

---

## Project Structure

```
├── src/                        # React frontend
│   ├── pages/
│   │   ├── auth/               # LoginPage
│   │   ├── dashboard/          # DashboardPage, UnifiedDashboard, AlertsDashboard,
│   │   │                       #   RegionalAnalytics, IndustryTracker
│   │   ├── officer/            # ForecastPage
│   │   ├── admin/              # ComplianceDashboard
│   │   └── public/             # PublicPortal (unauthenticated)
│   ├── components/
│   │   ├── map/                # PollutionMap (Leaflet heatmap)
│   │   ├── charts/             # ForecastChart, TrendChart
│   │   └── copilot/            # CopilotChat (streaming SSE)
│   ├── store/                  # Zustand: authStore, alertStore, dataStore, readingsStore
│   ├── hooks/                  # useWebSocket, useLiveReadings, useInterpolatedValue, useSSE
│   └── lib/                    # api.ts (demo/real), mockData.ts, bytez.ts
│
├── backend/
│   ├── app/
│   │   ├── main.py             # FastAPI app + fallback data generator
│   │   ├── routers/            # 12 API routers
│   │   ├── services/           # ML, anomaly detection, copilot, compliance
│   │   ├── models/             # SQLAlchemy ORM models
│   │   ├── schemas/            # Pydantic request/response schemas
│   │   └── workers/            # Celery tasks
│   ├── iot_simulator/
│   │   └── main.py             # Asyncio sensor simulator (persistent state)
│   └── scripts/                # Data import, model training, dataset sync
│
├── docker-compose.yml          # TimescaleDB, Redis, IoT simulator
└── .env.example                # Environment variable template
```

---

## Data Sources

### Ambient Monitoring

| Type | Source | API / Resource | Real? |
|---|---|---|---|
| **Air Quality** | data.gov.in — CPCB NAMP stations | `3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69` — hourly sync | ✅ 100% Real |
| **Water Quality** | data.gov.in — CPCB NWMP rivers | `9c6a4e06-c1b3-4b83-8e4d-60b499723d98` + CPCB 2020 verified baseline | ✅ Real government data |
| **Noise** | CPCB NANMN pattern + CG research baselines | Pattern from real metro API (`cpcb-nanmn-noise-monitoring`) | ⚠️ Pattern real, CG has no monitoring infrastructure |

### Industry / Stack Emission Data

| Type | Source | Reference | Real? |
|---|---|---|---|
| **CECB OCEMS** | Chhattisgarh ECB Online CEMS portal | `enviscecb.org/data.htm` — CSV import | ✅ Real stack emission readings |
| **CPCB RTDMS** | Central Pollution Control Board Real-Time Data | `rtdms.cpcb.gov.in` — 15 min sync | ✅ Real (with synthetic fallback when portal down) |
| **Emission Standards** | Environment (Protection) Rules, 1986 Schedule-I | Gazette notification — 5 industry types, 3 parameters | ✅ Real CPCB standards |
| **Industry Registry** | 10 verified CG industries | SAIL, NTPC, CSEB, BALCO, ACC, UltraTech, Monnet, JSPL, Nova Iron | ✅ Real industries with real coordinates |
| **Consent Data** | CECB Consent Management System | Consent-to-Operate validity dates | ✅ Real regulatory data |
| **Historical Violations** | CSE Inspection Reports | Nova Iron Bilaspur — SPM 2292 mg/m³ (June 2009) | ✅ Documented violation |

### CPCB Stack Emission Standards (EP Rules 1986 Schedule-I)

| Industry Type | PM (mg/Nm³) | SO₂ (mg/Nm³) | NOₓ (mg/Nm³) |
|---|---|---|---|
| Thermal Power Plant | 50 | 200 | 300 |
| Integrated Steel | 50 | 500 | 500 |
| Cement | 30 | 100 | 1000 |
| Sponge Iron | 150 | 500 | — |
| Aluminium Smelter | 50 | 400 | — |

**Note:** Chhattisgarh has no official noise monitoring stations under CPCB NANMN (covers only 7 metro cities — Mumbai, Delhi, Kolkata, Chennai, Bangalore, Lucknow, Hyderabad). This is the infrastructure gap PrithviNet aims to help fill. Noise data uses real NANMN pattern data from Lucknow Industrial zone (closest industrial profile to Korba/Bhilai) applied to verified Chhattisgarh research baselines.

**Same API key** from [data.gov.in](https://api.data.gov.in/) works for all three datasets.

### Sync & Import Scripts

| Script | What it does | Schedule |
|---|---|---|
| `backend/scripts/sync_govapi_chhattisgarh.py` | Air quality from CPCB via data.gov.in | Every 60 min |
| `backend/scripts/sync_water_govapi.py` | Water quality NWMP + CPCB baselines | Every 24 h |
| `backend/scripts/sync_noise_pattern.py` | Noise (NANMN pattern + CG baselines) | Every 24 h |
| `backend/scripts/seed_industries_real.py` | Seed 10 real CG industries + CPCB limits + Nova Iron violation | One-time |
| `backend/scripts/import_ocems_cecb.py` | Import CECB OCEMS CSV stack emission data | On-demand |
| `backend/scripts/sync_rtdms_live.py` | CPCB RTDMS live industry CEMS data | Every 15 min |

Pre-trained Prophet models are in `backend/ml_models/`.

---

## License

This project was developed as part of the E-Cell hackathon initiative. All rights reserved to the development team.
