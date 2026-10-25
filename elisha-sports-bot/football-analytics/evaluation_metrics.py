"""Shared evaluation metrics for chronological football model validation."""
from __future__ import annotations

import numpy as np
import pandas as pd


def multiclass_brier_score(y_true, probabilities, labels) -> float:
    """Mean per-row sum of squared multiclass probability errors."""
    y = np.asarray(y_true, dtype=str)
    probs = np.asarray(probabilities, dtype=float)
    labels = [str(label) for label in labels]
    if probs.ndim != 2 or probs.shape != (len(y), len(labels)) or len(y) == 0:
        raise ValueError("Probability matrix shape must match non-empty targets and labels.")
    if not np.isfinite(probs).all() or (probs < 0).any() or (probs > 1).any():
        raise ValueError("Probabilities must be finite values between 0 and 1.")
    if not np.allclose(probs.sum(axis=1), 1.0, atol=1e-5):
        raise ValueError("Each probability row must sum to 1.")
    index = {label: i for i, label in enumerate(labels)}
    unknown = sorted(set(y) - set(index))
    if unknown:
        raise ValueError(f"Targets contain labels outside the declared classes: {unknown}")
    one_hot = np.zeros_like(probs)
    for row, label in enumerate(y):
        one_hot[row, index[label]] = 1.0
    return float(np.mean(np.sum((probs - one_hot) ** 2, axis=1)))


def top_label_calibration(y_true, probabilities, predicted_labels, bins: int = 10):
    """Return reliability bins for confidence in the model's top predicted class."""
    y = np.asarray(y_true, dtype=str)
    probs = np.asarray(probabilities, dtype=float)
    predicted = np.asarray(predicted_labels, dtype=str)
    if bins < 2 or len(y) == 0 or probs.ndim != 2 or len(y) != len(probs) or len(y) != len(predicted):
        raise ValueError("Calibration requires aligned non-empty targets, probabilities, predictions and >=2 bins.")
    confidence = probs.max(axis=1)
    edges = np.linspace(0.0, 1.0, bins + 1)
    rows = []
    for i in range(bins):
        mask = (confidence >= edges[i]) & (
            confidence <= edges[i + 1] if i == bins - 1 else confidence < edges[i + 1]
        )
        if mask.any():
            rows.append({
                "lower_bound": round(float(edges[i]), 3),
                "upper_bound": round(float(edges[i + 1]), 3),
                "count": int(mask.sum()),
                "mean_confidence": round(float(confidence[mask].mean()), 6),
                "accuracy": round(float((y[mask] == predicted[mask]).mean()), 6),
            })
    return rows


def assert_strictly_chronological(train_dates, test_dates) -> None:
    """Reject any split where a training match is not strictly earlier than test matches."""
    train = pd.to_datetime(train_dates, utc=True)
    test = pd.to_datetime(test_dates, utc=True)
    if len(train) == 0 or len(test) == 0:
        raise ValueError("Chronological train and test sets must both be non-empty.")
    # Football results datasets often store kickoff as a date with no time. Treat
    # the full UTC calendar day as indivisible so no same-day match can cross folds.
    if train.max().normalize() >= test.min().normalize():
        raise ValueError("Chronological leakage detected: training dates must be strictly earlier than test dates.")


def date_range(values) -> dict[str, str]:
    dates = pd.to_datetime(values, utc=True)
    if len(dates) == 0:
        return {"from": None, "to": None}
    return {"from": str(dates.min().date()), "to": str(dates.max().date())}
