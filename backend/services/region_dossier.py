import logging
import json
import math
import os
import sqlite3
import time
import concurrent.futures
from urllib.parse import quote
import requests as _requests
from cachetools import TTLCache
from services.network_utils import fetch_with_curl

try:
    from shapely.geometry import Point, Polygon
    from shapely.geometry import shape
    from shapely.ops import unary_union
    from shapely import wkb
    from shapely.geometry import mapping

    _HAS_SHAPELY = True
except Exception:  # Intentional: optional dependency
    Point = None  # type: ignore[assignment]
    Polygon = None  # type: ignore[assignment]
    shape = None  # type: ignore[assignment]
    unary_union = None  # type: ignore[assignment]
    wkb = None  # type: ignore[assignment]
    mapping = None  # type: ignore[assignment]
    _HAS_SHAPELY = False

logger = logging.getLogger(__name__)

try:
    import shapefile  # pyshp

    _HAS_PYSHP = True
except Exception:  # Intentional: optional dependency
    shapefile = None  # type: ignore[assignment]
    _HAS_PYSHP = False

# Cache dossier results for 24 hours — country data barely changes
# Key: rounded lat/lng grid (0.1 degree ≈ 11km)
dossier_cache = TTLCache(maxsize=5000, ttl=60 * 30)

island_cache = TTLCache(maxsize=5000, ttl=60 * 60 * 24)

# Nominatim requires max 1 req/sec — track last call time
_nominatim_last_call = 0.0
_overpass_last_call = 0.0


def _point_in_bbox(lat: float, lng: float, bbox: tuple[float, float, float, float]) -> bool:
    min_lat, min_lng, max_lat, max_lng = bbox
    return (min_lat <= lat <= max_lat) and (min_lng <= lng <= max_lng)


def _point_in_polygon(lat: float, lng: float, polygon: "Polygon") -> bool:
    return bool(polygon.contains(Point(lng, lat)))


def _gpkg_geometry_to_shapely(blob: bytes):
    if not blob or len(blob) < 8:
        return None
    if blob[0:2] != b"GP":
        return None
    flags = blob[3]
    envelope_indicator = (flags >> 1) & 0b111
    header_size = 8
    envelope_size = 0
    if envelope_indicator == 1:
        envelope_size = 32
    elif envelope_indicator == 2:
        envelope_size = 48
    elif envelope_indicator == 3:
        envelope_size = 48
    elif envelope_indicator == 4:
        envelope_size = 64
    wkb_start = header_size + envelope_size
    if wkb_start >= len(blob):
        return None
    try:
        return wkb.loads(blob[wkb_start:])
    except Exception:
        return None


_VN_12NM_GEOM = None

_VN_LAND_EEZ_GEOM = None

_VN_GEOJSON_CACHE = None

_VN_GEOJSON_GEOM = None

_ISLAND_GAZETTEER = None


def _load_vn_12nm_geometry():
    if not _HAS_SHAPELY:
        return None
    base_dir = os.path.dirname(os.path.dirname(__file__))
    gpkg_path = os.path.join(
        base_dir,
        "data",
        "World_12NM_v4_20231025_gpkg",
        "World_12NM_v4_20231025_gpkg",
        "eez_12nm_v4.gpkg",
    )
    if not os.path.exists(gpkg_path):
        return None
    try:
        con = sqlite3.connect(gpkg_path)
        cur = con.cursor()
        cur.execute("SELECT geom FROM eez_12nm_v4 WHERE UPPER(ISO_SOV1) = 'VNM'")
        geoms = []
        for (geom_blob,) in cur.fetchall():
            if geom_blob is None:
                continue
            g = _gpkg_geometry_to_shapely(geom_blob)
            if g is not None:
                geoms.append(g)
        con.close()
        if not geoms:
            return None
        return unary_union(geoms)
    except Exception as e:
        logger.warning(f"Failed loading VN 12NM geometry: {e}")
        return None


def _shape_to_shapely_polygons(shape_obj) -> list:
    """Convert a pyshp Polygon/MultiPolygon shape into shapely polygons.

    Note: We treat each part as an exterior ring. This is sufficient for
    boundary display + point-in-polygon containment checks at operational scale.
    """
    if not _HAS_SHAPELY:
        return []
    if not shape_obj or not getattr(shape_obj, "points", None):
        return []
    pts = shape_obj.points
    parts = list(getattr(shape_obj, "parts", []) or [])
    if not parts:
        parts = [0]
    parts.append(len(pts))

    polys = []
    for i in range(len(parts) - 1):
        ring = pts[parts[i] : parts[i + 1]]
        if len(ring) < 4:
            continue
        try:
            p = Polygon(ring)
            if not p.is_valid:
                p = p.buffer(0)
            if not p.is_empty:
                polys.append(p)
        except Exception:
            continue
    return polys


def _load_vn_land_eez_union_geometry():
    if not (_HAS_SHAPELY and _HAS_PYSHP):
        return None
    base_dir = os.path.dirname(os.path.dirname(__file__))
    shp_path = os.path.join(
        base_dir,
        "data",
        "EEZ_land_union_v4_202410",
        "EEZ_land_union_v4_202410",
        "EEZ_land_union_v4_202410.shp",
    )
    if not os.path.exists(shp_path):
        return None
    try:
        r = shapefile.Reader(shp_path)
        field_names = [f[0] for f in r.fields[1:]]
        idx = {name: i for i, name in enumerate(field_names)}

        def _val(rec, name: str) -> str:
            if name not in idx:
                return ""
            v = rec[idx[name]]
            return str(v or "").strip().upper()

        geoms = []
        for i in range(len(r)):
            rec = r.record(i)
            if "VNM" not in (_val(rec, "ISO_SOV1"), _val(rec, "ISO_SOV2"), _val(rec, "ISO_SOV3")):
                continue
            shp = r.shape(i)
            geoms.extend(_shape_to_shapely_polygons(shp))
        if not geoms:
            return None
        return unary_union(geoms)
    except Exception as e:
        logger.warning(f"Failed loading VN land+EEZ union geometry: {e}")
        return None


def get_vn_12nm_boundary_geojson() -> dict:
    global _VN_12NM_GEOM
    if not _HAS_SHAPELY:
        return {"type": "FeatureCollection", "features": []}
    if _VN_12NM_GEOM is None:
        _VN_12NM_GEOM = _load_vn_12nm_geometry()
    if _VN_12NM_GEOM is None:
        return {"type": "FeatureCollection", "features": []}
    try:
        boundary = _VN_12NM_GEOM.boundary
        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {"name": "VN Territorial Sea 12NM"},
                    "geometry": mapping(boundary),
                }
            ],
        }
    except Exception as e:
        logger.warning(f"Failed building VN 12NM boundary geojson: {e}")
        return {"type": "FeatureCollection", "features": []}


def get_vn_land_eez_geojson() -> dict:
    global _VN_LAND_EEZ_GEOM
    if not (_HAS_SHAPELY and _HAS_PYSHP):
        return {"type": "FeatureCollection", "features": []}
    if _VN_LAND_EEZ_GEOM is None:
        _VN_LAND_EEZ_GEOM = _load_vn_land_eez_union_geometry()
    if _VN_LAND_EEZ_GEOM is None:
        return {"type": "FeatureCollection", "features": []}
    try:
        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {"name": "VN Land + EEZ (union)"},
                    "geometry": mapping(_VN_LAND_EEZ_GEOM),
                }
            ],
        }
    except Exception as e:
        logger.warning(f"Failed building VN land+EEZ geojson: {e}")
        return {"type": "FeatureCollection", "features": []}


def get_vn_land_eez_boundary_geojson() -> dict:
    global _VN_LAND_EEZ_GEOM
    if not (_HAS_SHAPELY and _HAS_PYSHP):
        return {"type": "FeatureCollection", "features": []}
    if _VN_LAND_EEZ_GEOM is None:
        _VN_LAND_EEZ_GEOM = _load_vn_land_eez_union_geometry()
    if _VN_LAND_EEZ_GEOM is None:
        return {"type": "FeatureCollection", "features": []}
    try:
        boundary = _VN_LAND_EEZ_GEOM.boundary
        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {"name": "VN Land + EEZ boundary"},
                    "geometry": mapping(boundary),
                }
            ],
        }
    except Exception as e:
        logger.warning(f"Failed building VN land+EEZ boundary geojson: {e}")
        return {"type": "FeatureCollection", "features": []}


def get_vietnam_geojson() -> dict:
    global _VN_GEOJSON_CACHE
    if _VN_GEOJSON_CACHE is not None:
        return _VN_GEOJSON_CACHE
    base_dir = os.path.dirname(os.path.dirname(__file__))
    geojson_path = os.path.join(base_dir, "data", "vietnam-geojson", "vietnam.geojson")
    if not os.path.exists(geojson_path):
        _VN_GEOJSON_CACHE = {"type": "FeatureCollection", "features": []}
        return _VN_GEOJSON_CACHE
    try:
        with open(geojson_path, "r", encoding="utf-8") as f:
            _VN_GEOJSON_CACHE = json.load(f)
        if not isinstance(_VN_GEOJSON_CACHE, dict) or _VN_GEOJSON_CACHE.get("type") != "FeatureCollection":
            _VN_GEOJSON_CACHE = {"type": "FeatureCollection", "features": []}
        return _VN_GEOJSON_CACHE
    except Exception as e:
        logger.warning(f"Failed loading vietnam.geojson: {e}")
        _VN_GEOJSON_CACHE = {"type": "FeatureCollection", "features": []}
        return _VN_GEOJSON_CACHE


def _load_island_gazetteer() -> list[dict]:
    base_dir = os.path.dirname(os.path.dirname(__file__))
    path = os.path.join(base_dir, "data", "island_gazetteer_vn.json")
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return [x for x in data if isinstance(x, dict) and "lat" in x and "lng" in x]
        return []
    except Exception as e:
        logger.warning(f"Failed loading island gazetteer: {e}")
        return []


def _load_vn_geojson_union_geometry():
    if not _HAS_SHAPELY:
        return None
    try:
        gj = get_vietnam_geojson() or {}
        features = gj.get("features", []) if isinstance(gj, dict) else []
        geoms = []
        for f in features:
            if not isinstance(f, dict):
                continue
            g = f.get("geometry")
            if not g:
                continue
            try:
                geoms.append(shape(g))
            except Exception:
                continue
        if not geoms:
            return None
        return unary_union(geoms)
    except Exception:
        return None


def _apply_country_overrides(lat: float, lng: float, geo: dict) -> dict:
    global _VN_12NM_GEOM
    global _VN_LAND_EEZ_GEOM
    global _VN_GEOJSON_GEOM
    if _HAS_SHAPELY and _VN_12NM_GEOM is None:
        _VN_12NM_GEOM = _load_vn_12nm_geometry()

    if (_HAS_SHAPELY and _HAS_PYSHP) and _VN_LAND_EEZ_GEOM is None:
        _VN_LAND_EEZ_GEOM = _load_vn_land_eez_union_geometry()

    if _HAS_SHAPELY and _VN_GEOJSON_GEOM is None:
        _VN_GEOJSON_GEOM = _load_vn_geojson_union_geometry()

    def _set_vn(updated_geo: dict, *, state: str = "", city: str = "", display_name: str = "", special_region: str = "") -> dict:
        updated = dict(updated_geo)
        updated["country"] = "Vietnam"
        updated["country_code"] = "VN"
        if state:
            updated["state"] = state
        if city:
            updated["city"] = city
        if display_name:
            updated["display_name"] = display_name
        if special_region:
            updated["special_region"] = special_region
        return updated

    vn_priority_bboxes: list[tuple[float, float, float, float]] = [
        (15.3, 111.0, 17.5, 113.3),
        (6.0, 109.0, 12.5, 117.5),
    ]

    # Always hard-override Hoàng Sa / Trường Sa locality labels to remove any CN attribution.
    for bbox in vn_priority_bboxes:
        if _point_in_bbox(lat, lng, bbox):
            if bbox[0] > 14:
                return _set_vn(
                    geo,
                    state="Đà Nẵng",
                    city="Hoàng Sa",
                    display_name="Hoàng Sa, Đà Nẵng, Việt Nam",
                    special_region="hoang_sa",
                )
            return _set_vn(
                geo,
                state="Khánh Hòa",
                city="Trường Sa",
                display_name="Trường Sa, Khánh Hòa, Việt Nam",
                special_region="truong_sa",
            )

    if _HAS_SHAPELY:
        hoang_sa = Polygon(
            [
                (111.0, 15.4),
                (113.3, 15.4),
                (113.3, 17.6),
                (111.0, 17.6),
                (111.0, 15.4),
            ]
        )
        truong_sa = Polygon(
            [
                (109.0, 6.0),
                (117.5, 6.0),
                (117.5, 12.5),
                (109.0, 12.5),
                (109.0, 6.0),
            ]
        )
        if _point_in_polygon(lat, lng, hoang_sa):
            return _set_vn(geo, state="Đà Nẵng", city="Hoàng Sa")
        if _point_in_polygon(lat, lng, truong_sa):
            return _set_vn(geo, state="Khánh Hoà", city="Trường Sa")

    # If point lies within VN land+EEZ union, always treat as Vietnam.
    if _HAS_SHAPELY and _VN_LAND_EEZ_GEOM is not None:
        try:
            if _VN_LAND_EEZ_GEOM.contains(Point(lng, lat)):
                return _set_vn(geo)
        except Exception:
            pass

    if _HAS_SHAPELY and _VN_GEOJSON_GEOM is not None:
        try:
            if _VN_GEOJSON_GEOM.contains(Point(lng, lat)):
                return _set_vn(geo)
        except Exception:
            pass

    if _HAS_SHAPELY and _VN_12NM_GEOM is not None:
        try:
            if _VN_12NM_GEOM.contains(Point(lng, lat)):
                return _set_vn(geo)
        except Exception:
            pass

    return geo


def _reverse_geocode(lat: float, lng: float) -> dict:
    global _nominatim_last_call
    url = (
        f"https://nominatim.openstreetmap.org/reverse?"
        f"lat={lat}&lon={lng}&format=json&zoom=10&addressdetails=1&accept-language=en"
    )
    headers = {"User-Agent": "ShadowBroker-OSINT/1.0 (live-risk-dashboard; contact@shadowbroker.app)"}

    for attempt in range(2):
        # Enforce Nominatim's 1 req/sec policy
        elapsed = time.time() - _nominatim_last_call
        if elapsed < 1.1:
            time.sleep(1.1 - elapsed)
        _nominatim_last_call = time.time()

        try:
            # Use requests directly — fetch_with_curl raises on non-200 which breaks 429 handling
            res = _requests.get(url, timeout=10, headers=headers)
            if res.status_code == 200:
                data = res.json()
                addr = data.get("address", {})
                return {
                    "city": addr.get("city") or addr.get("town") or addr.get("village") or addr.get("county") or "",
                    "state": addr.get("state") or addr.get("region") or "",
                    "island": addr.get("island") or "",
                    "archipelago": addr.get("archipelago") or "",
                    "country": addr.get("country") or "",
                    "country_code": (addr.get("country_code") or "").upper(),
                    "display_name": data.get("display_name", ""),
                }
            elif res.status_code == 429:
                logger.warning(f"Nominatim 429 rate-limited, retrying after 2s (attempt {attempt+1})")
                time.sleep(2)
                continue
            else:
                logger.warning(f"Nominatim returned {res.status_code}")
        except (_requests.RequestException, ConnectionError, TimeoutError, OSError) as e:
            logger.warning(f"Reverse geocode failed: {e}")
    return {}


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _overpass_nearby_island_name(lat: float, lng: float, *, radius_m: int = 25000) -> str:
    global _overpass_last_call
    url = "https://overpass-api.de/api/interpreter"
    query = f"""
    [out:json][timeout:15];
    (
      node(around:{radius_m},{lat},{lng})[place~\"^(island|islet)$\"]; 
      way(around:{radius_m},{lat},{lng})[place~\"^(island|islet)$\"]; 
      relation(around:{radius_m},{lat},{lng})[place~\"^(island|islet)$\"]; 
    );
    out center tags;
    """.strip()
    headers = {"User-Agent": "ShadowBroker-OSINT/1.0 (live-risk-dashboard; contact@shadowbroker.app)"}

    # Be polite to Overpass
    elapsed = time.time() - _overpass_last_call
    if elapsed < 1.1:
        time.sleep(1.1 - elapsed)
    _overpass_last_call = time.time()

    try:
        res = _requests.post(url, data=query.encode("utf-8"), timeout=20, headers=headers)
        if res.status_code != 200:
            return ""
        data = res.json()
        elems = data.get("elements", [])
        best_name = ""
        best_dist = 10**9
        for el in elems:
            tags = el.get("tags", {}) if isinstance(el, dict) else {}
            name = (tags.get("name:vi") or tags.get("name") or tags.get("name:en") or "").strip()
            if not name:
                continue

            # If we only have a CJK-script name (often Chinese) and no Vietnamese name, prefer blank.
            if not (tags.get("name:vi") or "").strip():
                if any("\u4e00" <= ch <= "\u9fff" for ch in name):
                    continue
            if "lat" in el and "lon" in el:
                el_lat = el.get("lat")
                el_lon = el.get("lon")
            else:
                center = el.get("center", {}) if isinstance(el, dict) else {}
                el_lat = center.get("lat")
                el_lon = center.get("lon")
            if el_lat is None or el_lon is None:
                continue
            dist = _haversine_km(lat, lng, float(el_lat), float(el_lon))
            if dist < best_dist:
                best_dist = dist
                best_name = name
        return best_name
    except Exception as e:
        logger.warning(f"Overpass island lookup failed: {e}")
        return ""


def _resolve_island_label(lat: float, lng: float, geo: dict) -> str:
    global _ISLAND_GAZETTEER
    cache_key = f"{round(lat, 3)}_{round(lng, 3)}"
    cached = island_cache.get(cache_key)
    if cached is not None:
        return cached

    if _ISLAND_GAZETTEER is None:
        _ISLAND_GAZETTEER = _load_island_gazetteer()

    best_name = ""
    best_dist = 10**9
    if _ISLAND_GAZETTEER:
        for item in _ISLAND_GAZETTEER:
            try:
                ilat = float(item.get("lat"))
                ilng = float(item.get("lng"))
            except Exception:
                continue
            dist = _haversine_km(lat, lng, ilat, ilng)
            if dist < best_dist:
                best_dist = dist
                best_name = (item.get("name_vi") or item.get("name") or item.get("name_en") or "").strip()
        if best_name and best_dist <= 30:
            island_cache[cache_key] = best_name
            return best_name

    island = (geo.get("island") or "").strip() if isinstance(geo, dict) else ""
    archipelago = (geo.get("archipelago") or "").strip() if isinstance(geo, dict) else ""
    if island:
        island_cache[cache_key] = island
        return island
    if archipelago:
        island_cache[cache_key] = archipelago
        return archipelago

    name = _overpass_nearby_island_name(lat, lng)
    island_cache[cache_key] = name
    return name


def _fetch_country_data(country_code: str) -> dict:
    if not country_code:
        return {}
    url = (
        f"https://restcountries.com/v3.1/alpha/{country_code}"
        f"?fields=name,population,capital,languages,region,subregion,area,currencies,borders,flag"
    )
    try:
        res = fetch_with_curl(url, timeout=10)
        if res.status_code == 200:
            return res.json()
    except (ConnectionError, TimeoutError, ValueError, KeyError, OSError) as e:
        logger.warning(f"RestCountries failed for {country_code}: {e}")
    return {}


def _fetch_wikidata_leader(country_name: str) -> dict:
    if not country_name:
        return {"leader": "Unknown", "government_type": "Unknown"}
    # SPARQL: get head of state (P35) and form of government (P122) for a sovereign state
    safe_name = country_name.replace('"', '\\"').replace("'", "\\'")
    sparql = f"""
    SELECT ?leaderLabel ?govTypeLabel WHERE {{
      ?country wdt:P31 wd:Q6256 ;
               rdfs:label "{safe_name}"@en .
      OPTIONAL {{ ?country wdt:P35 ?leader . }}
      OPTIONAL {{ ?country wdt:P122 ?govType . }}
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
    }} LIMIT 1
    """
    url = f"https://query.wikidata.org/sparql?query={quote(sparql)}&format=json"
    try:
        res = fetch_with_curl(url, timeout=15)
        if res.status_code == 200:
            results = res.json().get("results", {}).get("bindings", [])
            if results:
                r = results[0]
                return {
                    "leader": r.get("leaderLabel", {}).get("value", "Unknown"),
                    "government_type": r.get("govTypeLabel", {}).get("value", "Unknown"),
                }
    except (ConnectionError, TimeoutError, ValueError, KeyError, OSError) as e:
        logger.warning(f"Wikidata SPARQL failed for {country_name}: {e}")
    return {"leader": "Unknown", "government_type": "Unknown"}


def _fetch_local_wiki_summary(place_name: str, country_name: str = "") -> dict:
    if not place_name:
        return {}
    # Try exact match first, then with country qualifier
    candidates = [place_name]
    if country_name:
        candidates.append(f"{place_name}, {country_name}")

    # Common Vietnamese variants
    if place_name.strip().lower() == "vietnam" and "Việt Nam" not in candidates:
        candidates.insert(0, "Việt Nam")
    if country_name.strip().lower() == "vietnam" and f"{place_name}, Việt Nam" not in candidates:
        candidates.append(f"{place_name}, Việt Nam")

    for name in candidates:
        slug = quote(name.replace(" ", "_"))
        url = f"https://vi.wikipedia.org/api/rest_v1/page/summary/{slug}"
        try:
            res = fetch_with_curl(url, timeout=10)
            if res.status_code == 200:
                data = res.json()
                if data.get("type") != "disambiguation":
                    return {
                        "description": data.get("description", ""),
                        "extract": data.get("extract", ""),
                        "thumbnail": data.get("thumbnail", {}).get("source", ""),
                    }
        except (ConnectionError, TimeoutError, ValueError, KeyError, OSError):  # Intentional: optional enrichment
            continue
    return {}


def get_region_dossier(lat: float, lng: float) -> dict:
    cache_key = f"{round(lat, 1)}_{round(lng, 1)}"
    if cache_key in dossier_cache:
        return dossier_cache[cache_key]

    # Step 1: Reverse geocode
    geo = _reverse_geocode(lat, lng)
    geo = _apply_country_overrides(lat, lng, geo or {})
    if not geo or not geo.get("country"):
        return {
            "coordinates": {"lat": lat, "lng": lng},
            "location": geo or {},
            "country": None,
            "local": None,
            "error": "No country data — possibly international waters or uninhabited area",
        }

    country_code = geo.get("country_code", "")
    country_name = geo.get("country", "")
    city_name = geo.get("city", "")
    state_name = geo.get("state", "")

    special_region = (geo.get("special_region") or "").strip() if isinstance(geo, dict) else ""

    island_label = _resolve_island_label(lat, lng, geo)

    country_name_for_wiki = "Việt Nam" if (country_code or "").upper() == "VN" else country_name

    # Step 2: Parallel fetch with timeouts to prevent hanging
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        country_fut = pool.submit(_fetch_country_data, country_code)
        leader_fut = pool.submit(_fetch_wikidata_leader, country_name)
        if special_region == "hoang_sa":
            local_fut = pool.submit(
                lambda: {
                    "description": "Quần đảo",
                    "extract": "Quần đảo Hoàng Sa là quần đảo của Việt Nam, thuộc thành phố Đà Nẵng.",
                    "thumbnail": "",
                }
            )
        elif special_region == "truong_sa":
            local_fut = pool.submit(
                lambda: {
                    "description": "Quần đảo",
                    "extract": "Quần đảo Trường Sa là quần đảo của Việt Nam, thuộc tỉnh Khánh Hòa.",
                    "thumbnail": "",
                }
            )
        else:
            local_fut = pool.submit(_fetch_local_wiki_summary, city_name or state_name, country_name)
        # Also fetch country-level Wikipedia summary as fallback for local
        country_wiki_fut = pool.submit(_fetch_local_wiki_summary, country_name_for_wiki, "")

    try:
        country_data = country_fut.result(timeout=12)
    except Exception:  # Intentional: optional enrichment
        logger.warning("Country data fetch timed out or failed")
        country_data = {}
    try:
        leader_data = leader_fut.result(timeout=12)
    except Exception:  # Intentional: optional enrichment
        logger.warning("Leader data fetch timed out or failed")
        leader_data = {"leader": "Unknown", "government_type": "Unknown"}
    try:
        local_data = local_fut.result(timeout=12)
    except Exception:  # Intentional: optional enrichment
        logger.warning("Local wiki fetch timed out or failed")
        local_data = {}
    try:
        country_wiki_data = country_wiki_fut.result(timeout=12)
    except Exception:  # Intentional: optional enrichment
        country_wiki_data = {}

    # If no local data but we have country wiki summary, use that
    if not local_data.get("extract") and country_wiki_data.get("extract"):
        local_data = country_wiki_data

    # Build languages list
    languages = country_data.get("languages", {})
    lang_list = list(languages.values()) if isinstance(languages, dict) else []

    # Build currencies
    currencies = country_data.get("currencies", {})
    currency_list = []
    if isinstance(currencies, dict):
        for v in currencies.values():
            if isinstance(v, dict):
                symbol = v.get("symbol", "")
                name = v.get("name", "")
                currency_list.append(f"{name} ({symbol})" if symbol else name)

    result = {
        "coordinates": {"lat": lat, "lng": lng},
        "location": geo,
        "country": {
            "name": country_data.get("name", {}).get("common", country_name),
            "official_name": country_data.get("name", {}).get("official", ""),
            "leader": leader_data.get("leader", "Unknown"),
            "government_type": leader_data.get("government_type", "Unknown"),
            "population": country_data.get("population", 0),
            "capital": (country_data.get("capital") or ["Unknown"])[0] if isinstance(country_data.get("capital"), list) else "Unknown",
            "languages": lang_list,
            "currencies": currency_list,
            "region": country_data.get("region", ""),
            "subregion": country_data.get("subregion", ""),
            "area_km2": country_data.get("area", 0),
            "flag_emoji": country_data.get("flag", ""),
        },
        "local": {
            "name": city_name,
            "state": state_name,
            "island": island_label,
            "description": local_data.get("description", ""),
            "summary": local_data.get("extract", ""),
            "thumbnail": local_data.get("thumbnail", ""),
        },
    }

    dossier_cache[cache_key] = result
    return result
