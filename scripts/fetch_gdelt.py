from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import time
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen


API_BASE_URL = "https://api.freenewsapi.io/v1"
DEFAULT_PAGE_SIZE = 50
DEFAULT_MAX_LISTED_ARTICLES = 300
DEFAULT_MAX_DETAILED_ARTICLES = 90
DEFAULT_REQUEST_DELAY_SECONDS = 0.65
REQUEST_TIMEOUT_SECONDS = 60
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
SECTION_ORDER = ("world_news", "dutch_news", "tech_news", "buddhist_news")
SECTION_OUTPUT_FILES = {
    "world_news": "world_gdelt.json",
    "dutch_news": "dutch_gdelt.json",
    "tech_news": "tech_gdelt.json",
    "buddhist_news": "buddhist_gdelt.json",
}
SECTION_CONFIGS = {
    "world_news": {
        "filters": {"language": "en", "topic": "world"},
        "max_listed_articles": 320,
        "max_detailed_articles": 96,
    },
    "dutch_news": {
        "filters": {"country": "nl", "language": "nl"},
        "max_listed_articles": 320,
        "max_detailed_articles": 96,
    },
    "tech_news": {
        "filters": {"language": "en", "topic": "technology"},
        "max_listed_articles": 280,
        "max_detailed_articles": 90,
    },
    "buddhist_news": {
        "queries": [
            {"language": "en", "q": "dalai lama"},
            {"language": "en", "q": "tibetan buddhism"},
            {"language": "en", "q": "tibetan"},
            {"language": "en", "q": "buddhist"},
        ],
        "required_terms": ["buddh", "dalai", "tibet", "tibetan", "lama"],
        "max_listed_articles": 120,
        "max_detailed_articles": 36,
        "min_listed_articles": 6,
        "min_detailed_articles": 4,
        "optional": True,
    },
}
TITLE_STOPWORDS = {
    "a",
    "aan",
    "al",
    "als",
    "an",
    "and",
    "bij",
    "dan",
    "dat",
    "de",
    "der",
    "die",
    "dit",
    "een",
    "en",
    "for",
    "gaat",
    "het",
    "hoe",
    "in",
    "is",
    "met",
    "na",
    "naar",
    "nog",
    "of",
    "om",
    "on",
    "op",
    "over",
    "the",
    "to",
    "tot",
    "uit",
    "van",
    "voor",
    "weer",
    "who",
    "wil",
}
PUBLIC_INTEREST_KEYWORDS = {
    "aanval",
    "attack",
    "blokkade",
    "cabinet",
    "ceasefire",
    "commissie",
    "commissievoorzitter",
    "court",
    "crisis",
    "cyber",
    "defensie",
    "doden",
    "evacuatie",
    "evacuation",
    "explosion",
    "federal",
    "government",
    "hack",
    "investigation",
    "kabinet",
    "killed",
    "leger",
    "minister",
    "ministry",
    "onderzoek",
    "oorlog",
    "outage",
    "overheid",
    "parlement",
    "policy",
    "police",
    "president",
    "rechter",
    "ruling",
    "sancties",
    "school",
    "shooting",
    "staakt",
    "strike",
    "supply",
    "uitval",
    "veiligheid",
    "war",
    "wet",
    "ziekenhuis",
}
TECH_KEYWORDS = {
    "ai",
    "android",
    "api",
    "apple",
    "chatgpt",
    "chip",
    "cloud",
    "cyber",
    "data",
    "developer",
    "github",
    "google",
    "grok",
    "infra",
    "ios",
    "microsoft",
    "openai",
    "platform",
    "robot",
    "robotics",
    "security",
    "software",
    "tech",
    "tooling",
}
SPORTS_KEYWORDS = {
    "ajax",
    "arsenal",
    "beker",
    "champions",
    "coach",
    "doelpunt",
    "eredivisie",
    "f1",
    "feyenoord",
    "finale",
    "formula",
    "gp",
    "goal",
    "league",
    "livestream",
    "match",
    "moto",
    "nec",
    "play",
    "praat",
    "premier league",
    "race",
    "sport",
    "spurs",
    "tennis",
    "trainer",
    "transfer",
    "voetbal",
    "wedstrijd",
    "wielrennen",
    "wk",
}
ENTERTAINMENT_KEYWORDS = {
    "album",
    "actrice",
    "acteur",
    "bioscoop",
    "comic con",
    "concert",
    "film",
    "gtst",
    "podcast",
    "serie",
    "show",
    "songfestival",
    "teaser",
    "trailer",
    "tv",
}
LIFESTYLE_KEYWORDS = {
    "bruids",
    "camping",
    "fashion",
    "fitnes",
    "horloge",
    "mode",
    "outfit",
    "reizen",
    "vakantie",
    "watches",
}
LOW_SIGNAL_PATTERNS = (
    "praat mee",
    "live |",
    "live:",
    "liveblog",
    "podcast",
    "trailer",
    "watchparty",
    "dit betaal je",
    "op tv",
)
LATEST_STATUS_KEYWORDS = {
    "akkoord",
    "confirmed",
    "deal",
    "gesloten",
    "heropend",
    "investigation",
    "opens",
    "opnieuw",
    "opnieuw gesloten",
    "reaches",
    "reopened",
    "repaired",
    "restored",
    "rules",
    "sluit",
    "sluit weer",
    "staakt",
    "stemt",
    "updated",
    "veroordeeld",
    "weer open",
}
SECTION_SELECTION_RULES = {
    "world_news": {
        "target_story_candidates": 18,
        "max_sports": 0,
        "max_entertainment": 1,
        "max_lifestyle": 0,
        "min_high_signal": 10,
    },
    "dutch_news": {
        "target_story_candidates": 18,
        "max_sports": 1,
        "max_entertainment": 1,
        "max_lifestyle": 0,
        "min_high_signal": 10,
    },
    "tech_news": {
        "target_story_candidates": 16,
        "max_sports": 0,
        "max_entertainment": 0,
        "max_lifestyle": 0,
        "min_high_signal": 12,
    },
    "buddhist_news": {
        "target_story_candidates": 8,
        "max_sports": 0,
        "max_entertainment": 0,
        "max_lifestyle": 0,
        "min_high_signal": 4,
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch seven-day Dutch and international news from FreeNewsAPI.")
    parser.add_argument("--output-dir", default="data", help="Directory where aggregated and raw data will be written.")
    parser.add_argument(
        "--sections",
        nargs="+",
        choices=SECTION_ORDER,
        help="Optional subset of sections to fetch. Defaults to all sections.",
    )
    parser.add_argument("--days", type=int, default=7, help="Rolling UTC day window to fetch.")
    parser.add_argument("--api-key", default=os.environ.get("FREENEWSAPI_TOKEN", ""), help="FreeNewsAPI token. Defaults to FREENEWSAPI_TOKEN.")
    parser.add_argument("--page-size", type=int, default=DEFAULT_PAGE_SIZE, help="Listing page size for /news calls.")
    parser.add_argument(
        "--max-listed-articles",
        type=int,
        default=DEFAULT_MAX_LISTED_ARTICLES,
        help="Maximum listing records to retain per section before stopping pagination.",
    )
    parser.add_argument(
        "--max-detailed-articles",
        type=int,
        default=DEFAULT_MAX_DETAILED_ARTICLES,
        help="Maximum detail records to fetch per section for itemized records and richer summaries.",
    )
    parser.add_argument(
        "--request-delay-seconds",
        type=float,
        default=DEFAULT_REQUEST_DELAY_SECONDS,
        help="Delay between HTTP requests to stay below the documented 2 req/sec limit.",
    )
    return parser.parse_args()


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def format_iso_datetime(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None

    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def format_day_label(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y-%m-%d")


def build_time_slices(start: datetime, end: datetime) -> list[tuple[str, datetime, datetime]]:
    slices: list[tuple[str, datetime, datetime]] = []
    slice_start = start

    while slice_start < end:
        slice_end = min(slice_start + timedelta(days=1), end)
        slices.append((format_day_label(slice_start), slice_start, slice_end))
        slice_start = slice_end

    return slices


def sort_items_by_timestamp(items: list[dict[str, Any]], timestamp_key: str) -> list[dict[str, Any]]:
    return sorted(
        items,
        key=lambda item: parse_datetime(item.get(timestamp_key)) or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )


def deduplicate_listing_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduplicated: dict[str, dict[str, Any]] = {}

    for item in items:
        key = item.get("uuid") or f"{item.get('title', '')}|{item.get('published_at', '')}|{item.get('publisher', '')}"
        current = deduplicated.get(key)
        current_date = parse_datetime(current.get("published_at")) if current else None
        candidate_date = parse_datetime(item.get("published_at"))

        if current is None or (candidate_date and (not current_date or candidate_date >= current_date)):
            deduplicated[key] = item

    return sort_items_by_timestamp(list(deduplicated.values()), "published_at")


def normalize_title_for_matching(title: str) -> str:
    lowered = title.lower()
    lowered = re.sub(r"[^\w\s]", " ", lowered)
    lowered = re.sub(r"\b\d+\b", " ", lowered)
    lowered = re.sub(r"\s+", " ", lowered).strip()
    return lowered


def tokenize_title(title: str) -> set[str]:
    normalized = normalize_title_for_matching(title)
    return {
        token
        for token in normalized.split()
        if len(token) >= 3 and token not in TITLE_STOPWORDS
    }


def classify_story_category(title: str) -> str:
    lowered = title.lower()
    if any(keyword in lowered for keyword in SPORTS_KEYWORDS):
        return "sports"
    if any(keyword in lowered for keyword in ENTERTAINMENT_KEYWORDS):
        return "entertainment"
    if any(keyword in lowered for keyword in LIFESTYLE_KEYWORDS):
        return "lifestyle"
    if any(keyword in lowered for keyword in TECH_KEYWORDS):
        return "tech"
    if any(keyword in lowered for keyword in PUBLIC_INTEREST_KEYWORDS):
        return "public_interest"
    return "other"


def has_low_signal_pattern(title: str) -> bool:
    lowered = title.lower()
    return any(pattern in lowered for pattern in LOW_SIGNAL_PATTERNS)


def jaccard_similarity(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    intersection = left & right
    if not intersection:
        return 0.0
    return len(intersection) / len(left | right)


def cluster_matches_item(cluster: dict[str, Any], item: dict[str, Any]) -> bool:
    item_title = item.get("title", "")
    if not isinstance(item_title, str):
        return False

    item_normalized = normalize_title_for_matching(item_title)
    item_tokens = tokenize_title(item_title)
    cluster_tokens = cluster.get("token_union", set())
    representative_normalized = cluster.get("representative_normalized", "")

    if item_normalized and representative_normalized and (
        item_normalized in representative_normalized or representative_normalized in item_normalized
    ):
        return True

    overlap = item_tokens & cluster_tokens
    if len(overlap) >= 3 and jaccard_similarity(item_tokens, cluster_tokens) >= 0.35:
        return True

    return False


def create_story_cluster(item: dict[str, Any]) -> dict[str, Any]:
    title = item.get("title", "") if isinstance(item.get("title"), str) else ""
    published_at = item.get("published_at", "") if isinstance(item.get("published_at"), str) else ""
    return {
        "items": [item],
        "token_union": set(tokenize_title(title)),
        "representative_normalized": normalize_title_for_matching(title),
        "latest_item": item,
        "earliest_item": item,
        "first_seen": published_at,
        "last_seen": published_at,
    }


def update_story_cluster(cluster: dict[str, Any], item: dict[str, Any]) -> None:
    title = item.get("title", "") if isinstance(item.get("title"), str) else ""
    published_at = item.get("published_at", "") if isinstance(item.get("published_at"), str) else ""
    latest_seen = parse_datetime(cluster.get("last_seen"))
    current_seen = parse_datetime(published_at)
    earliest_seen = parse_datetime(cluster.get("first_seen"))

    cluster["items"].append(item)
    cluster["token_union"].update(tokenize_title(title))
    if current_seen and (not latest_seen or current_seen >= latest_seen):
        cluster["latest_item"] = item
        cluster["last_seen"] = published_at
        cluster["representative_normalized"] = normalize_title_for_matching(title)

    if current_seen and (not earliest_seen or current_seen <= earliest_seen):
        cluster["earliest_item"] = item
        cluster["first_seen"] = published_at


def find_matching_cluster(clusters: list[dict[str, Any]], item: dict[str, Any]) -> dict[str, Any] | None:
    for cluster in clusters:
        if cluster_matches_item(cluster, item):
            return cluster
    return None


def category_priority_weight(category: str) -> float:
    if category == "public_interest":
        return 3.0
    if category == "tech":
        return 2.5
    if category == "other":
        return 1.0
    return 0.0


def build_story_score_breakdown(
    category: str,
    source_diversity: int,
    item_count: int,
    recency_weight: float,
    latest_status_signal: float,
    low_signal_penalty: float,
) -> dict[str, float]:
    sports_penalty = 2.0 if category == "sports" else 0.0
    entertainment_penalty = 2.0 if category == "entertainment" else 0.0
    lifestyle_penalty = 1.5 if category == "lifestyle" else 0.0
    return {
        "source_diversity": round(3.0 * source_diversity, 2),
        "recurrence_count": round(2.0 * item_count, 2),
        "public_interest_weight": round(2.5 * category_priority_weight(category), 2),
        "recency_weight": round(1.5 * recency_weight, 2),
        "latest_status_signal": round(1.5 * latest_status_signal, 2),
        "sports_penalty": round(-2.0 * sports_penalty, 2),
        "entertainment_penalty": round(-2.0 * entertainment_penalty, 2),
        "lifestyle_penalty": round(-1.5 * lifestyle_penalty, 2),
        "low_signal_penalty": round(-1.5 * low_signal_penalty, 2),
    }


def build_story_candidate(section_name: str, index: int, cluster: dict[str, Any]) -> dict[str, Any]:
    items = sort_items_by_timestamp(cluster["items"], "published_at")
    latest_item = cluster["latest_item"]
    earliest_item = cluster["earliest_item"]
    publishers = sorted({item.get("publisher", "") for item in items if item.get("publisher")})
    dates = sorted({item.get("published_at", "")[:10] for item in items if isinstance(item.get("published_at"), str)})
    latest_title = latest_item.get("title", "") if isinstance(latest_item, dict) else ""
    category = classify_story_category(latest_title)
    item_count = len(items)
    source_diversity = len(publishers)
    last_seen = parse_datetime(cluster.get("last_seen")) or datetime.min.replace(tzinfo=timezone.utc)
    hours_old = max((utc_now() - last_seen).total_seconds() / 3600, 0.0)
    recency_weight = max(0.0, 3.0 - min(hours_old / 24.0, 3.0))
    low_signal_penalty = 1.5 if has_low_signal_pattern(latest_title) else 0.0
    latest_status_signal = 0.0
    latest_title_lower = latest_title.lower()
    if item_count > 1 and any(keyword in latest_title_lower for keyword in LATEST_STATUS_KEYWORDS):
        latest_status_signal = 1.5
    if len(dates) >= 2 and any(keyword in latest_title_lower for keyword in {"weer", "updated", "opnieuw", "restored", "reopened"}):
        latest_status_signal += 0.5

    detail_targets = [latest_item.get("uuid", "")]
    detail_target_items = [latest_item]
    earliest_uuid = earliest_item.get("uuid", "") if isinstance(earliest_item, dict) else ""
    if earliest_uuid and earliest_uuid not in detail_targets and (latest_status_signal > 0 or len(dates) >= 3):
        detail_targets.append(earliest_uuid)
        detail_target_items.append(earliest_item)

    score_breakdown = build_story_score_breakdown(
        category,
        source_diversity,
        item_count,
        recency_weight,
        latest_status_signal,
        low_signal_penalty,
    )
    return {
        "cluster_id": f"{section_name}-story-{index:03d}",
        "score": round(sum(score_breakdown.values()), 2),
        "score_breakdown": score_breakdown,
        "category": category,
        "high_signal": category in {"public_interest", "tech"},
        "story_label": latest_title or (items[0].get("title", "") if items else "Untitled story"),
        "representative_title": latest_title,
        "publisher_count": source_diversity,
        "publishers": publishers,
        "item_count": item_count,
        "first_seen": cluster.get("first_seen", ""),
        "last_seen": cluster.get("last_seen", ""),
        "distinct_dates": dates,
        "latest_status_signal": round(latest_status_signal, 2),
        "detail_target_uuids": [uuid for uuid in detail_targets if uuid],
        "detail_target_items": [
            {
                "uuid": item.get("uuid", ""),
                "title": item.get("title", ""),
                "publisher": item.get("publisher", ""),
                "published_at": item.get("published_at", ""),
            }
            for item in detail_target_items
            if isinstance(item, dict)
        ],
        "items": [
            {
                "uuid": item.get("uuid", ""),
                "title": item.get("title", ""),
                "publisher": item.get("publisher", ""),
                "published_at": item.get("published_at", ""),
            }
            for item in items[:12]
        ],
    }


def get_candidate_rejection_reason(
    candidate: dict[str, Any],
    selected_count: int,
    category_counts: dict[str, int],
    rules: dict[str, int],
) -> str | None:
    category = candidate.get("category")
    high_signal = bool(candidate.get("high_signal"))
    remaining_slots = int(rules["target_story_candidates"]) - selected_count
    high_signal_needed = max(int(rules["min_high_signal"]) - category_counts["high_signal"], 0)

    if remaining_slots <= high_signal_needed and not high_signal:
        return "excluded to protect high-signal quota"
    if category == "sports" and category_counts["sports"] >= int(rules["max_sports"]):
        return "excluded by sports cap"
    if category == "entertainment" and category_counts["entertainment"] >= int(rules["max_entertainment"]):
        return "excluded by entertainment cap"
    if category == "lifestyle" and category_counts["lifestyle"] >= int(rules["max_lifestyle"]):
        return "excluded by lifestyle cap"
    return None


def increment_candidate_counts(candidate: dict[str, Any], category_counts: dict[str, int]) -> None:
    if candidate.get("high_signal"):
        category_counts["high_signal"] += 1
    category = candidate.get("category")
    if category in {"sports", "entertainment", "lifestyle"}:
        category_counts[category] += 1


def build_story_candidates(section_name: str, listing_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    clusters: list[dict[str, Any]] = []

    for item in sort_items_by_timestamp(listing_items, "published_at"):
        title = item.get("title", "")
        if not isinstance(title, str) or not title.strip():
            continue

        matched_cluster = find_matching_cluster(clusters, item)
        if matched_cluster is None:
            clusters.append(create_story_cluster(item))
            continue

        update_story_cluster(matched_cluster, item)

    story_candidates = []
    for index, cluster in enumerate(clusters, start=1):
        story_candidates.append(build_story_candidate(section_name, index, cluster))

    story_candidates.sort(
        key=lambda candidate: (
            candidate.get("score", 0.0),
            parse_datetime(candidate.get("last_seen")) or datetime.min.replace(tzinfo=timezone.utc),
        ),
        reverse=True,
    )
    return story_candidates


def select_story_candidates(section_name: str, story_candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rules = SECTION_SELECTION_RULES.get(section_name, SECTION_SELECTION_RULES["world_news"])
    selected: list[dict[str, Any]] = []
    category_counts = {
        "high_signal": 0,
        "sports": 0,
        "entertainment": 0,
        "lifestyle": 0,
    }

    for candidate in story_candidates:
        if len(selected) >= int(rules["target_story_candidates"]):
            break

        rejection_reason = get_candidate_rejection_reason(candidate, len(selected), category_counts, rules)
        if rejection_reason:
            candidate["included"] = False
            candidate["include_reason"] = rejection_reason
            continue

        candidate["included"] = True
        candidate["include_reason"] = "selected by deterministic score"
        selected.append(candidate)
        increment_candidate_counts(candidate, category_counts)

    for candidate in story_candidates:
        if "included" not in candidate:
            candidate["included"] = False
            candidate["include_reason"] = "below ranked selection cutoff"

    return selected


def item_matches_required_terms(item: dict[str, Any], required_terms: list[str]) -> bool:
    if not required_terms:
        return True

    title = item.get("title", "")
    if not isinstance(title, str):
        return False

    lowered = title.lower()
    return any(term in lowered for term in required_terms)


def article_matches_required_terms(article: dict[str, Any], required_terms: list[str]) -> bool:
    if not required_terms:
        return True

    searchable_fields = [article.get("title", ""), article.get("incipit", ""), article.get("body", "")]
    haystack = " ".join(value for value in searchable_fields if isinstance(value, str)).lower()
    return any(term in haystack for term in required_terms)


def output_file_for_section(output_directory: Path, section_name: str) -> Path:
    return output_directory / SECTION_OUTPUT_FILES.get(section_name, f"{section_name}.json")


def ensure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def reset_directory(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, payload: Any) -> None:
    ensure_directory(path.parent)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def canonicalize_url(url: str) -> str:
    if not url:
        return ""

    split_result = urlsplit(url.strip())
    query_pairs = [
        (key, item_value)
        for key, item_value in parse_qsl(split_result.query, keep_blank_values=True)
        if not key.lower().startswith("utm_") and key.lower() not in {"fbclid", "gclid", "mc_cid", "mc_eid"}
    ]
    normalized_path = split_result.path or "/"

    return urlunsplit(
        (
            split_result.scheme.lower(),
            split_result.netloc.lower(),
            normalized_path.rstrip("/") or "/",
            urlencode(query_pairs, doseq=True),
            "",
        )
    )


def retry_delay_seconds(error: HTTPError, attempt: int) -> float:
    retry_after_value = error.headers.get("Retry-After") if error.headers else None
    try:
        retry_after_seconds = float(retry_after_value) if retry_after_value else 0.0
    except ValueError:
        retry_after_seconds = 0.0
    return max(retry_after_seconds, 2 ** attempt, 2.0 if error.code == 429 else 0.0)


def make_request(url: str, api_key: str) -> dict[str, Any]:
    request = Request(
        url,
        headers={
            "User-Agent": "productivity-redirect-weekly-news/1.0",
            "x-api-key": api_key,
        },
    )
    last_error: Exception | None = None

    for attempt in range(4):
        try:
            with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            last_error = error
            if error.code not in RETRYABLE_STATUS_CODES or attempt == 3:
                break
            time.sleep(retry_delay_seconds(error, attempt))
        except URLError as error:
            last_error = error
            if attempt == 3:
                break
            time.sleep(2 ** attempt)

    raise RuntimeError(f"FreeNewsAPI request failed for {url}: {last_error}")


class RateLimiter:
    def __init__(self, delay_seconds: float) -> None:
        self.delay_seconds = max(delay_seconds, 0.0)
        self.last_request_at = 0.0

    def wait(self) -> None:
        if self.delay_seconds == 0:
            return

        now = time.monotonic()
        elapsed = now - self.last_request_at
        if elapsed < self.delay_seconds:
            time.sleep(self.delay_seconds - elapsed)
        self.last_request_at = time.monotonic()


def normalize_listing_item(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "uuid": item.get("uuid", ""),
        "title": item.get("title", "Untitled article"),
        "publisher": item.get("publisher", ""),
        "published_at": item.get("published_at", ""),
    }


def fetch_listing_pages(
    section_name: str,
    filters: dict[str, str],
    start: datetime,
    end: datetime,
    api_key: str,
    output_directory: Path,
    page_size: int,
    max_listed_articles: int,
    limiter: RateLimiter,
    window_label: str,
    file_prefix: str = "",
) -> tuple[list[dict[str, Any]], list[str], bool]:
    raw_directory = output_directory / "raw" / section_name
    listing_items: list[dict[str, Any]] = []
    raw_files: list[str] = []
    cursor: str | None = None
    page_number = 1
    truncated = False

    while True:
        params: dict[str, str] = {
            **filters,
            "order_by": "recent",
            "page_size": str(page_size),
            "published_after": format_iso_datetime(start),
            "published_before": format_iso_datetime(end),
        }
        if cursor:
            params["cursor"] = cursor

        limiter.wait()
        payload = make_request(f"{API_BASE_URL}/news?{urlencode(params)}", api_key)
        raw_file = raw_directory / f"{file_prefix}news_{window_label}_page_{page_number:03d}.json"
        write_json(raw_file, payload)
        raw_files.append(raw_file.as_posix())

        page_items = [normalize_listing_item(item) for item in payload.get("data", []) if isinstance(item, dict)]
        listing_items.extend(page_items)

        if len(listing_items) >= max_listed_articles:
            listing_items = listing_items[:max_listed_articles]
            truncated = True
            break

        meta = payload.get("meta", {}) if isinstance(payload, dict) else {}
        if not meta.get("has_more") or not meta.get("next_cursor"):
            break

        cursor = meta["next_cursor"]
        page_number += 1

    return listing_items, raw_files, truncated


def fetch_listing_items(
    section_name: str,
    filters: dict[str, str],
    start: datetime,
    end: datetime,
    api_key: str,
    output_directory: Path,
    page_size: int,
    max_listed_articles: int,
    limiter: RateLimiter,
    file_prefix: str = "",
) -> tuple[list[dict[str, Any]], list[str], bool]:
    time_slices = build_time_slices(start, end)
    if not time_slices:
        return [], [], False

    per_slice_limit = max(1, (max_listed_articles + len(time_slices) - 1) // len(time_slices))
    listing_items: list[dict[str, Any]] = []
    raw_files: list[str] = []
    truncated = False

    for window_label, slice_start, slice_end in reversed(time_slices):
        slice_items, slice_files, slice_truncated = fetch_listing_pages(
            section_name,
            filters,
            slice_start,
            slice_end,
            api_key,
            output_directory,
            page_size,
            per_slice_limit,
            limiter,
            window_label,
            file_prefix,
        )
        listing_items.extend(slice_items)
        raw_files.extend(slice_files)
        truncated = truncated or slice_truncated

    deduplicated_items = deduplicate_listing_items(listing_items)
    if len(deduplicated_items) > max_listed_articles:
        deduplicated_items = deduplicated_items[:max_listed_articles]
        truncated = True

    return deduplicated_items, raw_files, truncated


def fetch_listing_items_from_queries(
    section_name: str,
    query_filters: list[dict[str, str]],
    start: datetime,
    end: datetime,
    api_key: str,
    output_directory: Path,
    page_size: int,
    max_listed_articles: int,
    limiter: RateLimiter,
    required_terms: list[str],
) -> tuple[list[dict[str, Any]], list[str], bool]:
    all_items: list[dict[str, Any]] = []
    raw_files: list[str] = []
    truncated = False
    per_query_limit = max(1, (max_listed_articles + len(query_filters) - 1) // len(query_filters))

    for index, filters in enumerate(query_filters, start=1):
        query_items, query_files, query_truncated = fetch_listing_items(
            section_name,
            filters,
            start,
            end,
            api_key,
            output_directory,
            page_size,
            per_query_limit,
            limiter,
            file_prefix=f"q{index:02d}_",
        )
        all_items.extend(query_items)
        raw_files.extend(query_files)
        truncated = truncated or query_truncated

    deduplicated_items = deduplicate_listing_items(all_items)
    filtered_items = [item for item in deduplicated_items if item_matches_required_terms(item, required_terms)]
    if len(filtered_items) > max_listed_articles:
        filtered_items = filtered_items[:max_listed_articles]
        truncated = True

    return filtered_items, raw_files, truncated


def normalize_detail_payload(detail: dict[str, Any]) -> dict[str, Any] | None:
    original_url = detail.get("original_url") or ""
    canonical_url = canonicalize_url(original_url)
    raw_languages = detail.get("languages")
    raw_countries = detail.get("countries")
    raw_topics = detail.get("topics")
    languages = raw_languages if isinstance(raw_languages, list) else []
    countries = raw_countries if isinstance(raw_countries, list) else []
    topics = [topic for topic in raw_topics if isinstance(topic, str)] if isinstance(raw_topics, list) else []

    if not detail.get("uuid"):
        return None

    return {
        "uuid": detail.get("uuid", ""),
        "url": original_url,
        "canonical_url": canonical_url or detail.get("uuid", ""),
        "title": detail.get("title", "Untitled article"),
        "date": detail.get("published_at", ""),
        "sourcecountry": countries[0] if countries else "",
        "language": languages[0] if languages else "",
        "publisher": detail.get("publisher", ""),
        "topics": topics,
        "incipit": detail.get("incipit", "") if isinstance(detail.get("incipit"), str) else "",
        "body": detail.get("body", "") if isinstance(detail.get("body"), str) else "",
    }


def deduplicate_articles(articles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_url: dict[str, dict[str, Any]] = {}

    for article in articles:
        key = article["canonical_url"]
        current = by_url.get(key)
        current_date = parse_datetime(current.get("date")) if current else None
        candidate_date = parse_datetime(article.get("date"))

        if current is None or (candidate_date and (not current_date or candidate_date >= current_date)):
            by_url[key] = article

    deduplicated = list(by_url.values())
    deduplicated.sort(key=lambda item: parse_datetime(item.get("date")) or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return deduplicated


def append_detail_selection_item(
    selected_items: list[dict[str, Any]],
    seen_uuids: set[str],
    item: dict[str, Any],
    max_detailed_articles: int,
) -> bool:
    if len(selected_items) >= max_detailed_articles:
        return False

    uuid = item.get("uuid", "")
    if not uuid or uuid in seen_uuids:
        return False

    selected_items.append(item)
    seen_uuids.add(uuid)
    return True


def collect_detail_selection_items(
    story_candidates: list[dict[str, Any]],
    max_detailed_articles: int,
) -> list[dict[str, Any]]:
    selected_items: list[dict[str, Any]] = []
    seen_uuids: set[str] = set()

    for candidate in story_candidates:
        for item in candidate.get("detail_target_items", []):
            append_detail_selection_item(selected_items, seen_uuids, item, max_detailed_articles)
        for item in candidate.get("items", []):
            if len(selected_items) >= max_detailed_articles:
                return selected_items
            if len(selected_items) >= int(max_detailed_articles * 0.75) and item.get("uuid", "") not in set(candidate.get("detail_target_uuids", [])):
                continue
            append_detail_selection_item(selected_items, seen_uuids, item, max_detailed_articles)

    return selected_items


def fetch_section_listing_data(
    section_name: str,
    query_filters: list[dict[str, str]],
    listing_filters: dict[str, str] | None,
    start: datetime,
    end: datetime,
    api_key: str,
    output_directory: Path,
    page_size: int,
    max_listed_articles: int,
    limiter: RateLimiter,
    required_terms: list[str],
) -> tuple[list[dict[str, Any]], list[str], bool]:
    if query_filters:
        return fetch_listing_items_from_queries(
            section_name,
            query_filters,
            start,
            end,
            api_key,
            output_directory,
            page_size,
            max_listed_articles,
            limiter,
            required_terms,
        )

    if listing_filters:
        listing_items, raw_listing_files, listing_truncated = fetch_listing_items(
            section_name,
            listing_filters,
            start,
            end,
            api_key,
            output_directory,
            page_size,
            max_listed_articles,
            limiter,
        )
        if required_terms:
            listing_items = [item for item in listing_items if item_matches_required_terms(item, required_terms)]
        return listing_items, raw_listing_files, listing_truncated

    raise RuntimeError(f"Section {section_name} is missing filters or queries.")


def fetch_detail_articles(
    section_name: str,
    story_candidates: list[dict[str, Any]],
    api_key: str,
    output_directory: Path,
    max_detailed_articles: int,
    limiter: RateLimiter,
    required_terms: list[str] | None = None,
) -> tuple[list[dict[str, Any]], list[str]]:
    raw_directory = output_directory / "raw" / section_name / "details"
    detailed_articles: list[dict[str, Any]] = []
    raw_files: list[str] = []
    selected_items = collect_detail_selection_items(story_candidates, max_detailed_articles)

    for item in selected_items:
        uuid = item.get("uuid")
        if not uuid:
            continue

        limiter.wait()
        payload = make_request(f"{API_BASE_URL}/details?{urlencode({'uuid': uuid})}", api_key)
        raw_file = raw_directory / f"{uuid}.json"
        write_json(raw_file, payload)
        raw_files.append(raw_file.as_posix())

        detail = payload.get("data", {}) if isinstance(payload, dict) else {}
        normalized = normalize_detail_payload(detail) if isinstance(detail, dict) else None
        if normalized:
            detailed_articles.append(normalized)

    deduplicated_articles = deduplicate_articles(detailed_articles)
    if required_terms:
        deduplicated_articles = [article for article in deduplicated_articles if article_matches_required_terms(article, required_terms)]
    return deduplicated_articles, raw_files


def build_section_payload(
    section_name: str,
    section_config: dict[str, Any],
    start: datetime,
    end: datetime,
    api_key: str,
    output_directory: Path,
    default_page_size: int,
    default_max_listed_articles: int,
    default_max_detailed_articles: int,
    limiter: RateLimiter,
) -> dict[str, Any] | None:
    reset_directory(output_directory / "raw" / section_name)
    page_size = int(section_config.get("page_size", default_page_size))
    max_listed_articles = int(section_config.get("max_listed_articles", default_max_listed_articles))
    max_detailed_articles = int(section_config.get("max_detailed_articles", default_max_detailed_articles))
    required_terms = [term.lower() for term in section_config.get("required_terms", []) if isinstance(term, str) and term.strip()]
    listing_filters = section_config.get("filters") if isinstance(section_config.get("filters"), dict) else None
    query_filters = [query for query in section_config.get("queries", []) if isinstance(query, dict)]
    listing_items, raw_listing_files, listing_truncated = fetch_section_listing_data(
        section_name,
        query_filters,
        listing_filters,
        start,
        end,
        api_key,
        output_directory,
        page_size,
        max_listed_articles,
        limiter,
        required_terms,
    )

    if not listing_items or len(listing_items) < int(section_config.get("min_listed_articles", 1)):
        if section_config.get("optional"):
            return None
        raise RuntimeError(f"FreeNewsAPI returned no listing data for {section_name} in the requested time window.")

    story_candidates = build_story_candidates(section_name, listing_items)
    selected_story_candidates = select_story_candidates(section_name, story_candidates)

    detailed_articles, raw_detail_files = fetch_detail_articles(
        section_name,
        selected_story_candidates,
        api_key,
        output_directory,
        max_detailed_articles,
        limiter,
        required_terms,
    )

    if not detailed_articles or len(detailed_articles) < int(section_config.get("min_detailed_articles", 1)):
        if section_config.get("optional"):
            return None
        raise RuntimeError(f"FreeNewsAPI returned no detail records for {section_name}; cannot build grounded article items.")

    publisher_counts = Counter(item["publisher"] for item in listing_items if item.get("publisher"))
    topic_counts = Counter(topic for article in detailed_articles for topic in article.get("topics", []))
    payload = {
        "section": section_name,
        "source": "freenewsapi",
        "filters": section_config.get("filters") or {"queries": query_filters},
        "generated_at": format_iso_datetime(utc_now()),
        "time_window": {"start": format_iso_datetime(start), "end": format_iso_datetime(end)},
        "article_count": len(listing_items),
        "listing_truncated": listing_truncated,
        "detailed_article_count": len(detailed_articles),
        "top_publishers": [{"publisher": publisher, "count": count} for publisher, count in publisher_counts.most_common(25)],
        "top_topics": [{"topic": topic, "count": count} for topic, count in topic_counts.most_common(25)],
        "raw_listing_files": raw_listing_files,
        "raw_detail_files": raw_detail_files,
        "listing_items": listing_items,
        "story_candidates": story_candidates,
        "selected_story_candidate_count": len(selected_story_candidates),
        "articles": detailed_articles,
    }
    output_file = output_file_for_section(output_directory, section_name)
    write_json(output_file, payload)
    return payload


def main() -> int:
    args = parse_args()
    if not args.api_key:
        print("Missing FreeNewsAPI token. Provide --api-key or set FREENEWSAPI_TOKEN.", file=sys.stderr)
        return 1

    output_directory = Path(args.output_dir)
    end = utc_now()
    start = end - timedelta(days=args.days)
    limiter = RateLimiter(args.request_delay_seconds)
    requested_sections = tuple(args.sections) if args.sections else SECTION_ORDER
    manifest_sections = []
    diagnostics_sections = []

    try:
        for section_name in requested_sections:
            payload = build_section_payload(
                section_name,
                SECTION_CONFIGS[section_name],
                start,
                end,
                args.api_key,
                output_directory,
                args.page_size,
                args.max_listed_articles,
                args.max_detailed_articles,
                limiter,
            )
            if payload is None:
                continue
            manifest_sections.append(
                {
                    "section": section_name,
                    "filters": payload["filters"],
                    "output": output_file_for_section(output_directory, section_name).as_posix(),
                    "article_count": payload["article_count"],
                    "detailed_article_count": payload["detailed_article_count"],
                    "selected_story_candidate_count": payload.get("selected_story_candidate_count", 0),
                    "listing_truncated": payload["listing_truncated"],
                }
            )
            diagnostics_sections.append(
                {
                    "section": section_name,
                    "article_count": payload["article_count"],
                    "detailed_article_count": payload["detailed_article_count"],
                    "selected_story_candidate_count": payload.get("selected_story_candidate_count", 0),
                    "story_candidates": payload.get("story_candidates", []),
                }
            )
    except Exception as error:  # noqa: BLE001
        print(str(error), file=sys.stderr)
        return 1

    write_json(
        output_directory / "fetch-manifest.json",
        {
            "source": "freenewsapi",
            "generated_at": format_iso_datetime(utc_now()),
            "time_window": {"start": format_iso_datetime(start), "end": format_iso_datetime(end)},
            "sections": manifest_sections,
        },
    )
    write_json(
        output_directory / "story-candidate-diagnostics.json",
        {
            "source": "freenewsapi",
            "generated_at": format_iso_datetime(utc_now()),
            "time_window": {"start": format_iso_datetime(start), "end": format_iso_datetime(end)},
            "sections": diagnostics_sections,
        },
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())