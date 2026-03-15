# PrithviNet
### Mid-Evaluation Progress Report

**Project Focus:** Real-time National Environmental Monitoring System (CECB, Chhattisgarh)

---

## 1. Technological Stack

### Frontend Ecosystem
* **React 19 & TypeScript:** Provides a highly responsive, strictly-typed user interface architecture avoiding runtime errors.
* **Vite:** Modern frontend tooling leveraging ES modules for rapid compilation and hot module replacement.
* **Tailwind CSS:** Custom, fully responsive, utility-first styling without large CSS overheads.
* **Leaflet (React-Leaflet) & Heatmaps:** Renders high-fidelity, interactive geographical heatmaps for active pollutant distribution points.

### Backend Ecosystem
* **Python & FastAPI:** High-performance, highly concurrent ASGI web framework orchestrating complex REST, SSE, and WebSocket endpoints.
* **PostgreSQL + TimescaleDB:** Purpose-built time-series database architecture. Currently optimized to seamlessly handle massive query volumes (seeded with 104,000+ rows of granular 180-day hourly sensor history data).
* **SQLAlchemy & Asyncpg:** Fully asynchronous Object-Relational Mapping (ORM) handling smooth, scalable database connection pooling.
* **Redis:** In-memory key-value data store leveraged aggressively for caching high-load public map overviews, preventing database-level exhaustion during active polling.

### AI & Predictive Forecasting
* **Facebook Prophet (Python):** End-to-end time-series forecasting algorithms that dynamically generate custom 3-day (48-72 hr) future predictions. Isolated binary `.pkl` models are independently trained natively for exact regional coordinates based on specific, unique node datasets.

---

## 2. Key Implemented Features

* **Authentic Geo-Spatial Mapping:** Digested officially verified Government datasets to accurately plot precise geospatial nodes (ex. Bhilai, Raipur, Tumidih) onto a dynamic layout rendering exact latitude/longitude clusters.
* **Strict Indian CPCB AQI Standardization:** Rebuilt core backend mathematical equations overriding broad global standards. Now structurally translates raw $PM2.5$ ($µg/m^3$) metrics into the authorized Indian Air Quality Index. Actively triggers certified visual and semantic categories (Good, Satisfactory, Moderate, Poor, Very Poor, Severe).
* **Real-Time Data Streaming:** Implemented persistent frontend background network pooling processes (10-second `setInterval` streams) intricately patched into asynchronous backend routers to keep visual interface nodes completely synchronized as native metrics trigger.
* **Granular Historical Data Seeding:** Completely decoupled default structural databases to ingest natively formatted, structured `.csv` records, laying ground for high-accuracy ML simulations extending back 6 months.

---

## 3. Data Integrity & Deployment Structuring
Robust structural decisions include separating backend dependency injection bounds (via internal `.venv` instances), configuring active data-caching layers (Redis flushes triggered exactly on structural schema modifications), mapping full `docker-compose.yml` clusters, and providing independent build chains ensuring rapid progression towards production readiness.