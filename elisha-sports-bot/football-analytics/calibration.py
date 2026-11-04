"""Chronological one-vs-rest isotonic calibration for the 1X2 classifier.

The calibrators are fit on matches the classifier has not trained on, then applied
and renormalised so home/draw/away still sum to 1.
"""
from __future__ import annotations

from typing import Any

import numpy as np
from sklearn.isotonic import IsotonicRegression


def fit_multiclass_isotonic(proba: np.ndarray, labels: np.ndarray, classes: list[str]) -> list[IsotonicRegression]:
    proba = np.asarray(proba, dtype=float)
    labels = np.asarray(labels)
    if proba.ndim != 2 or proba.shape[1] != len(classes):
        raise ValueError("Probability matrix must have one column per class.")
    if len(labels) != len(proba) or len(labels) < 30:
        raise ValueError("At least 30 calibration rows are required.")
    calibrators: list[IsotonicRegression] = []
    for index, label in enumerate(classes):
        model = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
        model.fit(proba[:, index], (labels == label).astype(float))
        calibrators.append(model)
    return calibrators


def apply_multiclass_isotonic(proba: np.ndarray, calibrators: list[Any]) -> np.ndarray:
    proba = np.asarray(proba, dtype=float)
    if proba.ndim == 1:
        proba = proba.reshape(1, -1)
    if len(calibrators) != proba.shape[1]:
        raise ValueError("Calibrator count does not match probability columns.")
    adjusted = np.column_stack([
        np.clip(model.predict(proba[:, index]), 0.0, 1.0)
        for index, model in enumerate(calibrators)
    ])
    totals = adjusted.sum(axis=1, keepdims=True)
    totals = np.where(totals <= 1e-12, 1.0, totals)
    return adjusted / totals
