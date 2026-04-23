from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

from fetch_gdelt import DEFAULT_REQUEST_DELAY_SECONDS, RateLimiter, make_request, normalize_detail_payload


SECTION_OUTPUTS = {
    "world_news": "world_gdelt.json",
    "dutch_news": "dutch_gdelt.json",
    "tech_news": "tech_gdelt.json",
    "buddhist_news": "buddhist_gdelt.json",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Load richer article context from the FreeNewsAPI-backed weekly dataset.")
    parser.add_argument("--section", required=True, choices=sorted(SECTION_OUTPUTS), help="Section to inspect.")
    parser.add_argument("--date", action="append", default=[], help="UTC date (YYYY-MM-DD) to match. Repeatable.")
    parser.add_argument("--keyword", action="append", default=[], help="Case-insensitive keyword to match in article titles or publishers. Repeatable.")
    parser.add_argument("--uuid", action="append", default=[], help="Exact listing UUID to include. Repeatable.")
    parser.add_argument("--limit", type=int, default=10, help="Maximum number of detailed articles to return.")
    parser.add_argument("--data-dir", default="data", help="Directory containing the aggregated weekly dataset.")
    parser.add_argument("--output", help="Optional JSON file to write instead of stdout.")
    parser.add_argument("--api-key", default=os.environ.get("FREENEWSAPI_TOKEN", ""), help="FreeNewsAPI token for cache misses.")
    parser.add_argument(
        "--request-delay-seconds",
        type=float,
        default=DEFAULT_REQUEST_DELAY_SECONDS,
        help="Delay between API detail requests when cache misses need to be fetched.",
    )
    return parser.parse_args()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def matches_listing_item(item: dict[str, Any], dates: set[str], keywords: list[str], uuids: set[str]) -> bool:
    uuid = item.get("uuid", "")
    published_at = item.get("published_at", "")
    title = item.get("title", "")
    publisher = item.get("publisher", "")

    if uuids and uuid not in uuids:
        return False

    if dates and published_at[:10] not in dates:
        return False

    if keywords:
        haystack = f"{title} {publisher}".lower()
        if not any(keyword in haystack for keyword in keywords):
            return False

    return True


def load_detail_payload(section_directory: Path, uuid: str, api_key: str, limiter: RateLimiter) -> dict[str, Any] | None:
    detail_file = section_directory / "details" / f"{uuid}.json"

    if detail_file.exists():
        payload = read_json(detail_file)
    else:
        if not api_key:
            return None
        limiter.wait()
        payload = make_request(f"https://api.freenewsapi.io/v1/details?uuid={uuid}", api_key)
        write_json(detail_file, payload)

    detail = payload.get("data", {}) if isinstance(payload, dict) else {}
    if not isinstance(detail, dict):
        return None

    normalized = normalize_detail_payload(detail)
    if not normalized:
        return None

    return {
        "uuid": normalized.get("uuid", ""),
        "url": normalized.get("url", ""),
        "title": normalized.get("title", ""),
        "date": normalized.get("date", ""),
        "sourcecountry": normalized.get("sourcecountry", ""),
        "language": normalized.get("language", ""),
        "publisher": normalized.get("publisher", ""),
        "topics": normalized.get("topics", []),
        "incipit": normalized.get("incipit", ""),
        "body": normalized.get("body", ""),
    }


def main() -> int:
    args = parse_args()
    data_directory = Path(args.data_dir)
    section_file = data_directory / SECTION_OUTPUTS[args.section]

    if not section_file.exists():
        print(f"Missing dataset file: {section_file}", file=sys.stderr)
        return 1

    payload = read_json(section_file)
    listing_items = payload.get("listing_items", []) if isinstance(payload, dict) else []
    if not isinstance(listing_items, list):
        print(f"Dataset file does not contain listing_items: {section_file}", file=sys.stderr)
        return 1

    keywords = [keyword.strip().lower() for keyword in args.keyword if isinstance(keyword, str) and keyword.strip()]
    dates = {date_value.strip() for date_value in args.date if isinstance(date_value, str) and date_value.strip()}
    uuids = {uuid_value.strip() for uuid_value in args.uuid if isinstance(uuid_value, str) and uuid_value.strip()}
    filtered_items = [item for item in listing_items if isinstance(item, dict) and matches_listing_item(item, dates, keywords, uuids)]

    if not dates and not keywords and not uuids:
        filtered_items = [item for item in listing_items if isinstance(item, dict)]

    filtered_items = sorted(filtered_items, key=lambda item: item.get("published_at", ""), reverse=True)[: max(args.limit, 0)]
    section_directory = data_directory / "raw" / args.section
    limiter = RateLimiter(args.request_delay_seconds)
    articles = []

    for item in filtered_items:
        uuid = item.get("uuid", "")
        if not uuid:
            continue

        detail_payload = load_detail_payload(section_directory, uuid, args.api_key, limiter)
        if detail_payload:
            articles.append(detail_payload)

    result = {
        "section": args.section,
        "filters": {
            "dates": sorted(dates),
            "keywords": keywords,
            "uuids": sorted(uuids),
        },
        "matched_listing_count": len(filtered_items),
        "articles": articles,
    }

    if args.output:
        write_json(Path(args.output), result)
    else:
        sys.stdout.buffer.write((json.dumps(result, indent=2, ensure_ascii=False) + "\n").encode("utf-8"))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())