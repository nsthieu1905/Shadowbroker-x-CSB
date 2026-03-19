import json
import os
import time
from typing import Any

import requests

API = "https://vi.wikipedia.org/w/api.php"
USER_AGENT = "ShadowBroker-OSINT/1.0 (island-gazetteer; contact@shadowbroker.app)"


def _api(params: dict[str, Any]) -> dict:
    res = requests.get(API, params=params, timeout=30, headers={"User-Agent": USER_AGENT})
    res.raise_for_status()
    return res.json()


def _get_section_index(page: str, header_contains: str) -> int | None:
    data = _api({"action": "parse", "page": page, "prop": "sections", "format": "json"})
    for sec in data.get("parse", {}).get("sections", []):
        line = (sec.get("line") or "").strip()
        if header_contains.lower() in line.lower():
            try:
                return int(sec.get("index"))
            except Exception:
                return None
    return None


def _get_section_links(page: str, section_index: int) -> list[str]:
    titles: list[str] = []
    cont: dict[str, Any] = {}
    while True:
        params: dict[str, Any] = {
            "action": "parse",
            "page": page,
            "prop": "links",
            "section": section_index,
            "format": "json",
        }
        params.update(cont)
        data = _api(params)
        for link in data.get("parse", {}).get("links", []):
            if link.get("ns") != 0:
                continue
            t = (link.get("*") or "").strip()
            if t and t not in titles:
                titles.append(t)
        if "continue" in data:
            cont = data["continue"]
            time.sleep(0.2)
            continue
        break
    return titles


def _batch(iterable: list[str], size: int) -> list[list[str]]:
    return [iterable[i : i + size] for i in range(0, len(iterable), size)]


def _fetch_coords_and_wikidata(titles: list[str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for chunk in _batch(titles, 40):
        joined = "|".join(chunk)
        data = _api(
            {
                "action": "query",
                "titles": joined,
                "prop": "coordinates|pageprops",
                "ppprop": "wikibase_item",
                "colimit": "max",
                "format": "json",
            }
        )
        pages = data.get("query", {}).get("pages", {})
        for _, p in pages.items():
            title = (p.get("title") or "").strip()
            coords = p.get("coordinates") or []
            if not coords:
                continue
            c0 = coords[0]
            try:
                lat = float(c0.get("lat"))
                lng = float(c0.get("lon"))
            except Exception:
                continue
            qid = (p.get("pageprops") or {}).get("wikibase_item") or ""
            out.append({"name_vi": title, "lat": lat, "lng": lng, "wikidata_id": qid})
        time.sleep(0.2)
    return out


def build(output_path: str) -> None:
    hs_page = "Quần đảo Hoàng Sa"
    ts_page = "Quần đảo Trường Sa"

    # Use MediaWiki API link graph + coordinates as a stable extraction method.
    # Any future page layout changes are less likely to break this than HTML scraping.
    hs_idx = _get_section_index(hs_page, "")
    ts_idx = _get_section_index(ts_page, "")
    if hs_idx is None or ts_idx is None:
        # Fallback: section index 0 means whole page (links)
        hs_idx = 0
        ts_idx = 0

    hs_titles = _get_section_links(hs_page, hs_idx)
    ts_titles = _get_section_links(ts_page, ts_idx)

    hs_items = _fetch_coords_and_wikidata(hs_titles)
    for it in hs_items:
        it["group"] = "Hoang Sa"
        it["state"] = "Da Nang"

    ts_items = _fetch_coords_and_wikidata(ts_titles)
    for it in ts_items:
        it["group"] = "Truong Sa"
        it["state"] = "Khanh Hoa"

    merged: dict[str, dict[str, Any]] = {}
    for it in hs_items + ts_items:
        key = it.get("name_vi") or f"{it.get('lat')}_{it.get('lng')}"
        merged[key] = it

    items = list(merged.values())
    items.sort(key=lambda x: (x.get("group", ""), x.get("name_vi", "")))

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    repo_root = os.path.dirname(os.path.dirname(__file__))
    out = os.path.join(repo_root, "data", "island_gazetteer_vn.json")
    build(out)
    print(f"Wrote {out}")
