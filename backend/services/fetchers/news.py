"""News fetching, geocoding, clustering, and risk assessment."""
import re
import logging
import concurrent.futures
import json
import os
import unicodedata
import html
import requests
import feedparser
from services.network_utils import fetch_with_curl
from services.fetchers._store import latest_data, _data_lock, _mark_fresh
from services.fetchers.retry import with_retry

logger = logging.getLogger("services.data_fetcher")


def _infer_country_from_keyword(kw: str | None) -> str | None:
    if not kw:
        return None
    k = kw.strip().lower()
    if k in {" us ", " usa ", "united states", "washington"}:
        return "United States"
    if k in {" uk ", "united kingdom", "london"}:
        return "United Kingdom"
    city_to_country = {
        "kyiv": "Ukraine",
        "moscow": "Russia",
        "beijing": "China",
        "tokyo": "Japan",
        "seoul": "South Korea",
        "pyongyang": "North Korea",
        "paris": "France",
        "berlin": "Germany",
        "dubai": "United Arab Emirates",
        "singapore": "Singapore",
        "bangkok": "Thailand",
        "jakarta": "Indonesia",
        "delhi": "India",
        "new delhi": "India",
        "mumbai": "India",
        "shanghai": "China",
        "hong kong": "China",
        "istanbul": "Turkey",
    }
    if k in city_to_country:
        return city_to_country[k]

    country_like = {
        "venezuela",
        "brazil",
        "argentina",
        "colombia",
        "mexico",
        "united states",
        "canada",
        "ukraine",
        "russia",
        "israel",
        "iran",
        "lebanon",
        "syria",
        "yemen",
        "china",
        "taiwan",
        "north korea",
        "south korea",
        "japan",
        "afghanistan",
        "pakistan",
        "india",
        "france",
        "germany",
        "sudan",
        "congo",
        "south africa",
        "nigeria",
        "egypt",
        "zimbabwe",
        "kenya",
        "libya",
        "mali",
        "niger",
        "somalia",
        "ethiopia",
        "australia",
    }
    if k in country_like:
        return k.title()
    return None


def _strip_accents(s: str) -> str:
    if not s:
        return ""
    return "".join(ch for ch in unicodedata.normalize("NFD", s) if unicodedata.category(ch) != "Mn")


def _normalize_vi_text(s: str) -> str:
    s = (s or "").lower()
    s = _strip_accents(s)
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _clean_feed_text(s: str) -> str:
    s = html.unescape(s or "")
    # Strip HTML tags commonly found in RSS summaries
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def _load_vn_provinces_34() -> list[dict]:
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    path = os.path.join(base_dir, "data", "vn_provinces_34.json")
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _build_vn_province_keyword_map() -> tuple[dict, dict]:
    provinces = _load_vn_provinces_34()
    kw_to_coords: dict[str, tuple[float, float]] = {}
    kw_to_region: dict[str, str] = {}
    for p in provinces:
        if not isinstance(p, dict):
            continue
        name = (p.get("name") or "").strip()
        if not name:
            continue
        lat = p.get("lat")
        lng = p.get("lng")
        if lat is None or lng is None:
            continue
        try:
            lat_f = float(lat)
            lng_f = float(lng)
        except Exception:
            continue

        keywords = p.get("keywords")
        if not isinstance(keywords, list) or not keywords:
            keywords = [name]
        for kw in keywords:
            if not isinstance(kw, str):
                continue
            nkw = _normalize_vi_text(kw)
            if not nkw:
                continue
            kw_to_coords[nkw] = (lat_f, lng_f)
            kw_to_region[nkw] = name

        nname = _normalize_vi_text(name)
        if nname and nname not in kw_to_coords:
            kw_to_coords[nname] = (lat_f, lng_f)
            kw_to_region[nname] = name
    return kw_to_coords, kw_to_region


_VN_PROVINCE_KEYWORD_COORDS, _VN_PROVINCE_KEYWORD_REGION = _build_vn_province_keyword_map()
_VN_PROVINCE_KEYWORDS_SORTED = sorted(
    _VN_PROVINCE_KEYWORD_COORDS.items(),
    key=lambda kv: len(kv[0]),
    reverse=True,
)


# Keyword -> coordinate mapping for geocoding news articles
_KEYWORD_COORDS = {
    "venezuela": (7.119, -66.589),
    "brazil": (-14.235, -51.925),
    "argentina": (-38.416, -63.616),
    "colombia": (4.570, -74.297),
    "mexico": (23.634, -102.552),
    "united states": (38.907, -77.036),
    " usa ": (38.907, -77.036),
    " us ": (38.907, -77.036),
    "washington": (38.907, -77.036),
    "canada": (56.130, -106.346),
    "ukraine": (49.487, 31.272),
    "kyiv": (50.450, 30.523),
    "russia": (61.524, 105.318),
    "moscow": (55.755, 37.617),
    "israel": (31.046, 34.851),
    "gaza": (31.416, 34.333),
    "iran": (32.427, 53.688),
    "lebanon": (33.854, 35.862),
    "syria": (34.802, 38.996),
    "yemen": (15.552, 48.516),
    "china": (35.861, 104.195),
    "beijing": (39.904, 116.407),
    "taiwan": (23.697, 120.960),
    "north korea": (40.339, 127.510),
    "south korea": (35.907, 127.766),
    "pyongyang": (39.039, 125.762),
    "seoul": (37.566, 126.978),
    "japan": (36.204, 138.252),
    "tokyo": (35.676, 139.650),
    "afghanistan": (33.939, 67.709),
    "pakistan": (30.375, 69.345),
    "india": (20.593, 78.962),
    " uk ": (55.378, -3.435),
    "london": (51.507, -0.127),
    "france": (46.227, 2.213),
    "paris": (48.856, 2.352),
    "germany": (51.165, 10.451),
    "berlin": (52.520, 13.405),
    "sudan": (12.862, 30.217),
    "congo": (-4.038, 21.758),
    "south africa": (-30.559, 22.937),
    "nigeria": (9.082, 8.675),
    "egypt": (26.820, 30.802),
    "zimbabwe": (-19.015, 29.154),
    "kenya": (-1.292, 36.821),
    "libya": (26.335, 17.228),
    "mali": (17.570, -3.996),
    "niger": (17.607, 8.081),
    "somalia": (5.152, 46.199),
    "ethiopia": (9.145, 40.489),
    "australia": (-25.274, 133.775),
    "middle east": (31.500, 34.800),
    "europe": (48.800, 2.300),
    "africa": (0.000, 25.000),
    "america": (38.900, -77.000),
    "south america": (-14.200, -51.900),
    "asia": (34.000, 100.000),
    "california": (36.778, -119.417),
    "texas": (31.968, -99.901),
    "florida": (27.994, -81.760),
    "new york": (40.712, -74.006),
    "virginia": (37.431, -78.656),
    "british columbia": (53.726, -127.647),
    "ontario": (51.253, -85.323),
    "quebec": (52.939, -73.549),
    "delhi": (28.704, 77.102),
    "new delhi": (28.613, 77.209),
    "mumbai": (19.076, 72.877),
    "shanghai": (31.230, 121.473),
    "hong kong": (22.319, 114.169),
    "istanbul": (41.008, 28.978),
    "dubai": (25.204, 55.270),
    "singapore": (1.352, 103.819),
    "bangkok": (13.756, 100.501),
    "jakarta": (-6.208, 106.845),
}


@with_retry(max_retries=1, base_delay=2)
def fetch_news():
    from services.news_feed_config import get_feeds
    feed_config = get_feeds()
    feeds = {f["name"]: f["url"] for f in feed_config}
    source_weights = {f["name"]: f["weight"] for f in feed_config}

    clusters = {}
    _cluster_grid = {}

    def _fetch_feed(item):
        source_name, url = item
        try:
            xml_data = fetch_with_curl(url, timeout=10).text
            return source_name, feedparser.parse(xml_data)
        except (requests.RequestException, ConnectionError, TimeoutError, ValueError, KeyError, OSError) as e:
            logger.warning(f"Feed {source_name} failed: {e}")
            return source_name, None

    with concurrent.futures.ThreadPoolExecutor(max_workers=len(feeds)) as pool:
        feed_results = list(pool.map(_fetch_feed, feeds.items()))

    for source_name, feed in feed_results:
        if not feed:
            continue
        for entry in feed.entries[:5]:
            title = _clean_feed_text(entry.get('title', ''))
            summary = _clean_feed_text(entry.get('summary', ''))

            _seismic_kw = ["earthquake", "seismic", "quake", "tremor", "magnitude", "richter"]
            _text_lower = (title + " " + summary).lower()
            if any(kw in _text_lower for kw in _seismic_kw):
                continue

            if source_name == "GDACS":
                alert_level = entry.get("gdacs_alertlevel", "Green")
                if alert_level == "Red": risk_score = 10
                elif alert_level == "Orange": risk_score = 7
                else: risk_score = 4
            else:
                risk_keywords = ['war', 'missile', 'strike', 'attack', 'crisis', 'tension', 'military', 'conflict', 'defense', 'clash', 'nuclear']
                text = (title + " " + summary).lower()

                risk_score = 1
                for kw in risk_keywords:
                    if kw in text:
                        risk_score += 2
                risk_score = min(10, risk_score)

            keyword_coords = _KEYWORD_COORDS

            lat, lng = None, None
            region_name = None
            country_name = None
            matched_kw = None

            if 'georss_point' in entry:
                geo_parts = entry['georss_point'].split()
                if len(geo_parts) == 2:
                    lat, lng = float(geo_parts[0]), float(geo_parts[1])
            elif 'where' in entry and hasattr(entry['where'], 'coordinates'):
                coords = entry['where'].coordinates
                lat, lng = coords[1], coords[0]

            if lat is None:
                combined = f"{title} {summary}"
                normalized = _normalize_vi_text(combined)
                padded = f" {normalized} "

                if _VN_PROVINCE_KEYWORDS_SORTED:
                    for kw, coords in _VN_PROVINCE_KEYWORDS_SORTED:
                        if f" {kw} " in padded:
                            lat, lng = coords
                            region_name = _VN_PROVINCE_KEYWORD_REGION.get(kw)
                            country_name = "Việt Nam"
                            break

                if lat is None:
                    # text may not be defined yet for GDACS path
                    text = (title + " " + summary).lower()
                    padded_text = f" {text} "
                    for kw, coords in keyword_coords.items():
                        if kw.startswith(" ") or kw.endswith(" "):
                            if kw in padded_text:
                                lat, lng = coords
                                matched_kw = kw
                                break
                        else:
                            if re.search(r'\b' + re.escape(kw) + r'\b', text):
                                lat, lng = coords
                                matched_kw = kw
                                break

            if country_name is None:
                country_name = _infer_country_from_keyword(matched_kw)

            if lat is not None:
                if region_name:
                    key = f"vn_region:{region_name}"
                else:
                    key = None
                    cell_x, cell_y = int(lng // 4), int(lat // 4)
                    for dx in range(-1, 2):
                        for dy in range(-1, 2):
                            for ckey in _cluster_grid.get((cell_x + dx, cell_y + dy), []):
                                parts = ckey.split(",")
                                elat, elng = float(parts[0]), float(parts[1])
                                if ((lat - elat) ** 2 + (lng - elng) ** 2) ** 0.5 < 4.0:
                                    key = ckey
                                    break
                            if key:
                                break
                        if key:
                            break
                    if key is None:
                        key = f"{lat},{lng}"
                        _cluster_grid.setdefault((cell_x, cell_y), []).append(key)
            else:
                key = title

            if key not in clusters:
                clusters[key] = []

            clusters[key].append({
                "title": title,
                "link": entry.get('link', ''),
                "published": entry.get('published', ''),
                "source": source_name,
                "risk_score": risk_score,
                "country": country_name,
                "region": region_name,
                "coords": [lat, lng] if lat is not None else None
            })

    news_items = []
    for key, articles in clusters.items():
        articles.sort(key=lambda x: (x['risk_score'], source_weights.get(x["source"], 0)), reverse=True)
        max_risk = articles[0]['risk_score']

        top_article = articles[0]
        news_items.append({
            "title": top_article["title"],
            "link": top_article["link"],
            "published": top_article["published"],
            "source": top_article["source"],
            "risk_score": max_risk,
            "coords": top_article["coords"],
            "country": top_article.get("country"),
            "region": top_article.get("region"),
            "cluster_count": len(articles),
            "articles": articles,
            "machine_assessment": None
        })

    news_items.sort(key=lambda x: x['risk_score'], reverse=True)
    with _data_lock:
        latest_data['news'] = news_items
    _mark_fresh("news")
