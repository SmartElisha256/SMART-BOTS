"""League registry: which competitions the bot can model and where their files live.

Each league is trained separately. Elo and form are not shared across leagues.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent


@dataclass(frozen=True)
class League:
    key: str
    name: str
    fd_code: str  # football-data.co.uk competition code (E0, SP1, ...)
    aliases: tuple[str, ...] = field(default_factory=tuple)
    default: bool = True


LEAGUES: dict[str, League] = {
    "epl": League("epl", "Premier League", "E0", ("premier league", "english premier league", "epl", "pl")),
    "laliga": League("laliga", "La Liga", "SP1", ("la liga", "laliga", "spanish la liga", "primera division")),
    "bundesliga": League("bundesliga", "Bundesliga", "D1", ("bundesliga", "german bundesliga")),
    "seriea": League("seriea", "Serie A", "I1", ("serie a", "seriea", "italian serie a")),
    "ligue1": League("ligue1", "Ligue 1", "F1", ("ligue 1", "french ligue 1", "france ligue 1")),
    "championship": League("championship", "Championship", "E1", ("championship", "efl championship", "english championship"), default=False),
    "eredivisie": League("eredivisie", "Eredivisie", "N1", ("eredivisie", "dutch eredivisie"), default=False),
    "primeira": League("primeira", "Primeira Liga", "P1", ("primeira liga", "liga portugal", "portuguese primeira liga"), default=False),
}


def get_league(key: str) -> League:
    try:
        return LEAGUES[key.strip().lower()]
    except (KeyError, AttributeError):
        raise ValueError(f"Unknown league '{key}'. Known leagues: {', '.join(sorted(LEAGUES))}.") from None


def resolve_league_name(value: str | None) -> League | None:
    """Map a league key or a provider's competition name to a League (or None)."""
    if not value:
        return None
    text = re.sub(r"\s+", " ", str(value).strip().lower())
    if text in LEAGUES:
        return LEAGUES[text]
    for league in LEAGUES.values():
        if text == league.name.lower() or text in league.aliases:
            return league
    return None


def default_keys() -> list[str]:
    return [k for k, v in LEAGUES.items() if v.default]


def season_file_regex(key: str) -> re.Pattern:
    return re.compile(rf"^{re.escape(key)}_\d{{4}}_\d{{2}}\.csv$")


def data_path(key: str, root: Path = ROOT) -> Path:
    return root / "data" / f"{get_league(key).key}_historical.csv"


def models_dir(key: str, root: Path = ROOT) -> Path:
    return root / "models" if get_league(key).key == "epl" else root / "models" / get_league(key).key


def metadata_path(key: str, root: Path = ROOT) -> Path:
    return root / "data" / ("dataset_metadata.json" if get_league(key).key == "epl" else f"{key}_dataset_metadata.json")


def is_trained(key: str, root: Path = ROOT) -> bool:
    d = models_dir(key, root)
    return data_path(key, root).exists() and all((d / n).exists() for n in ("result.joblib", "home_goals.joblib", "away_goals.joblib"))


def trained_leagues(root: Path = ROOT) -> list[str]:
    return [k for k in LEAGUES if is_trained(k, root)]


def season_start_year(today=None) -> int:
    """Season starting year for a date: Jul-Dec -> this year, Jan-Jun -> last year."""
    from datetime import datetime, timezone
    today = today or datetime.now(timezone.utc)
    return today.year if today.month >= 7 else today.year - 1


def season_code(start_year: int) -> str:
    return f"{start_year}_{str(start_year + 1)[-2:]}"
