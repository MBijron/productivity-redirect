from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit


SECTION_ORDER = ("world_news", "dutch_news", "tech_news", "buddhist_news")
DISPLAY_ORDER = ("dutch_news", "world_news", "tech_news", "buddhist_news")
REQUIRED_SECTIONS = ("world_news", "dutch_news", "tech_news")
REQUIRED_RECORD_KEYS = {
    "generated_at",
    "section",
    "time_window",
    "article_count",
    "sources",
    "top_stories",
    "themes",
    "overall_take",
    "summary",
    "articles",
}
REQUIRED_ARTICLE_KEYS = {"url", "title", "date", "sourcecountry", "language", "short_summary"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prepare or validate the weekly JSONL summary output.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    prepare_parser = subparsers.add_parser("prepare", help="Build a compact Copilot input file from fetched GDELT JSON.")
    prepare_parser.add_argument("--input-dir", help="Directory containing fetch-manifest.json and section output files")
    prepare_parser.add_argument("--world", help="Path to data/world_gdelt.json")
    prepare_parser.add_argument("--dutch", help="Path to data/dutch_gdelt.json")
    prepare_parser.add_argument("--tech", help="Optional path to data/tech_gdelt.json")
    prepare_parser.add_argument("--buddhist", help="Optional path to data/buddhist_gdelt.json")
    prepare_parser.add_argument("--output", required=True, help="Output path for the compact Copilot input JSON")

    validate_parser = subparsers.add_parser("validate", help="Validate weekly-news.jsonl and optionally build news-summary.json")
    validate_parser.add_argument("--input", required=True, help="Path to weekly-news.jsonl")
    validate_parser.add_argument("--site-output", help="Optional path for a browser-friendly JSON summary")
    return parser.parse_args()


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def parse_iso_datetime(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def format_date(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def format_coverage_label(start: str, end: str) -> str:
    start_value = parse_iso_datetime(start)
    end_value = parse_iso_datetime(end)
    return f"{start_value.day} {start_value.strftime('%B %Y')} to {end_value.day} {end_value.strftime('%B %Y')}"


def section_sort_key(section_name: str) -> int:
    return SECTION_ORDER.index(section_name) if section_name in SECTION_ORDER else len(SECTION_ORDER)


def display_sort_key(section_name: str) -> int:
    return DISPLAY_ORDER.index(section_name) if section_name in DISPLAY_ORDER else len(DISPLAY_ORDER)


def resolve_prepare_inputs(args: argparse.Namespace) -> list[Path]:
    if args.input_dir:
        manifest_path = Path(args.input_dir) / "fetch-manifest.json"
        manifest = read_json(manifest_path)
        section_paths = []

        for section in manifest.get("sections", []):
            if not isinstance(section, dict) or not isinstance(section.get("output"), str):
                continue
            section_paths.append(Path(section["output"]))

        if not section_paths:
            raise ValueError("fetch-manifest.json does not list any section outputs")

        return sorted(section_paths, key=lambda path: section_sort_key(path.stem.replace("_gdelt", "_news") if path.stem.endswith("_gdelt") else path.stem))

    if not args.world or not args.dutch:
        raise ValueError("prepare requires either --input-dir or both --world and --dutch")

    section_paths = [Path(args.world), Path(args.dutch)]
    if args.tech:
        section_paths.append(Path(args.tech))
    if args.buddhist:
        section_paths.append(Path(args.buddhist))
    return section_paths


def build_week_id(start: str, end: str) -> str:
    return f"{start[:10]}:{end[:10]}"


def build_coverage_by_day(listing_items: list[dict[str, Any]], articles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    listing_counts = Counter(
        item.get("published_at", "")[:10]
        for item in listing_items
        if isinstance(item.get("published_at"), str) and len(item["published_at"]) >= 10
    )
    article_counts = Counter(
        article.get("date", "")[:10]
        for article in articles
        if isinstance(article.get("date"), str) and len(article["date"]) >= 10
    )
    coverage_days = sorted(set(listing_counts.keys()) | set(article_counts.keys()))

    return [
        {
            "date": day,
            "listing_count": listing_counts.get(day, 0),
            "detailed_count": article_counts.get(day, 0),
        }
        for day in coverage_days
    ]


def validate_article(article: Any, section_name: str, index: int) -> dict[str, Any]:
    if not isinstance(article, dict):
        raise ValueError(f"{section_name} article #{index + 1} is not a JSON object")

    missing_keys = REQUIRED_ARTICLE_KEYS.difference(article.keys())
    if missing_keys:
        raise ValueError(f"{section_name} article #{index + 1} is missing keys: {', '.join(sorted(missing_keys))}")

    validated = {}
    for key in REQUIRED_ARTICLE_KEYS:
        value = article.get(key)
        if not isinstance(value, str):
            raise ValueError(f"{section_name} article #{index + 1} field '{key}' must be a string")
        validated[key] = value

    detail_paragraphs = article.get("detail_paragraphs", [])
    if detail_paragraphs is None:
        detail_paragraphs = []
    if not isinstance(detail_paragraphs, list) or any(not isinstance(paragraph, str) or not paragraph.strip() for paragraph in detail_paragraphs):
        raise ValueError(f"{section_name} article #{index + 1} field 'detail_paragraphs' must be an array of non-empty strings when provided")
    validated["detail_paragraphs"] = detail_paragraphs

    return validated


def validate_required_keys(record: dict[str, Any]) -> None:
    missing_keys = REQUIRED_RECORD_KEYS.difference(record.keys())
    if missing_keys:
        raise ValueError(f"Record for section {record.get('section', '<unknown>')} is missing keys: {', '.join(sorted(missing_keys))}")


def validate_time_window(section_name: str, time_window: Any) -> dict[str, str]:
    if not isinstance(time_window, dict) or not isinstance(time_window.get("start"), str) or not isinstance(time_window.get("end"), str):
        raise ValueError(f"Section {section_name} must provide time_window.start and time_window.end as strings")

    parse_iso_datetime(time_window["start"])
    parse_iso_datetime(time_window["end"])
    return {"start": time_window["start"], "end": time_window["end"]}


def validate_string_field(record: dict[str, Any], section_name: str, key: str) -> str:
    value = record.get(key)
    if not isinstance(value, str) or (key != "generated_at" and not value.strip()):
        raise ValueError(f"Section {section_name} must provide a non-empty {key} string")
    return value


def validate_list_field(record: dict[str, Any], section_name: str, key: str) -> list[Any]:
    value = record.get(key)
    if not isinstance(value, list):
        raise ValueError(f"Section {section_name} field '{key}' must be an array")
    return value


def validate_record(record: Any) -> dict[str, Any]:
    if not isinstance(record, dict):
        raise ValueError("Each JSONL line must be a JSON object")

    validate_required_keys(record)

    section_name = record.get("section")
    if section_name not in SECTION_ORDER:
        raise ValueError(f"Unexpected section '{section_name}'. Expected one of {', '.join(SECTION_ORDER)}")

    time_window = validate_time_window(section_name, record.get("time_window"))
    parse_iso_datetime(validate_string_field(record, section_name, "generated_at"))

    if not isinstance(record.get("article_count"), int) or record["article_count"] < 0:
        raise ValueError(f"Section {section_name} must provide article_count as a non-negative integer")

    sources = validate_list_field(record, section_name, "sources")
    top_stories = validate_list_field(record, section_name, "top_stories")
    themes = validate_list_field(record, section_name, "themes")
    articles = validate_list_field(record, section_name, "articles")
    validate_string_field(record, section_name, "summary")
    validate_string_field(record, section_name, "overall_take")

    validated_articles = [validate_article(article, section_name, index) for index, article in enumerate(articles)]
    if record["article_count"] < len(validated_articles):
        raise ValueError(
            f"Section {section_name} article_count {record['article_count']} cannot be smaller than the number of article objects {len(validated_articles)}"
        )

    return {
        **record,
        "time_window": time_window,
        "sources": sources,
        "top_stories": top_stories,
        "themes": themes,
        "articles": validated_articles,
    }


def title_from_section(section_name: str) -> str:
    if section_name == "dutch_news":
        return "Nederlands nieuws"
    if section_name == "world_news":
        return "World news"
    if section_name == "tech_news":
        return "Tech news"
    if section_name == "buddhist_news":
        return "Buddhist news"
    return section_name.replace("_", " ").title()


def source_label(article: dict[str, str]) -> str:
    hostname = urlsplit(article["url"]).netloc.replace("www.", "") if article["url"] else ""
    pieces = [piece for piece in (hostname, article["sourcecountry"], article["language"].upper() if article["language"] else "") if piece]
    return " · ".join(pieces)


def format_top_story_item(item: Any) -> str | None:
    if isinstance(item, str):
        return item

    if not isinstance(item, dict):
        return None

    headline = item.get("headline") or item.get("title") or item.get("name")
    rationale = item.get("rationale") or item.get("why_it_matters")

    if isinstance(headline, str) and isinstance(rationale, str) and headline and rationale:
        return f"{headline}: {rationale}"
    if isinstance(headline, str) and headline:
        return headline
    return None


def build_browser_section(record: dict[str, Any]) -> dict[str, Any]:
    top_story_text = [formatted for formatted in (format_top_story_item(item) for item in record["top_stories"]) if formatted]

    return {
        "sectionName": record["section"],
        "title": title_from_section(record["section"]),
        "description": record["overall_take"],
        "summary": record["summary"],
        "articleCount": record["article_count"],
        "sources": [source for source in record["sources"] if isinstance(source, str)],
        "topStories": top_story_text,
        "themes": [theme for theme in record["themes"] if isinstance(theme, str)],
        "linkTitles": record["section"] == "tech_news",
        "stories": [
            {
                "sourceLabel": source_label(article),
                "title": article["title"],
                "excerpt": article["short_summary"],
                "publishedAt": article["date"],
                "url": article["url"],
                "detailParagraphs": article.get("detail_paragraphs", []),
            }
            for article in record["articles"]
        ],
    }


def build_browser_summary(records: list[dict[str, Any]]) -> dict[str, Any]:
    ordered = sorted(records, key=lambda record: display_sort_key(record["section"]))
    reference = min(records, key=lambda record: section_sort_key(record["section"]))
    time_window = reference["time_window"]
    total_articles = sum(record["article_count"] for record in records)
    sections = [build_browser_section(record) for record in ordered]
    section_label = "section" if len(sections) == 1 else "sections"

    return {
        "weekId": build_week_id(time_window["start"], time_window["end"]),
        "generatedAt": reference["generated_at"],
        "coverageStart": time_window["start"],
        "coverageEnd": time_window["end"],
        "coverageLabel": format_coverage_label(time_window["start"], time_window["end"]),
        "intro": f"This briefing compacts the latest seven-day FreeNewsAPI window into {len(sections)} {section_label} across {total_articles} matched articles.",
        "sections": sections,
        "note": "Generated from FreeNewsAPI listing and detail responses and weekly-news.jsonl.",
    }


def command_prepare(args: argparse.Namespace) -> int:
    payload_paths = resolve_prepare_inputs(args)
    section_payloads = [read_json(path) for path in payload_paths]
    sections = []

    for payload in sorted(section_payloads, key=lambda item: section_sort_key(item.get("section", ""))):
        articles = payload.get("articles", [])
        listing_items = payload.get("listing_items", [])
        source_counts = Counter(item.get("publisher") for item in listing_items if item.get("publisher"))
        language_counts = Counter(article.get("language") for article in articles if article.get("language"))
        sections.append(
            {
                "section": payload.get("section"),
                "source": payload.get("source", "freenewsapi"),
                "time_window": payload.get("time_window"),
                "article_count": payload.get("article_count"),
                "selected_story_candidate_count": payload.get("selected_story_candidate_count", 0),
                "top_sources": [{"source": source, "count": count} for source, count in source_counts.most_common(25)],
                "top_languages": [{"language": language, "count": count} for language, count in language_counts.most_common(10)],
                "top_topics": payload.get("top_topics", []),
                "coverage_by_day": build_coverage_by_day(listing_items, articles),
                "story_candidates": [
                    {
                        "cluster_id": candidate.get("cluster_id", ""),
                        "story_label": candidate.get("story_label", ""),
                        "score": candidate.get("score", 0),
                        "score_breakdown": candidate.get("score_breakdown", {}),
                        "category": candidate.get("category", "other"),
                        "high_signal": candidate.get("high_signal", False),
                        "included": candidate.get("included", False),
                        "include_reason": candidate.get("include_reason", ""),
                        "publisher_count": candidate.get("publisher_count", 0),
                        "publishers": candidate.get("publishers", []),
                        "item_count": candidate.get("item_count", 0),
                        "first_seen": candidate.get("first_seen", ""),
                        "last_seen": candidate.get("last_seen", ""),
                        "distinct_dates": candidate.get("distinct_dates", []),
                        "latest_status_signal": candidate.get("latest_status_signal", 0),
                        "detail_target_uuids": candidate.get("detail_target_uuids", []),
                        "items": candidate.get("items", []),
                    }
                    for candidate in payload.get("story_candidates", [])
                ],
                "listing_items": listing_items,
                "detailed_articles": [
                    {
                        "url": article.get("url", ""),
                        "title": article.get("title", ""),
                        "date": article.get("date", ""),
                        "sourcecountry": article.get("sourcecountry", ""),
                        "language": article.get("language", ""),
                        "publisher": article.get("publisher", ""),
                        "topics": article.get("topics", []),
                        "incipit": article.get("incipit", ""),
                        "body": article.get("body", ""),
                    }
                    for article in articles
                ],
            }
        )

    output_payload = {
        "generated_at": format_date(datetime.now(timezone.utc)),
        "sections": sections,
    }
    write_json(Path(args.output), output_payload)
    return 0


def command_validate(args: argparse.Namespace) -> int:
    input_path = Path(args.input)
    lines = [line.strip() for line in input_path.read_text(encoding="utf-8").splitlines() if line.strip()]

    if len(lines) < len(REQUIRED_SECTIONS) or len(lines) > len(SECTION_ORDER):
        raise ValueError("weekly-news.jsonl must contain the required sections plus at most one optional buddhist_news line")

    validated_records = [validate_record(json.loads(line)) for line in lines]
    section_names = [record["section"] for record in validated_records]
    expected_sections = [section for section in SECTION_ORDER if section in section_names]
    if section_names != expected_sections or any(section not in section_names for section in REQUIRED_SECTIONS):
        raise ValueError("weekly-news.jsonl must write world_news, dutch_news, and tech_news first, with optional buddhist_news last")

    reference_window = validated_records[0]["time_window"]
    for record in validated_records[1:]:
        if record["time_window"] != reference_window:
            raise ValueError("All JSONL sections must share the same time_window")

    if args.site_output:
        write_json(Path(args.site_output), build_browser_summary(validated_records))

    return 0


def main() -> int:
    args = parse_args()
    try:
        if args.command == "prepare":
            return command_prepare(args)
        return command_validate(args)
    except Exception as error:  # noqa: BLE001
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())