"""
Geocode data center street addresses via Nominatim (OpenStreetMap).
Rate limit: 1 request/second (Nominatim policy).
Resumable: caches results in geocode_cache.json so interrupted runs can continue.
"""
import json
import time
import urllib.request
import urllib.parse
import os
import sys

# Fix Windows console encoding + force unbuffered output
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Force line-buffered stdout for detached processes
class Unbuffered:
    def __init__(self, stream):
        self.stream = stream
    def write(self, data):
        self.stream.write(data)
        self.stream.flush()
    def writelines(self, datas):
        self.stream.writelines(datas)
        self.stream.flush()
    def __getattr__(self, attr):
        return getattr(self.stream, attr)

sys.stdout = Unbuffered(sys.stdout)

DATA_FILE = os.path.join(os.path.dirname(__file__), "data", "datacenters.json")
CACHE_FILE = os.path.join(os.path.dirname(__file__), "data", "geocode_cache.json")
OUTPUT_FILE = os.path.join(os.path.dirname(__file__), "data", "datacenters_geocoded.json")

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "ShadowBroker-DataCenterGeocoder/1.0"


def geocode_address(address: str, retries: int = 3) -> tuple[float, float] | None:
    """Geocode a single address via Nominatim. Returns (lat, lng) or None."""
    params = urllib.parse.urlencode({"q": address, "format": "json", "limit": 1})
    url = f"{NOMINATIM_URL}?{params}"
    for attempt in range(retries):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            resp = urllib.request.urlopen(req, timeout=15)
            data = json.loads(resp.read())
            if data:
                return float(data[0]["lat"]), float(data[0]["lon"])
            return None  # Valid response but no results
        except Exception as e:
            if attempt < retries - 1:
                wait = 2 ** (attempt + 1)
                print(f"  RETRY ({attempt+1}/{retries}): {e} — waiting {wait}s")
                time.sleep(wait)
            else:
                print(f"  ERROR (gave up after {retries} attempts): {e}")
    return None


def main():
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        dcs = json.load(f)

    # Load cache
    cache = {}
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            cache = json.load(f)
        print(f"Loaded {len(cache)} cached geocode results")

    # Filter to DCs with real street addresses
    to_geocode = []
    skipped = 0
    for i, dc in enumerate(dcs):
        street = (dc.get("street") or "").strip()
        if not street or len(street) <= 3 or street.lower() in ("tbc", "n/a", "na", "-"):
            skipped += 1
            continue
        to_geocode.append((i, dc))

    print(f"Total DCs: {len(dcs)}")
    print(f"Skipped (no real address): {skipped}")
    print(f"To geocode: {len(to_geocode)}")

    # Count how many already cached
    already_cached = sum(1 for _, dc in to_geocode if dc.get("address", "") in cache)
    need_api = len(to_geocode) - already_cached
    print(f"Already cached: {already_cached}")
    print(f"Need API calls: {need_api}")
    if need_api > 0:
        print(f"Estimated time: {need_api // 60}m {need_api % 60}s")
    print()

    geocoded = 0
    failed = 0
    api_calls = 0
    save_interval = 50  # Save cache every 50 API calls

    for idx, (i, dc) in enumerate(to_geocode):
        address = dc.get("address", "").strip()
        if not address:
            # Build address from parts
            parts = [dc.get("street", ""), dc.get("zip", ""), dc.get("city", ""), dc.get("country", "")]
            address = " ".join(p.strip() for p in parts if p and p.strip())

        if not address:
            failed += 1
            continue

        # Check cache first
        if address in cache:
            result = cache[address]
            if result:
                dcs[i]["lat"] = result[0]
                dcs[i]["lng"] = result[1]
                dcs[i]["geocode_source"] = "nominatim"
                geocoded += 1
            else:
                failed += 1
            continue

        # API call — Nominatim requires 1 req/s, use 1.5s to avoid 429s after heavy use
        time.sleep(1.5)
        coords = geocode_address(address)
        api_calls += 1

        if coords:
            cache[address] = coords
            dcs[i]["lat"] = coords[0]
            dcs[i]["lng"] = coords[1]
            dcs[i]["geocode_source"] = "nominatim"
            geocoded += 1
            print(f"[{api_calls}/{need_api}] OK: {dc.get('name', '?')} -> ({coords[0]:.4f}, {coords[1]:.4f})")
        else:
            cache[address] = None
            failed += 1
            print(f"[{api_calls}/{need_api}] FAIL: {dc.get('name', '?')} | {address}")

        # Periodic cache save
        if api_calls % save_interval == 0:
            with open(CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(cache, f)
            print(f"  -- Cache saved ({len(cache)} entries) --")

    # Final save
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f)

    # Write output - only DCs with real coordinates
    output = [dc for dc in dcs if dc.get("lat") is not None and dc.get("lng") is not None]

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)

    print(f"\nDone!")
    print(f"Geocoded: {geocoded}")
    print(f"Failed: {failed}")
    print(f"API calls made: {api_calls}")
    print(f"Output: {len(output)} DCs with coordinates -> {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
