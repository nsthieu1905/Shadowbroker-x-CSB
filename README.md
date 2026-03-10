<p align="center">
  <h1 align="center">🛰️ S H A D O W B R O K E R</h1>
  <p align="center"><strong>Global Threat Intercept — Real-Time Geospatial Intelligence Platform</strong></p>
  <p align="center">

  </p>
</p>

---


![560645594-989008ee-c690-4cc0-aade-14c24ca82874](https://github.com/user-attachments/assets/5a879552-327f-4f66-81e9-4ae1cec9c468)



**ShadowBroker** is a real-time, multi-domain OSINT dashboard that aggregates live data from dozens of open-source intelligence feeds and renders them on a unified dark-ops map interface. It tracks aircraft, ships, satellites, earthquakes, conflict zones, CCTV networks, GPS jamming, and breaking geopolitical events — all updating in real time.

Built with **Next.js**, **MapLibre GL**, **FastAPI**, and **Python**, it's designed for analysts, researchers, and enthusiasts who want a single-pane-of-glass view of global activity.

---

## Interesting Use Cases

* Track private jets of billionaires
* Monitor satellites passing overhead and see high-resolution satellite imagery
* Nose around local emergency scanners
* Watch naval traffic worldwide
* Detect GPS jamming zones
* Follow earthquakes and disasters in real time

---

## ⚡ Quick Start (Docker or Podman)

```bash
git clone https://github.com/BigBodyCobain/Shadowbroker.git
cd Shadowbroker
./compose.sh up -d
```

Open `http://localhost:3000` to view the dashboard! *(Requires Docker or Podman)*

`compose.sh` auto-detects `docker compose`, `docker-compose`, `podman compose`, and `podman-compose`.
If both runtimes are installed, you can force Podman with `./compose.sh --engine podman up -d`.
Do not append a trailing `.` to that command; Compose treats it as a service name.

---

## ✨ Features

### 🛩️ Aviation Tracking

* **Commercial Flights** — Real-time positions via OpenSky Network (~5,000+ aircraft)
* **Private Aircraft** — Light GA, turboprops, bizjets tracked separately
* **Private Jets** — High-net-worth individual aircraft with owner identification
* **Military Flights** — Tankers, ISR, fighters, transports via adsb.lol military endpoint
* **Flight Trail Accumulation** — Persistent breadcrumb trails for all tracked aircraft
* **Holding Pattern Detection** — Automatically flags aircraft circling (>300° total turn)
* **Aircraft Classification** — Shape-accurate SVG icons: airliners, turboprops, bizjets, helicopters
* **Grounded Detection** — Aircraft below 100ft AGL rendered with grey icons

### 🚢 Maritime Tracking

* **AIS Vessel Stream** — 25,000+ vessels via aisstream.io WebSocket (real-time)
* **Ship Classification** — Cargo, tanker, passenger, yacht, military vessel types with color-coded icons
* **Carrier Strike Group Tracker** — All 11 active US Navy aircraft carriers with OSINT-estimated positions
  * Automated GDELT news scraping for carrier movement intelligence
  * 50+ geographic region-to-coordinate mappings
  * Disk-cached positions, auto-updates at 00:00 & 12:00 UTC
* **Cruise & Passenger Ships** — Dedicated layer for cruise liners and ferries
* **Clustered Display** — Ships cluster at low zoom with count labels, decluster on zoom-in

### 🛰️ Space & Satellites

* **Orbital Tracking** — Real-time satellite positions via CelesTrak TLE data + SGP4 propagation (2,000+ active satellites, no API key required)
* **Mission-Type Classification** — Color-coded by mission: military recon (red), SAR (cyan), SIGINT (white), navigation (blue), early warning (magenta), commercial imaging (green), space station (gold)

### 🌍 Geopolitics & Conflict

* **Global Incidents** — GDELT-powered conflict event aggregation (last 8 hours, ~1,000 events)
* **Ukraine Frontline** — Live warfront GeoJSON from DeepState Map
* **SIGINT/RISINT News Feed** — Real-time RSS aggregation from multiple intelligence-focused sources
* **Region Dossier** — Right-click anywhere on the map for:
  * Country profile (population, capital, languages, currencies, area)
  * Head of state & government type (Wikidata SPARQL)
  * Local Wikipedia summary with thumbnail

### 🛰️ Satellite Imagery

* **NASA GIBS (MODIS Terra)** — Daily true-color satellite imagery overlay with 30-day time slider, play/pause animation, and opacity control (~250m/pixel)
* **High-Res Satellite (Esri)** — Sub-meter resolution imagery via Esri World Imagery — zoom into buildings and terrain detail (zoom 18+)
* **Sentinel-2 Intel Card** — Right-click anywhere on the map for a floating intel card showing the latest Sentinel-2 satellite photo with capture date, cloud cover %, and clickable full-resolution image (10m resolution, updated every ~5 days)
* **SATELLITE Style Preset** — Quick-toggle high-res imagery via the STYLE button (DEFAULT → SATELLITE → FLIR → NVG → CRT)

### 📻 Software-Defined Radio (SDR)

* **KiwiSDR Receivers** — 500+ public SDR receivers plotted worldwide with clustered amber markers
* **Live Radio Tuner** — Click any KiwiSDR node to open an embedded SDR tuner directly in the SIGINT panel
* **Metadata Display** — Node name, location, antenna type, frequency bands, active users

### 📷 Surveillance

* **CCTV Mesh** — 2,000+ live traffic cameras from:
  * 🇬🇧 Transport for London JamCams
  * 🇺🇸 Austin, TX TxDOT
  * 🇺🇸 NYC DOT
  * 🇸🇬 Singapore LTA
  * Custom URL ingestion
* **Feed Rendering** — Automatic detection & rendering of video, MJPEG, HLS, embed, satellite tile, and image feeds
* **Clustered Map Display** — Green dots cluster with count labels, decluster on zoom

### 📡 Signal Intelligence

* **GPS Jamming Detection** — Real-time analysis of aircraft NAC-P (Navigation Accuracy Category) values
  * Grid-based aggregation identifies interference zones
  * Red overlay squares with "GPS JAM XX%" severity labels
* **Radio Intercept Panel** — Scanner-style UI for monitoring communications

### 🌐 Additional Layers

* **Earthquakes (24h)** — USGS real-time earthquake feed with magnitude-scaled markers
* **Day/Night Cycle** — Solar terminator overlay showing global daylight/darkness
* **Global Markets Ticker** — Live financial market indices (minimizable)
* **Measurement Tool** — Point-to-point distance & bearing measurement on the map
* **LOCATE Bar** — Search by coordinates (31.8, 34.8) or place name (Tehran, Strait of Hormuz) to fly directly to any location — geocoded via OpenStreetMap Nominatim

![Gaza](https://github.com/user-attachments/assets/f2c953b2-3528-4360-af5a-7ea34ff28489)

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────┐
│                   FRONTEND (Next.js)                   │
│                                                        │
│  ┌─────────────┐    ┌──────────┐    ┌───────────────┐  │
│  │ MapLibre GL │    │ NewsFeed │    │ Control Panels│  │
│  │  2D WebGL   │    │  SIGINT  │    │ Layers/Filters│  │
│  │ Map Render  │    │  Intel   │    │ Markets/Radio │  │
│  └──────┬──────┘    └────┬─────┘    └───────┬───────┘  │
│         └────────────────┼──────────────────┘          │
│                          │ REST API (60s / 120s)       │
├──────────────────────────┼─────────────────────────────┤
│                    BACKEND (FastAPI)                   │
│                          │                             │
│  ┌───────────────────────┼──────────────────────────┐  │
│  │               Data Fetcher (Scheduler)           │  │
│  │                                                  │  │
│  │  ┌──────────┬──────────┬──────────┬───────────┐  │  │
│  │  │ OpenSky  │ adsb.lol │CelesTrak │   USGS    │  │  │
│  │  │ Flights  │ Military │   Sats   │  Quakes   │  │  │
│  │  ├──────────┼──────────┼──────────┼───────────┤  │  │
│  │  │  AIS WS  │ Carrier  │  GDELT   │   CCTV    │  │  │
│  │  │  Ships   │ Tracker  │ Conflict │  Cameras  │  │  │
│  │  ├──────────┼──────────┼──────────┼───────────┤  │  │
│  │  │ DeepState│   RSS    │  Region  │    GPS    │  │  │
│  │  │ Frontline│  Intel   │ Dossier  │  Jamming  │  │  │
│  │  └──────────┴──────────┴──────────┴───────────┘  │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

---

## 📊 Data Sources & APIs

| Source | Data | Update Frequency | API Key Required |
|---|---|---|---|
| [OpenSky Network](https://opensky-network.org) | Commercial & private flights | ~60s | Optional (anonymous limited) |
| [adsb.lol](https://adsb.lol) | Military aircraft | ~60s | No |
| [aisstream.io](https://aisstream.io) | AIS vessel positions | Real-time WebSocket | **Yes** |
| [CelesTrak](https://celestrak.org) | Satellite orbital positions (TLE + SGP4) | ~60s | No |
| [USGS Earthquake](https://earthquake.usgs.gov) | Global seismic events | ~60s | No |
| [GDELT Project](https://www.gdeltproject.org) | Global conflict events | ~6h | No |
| [DeepState Map](https://deepstatemap.live) | Ukraine frontline | ~30min | No |
| [Transport for London](https://api.tfl.gov.uk) | London CCTV JamCams | ~5min | No |
| [TxDOT](https://its.txdot.gov) | Austin TX traffic cameras | ~5min | No |
| [NYC DOT](https://webcams.nyctmc.org) | NYC traffic cameras | ~5min | No |
| [Singapore LTA](https://datamall.lta.gov.sg) | Singapore traffic cameras | ~5min | **Yes** |
| [RestCountries](https://restcountries.com) | Country profile data | On-demand (cached 24h) | No |
| [Wikidata SPARQL](https://query.wikidata.org) | Head of state data | On-demand (cached 24h) | No |
| [Wikipedia API](https://en.wikipedia.org/api) | Location summaries & aircraft images | On-demand (cached) | No |
| [NASA GIBS](https://gibs.earthdata.nasa.gov) | MODIS Terra daily satellite imagery | Daily (24-48h delay) | No |
| [Esri World Imagery](https://www.arcgis.com) | High-res satellite basemap | Static (periodically updated) | No |
| [MS Planetary Computer](https://planetarycomputer.microsoft.com) | Sentinel-2 L2A scenes (right-click) | On-demand | No |
| [KiwiSDR](https://kiwisdr.com) | Public SDR receiver locations | ~30min | No |
| [OSM Nominatim](https://nominatim.openstreetmap.org) | Place name geocoding (LOCATE bar) | On-demand | No |
| [CARTO Basemaps](https://carto.com) | Dark map tiles | Continuous | No |

---

## 🚀 Getting Started

### 🐳 Docker / Podman Setup (Recommended for Self-Hosting)

The repo includes a `docker-compose.yml` that builds both images locally.

```bash
git clone https://github.com/BigBodyCobain/Shadowbroker.git
cd Shadowbroker
# Add your API keys in a repo-root .env file (optional — see Environment Variables below)
./compose.sh up -d
```

Open `http://localhost:3000` to view the dashboard.

> **Deploying publicly or on a LAN?** The frontend **auto-detects** the
> backend — it uses your browser's hostname with port `8000`
> (e.g. if you visit `http://192.168.1.50:3000`, API calls go to
> `http://192.168.1.50:8000`). **No configuration needed** for most setups.
>
> If your backend runs on a **different port or host** (reverse proxy,
> custom Docker port mapping, separate server), set `NEXT_PUBLIC_API_URL`:
>
> ```bash
> # Linux / macOS
> NEXT_PUBLIC_API_URL=http://myserver.com:9096 docker-compose up -d --build
>
> # Podman (via compose.sh wrapper)
> NEXT_PUBLIC_API_URL=http://192.168.1.50:9096 ./compose.sh up -d --build
>
> # Windows (PowerShell)
> $env:NEXT_PUBLIC_API_URL="http://myserver.com:9096"; docker-compose up -d --build
>
> # Or add to a .env file next to docker-compose.yml:
> # NEXT_PUBLIC_API_URL=http://myserver.com:9096
> ```
>
> This is a **build-time** variable (Next.js limitation) — it gets baked into
> the frontend during `npm run build`. Changing it requires a rebuild.

If you prefer to call the container engine directly, Podman users can run `podman compose up -d`, or force the wrapper to use Podman with `./compose.sh --engine podman up -d`.
Depending on your local Podman configuration, `podman compose` may still delegate to an external compose provider while talking to the Podman socket.

---

### 📦 Quick Start (No Code Required)

If you just want to run the dashboard without dealing with terminal commands:

1. Go to the **[Releases](../../releases)** tab on the right side of this GitHub page.
2. Download the latest `.zip` file from the release.
3. Extract the folder to your computer.
4. **Windows:** Double-click `start.bat`.
   **Mac/Linux:** Open terminal, type `chmod +x start.sh`, and run `./start.sh`.
5. It will automatically install everything and launch the dashboard!

---

### 💻 Developer Setup

If you want to modify the code or run from source:

#### Prerequisites

* **Node.js** 18+ and **npm** — [nodejs.org](https://nodejs.org/)
* **Python** 3.10, 3.11, or 3.12 with `pip` — [python.org](https://www.python.org/downloads/) (**check "Add to PATH"** during install)
  * ⚠️ Python 3.13+ may have compatibility issues with some dependencies. **3.11 or 3.12 is recommended.**
* API keys for: `aisstream.io` (required), and optionally `opensky-network.org` (OAuth2), `lta.gov.sg`

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/shadowbroker.git
cd shadowbroker/live-risk-dashboard

# Backend setup
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt   # includes pystac-client for Sentinel-2

# Create .env with your API keys
echo "AIS_API_KEY=your_aisstream_key" >> .env
echo "OPENSKY_CLIENT_ID=your_opensky_client_id" >> .env
echo "OPENSKY_CLIENT_SECRET=your_opensky_secret" >> .env

# Frontend setup
cd ../frontend
npm install
```

### Running

```bash
# From the frontend directory — starts both frontend & backend concurrently
npm run dev
```

This starts:

* **Next.js** frontend on `http://localhost:3000`
* **FastAPI** backend on `http://localhost:8000`

---

## 🎛️ Data Layers

All layers are independently toggleable from the left panel:

| Layer | Default | Description |
|---|---|---|
| Commercial Flights | ✅ ON | Airlines, cargo, GA aircraft |
| Private Flights | ✅ ON | Non-commercial private aircraft |
| Private Jets | ✅ ON | High-value bizjets with owner data |
| Military Flights | ✅ ON | Military & government aircraft |
| Tracked Aircraft | ✅ ON | Special interest watch list |
| Satellites | ✅ ON | Orbital assets by mission type |
| Carriers / Mil / Cargo | ✅ ON | Navy carriers, cargo ships, tankers |
| Civilian Vessels | ❌ OFF | Yachts, fishing, recreational |
| Cruise / Passenger | ✅ ON | Cruise ships and ferries |
| Earthquakes (24h) | ✅ ON | USGS seismic events |
| CCTV Mesh | ❌ OFF | Surveillance camera network |
| Ukraine Frontline | ✅ ON | Live warfront positions |
| Global Incidents | ✅ ON | GDELT conflict events |
| GPS Jamming | ✅ ON | NAC-P degradation zones |
| MODIS Terra (Daily) | ❌ OFF | NASA GIBS daily satellite imagery |
| High-Res Satellite | ❌ OFF | Esri sub-meter satellite imagery |
| KiwiSDR Receivers | ❌ OFF | Public SDR radio receivers |
| Day / Night Cycle | ✅ ON | Solar terminator overlay |

---

## 🔧 Performance

The platform is optimized for handling massive real-time datasets:

* **Gzip Compression** — API payloads compressed ~92% (11.6 MB → 915 KB)
* **ETag Caching** — `304 Not Modified` responses skip redundant JSON parsing
* **Viewport Culling** — Only features within the visible map bounds (+20% buffer) are rendered
* **Clustered Rendering** — Ships, CCTV, and earthquakes use MapLibre clustering to reduce feature count
* **Debounced Viewport Updates** — 300ms debounce prevents GeoJSON rebuild thrash during pan/zoom
* **Position Interpolation** — Smooth 10s tick animation between data refreshes
* **React.memo** — Heavy components wrapped to prevent unnecessary re-renders
* **Coordinate Precision** — Lat/lng rounded to 5 decimals (~1m) to reduce JSON size

---

## 📁 Project Structure

```
live-risk-dashboard/
├── backend/
│   ├── main.py                     # FastAPI app, middleware, API routes
│   ├── carrier_cache.json          # Persisted carrier OSINT positions
│   ├── cctv.db                     # SQLite CCTV camera database
│   └── services/
│       ├── data_fetcher.py         # Core scheduler — fetches all data sources
│       ├── ais_stream.py           # AIS WebSocket client (25K+ vessels)
│       ├── carrier_tracker.py      # OSINT carrier position tracker
│       ├── cctv_pipeline.py        # Multi-source CCTV camera ingestion
│       ├── geopolitics.py          # GDELT + Ukraine frontline fetcher
│       ├── region_dossier.py       # Right-click country/city intelligence
│       ├── radio_intercept.py      # Scanner radio feed integration
│       ├── kiwisdr_fetcher.py      # KiwiSDR receiver scraper
│       ├── sentinel_search.py      # Sentinel-2 STAC imagery search
│       ├── network_utils.py        # HTTP client with curl fallback
│       └── api_settings.py         # API key management
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   └── page.tsx            # Main dashboard — state, polling, layout
│   │   └── components/
│   │       ├── MaplibreViewer.tsx   # Core map — 2,000+ lines, all GeoJSON layers
│   │       ├── NewsFeed.tsx         # SIGINT feed + entity detail panels
│   │       ├── WorldviewLeftPanel.tsx   # Data layer toggles
│   │       ├── WorldviewRightPanel.tsx  # Search + filter sidebar
│   │       ├── FilterPanel.tsx     # Basic layer filters
│   │       ├── AdvancedFilterModal.tsx  # Airport/country/owner filtering
│   │       ├── MapLegend.tsx       # Dynamic legend with all icons
│   │       ├── MarketsPanel.tsx    # Global financial markets ticker
│   │       ├── RadioInterceptPanel.tsx # Scanner-style radio panel
│   │       ├── FindLocateBar.tsx   # Search/locate bar
│   │       ├── ChangelogModal.tsx  # Version changelog popup
│   │       ├── SettingsPanel.tsx   # App settings
│   │       ├── ScaleBar.tsx        # Map scale indicator
│   │       ├── WikiImage.tsx       # Wikipedia image fetcher
│   │       └── ErrorBoundary.tsx   # Crash recovery wrapper
│   └── package.json
```

---

## 🔑 Environment Variables

### Backend (`backend/.env`)

```env
# Required
AIS_API_KEY=your_aisstream_key                # Maritime vessel tracking (aisstream.io)

# Optional (enhances data quality)
OPENSKY_CLIENT_ID=your_opensky_client_id      # OAuth2 — higher rate limits for flight data
OPENSKY_CLIENT_SECRET=your_opensky_secret     # OAuth2 — paired with Client ID above
LTA_ACCOUNT_KEY=your_lta_key                  # Singapore CCTV cameras
```

### Frontend (optional)

| Variable | Where to set | Purpose |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `.env` next to `docker-compose.yml`, or shell env | Override backend URL when deploying publicly or behind a reverse proxy. Leave unset for auto-detection. |

**How auto-detection works:** When `NEXT_PUBLIC_API_URL` is not set, the frontend
reads `window.location.hostname` in the browser and calls `{protocol}//{hostname}:8000`.
This means the dashboard works on `localhost`, LAN IPs, and public domains without
any configuration — as long as the backend is reachable on port 8000 of the same host.

---

## ⚠️ Disclaimer

This is an **educational and research tool** built entirely on publicly available, open-source intelligence (OSINT) data. No classified, restricted, or non-public data sources are used. Carrier positions are estimates based on public reporting. The military-themed UI is purely aesthetic.

**Do not use this tool for any operational, military, or intelligence purpose.**

---

## 📜 License

This project is for educational and personal research purposes. See individual API provider terms of service for data usage restrictions.

---

<p align="center">
  <sub>Built with ☕ and too many API calls</sub>
</p>
