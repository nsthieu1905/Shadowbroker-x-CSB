import json
import os
import time
import argparse
import unicodedata
import requests


def _strip_accents(s: str) -> str:
    if not s:
        return ""
    return "".join(ch for ch in unicodedata.normalize("NFD", s) if unicodedata.category(ch) != "Mn")


def _normalize_key(s: str) -> str:
    s = (s or "").strip().lower()
    s = _strip_accents(s)
    s = " ".join(s.split())
    return s


def _geocode(query: str, *, timeout: int = 15) -> tuple[float | None, float | None]:
    url = "https://nominatim.openstreetmap.org/search"
    params = {
        "q": query,
        "format": "json",
        "limit": 1,
        "addressdetails": 0,
    }
    headers = {
        "User-Agent": "ShadowBroker-OSINT/1.0 (vn-province-builder; contact@shadowbroker.app)",
        "Accept-Language": "vi",
    }
    res = requests.get(url, params=params, headers=headers, timeout=timeout)
    if res.status_code != 200:
        return None, None
    data = res.json()
    if not data:
        return None, None
    try:
        lat = float(data[0].get("lat"))
        lon = float(data[0].get("lon"))
        return lat, lon
    except Exception:
        return None, None


def build(input_path: str, *, overwrite: bool = False, sleep_s: float = 1.1) -> None:
    if not os.path.exists(input_path):
        raise FileNotFoundError(input_path)

    with open(input_path, "r", encoding="utf-8") as f:
        provinces = json.load(f)

    if not isinstance(provinces, list):
        raise ValueError("vn_provinces_34.json must be a list")

    # Local cache to avoid re-geocoding the same admin center string
    cache: dict[str, tuple[float | None, float | None]] = {}

    updated = 0
    for p in provinces:
        if not isinstance(p, dict):
            continue

        name = (p.get("name") or "").strip()
        admin_center = (p.get("admin_center") or "").strip()
        if not name or not admin_center:
            continue

        if not overwrite and p.get("lat") is not None and p.get("lng") is not None:
            continue

        key = _normalize_key(admin_center)
        if key in cache:
            lat, lng = cache[key]
        else:
            # Bias results strongly towards Vietnam
            q1 = f"{admin_center}, Việt Nam"
            lat, lng = _geocode(q1)
            if lat is None or lng is None:
                # Fallback without country suffix
                lat, lng = _geocode(admin_center)
            cache[key] = (lat, lng)
            time.sleep(sleep_s)

        if lat is None or lng is None:
            continue

        p["lat"] = lat
        p["lng"] = lng
        updated += 1

    with open(input_path, "w", encoding="utf-8") as f:
        json.dump(provinces, f, ensure_ascii=False, indent=2)

    print(f"Updated {updated} province center coordinates in {input_path}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--path",
        default=os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "vn_provinces_34.json"),
        help="Path to vn_provinces_34.json",
    )
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing lat/lng")
    args = parser.parse_args()

    build(args.path, overwrite=args.overwrite)


if __name__ == "__main__":
    main()
