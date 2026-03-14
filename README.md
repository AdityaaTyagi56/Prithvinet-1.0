# 🌿 PrithviNet

**Smart Environmental Monitoring and Compliance Platform for Chhattisgarh, India**

[![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TimescaleDB](https://img.shields.io/badge/TimescaleDB-PostgreSQL_14-FDB515?logo=postgresql&logoColor=black)](https://www.timescale.com)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docker.com)
[![Prophet](https://img.shields.io/badge/Prophet-ML_Forecasting-brightgreen)](https://facebook.github.io/prophet/)

---

## What Is PrithviNet

PrithviNet is a real-time environmental monitoring and compliance enforcement platform for Chhattisgarh's State Pollution Control Board (CECB). It ingests continuous sensor telemetry from Air (PM2.5, PM10, SO2, NO2, CO, O3), Water (pH, BOD, DO, Coliform), and Noise (Leq day/night) monitoring stations distributed across Raipur, Bhilai, Korba, Bilaspur, and Raigarh. AI-powered 72-hour forecasting, automated violation detection with instant alerts, and a citizen-facing public portal replace the slow manual compliance process that currently causes days of reporting delay.

---

## The Problem It Solves

| Statistic | Source |
|---|---|
| Only **10% of CEMS stations** meet CPCB's 85% data availability standard | CEEW 2024 |
| **60% of small industries** in high-pollution zones violate norms regularly | University of Chicago 2024 |
| Korba designated a **Critically Polluted Area** by CPCB — coal plant emissions 3× safe limits | CPCB CPAList |
| Manual compliance reporting creates **72-hour delays** in violation detection | CECB Internal |

PrithviNet addresses all four: continuous data ingestion (100% uptime target), automated threshold monitoring (< 5 minute detection), AI-assisted forecasting, and a public-facing dashboard for citizen transparency.

---

## Demo Credentials

| Role | Email | Password | Access |
|---|---|---|---|
| Super Admin | `admin@prithvinet.in` | `admin123` | All stations, all reports, user management, compliance overview |
| Regional Officer | `ro.delhi@prithvinet.in` | `officer123` | Dashboard, forecasts, regional analytics, alert management |
| Monitoring Team | `monitor1@prithvinet.in` | `monitor123` | Live station readings, trend charts |
| Industry User | `steelplant@example.in` | `industry123` | Own station data, compliance status |
| **Public Portal** | No login required | — | `http://localhost:3000/public` |

---

## Quick Start

> **No backend needed for demo.** The frontend ships with `DEMO_MODE = true` in `src/lib/api.ts` — everything runs off mock data.

```bash
git clone https://github.com/AdityaaTyagi56/Prithvinet-1.0.git
cd Prithvinet-1.0
npm install
npm run dev
# Open http://localhost:3000
```

**Full stack (with real database):**

```bash
cp .env.example .env            # fill in DATABASE_URL, REDIS_URL, JWT_SECRET_KEY
docker-compose up --build       # starts TimescaleDB + Redis + IoT Simulator
cd backend && pip install -r requirements.txt
alembic upgrade head            # run migrations
python seed.py                  # seed stations, parameters, demo users
uvicorn app.main:app --port 8000 --reload
# Set DEMO_MODE = false in src/lib/api.ts, then: npm run dev
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   Browser (React 19 + Vite 6)            │
│   Leaflet heatmap · Recharts · Zustand · Tailwind CSS 4  │
└────────────────────────┬─────────────────────────────────┘
                         │  REST /api/v1  ·  WebSocket /ws  ·  SSE /copilot
┌────────────────────────▼─────────────────────────────────┐
│               FastAPI  (Python 3.11 · Uvicorn)           │
│  JWT Auth · Celery Workers · Anomaly Service             │
│  ML Service (Prophet + IsolationForest)                  │
│  AI Copilot (OpenRouter/OpenAI/Gemini — streaming SSE)   │
└──────────┬────────────────────────────┬──────────────────┘
           │                            │
┌──────────▼────────┐      ┌────────────▼─────────────────┐
│  TimescaleDB 14   │      │     Redis (pub/sub + cache)  │
│  (PostgreSQL)     │      │     Celery Broker            │
│  Hypertables for  │      └──────────────────────────────┘
│  time-series data │
└──────────▲────────┘
           │  POST /api/v1/readings/ every 30 s
┌──────────┴────────────────────────────────────────────┐
│  IoT Simulator (asyncio · Docker)                     │
│  • Time-of-day, weekday, seasonal factors            │
│  • Korba coal plant spike cycles                     │
│  • Persistent state file (Docker volume)             │
│  • Offline buffer — retries when backend recovers    │
└───────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React 19 + TypeScript | UI framework |
| **Build** | Vite 6 | Fast HMR dev server + bundler |
| **Styling** | Tailwind CSS 4 | PARIVESH 2.0 government theme |
| **State** | Zustand 5 | Global sensor value store (no re-randomizing) |
| **Routing** | React Router 7 | Client-side navigation |
| **Charts** | Recharts 3 | Trend + forecast visualisation |
| **Maps** | React-Leaflet + leaflet.heat | Geo-spatial pollution heatmap |
| **HTTP** | Axios | API client |
| **Animations** | Motion + requestAnimationFrame | Smooth sensor value interpolation |
| **Frontend AI** | Bytez.js | Proxies Claude / GPT-4o in browser |
| **Backend** | FastAPI 0.104 | Async REST API + WebSocket + SSE |
| **Runtime** | Python 3.11 + Uvicorn | ASGI server |
| **ORM** | SQLAlchemy 2 (asyncpg) | Async database access |
| **Migrations** | Alembic | Schema version control |
| **Database** | TimescaleDB 14 | PostgreSQL with time-series hypertables |
| **Cache/Bus** | Redis 5 | WebSocket pub/sub · session cache |
| **Tasks** | Celery 5 + APScheduler | Background jobs, report generation |
| **ML — Forecast** | Prophet 1.1 | 72h pollutant concentration forecasting |
| **ML — Anomaly** | scikit-learn IsolationForest | Unsupervised anomaly detection |
| **AI Copilot** | OpenRouter / OpenAI / Gemini | Streaming compliance assistant |
| **Reports** | ReportLab | PDF compliance report export |
| **Simulator** | asyncio + httpx | Realistic IoT sensor simulation |
| **Containers** | Docker Compose | Local dev orchestration |

---

## Features

### Real-Time Monitoring
- **Live telemetry cards** — PM2.5, PM10, SO2, NO2, CO, O3 per station; smooth random-walk updates every 5 s, never jumps
- **Three-state WebSocket** — `connecting → live → stale`; displays last-known values on disconnect (no blank screen)
- **Skeleton loading** — animated placeholder cards while stations load
- **Station selector** — switch between monitoring locations via dropdown

### AI & ML
- **72-hour Prophet forecast** — trained on Chhattisgarh Open-Meteo historical data; confidence interval bands in Recharts
- **AI narrative insight** — Claude / GPT-4o generates a 2-sentence human-readable forecast summary per station
- **Anomaly detection** — IsolationForest flags outlier readings; stored as `is_anomaly=TRUE` for audit trail
- **AI CoPilot** — streaming SSE chat assistant; queries sensor DB, explains violations, drafts compliance summaries

### Compliance
- **Automated threshold breach** — every reading checked against CPCB limits; breach → alert + WebSocket push
- **Industry tracker** — per-industry compliance score, consent expiry, YTD violations, risk score
- **Compliance calendar** — overdue / upcoming inspection schedule
- **PDF report export** — ReportLab-generated compliance summary downloadable per station

### Visualisation
- **Leaflet heatmap** — geo-spatial risk overlay; click any station for popup with latest readings
- **Stable map values** — station readings seeded once at map mount; popups never re-randomize
- **Trend charts** — 30-day historical sparklines per parameter
- **Regional analytics** — side-by-side city comparison: AQI, WQI, noise dB, violations

### Public Portal
- **No authentication required** at `/public`
- Shows state-wide current air quality by region
- Colour-coded AQI bands (Good → Severe)

---

## Screenshots

> Run `python scripts/capture_screenshots.py` with the dev server live to regenerate.

| | |
|---|---|
| ![Public Portal](docs/screenshots/01_public_portal.png) | ![Login](docs/screenshots/02_login.png) |
| *Public AQI Portal — no login required* | *Login page* |
| ![Dashboard](docs/screenshots/03_dashboard.png) | ![Map](docs/screenshots/04_map.png) |
| *Unified Live Telemetry Dashboard* | *Geo-spatial Pollution Heatmap* |
| ![Forecast](docs/screenshots/05_forecast.png) | ![Alerts](docs/screenshots/06_alerts.png) |
| *72-hour AI Forecast with confidence bands* | *Real-time Alerts Dashboard* |
| ![Compliance](docs/screenshots/07_compliance.png) | ![CoPilot](docs/screenshots/08_copilot.png) |
| *Compliance Dashboard — industry tracker* | *Streaming AI CoPilot* |

---

## Chhattisgarh Data Coverage

| Station | City | Type | Lat | Lon | Parameters |
|---|---|---|---|---|---|
| Raipur CEMS Station | Raipur | Air | 21.2514 | 81.6296 | PM2.5, PM10, SO2, NO2, CO, O3 |
| Bhilai Steel Industrial CEMS | Bhilai | Air | 21.1938 | 81.3509 | PM2.5, PM10, SO2, NO2, CO, O3 |
| Korba Thermal Power Station | Korba | Air | 22.3595 | 82.7501 | PM2.5, PM10, SO2, NO2, CO, O3 |
| Bilaspur Urban Monitor | Bilaspur | Air | 22.0796 | 82.1391 | PM2.5, PM10, SO2, NO2, CO, O3 |
| Durg Industrial Cluster | Durg | Air | 21.1904 | 81.2849 | PM2.5, PM10, SO2, NO2, CO, O3 |
| Raigarh CAQI | Raigarh | Air | 21.8974 | 83.3950 | PM2.5, PM10, SO2, NO2, CO, O3 |
| Jagdalpur Forest Monitor | Jagdalpur | Air | 19.0748 | 82.0289 | PM2.5, PM10 |
| Mahanadi at Arrang | Raipur | Water | 21.2400 | 81.7200 | pH, DO, BOD, Conductivity, Nitrate, Coliform |
| Kharoon River at Bundri | Raipur | Water | 21.3200 | 81.6800 | pH, DO, BOD, Conductivity, Nitrate, Coliform |
| Seonath River at Durg | Durg | Water | 21.2100 | 81.2600 | pH, DO, BOD, Conductivity, Nitrate, Coliform |
| Arpa River DS Bilaspur | Bilaspur | Water | 22.0500 | 82.1600 | pH, DO, BOD, Conductivity, Nitrate, Coliform |
| Kelo River US Raigarh | Raigarh | Water | 21.9200 | 83.4100 | pH, DO, BOD, Conductivity, Nitrate, Coliform |
| Kelo River DS Raigarh | Raigarh | Water | 21.8800 | 83.4400 | pH, DO, BOD, Conductivity, Nitrate, Coliform |
| Dengur Nallah Korba | Korba | Water | 22.3700 | 82.7600 | pH, DO, BOD, Conductivity, Nitrate, Coliform |
| Korba Industrial Area | Korba | Noise | 22.3550 | 82.7400 | Leq, Lmax, Lmin, L10, L90 |
| Bhilai Steel Zone | Bhilai | Noise | 21.2100 | 81.4300 | Leq, Lmax, Lmin |
| Raipur Commercial Hub | Raipur | Noise | 21.2480 | 81.6350 | Leq, Lmax, Lmin |
| Raipur Civil Lines | Raipur | Noise | 21.2350 | 81.6450 | Leq, Lmax, Lmin |
| Bilaspur Residential | Bilaspur | Noise | 22.0810 | 82.1420 | Leq, Lmax, Lmin |

---

## API Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/v1/auth/login` | Login → JWT access + refresh tokens | Public |
| `GET` | `/api/v1/auth/me` | Get current user profile | Bearer |
| `GET` | `/api/v1/readings/` | Query readings by location, parameter, time range | Bearer |
| `POST` | `/api/v1/readings/` | Ingest a sensor reading (IoT simulator / external) | Bearer |
| `GET` | `/api/v1/locations/` | List monitoring stations (filter: `?type=air\|water\|noise`) | Bearer |
| `GET` | `/api/v1/alerts/` | Get active/historical alerts | Bearer |
| `GET` | `/api/v1/forecast/{location_id}` | 72-hour ML forecast + AI narrative | Bearer |
| `POST` | `/api/v1/copilot/chat` | AI CoPilot streaming response (SSE) | Bearer |
| `GET` | `/api/v1/industries/` | Industry compliance tracker | Bearer |
| `GET` | `/api/v1/public/overview` | State-wide air quality summary | Public |
| `WS` | `/ws/readings/{location_id}` | Live reading stream per station | Bearer (query param) |
| `WS` | `/ws/alerts` | Real-time violation alerts | Bearer (query param) |
| `GET` | `/health` | Health check | Public |

---

## ML Models

### Prophet — 72-Hour Forecasting

- **Trained on:** Chhattisgarh Open-Meteo historical air quality data (2020–present) for 7 cities — real coordinates, real measurements
- **Parameters forecasted:** PM2.5, PM10, SO2, NO2, CO, O3 — one model per station per parameter
- **Retraining:** Triggered via Celery task; scheduled weekly or on-demand via `/api/v1/forecast/retrain`
- **Output:** 72 hourly future points with `yhat`, `yhat_lower`, `yhat_upper` (80% confidence interval)
- **AI narrative:** Each forecast response includes a 2-sentence plain-language summary generated by Claude / GPT-4o via OpenRouter

### IsolationForest — Anomaly Detection

- **Algorithm:** Unsupervised ensemble method (100 estimators, contamination=0.05)
- **Features:** rolling 24h mean, rolling 24h std, hour-of-day, day-of-week, month, value
- **Training data:** Last 90 days of station readings (min 500 samples required)
- **Output:** `is_anomaly=TRUE` flag on `sensor_readings`; also triggers real-time alert if value > 3× 24h rolling mean
- **Retraining:** Background Celery task runs nightly

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | — | Async PostgreSQL (`postgresql+asyncpg://...`) |
| `SYNC_DATABASE_URL` | **Yes** | — | Sync PostgreSQL for Alembic (`postgresql+psycopg2://...`) |
| `REDIS_URL` | **Yes** | — | Redis URL (`redis://localhost:6379/0`) |
| `CELERY_BROKER_URL` | **Yes** | — | Celery broker (use same Redis URL) |
| `CELERY_RESULT_BACKEND` | **Yes** | — | Celery results (use same Redis URL) |
| `JWT_SECRET_KEY` | **Yes** | — | Random secret for JWT signing (32+ chars) |
| `OPENAI_API_KEY` | No | — | OpenAI API key for AI copilot |
| `OPENROUTER_API_KEY` | No | — | OpenRouter key (Claude, Gemini, GPT-4o) |
| `GEMINI_API_KEY` | No | — | Google Gemini API key |
| `GOVAPI_KEY` | No | — | data.gov.in API key for official dataset sync |
| `VITE_API_URL` | No | `http://localhost:8000` | Frontend → backend REST URL |
| `VITE_WS_URL` | No | `ws://localhost:8000` | Frontend WebSocket URL |
| `VITE_BYTEZ_API_KEY` | No | — | Bytez key for in-browser AI features |

See `.env.example` for the complete list with descriptions and defaults.

---

## Hackathon Submission Notes

**Problem Statement:** WEB 2 — PS1
**Event:** E-Cell Hackathon 2026
**Team:** PrithviNet Team

### Innovation Features

| Feature | How It Works |
|---|---|
| **72-hr AI Forecast** | Prophet trained on real Open-Meteo + CPCB data; Claude generates narrative insight via OpenRouter |
| **Real-Time AI CoPilot** | Streaming SSE chat that queries live DB readings, explains violations, and drafts compliance notices |
| **Anomaly Detection** | IsolationForest flags statistical outliers; auto-escalates if exceeds 3× rolling baseline |
| **Geo-Spatial Risk Heatmap** | Leaflet.heat overlay driven by live readings; stable values seeded at mount to prevent flicker |
| **Persistent IoT Simulation** | Simulator persists sensor baselines to disk (Docker volume) so values drift naturally on restart |
| **Fallback Data Generator** | FastAPI background task fills gaps for any station silent > 2 minutes (works without docker) |

### Judging Criteria Alignment

| Criterion | PrithviNet Feature |
|---|---|
| **Innovation** | AI copilot + ML forecast + geo-heatmap combined — no comparable open-source SPCB tool exists |
| **Technical Complexity** | Full-stack: React 19 + FastAPI + TimescaleDB + Redis + Celery + Prophet + IsolationForest |
| **Social Impact** | Addresses Korba CPArea crisis; enables SPCB to act in < 5 minutes vs 72 hours previously |
| **Scalability** | TimescaleDB hypertables + Redis pub/sub scale horizontally; Docker Compose → Kubernetes ready |
| **Completeness** | Air + Water + Noise pipelines; real Chhattisgarh data; role-based auth; PDF exports |
| **Presentation** | PARIVESH 2.0 government-grade UI; public portal; live demo with no backend needed |

---

## Project Structure

```
├── src/                           # React frontend
│   ├── pages/
│   │   ├── auth/                  # LoginPage
│   │   ├── dashboard/             # UnifiedDashboard, DashboardPage, Alerts,
│   │   │                          #   RegionalAnalytics, IndustryTracker
│   │   ├── officer/               # ForecastPage
│   │   ├── admin/                 # ComplianceDashboard
│   │   └── public/                # PublicPortal (no auth)
│   ├── components/
│   │   ├── map/                   # PollutionMap (Leaflet heatmap)
│   │   ├── charts/                # ForecastChart, TrendChart
│   │   └── copilot/               # CopilotChat (streaming SSE)
│   ├── store/                     # Zustand: auth, alerts, dataStore, readings
│   ├── hooks/                     # useWebSocket, useLiveReadings, useInterpolatedValue
│   └── lib/                       # api.ts (DEMO_MODE toggle), mockData.ts
│
├── backend/
│   ├── app/
│   │   ├── main.py                # FastAPI app + fallback data generator
│   │   ├── routers/               # 12 API routers (auth, readings, forecast, etc.)
│   │   ├── services/              # ML, anomaly, copilot, compliance
│   │   ├── models/                # SQLAlchemy ORM models
│   │   └── workers/               # Celery tasks
│   ├── iot_simulator/
│   │   ├── main.py                # Persistent asyncio simulator (TOD + seasonal + spike)
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   ├── scripts/
│   │   ├── generate_water_dataset.py   # Generates synthetic water_quality.csv
│   │   ├── import_water_chhattisgarh.py
│   │   ├── generate_noise_dataset.py   # Generates synthetic noise_data.csv
│   │   ├── import_noise_chhattisgarh.py
│   │   ├── import_air_chhattisgarh.py
│   │   ├── train_prophet_air.py
│   │   └── train_anomaly_air.py
│   ├── data/
│   │   ├── water_quality.csv       # 7 CG water stations × 5 years
│   │   └── trusted_sources/        # Real Open-Meteo + CPCB air data
│   └── alembic/                   # Database migrations
│
├── frontend/nginx.conf            # Nginx config for production deploy
├── docker-compose.yml             # TimescaleDB + Redis + IoT Simulator
├── .env.example                   # All env vars documented with defaults
└── README.md
```

---

## Enabling Real Noise Data (when backend is running)

The noise pipeline runs entirely on mock data in demo mode. To switch to real DB data:

1. Generate the dataset: `python backend/scripts/generate_noise_dataset.py`
2. Import to DB: `python backend/scripts/import_noise_chhattisgarh.py`
3. In `src/lib/api.ts` line 20, set `DEMO_MODE = false`

The frontend will then call `GET /api/v1/locations?type=noise` and `GET /api/v1/readings/` automatically.

---

## License

Developed for the E-Cell Hackathon 2026. All rights reserved.
