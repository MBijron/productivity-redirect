#!/usr/bin/env python3

from __future__ import annotations

import argparse
import sys

from build_summary import command_validate


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate weekly-news.jsonl without building site output.")
    parser.add_argument("--input", default="weekly-news.jsonl", help="Path to weekly-news.jsonl")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        command_validate(argparse.Namespace(input=args.input, site_output=None))
    except Exception as error:  # noqa: BLE001
        print(str(error), file=sys.stderr)
        return 1

    print("Validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())