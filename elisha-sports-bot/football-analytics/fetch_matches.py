"""Optional historical-results fetch adapter.

No provider is enabled by default. Configure a documented provider in your own
environment rather than assuming live/official data is available.
"""
import argparse
import os
import urllib.request
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=os.getenv("FOOTBALL_RESULTS_CSV_URL"))
    parser.add_argument("--output", default="data/matches.csv")
    args = parser.parse_args()
    if not args.url:
        parser.error("No data URL configured. Set FOOTBALL_RESULTS_CSV_URL or pass --url.")
    if not args.url.startswith("https://"):
        parser.error("Only HTTPS URLs are accepted.")
    request = urllib.request.Request(args.url, headers={"User-Agent": "ELISHA-SPORTS-BOT/1.0"})
    with urllib.request.urlopen(request, timeout=20) as response:
        if response.status != 200:
            raise RuntimeError(f"Provider returned HTTP {response.status}")
        content = response.read(20_000_001)
    if len(content) > 20_000_000:
        raise RuntimeError("CSV exceeds the 20 MB safety limit.")
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(content)
    print(f"Downloaded provider CSV to {output}. Validate it before training.")

if __name__ == "__main__":
    main()
