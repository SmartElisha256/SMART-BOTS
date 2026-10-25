import json
from pathlib import Path
from urllib.error import URLError

import pandas as pd
import pytest

import fetch_matches


class FakeResponse:
    status = 200

    def __init__(self, content):
        self.content = content

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self, limit):
        return self.content


def _configure(monkeypatch, output):
    monkeypatch.setenv("FOOTBALL_RESULTS_CSV_URL", "https://licensed-provider.example/results.csv")
    monkeypatch.setenv("FOOTBALL_RESULTS_LICENSE_CONFIRMED", "true")
    monkeypatch.setattr("sys.argv", ["fetch_matches.py", "--output", str(output)])


def _valid_csv():
    day = (pd.Timestamp.now(tz="UTC").normalize() - pd.Timedelta(days=3)).date().isoformat()
    return (
        "match_date,home_team,away_team,home_goals,away_goals\n"
        f"{day},Arsenal,Chelsea,2,1\n"
    ).encode()


def test_failed_download_preserves_last_known_good_file(tmp_path, monkeypatch):
    output = tmp_path / "provider_matches.csv"
    output.write_text("last-good")
    _configure(monkeypatch, output)

    def fail(*args, **kwargs):
        raise URLError("temporary outage")

    monkeypatch.setattr(fetch_matches.urllib.request, "urlopen", fail)
    with pytest.raises(URLError):
        fetch_matches.main()
    assert output.read_text() == "last-good"


def test_invalid_provider_csv_preserves_last_known_good_file(tmp_path, monkeypatch):
    output = tmp_path / "provider_matches.csv"
    output.write_text("last-good")
    _configure(monkeypatch, output)
    monkeypatch.setattr(fetch_matches.urllib.request, "urlopen", lambda *a, **k: FakeResponse(b"wrong,columns\n1,2\n"))

    with pytest.raises(ValueError):
        fetch_matches.main()
    assert output.read_text() == "last-good"


def test_valid_provider_csv_is_atomically_saved_with_freshness_manifest(tmp_path, monkeypatch):
    output = tmp_path / "provider_matches.csv"
    _configure(monkeypatch, output)
    monkeypatch.setattr(fetch_matches.urllib.request, "urlopen", lambda *a, **k: FakeResponse(_valid_csv()))

    fetch_matches.main()
    assert output.exists()
    assert "Arsenal" in output.read_text()
    manifest_path = output.with_suffix(output.suffix + ".manifest.json")
    manifest = json.loads(manifest_path.read_text())
    assert manifest["provider_host"] == "licensed-provider.example"
    assert manifest["dataset_type"] == "completed_historical_results"
    assert manifest["last_successful_update_utc"]
    assert manifest["sha256"]


def test_provider_update_with_synthetic_rows_is_rejected(tmp_path, monkeypatch):
    output = tmp_path / "provider_matches.csv"
    output.write_text("last-good")
    _configure(monkeypatch, output)
    day = (pd.Timestamp.now(tz="UTC").normalize() - pd.Timedelta(days=3)).date().isoformat()
    content = (
        "match_date,home_team,away_team,home_goals,away_goals,source\n"
        f"{day},Arsenal,Chelsea,2,1,provider\n"
        f"{day},Spurs,United,1,0,synthetic\n"
    ).encode()
    monkeypatch.setattr(fetch_matches.urllib.request, "urlopen", lambda *a, **k: FakeResponse(content))

    with pytest.raises(ValueError, match="synthetic"):
        fetch_matches.main()
    assert output.read_text() == "last-good"
