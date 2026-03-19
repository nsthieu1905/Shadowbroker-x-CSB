"use client";

import { useEffect, useState, useRef, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import WorldviewLeftPanel from "@/components/WorldviewLeftPanel";

import NewsFeed from "@/components/NewsFeed";
import FilterPanel from "@/components/FilterPanel";
import FindLocateBar from "@/components/FindLocateBar";
import SettingsPanel from "@/components/SettingsPanel";
import MapLegend from "@/components/MapLegend";
import ScaleBar from "@/components/ScaleBar";
import ErrorBoundary from "@/components/ErrorBoundary";
import { DashboardDataProvider } from "@/lib/DashboardDataContext";
import OnboardingModal, { useOnboarding } from "@/components/OnboardingModal";
import ChangelogModal, { useChangelog } from "@/components/ChangelogModal";
import type { SelectedEntity } from "@/types/dashboard";
import type { KiwiSDR } from "@/types/dashboard";
import { NOMINATIM_DEBOUNCE_MS } from "@/lib/constants";
import { useDataPolling } from "@/hooks/useDataPolling";
import { useReverseGeocode } from "@/hooks/useReverseGeocode";
import { useRegionDossier } from "@/hooks/useRegionDossier";

const ACTIVE_FILTERS_STORAGE_KEY = "sb_active_filters_v1";
const ACTIVE_LAYERS_STORAGE_KEY = "sb_active_layers_v1";

const DEFAULT_ACTIVE_LAYERS = {
  flights: true,
  private: true,
  jets: true,
  military: true,
  tracked: true,
  satellites: true,
  ships_military: true,
  ships_cargo: true,
  ships_civilian: false,
  ships_passenger: true,
  ships_tracked_yachts: true,
  earthquakes: true,
  cctv: false,
  ukraine_frontline: true,
  global_incidents: true,
  day_night: true,
  gps_jamming: true,
  gibs_imagery: false,
  highres_satellite: false,
  kiwisdr: false,
  firms: false,
  internet_outages: false,
  datacenters: false,
};

function loadActiveFilters(): Record<string, string[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(ACTIVE_FILTERS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};

    const out: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof k !== "string") continue;
      if (!Array.isArray(v)) continue;
      const arr = (v as unknown[]).filter((x) => typeof x === "string") as string[];
      if (arr.length > 0) out[k] = arr;
    }
    return out;
  } catch {
    return {};
  }
}

function saveActiveFilters(filters: Record<string, string[]>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_FILTERS_STORAGE_KEY, JSON.stringify(filters || {}));
  } catch {
    // ignore quota/serialization errors
  }
}

function loadActiveLayers(): typeof DEFAULT_ACTIVE_LAYERS {
  if (typeof window === "undefined") return { ...DEFAULT_ACTIVE_LAYERS };
  try {
    const raw = window.localStorage.getItem(ACTIVE_LAYERS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ACTIVE_LAYERS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_ACTIVE_LAYERS };

    const parsedObj = parsed as Record<string, unknown>;

    const next = { ...DEFAULT_ACTIVE_LAYERS };
    for (const key of Object.keys(DEFAULT_ACTIVE_LAYERS) as Array<keyof typeof DEFAULT_ACTIVE_LAYERS>) {
      const v = parsedObj[String(key)];
      if (typeof v === "boolean") next[key] = v;
    }
    return next;
  } catch {
    return { ...DEFAULT_ACTIVE_LAYERS };
  }
}

function saveActiveLayers(layers: typeof DEFAULT_ACTIVE_LAYERS) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_LAYERS_STORAGE_KEY, JSON.stringify(layers || DEFAULT_ACTIVE_LAYERS));
  } catch {
    // ignore quota/serialization errors
  }
}

const _SB_STORAGE_EVENT = "sb_local_storage_change";

function _emitStorageChange() {
  if (typeof window === "undefined") return;
  try {
    // Defer notification so we don't trigger store updates during React render.
    // Some call sites update multiple pieces of state in one handler.
    if (typeof queueMicrotask === "function") {
      queueMicrotask(() => {
        try {
          window.dispatchEvent(new Event(_SB_STORAGE_EVENT));
        } catch {
          // ignore
        }
      });
    } else {
      setTimeout(() => {
        try {
          window.dispatchEvent(new Event(_SB_STORAGE_EVENT));
        } catch {
          // ignore
        }
      }, 0);
    }
  } catch {
    // ignore
  }
}

type ActiveFiltersState = Record<string, string[]>;
type ActiveLayersState = typeof DEFAULT_ACTIVE_LAYERS;

const _SERVER_FILTERS_SNAPSHOT: ActiveFiltersState = {};
const _SERVER_LAYERS_SNAPSHOT: ActiveLayersState = { ...DEFAULT_ACTIVE_LAYERS };

const _activeFiltersStore: { current: ActiveFiltersState } = { current: {} };
const _activeLayersStore: { current: ActiveLayersState } = { current: { ...DEFAULT_ACTIVE_LAYERS } };

function _hydrateFiltersStoreFromLocalStorage() {
  _activeFiltersStore.current = loadActiveFilters();
  _emitStorageChange();
}

function _hydrateLayersStoreFromLocalStorage() {
  _activeLayersStore.current = loadActiveLayers();
  _emitStorageChange();
}

function useActiveFiltersStore(): [ActiveFiltersState, React.Dispatch<React.SetStateAction<ActiveFiltersState>>] {
  const subscribe = (onStoreChange: () => void) => {
    if (typeof window === "undefined") return () => {};
    const handler = () => onStoreChange();
    window.addEventListener("storage", handler);
    window.addEventListener(_SB_STORAGE_EVENT, handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener(_SB_STORAGE_EVENT, handler);
    };
  };

  const filters = useSyncExternalStore(
    subscribe,
    () => _activeFiltersStore.current,
    () => _SERVER_FILTERS_SNAPSHOT,
  );
  const setFilters: React.Dispatch<React.SetStateAction<ActiveFiltersState>> = (next) => {
    const resolved = typeof next === "function" ? next(_activeFiltersStore.current) : next;
    const safe = (resolved || {}) as ActiveFiltersState;
    _activeFiltersStore.current = safe;
    saveActiveFilters(safe);
    _emitStorageChange();
  };
  return [filters, setFilters];
}

function useActiveLayersStore(): [ActiveLayersState, React.Dispatch<React.SetStateAction<ActiveLayersState>>] {
  const subscribe = (onStoreChange: () => void) => {
    if (typeof window === "undefined") return () => {};
    const handler = () => onStoreChange();
    window.addEventListener("storage", handler);
    window.addEventListener(_SB_STORAGE_EVENT, handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener(_SB_STORAGE_EVENT, handler);
    };
  };

  const layers = useSyncExternalStore(
    subscribe,
    () => _activeLayersStore.current,
    () => _SERVER_LAYERS_SNAPSHOT,
  );
  const setLayers: React.Dispatch<React.SetStateAction<ActiveLayersState>> = (next) => {
    const resolved = typeof next === "function" ? next(_activeLayersStore.current) : next;
    const safe = (resolved || { ...DEFAULT_ACTIVE_LAYERS }) as ActiveLayersState;
    _activeLayersStore.current = safe;
    saveActiveLayers(safe);
    _emitStorageChange();
  };
  return [layers, setLayers];
}

// Use dynamic loads for Maplibre to avoid SSR window is not defined errors
const MaplibreViewer = dynamic(() => import("@/components/MaplibreViewer"), { ssr: false });

/* ── LOCATE BAR ── coordinate / place-name search above bottom status bar ── */
function LocateBar({ onLocate }: { onLocate: (lat: number, lng: number) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [results, setResults] = useState<{ label: string; lat: number; lng: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Parse raw coordinate input: "31.8, 34.8" or "31.8 34.8" or "-12.3, 45.6"
  const parseCoords = (s: string): { lat: number; lng: number } | null => {
    const m = s.trim().match(/^([+-]?\d+\.?\d*)[,\s]+([+-]?\d+\.?\d*)$/);
    if (!m) return null;
    const lat = parseFloat(m[1]),
      lng = parseFloat(m[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
    return null;
  };

  const handleSearch = async (q: string) => {
    setValue(q);
    // Check for raw coordinates first
    const coords = parseCoords(q);
    if (coords) {
      setResults([{ label: `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`, ...coords }]);
      return;
    }
    // Geocode with Nominatim (debounced)
    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5`,
          {
            headers: { "Accept-Language": "vi" },
          },
        );
        const data = await res.json();
        setResults(
          data.map((r: { display_name: string; lat: string; lon: string }) => ({
            label: r.display_name,
            lat: parseFloat(r.lat),
            lng: parseFloat(r.lon),
          })),
        );
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, NOMINATIM_DEBOUNCE_MS);
  };

  const handleSelect = (r: { lat: number; lng: number }) => {
    onLocate(r.lat, r.lng);
    setOpen(false);
    setValue("");
    setResults([]);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-[var(--bg-primary)]/60 backdrop-blur-md border border-[var(--border-primary)] rounded-lg px-3 py-1.5 text-[9px] font-mono tracking-[0.15em] text-[var(--text-muted)] hover:text-cyan-400 hover:border-cyan-800 transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        TÌM
      </button>
    );
  }

  return (
    <div className="relative w-[420px]">
      <div className="flex items-center gap-2 bg-[var(--bg-primary)]/80 backdrop-blur-md border border-cyan-800/60 rounded-lg px-3 py-2 shadow-[0_0_20px_rgba(0,255,255,0.1)]">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-cyan-500 flex-shrink-0"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => handleSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setValue("");
              setResults([]);
            }
            if (e.key === "Enter" && results.length > 0) handleSelect(results[0]);
          }}
          placeholder="Nhập tọa độ (31.8, 34.8) hoặc tên địa điểm..."
          className="flex-1 bg-transparent text-[10px] text-[var(--text-primary)] font-mono tracking-wider outline-none placeholder:text-[var(--text-muted)]"
        />
        {loading && <div className="w-3 h-3 border border-cyan-500 border-t-transparent rounded-full animate-spin" />}
        <button
          onClick={() => {
            setOpen(false);
            setValue("");
            setResults([]);
          }}
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
      {results.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-[var(--bg-secondary)]/95 backdrop-blur-md border border-[var(--border-primary)] rounded-lg overflow-hidden shadow-[0_-8px_30px_rgba(0,0,0,0.4)] max-h-[200px] overflow-y-auto styled-scrollbar">
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => handleSelect(r)}
              className="w-full text-left px-3 py-2 hover:bg-cyan-950/40 transition-colors border-b border-[var(--border-primary)]/50 last:border-0 flex items-center gap-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-cyan-500 flex-shrink-0"
              >
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span className="text-[9px] text-[var(--text-secondary)] font-mono truncate">{r.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { data, backendStatus } = useDataPolling();
  const { mouseCoords, locationLabel, handleMouseCoords } = useReverseGeocode();
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);
  const [trackedSdr, setTrackedSdr] = useState<KiwiSDR | null>(null);
  const { regionDossier, regionDossierLoading, handleMapRightClick } = useRegionDossier(
    selectedEntity,
    setSelectedEntity,
  );

  const [uiVisible, setUiVisible] = useState(true);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [mapView, setMapView] = useState({ zoom: 2, latitude: 20 });
  const [measureMode, setMeasureMode] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<{ lat: number; lng: number }[]>([]);

  const [activeLayers, setActiveLayers] = useActiveLayersStore();

  // NASA GIBS satellite imagery state
  const [gibsDate, setGibsDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [gibsOpacity, setGibsOpacity] = useState(0.6);

  const [effects] = useState({
    bloom: true,
  });

  const [activeStyle, setActiveStyle] = useState("DEFAULT");
  const stylesList = ["DEFAULT", "SATELLITE"];

  const cycleStyle = () => {
    setActiveStyle((prev) => {
      const idx = stylesList.indexOf(prev);
      const next = stylesList[(idx + 1) % stylesList.length];
      // Auto-toggle High-Res Satellite layer with SATELLITE style
      setActiveLayers((l) => ({ ...l, highres_satellite: next === "SATELLITE" }));
      return next;
    });
  };

  const [activeFilters, setActiveFilters] = useActiveFiltersStore();
  const [flyToLocation, setFlyToLocation] = useState<{ lat: number; lng: number; ts: number } | null>(null);

  useEffect(() => {
    _hydrateLayersStoreFromLocalStorage();
    _hydrateFiltersStoreFromLocalStorage();
  }, []);

  // Eavesdrop Mode State
  const [isEavesdropping, setIsEavesdropping] = useState(false);
  const [eavesdropLocation, setEavesdropLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [cameraCenter, setCameraCenter] = useState<{ lat: number; lng: number } | null>(null);

  // Onboarding & connection status
  const { showOnboarding, setShowOnboarding } = useOnboarding();
  const { showChangelog, setShowChangelog } = useChangelog();

  return (
    <DashboardDataProvider data={data} selectedEntity={selectedEntity} setSelectedEntity={setSelectedEntity}>
      <main
        className="fixed inset-0 w-full h-full bg-[var(--bg-primary)] overflow-hidden font-sans"
        suppressHydrationWarning
      >
        {/* MAPLIBRE WEBGL OVERLAY */}
        <ErrorBoundary name="Map">
          <MaplibreViewer
            data={data}
            activeLayers={activeLayers}
            activeFilters={activeFilters}
            effects={{ ...effects, bloom: effects.bloom && activeStyle !== "DEFAULT", style: activeStyle }}
            onEntityClick={setSelectedEntity}
            selectedEntity={selectedEntity}
            flyToLocation={flyToLocation}
            gibsDate={gibsDate}
            gibsOpacity={gibsOpacity}
            isEavesdropping={isEavesdropping}
            onEavesdropClick={setEavesdropLocation}
            onCameraMove={setCameraCenter}
            onMouseCoords={handleMouseCoords}
            onRightClick={handleMapRightClick}
            regionDossier={regionDossier}
            regionDossierLoading={regionDossierLoading}
            onViewStateChange={setMapView}
            measureMode={measureMode}
            onMeasureClick={(pt: { lat: number; lng: number }) => {
              setMeasurePoints((prev) => (prev.length >= 3 ? prev : [...prev, pt]));
            }}
            measurePoints={measurePoints}
            trackedSdr={trackedSdr}
            setTrackedSdr={setTrackedSdr}
          />
        </ErrorBoundary>

        {uiVisible && (
          <>
            {/* WORLDVIEW HEADER */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1 }}
              className="absolute top-6 left-6 z-[200] pointer-events-none flex items-center gap-4 hud-zone"
            >
              <div className="w-8 h-8 flex items-center justify-center">
                {/* Target Reticle Icon */}
                <div className="w-6 h-6 rounded-full border border-cyan-500 relative flex items-center justify-center">
                  <div className="w-4 h-4 rounded-full bg-cyan-500/30"></div>
                  <div className="absolute top-[-2px] bottom-[-2px] w-[1px] bg-cyan-500"></div>
                  <div className="absolute left-[-2px] right-[-2px] h-[1px] bg-cyan-500"></div>
                </div>
              </div>
              <div className="flex flex-col">
                <h1
                  className="text-2xl font-bold tracking-wider text-white flex items-center gap-3"
                  style={{ fontFamily: "monospace" }}
                >
                  Phần mềm giám sát FLYT
                </h1>
                <div className="text-[9px] text-white font-mono tracking-[0.25em] mt-1 ml-0.5">
                  Cảnh sát biển Việt Nam
                </div>
              </div>
            </motion.div>

            {/* SYSTEM METRICS TOP LEFT */}
            <div className="absolute top-2 left-6 text-[8px] font-mono tracking-widest text-cyan-500/50 z-[200] pointer-events-none hud-zone">
              OPTIC VIS:113 SRC:180 DENS:1.42 0.8ms
            </div>

            {/* SYSTEM METRICS TOP RIGHT */}
            <div className="absolute top-2 right-6 text-[9px] flex flex-col items-end font-mono tracking-widest text-[var(--text-muted)] z-[200] pointer-events-none hud-zone">
              <div>RTX</div>
              <div>VSR</div>
            </div>

            {/* LEFT HUD CONTAINER — slides off left edge when hidden */}
            <motion.div
              className="absolute left-6 top-24 bottom-6 w-80 flex flex-col gap-6 z-[200] pointer-events-none hud-zone"
              animate={{ x: leftOpen ? 0 : -360 }}
              transition={{ type: "spring", damping: 30, stiffness: 250 }}
            >
              {/* LEFT PANEL - DATA LAYERS */}
              <ErrorBoundary name="WorldviewLeftPanel">
                <WorldviewLeftPanel
                  data={data}
                  activeLayers={activeLayers}
                  setActiveLayers={setActiveLayers}
                  onSettingsClick={() => setSettingsOpen(true)}
                  onLegendClick={() => setLegendOpen(true)}
                  gibsDate={gibsDate}
                  setGibsDate={setGibsDate}
                  gibsOpacity={gibsOpacity}
                  setGibsOpacity={setGibsOpacity}
                  onEntityClick={setSelectedEntity}
                  onFlyTo={(lat, lng) => setFlyToLocation({ lat, lng, ts: Date.now() })}
                  trackedSdr={trackedSdr}
                  setTrackedSdr={setTrackedSdr}
                />
              </ErrorBoundary>
            </motion.div>

            {/* LEFT SIDEBAR TOGGLE TAB */}
            <motion.div
              className="absolute left-0 top-1/2 -translate-y-1/2 z-[201] pointer-events-auto hud-zone"
              animate={{ x: leftOpen ? 344 : 0 }}
              transition={{ type: "spring", damping: 30, stiffness: 250 }}
            >
              <button
                onClick={() => setLeftOpen(!leftOpen)}
                className="flex flex-col items-center gap-1.5 py-5 px-1.5 bg-cyan-400 border border-cyan-400 border-l-0 rounded-r-md text-black hover:bg-cyan-300 hover:border-cyan-300 transition-colors shadow-[2px_0_12px_rgba(0,0,0,0.4)]"
              >
                {leftOpen ? <ChevronLeft size={10} /> : <ChevronRight size={10} />}
                <span
                  className="text-[7px] font-mono tracking-[0.2em] font-bold text-black"
                  style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                >
                  LỚP
                </span>
              </button>
            </motion.div>

            {/* RIGHT SIDEBAR TOGGLE TAB */}
            <motion.div
              className="absolute right-0 top-1/2 -translate-y-1/2 z-[201] pointer-events-auto hud-zone"
              animate={{ x: rightOpen ? -344 : 0 }}
              transition={{ type: "spring", damping: 30, stiffness: 250 }}
            >
              <button
                onClick={() => setRightOpen(!rightOpen)}
                className="flex flex-col items-center gap-1.5 py-5 px-1.5 bg-cyan-400 border border-cyan-400 border-r-0 rounded-l-md text-black hover:bg-cyan-300 hover:border-cyan-300 transition-colors shadow-[-2px_0_12px_rgba(0,0,0,0.4)]"
              >
                {rightOpen ? <ChevronRight size={10} /> : <ChevronLeft size={10} />}
                <span
                  className="text-[7px] font-mono tracking-[0.2em] font-bold text-black"
                  style={{ writingMode: "vertical-rl" }}
                >
                  TIN
                </span>
              </button>
            </motion.div>

            {/* RIGHT HUD CONTAINER — slides off right edge when hidden */}
            <motion.div
              className="absolute right-6 top-24 bottom-6 w-80 flex flex-col gap-4 z-[200] pointer-events-auto overflow-y-auto styled-scrollbar pr-2 hud-zone"
              animate={{ x: rightOpen ? 0 : 360 }}
              transition={{ type: "spring", damping: 30, stiffness: 250 }}
            >
              {/* FIND / LOCATE */}
              <div className="flex-shrink-0">
                <FindLocateBar
                  data={data}
                  onLocate={(lat, lng) => {
                    setFlyToLocation({ lat, lng, ts: Date.now() });
                  }}
                  onFilter={(filterKey, value) => {
                    setActiveFilters((prev) => {
                      const current = prev[filterKey] || [];
                      if (!current.includes(value)) {
                        return { ...prev, [filterKey]: [...current, value] };
                      }
                      return prev;
                    });
                  }}
                />
              </div>

              {/* DATA FILTERS */}
              <div className="flex-shrink-0">
                <ErrorBoundary name="FilterPanel">
                  <FilterPanel data={data} activeFilters={activeFilters} setActiveFilters={setActiveFilters} />
                </ErrorBoundary>
              </div>

              {/* BOTTOM RIGHT - NEWS FEED (fills remaining space) */}
              <div className="flex-1 min-h-0 flex flex-col">
                <ErrorBoundary name="NewsFeed">
                  <NewsFeed
                    data={data}
                    selectedEntity={selectedEntity}
                    regionDossier={regionDossier}
                    regionDossierLoading={regionDossierLoading}
                  />
                </ErrorBoundary>
              </div>
            </motion.div>

            {/* BOTTOM CENTER COORDINATE / LOCATION BAR — hidden when Sentinel-2 imagery overlay is open */}
            {!(selectedEntity?.type === "region_dossier" && regionDossier?.sentinel2) && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1, duration: 1 }}
                className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[200] pointer-events-auto flex flex-col items-center gap-2 hud-zone"
              >
                {/* LOCATE BAR — search by coordinates or place name */}
                <LocateBar onLocate={(lat, lng) => setFlyToLocation({ lat, lng, ts: Date.now() })} />

                <div
                  className="bg-[var(--bg-primary)]/60 backdrop-blur-md border border-[var(--border-primary)] rounded-xl px-6 py-2.5 flex items-center gap-6 shadow-[0_4px_30px_rgba(0,0,0,0.2)] border-b-2 border-b-cyan-900 cursor-pointer"
                  onClick={cycleStyle}
                >
                  {/* Coordinates */}
                  <div className="flex flex-col items-center min-w-[120px]">
                    <div className="text-[8px] text-[var(--text-muted)] font-mono tracking-[0.2em]">TỌA ĐỘ</div>
                    <div className="text-[11px] text-cyan-400 font-mono font-bold tracking-wide">
                      {mouseCoords ? `${mouseCoords.lat.toFixed(4)}, ${mouseCoords.lng.toFixed(4)}` : "0.0000, 0.0000"}
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="w-px h-8 bg-[var(--border-primary)]" />

                  {/* Location name */}
                  <div className="flex flex-col items-center min-w-[180px] max-w-[320px]">
                    <div className="text-[8px] text-[var(--text-muted)] font-mono tracking-[0.2em]">VỊ TRÍ</div>
                    <div className="text-[10px] text-[var(--text-secondary)] font-mono truncate max-w-[320px]">
                      {locationLabel || "Di chuột lên bản đồ..."}
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="w-px h-8 bg-[var(--border-primary)]" />

                  {/* Style preset (compact) */}
                  <div className="flex flex-col items-center">
                    <div className="text-[8px] text-[var(--text-muted)] font-mono tracking-[0.2em]">KIỂU</div>
                    <div className="text-[11px] text-cyan-400 font-mono font-bold">{activeStyle}</div>
                  </div>

                  {/* Divider */}
                  <div className="w-px h-8 bg-[var(--border-primary)]" />

                  {/* Space Weather */}
                  <div
                    className="flex flex-col items-center"
                    title={`Kp Index: ${data?.space_weather?.kp_index ?? "N/A"}`}
                  >
                    <div className="text-[8px] text-[var(--text-muted)] font-mono tracking-[0.2em]">MẶT TRỜI</div>
                    <div
                      className={`text-[11px] font-mono font-bold ${
                        (data?.space_weather?.kp_index ?? 0) >= 5
                          ? "text-red-400"
                          : (data?.space_weather?.kp_index ?? 0) >= 4
                            ? "text-yellow-400"
                            : "text-green-400"
                      }`}
                    >
                      {data?.space_weather?.kp_text || "N/A"}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </>
        )}

        {/* RESTORE UI BUTTON (If Hidden) */}
        {!uiVisible && (
          <button
            onClick={() => setUiVisible(true)}
            className="absolute bottom-6 right-6 z-[200] bg-[var(--bg-primary)]/60 backdrop-blur-md border border-[var(--border-primary)] rounded px-4 py-2 text-[10px] font-mono tracking-widest text-cyan-500 hover:text-cyan-300 hover:border-cyan-800 transition-colors pointer-events-auto"
          >
            HIỆN LẠI UI
          </button>
        )}

        {/* DYNAMIC SCALE BAR */}
        <div className="absolute bottom-[5.5rem] left-[26rem] z-[201] pointer-events-auto">
          <ScaleBar
            zoom={mapView.zoom}
            latitude={mapView.latitude}
            measureMode={measureMode}
            measurePoints={measurePoints}
            onToggleMeasure={() => {
              setMeasureMode((m) => !m);
              if (measureMode) setMeasurePoints([]);
            }}
            onClearMeasure={() => setMeasurePoints([])}
          />
        </div>

        {/* STATIC CRT VIGNETTE */}
        <div
          className="absolute inset-0 pointer-events-none z-[2]"
          style={{
            background: "radial-gradient(circle, transparent 40%, rgba(0,0,0,0.8) 100%)",
          }}
        />

        {/* SCANLINES OVERLAY */}
        <div
          className="absolute inset-0 pointer-events-none z-[3] opacity-5 bg-[linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px)]"
          style={{ backgroundSize: "100% 4px" }}
        ></div>

        {/* SETTINGS PANEL */}
        <ErrorBoundary name="SettingsPanel">
          <SettingsPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </ErrorBoundary>

        {/* MAP LEGEND */}
        <ErrorBoundary name="MapLegend">
          <MapLegend isOpen={legendOpen} onClose={() => setLegendOpen(false)} />
        </ErrorBoundary>

        {/* ONBOARDING MODAL */}
        {showOnboarding && (
          <OnboardingModal
            onClose={() => setShowOnboarding(false)}
            onOpenSettings={() => {
              setShowOnboarding(false);
              setSettingsOpen(true);
            }}
          />
        )}

        {/* v0.4 CHANGELOG MODAL — shows once per version after onboarding */}
        {!showOnboarding && showChangelog && <ChangelogModal onClose={() => setShowChangelog(false)} />}

        {/* BACKEND DISCONNECTED BANNER */}
        {backendStatus === "disconnected" && (
          <div className="absolute top-0 left-0 right-0 z-[9000] flex items-center justify-center py-2 bg-red-950/90 border-b border-red-500/40 backdrop-blur-sm">
            <span className="text-[10px] font-mono tracking-widest text-red-400">
              BACKEND OFFLINE — Cannot reach backend server. Check that the backend container is running and BACKEND_URL
              is correct.
            </span>
          </div>
        )}
      </main>
    </DashboardDataProvider>
  );
}
