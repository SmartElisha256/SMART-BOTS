import json
from pathlib import Path
import sys
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from features import DataQualityError, load_matches, build_training_frame, FEATURES
from train import main as _train_main
from predict import predict

DATA = ROOT / "data" / "synthetic_matches.csv"

def test_duplicate_detection(tmp_path):
    df = pd.read_csv(DATA)
    df = pd.concat([df, df.iloc[[0]]], ignore_index=True)
    path = tmp_path / "dupes.csv"; df.to_csv(path, index=False)
    with pytest.raises(DataQualityError, match="Duplicate"):
        load_matches(path)

def test_feature_generation_uses_prior_matches_only():
    df = load_matches(DATA)
    frame = build_training_frame(df)
    assert len(frame) == len(df)
    assert all(name in frame.columns for name in FEATURES)
    assert frame.iloc[0]["home_matches_seen"] == 0
    assert frame.iloc[0]["away_matches_seen"] == 0
    assert frame.iloc[1]["home_matches_seen"] <= 1

def test_missing_data_handling(tmp_path):
    df = pd.read_csv(DATA).drop(columns=["home_goals"])
    path = tmp_path / "missing.csv"; df.to_csv(path, index=False)
    with pytest.raises(DataQualityError, match="Missing required"):
        load_matches(path)

def test_invalid_date_and_bad_team_name(tmp_path):
    df = pd.read_csv(DATA); df.loc[0, "match_date"] = "not-a-date"
    path = tmp_path / "date.csv"; df.to_csv(path, index=False)
    with pytest.raises(DataQualityError, match="match_date"):
        load_matches(path)
    df = pd.read_csv(DATA); df.loc[0, "home_team"] = " "
    path = tmp_path / "team.csv"; df.to_csv(path, index=False)
    with pytest.raises(DataQualityError, match="team name"):
        load_matches(path)

def test_training_and_prediction_schema(tmp_path):
    import joblib
    from sklearn.ensemble import RandomForestClassifier
    from train import main
    import os
    old = os.getcwd()
    try:
        os.chdir(ROOT)
        import sys
        sys.argv = ["train.py", "--data", str(DATA), "--models-dir", str(tmp_path)]
        main()
        result = predict({"home_team": "Lakeside FC", "away_team": "Hill United"}, str(DATA), str(tmp_path))
    finally:
        os.chdir(old)
    for key in ("match_result", "double_chance", "goal_markets", "btts", "expected_goals", "correct_score", "team_form", "confidence"):
        assert key in result
    assert set(result["match_result"]) == {"home_win", "draw", "away_win"}

def test_probability_validity_and_market_bounds(tmp_path):
    import os
    old = os.getcwd()
    try:
        os.chdir(ROOT)
        import sys
        sys.argv = ["train.py", "--data", str(DATA), "--models-dir", str(tmp_path)]
        from train import main
        main()
        p = predict({"home_team": "Lakeside FC", "away_team": "Hill United"}, str(DATA), str(tmp_path))
    finally:
        os.chdir(old)
    r = p["match_result"]
    assert all(0 <= value <= 1 for value in r.values())
    assert sum(r.values()) == pytest.approx(1.0)
    d = p["double_chance"]
    assert d["1X"] == pytest.approx(r["home_win"] + r["draw"])
    assert d["X2"] == pytest.approx(r["draw"] + r["away_win"])
    assert d["12"] == pytest.approx(r["home_win"] + r["away_win"])
    assert all(0 <= value <= 1 for value in p["goal_markets"].values())
    assert p["btts"]["yes"] + p["btts"]["no"] == pytest.approx(1.0)
    assert all(0 <= item["probability"] <= 1 for item in p["correct_score"])

def test_invalid_fixture_request():
    with pytest.raises(ValueError):
        predict({"home_team": "Same FC", "away_team": "Same FC"}, str(DATA), "missing-models")

def test_same_day_fixtures_do_not_leak_results_into_each_other():
    from features import build_training_frame
    rows = pd.DataFrame([
        {"match_date": "2025-01-01T00:00:00Z", "home_team": "Arsenal", "away_team": "Chelsea", "home_goals": 2, "away_goals": 0},
        {"match_date": "2025-01-01T00:00:00Z", "home_team": "Chelsea", "away_team": "Liverpool", "home_goals": 1, "away_goals": 1},
        {"match_date": "2025-01-02T00:00:00Z", "home_team": "Arsenal", "away_team": "Liverpool", "home_goals": 0, "away_goals": 1},
    ])
    rows["match_date"] = pd.to_datetime(rows["match_date"], utc=True)
    frame = build_training_frame(rows)
    same_day = frame[frame["match_date"] == pd.Timestamp("2025-01-01T00:00:00Z")]
    assert same_day["home_matches_seen"].tolist() == [0, 0]
    assert same_day["away_matches_seen"].tolist() == [0, 0]
    next_day = frame[frame["match_date"] == pd.Timestamp("2025-01-02T00:00:00Z")].iloc[0]
    assert next_day["home_matches_seen"] == 1
    assert next_day["away_matches_seen"] == 1


def test_historical_prediction_rejects_model_trained_after_kickoff(tmp_path):
    import os
    from train import main
    import joblib
    old = os.getcwd()
    try:
        os.chdir(ROOT)
        sys.argv = ["train.py", "--data", str(DATA), "--models-dir", str(tmp_path)]
        main()
    finally:
        os.chdir(old)
    dates = pd.to_datetime(pd.read_csv(DATA)["match_date"], utc=True)
    kickoff = dates.max().isoformat()
    with pytest.raises(ValueError, match="include matches on or after"):
        predict({"home_team": "Lakeside FC", "away_team": "Hill United", "kickoff": kickoff}, str(DATA), str(tmp_path))


def test_goal_line_probabilities_are_complementary(tmp_path):
    import os
    from train import main
    old = os.getcwd()
    try:
        os.chdir(ROOT)
        sys.argv = ["train.py", "--data", str(DATA), "--models-dir", str(tmp_path)]
        main()
        result = predict({"home_team": "Lakeside FC", "away_team": "Hill United"}, str(DATA), str(tmp_path))
    finally:
        os.chdir(old)
    for line in ("0_5", "1_5", "2_5", "3_5"):
        assert result["goal_markets"][f"over_{line}"] + result["goal_markets"][f"under_{line}"] == pytest.approx(1.0)
    assert result["data_quality"]["status"] in {"synthetic", "limited", "unvalidated"}


def test_optional_match_statistics_are_used_only_from_prior_matches():
    rows = pd.DataFrame([
        {"match_date": "2025-01-01T00:00:00Z", "home_team": "Arsenal", "away_team": "Chelsea",
         "home_goals": 2, "away_goals": 0, "home_shots": 14, "away_shots": 7,
         "home_shots_on_target": 6, "away_shots_on_target": 2, "home_corners": 8, "away_corners": 3},
        {"match_date": "2025-01-02T00:00:00Z", "home_team": "Arsenal", "away_team": "Liverpool",
         "home_goals": 1, "away_goals": 1, "home_shots": 9, "away_shots": 10,
         "home_shots_on_target": 3, "away_shots_on_target": 4, "home_corners": 5, "away_corners": 6},
    ])
    rows["match_date"] = pd.to_datetime(rows["match_date"], utc=True)
    frame = build_training_frame(rows)
    assert frame.iloc[0]["home_shots_avg"] == 0
    assert frame.iloc[0]["home_shots_coverage"] == 0
    assert frame.iloc[1]["home_shots_avg"] == pytest.approx(14.0)
    assert frame.iloc[1]["home_shots_coverage"] == 1
    assert frame.iloc[1]["home_shots_on_target_avg"] == pytest.approx(6.0)
    assert frame.iloc[1]["home_days_rest"] == pytest.approx(1.0)
