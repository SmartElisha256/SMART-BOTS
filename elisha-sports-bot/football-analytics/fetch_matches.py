"""Safely fetch a configured licensed CSV of completed football results.

No provider is enabled by default. This adapter never claims to be a live feed.
The destination is replaced only after schema and data-quality validation passes.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import tempfile
from urllib.parse import urlparse
import urllib.request

import pandas as pd
from features import load_matches


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=os.getenv("FOOTBALL_RESULTS_CSV_URL"))
    parser.add_argument("--output", default="data/provider_matches.csv")
    parser.add_argument("--max-age-days", type=int, default=90)
    args = parser.parse_args()

    if not args.url:
        parser.error("No data URL configured. Set FOOTBALL_RESULTS_CSV_URL or pass --url.")
    parsed = urlparse(args.url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        parser.error("Only HTTPS provider URLs without embedded credentials are accepted.")
    if os.getenv("FOOTBALL_RESULTS_LICENSE_CONFIRMED", "").lower() != "true":
        parser.error(
            "Confirm the provider's licence and commercial-use terms first by setting "
            "FOOTBALL_RESULTS_LICENSE_CONFIRMED=true. This is an operator attestation, not legal verification."
        )
    if args.max_age_days < 1:
        parser.error("--max-age-days must be positive")

    request = urllib.request.Request(
        args.url,
        headers={"User-Agent": "ELISHA-SPORTS-BOT/1.0", "Accept": "text/csv"},
    )
    with urllib.request.urlopen(request, timeout=25) as response:
        if response.status != 200:
            raise RuntimeError(f"Provider returned HTTP {response.status}")
        content = response.read(20_000_001)
    if not content:
        raise RuntimeError("Provider returned an empty CSV.")
    if len(content) > 20_000_000:
        raise RuntimeError("CSV exceeds the 20 MB safety limit.")

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    temp_name = None
    try:
        with tempfile.NamedTemporaryFile(mode="wb", prefix=".matches-validation-", suffix=".csv", dir=output.parent, delete=False) as tmp:
            temp_name = tmp.name
            tmp.write(content)
            tmp.flush()
            os.fsync(tmp.fileno())
        df = load_matches(temp_name)
        if df.empty:
            raise ValueError("Provider CSV contains no completed matches.")
        if "source" in df.columns and df["source"].astype(str).str.lower().eq("synthetic").any():
            raise ValueError("Provider updates containing any synthetic test rows are rejected.")
        now = pd.Timestamp.now(tz="UTC")
        if (df["match_date"] > now + pd.Timedelta(days=1)).any():
            raise ValueError("CSV contains future-dated rows; this workflow accepts completed results only.")
        newest = df["match_date"].max()
        age_days = max(0, int((now - newest).total_seconds() // 86400))
        if age_days > args.max_age_days:
            raise ValueError(
                f"Newest completed match is {age_days} days old, exceeding --max-age-days={args.max_age_days}; "
                "existing last-known-good output was preserved."
            )

        # Atomic replace only after all validation succeeds. Existing output remains untouched on failure.
        os.replace(temp_name, output)
        temp_name = None
        seasons_covered = sorted({
            f"{match_date.year}-{match_date.year + 1}" if match_date.month >= 8
            else f"{match_date.year - 1}-{match_date.year}"
            for match_date in df["match_date"]
        })
        manifest = {
            "provider_host": parsed.hostname,
            "provider_url_credentials_or_query_saved": False,
            "last_successful_update_utc": datetime.now(timezone.utc).isoformat(),
            "dataset_type": "completed_historical_results",
            "rows": int(len(df)),
            "date_range": {"from": str(df["match_date"].min().date()), "to": str(newest.date())},
            "seasons_covered": seasons_covered,
            "data_age_days_at_update": age_days,
            "freshness_status": "recent_completed_results",
            "sha256": hashlib.sha256(content).hexdigest(),
            "licence_confirmation": "operator_attested; not independently verified",
        }
        manifest_path = output.with_suffix(output.suffix + ".manifest.json")
        manifest_tmp = manifest_path.with_suffix(manifest_path.suffix + ".tmp")
        manifest_tmp.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        os.replace(manifest_tmp, manifest_path)
        print(json.dumps({"output": str(output), "manifest": str(manifest_path), **manifest}, indent=2))
    finally:
        if temp_name and os.path.exists(temp_name):
            os.unlink(temp_name)


if __name__ == "__main__":
    main()
