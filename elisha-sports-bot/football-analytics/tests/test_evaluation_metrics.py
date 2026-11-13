from datetime import datetime, timezone

import numpy as np
import pytest

from evaluation_metrics import (
    assert_strictly_chronological,
    date_range,
    multiclass_brier_score,
    top_label_calibration,
)


def test_multiclass_brier_score_known_case():
    score = multiclass_brier_score(
        ["H", "A"],
        [[0.7, 0.2, 0.1], [0.1, 0.2, 0.7]],
        ["H", "D", "A"],
    )
    assert score == pytest.approx((0.14 + 0.14) / 2)


def test_multiclass_brier_rejects_invalid_probability_rows():
    with pytest.raises(ValueError):
        multiclass_brier_score(["H"], [[0.4, 0.4, 0.4]], ["H", "D", "A"])
    with pytest.raises(ValueError):
        multiclass_brier_score(["X"], [[0.2, 0.3, 0.5]], ["H", "D", "A"])


def test_top_label_calibration_reports_counts_and_confidence():
    rows = top_label_calibration(
        ["H", "A", "D"],
        [[0.8, 0.1, 0.1], [0.1, 0.1, 0.8], [0.2, 0.6, 0.2]],
        ["H", "A", "D"],
        bins=5,
    )
    assert sum(row["count"] for row in rows) == 3
    assert all(0 <= row["mean_confidence"] <= 1 for row in rows)
    assert all(0 <= row["accuracy"] <= 1 for row in rows)


def test_strict_chronology_accepts_earlier_train_and_later_test():
    assert_strictly_chronological(
        [datetime(2024, 1, 1, tzinfo=timezone.utc), datetime(2024, 1, 2, tzinfo=timezone.utc)],
        [datetime(2024, 1, 3, tzinfo=timezone.utc)],
    )


def test_strict_chronology_rejects_same_day_or_future_train_rows():
    with pytest.raises(ValueError, match="leakage"):
        assert_strictly_chronological(
            ["2024-01-03T10:00:00Z"], ["2024-01-03T12:00:00Z"]
        )
    with pytest.raises(ValueError, match="leakage"):
        assert_strictly_chronological(["2024-01-04"], ["2024-01-03"])


def test_date_range_reports_utc_calendar_dates():
    assert date_range(["2024-01-02T23:00:00Z", "2024-02-03T00:00:00Z"]) == {
        "from": "2024-01-02",
        "to": "2024-02-03",
    }
