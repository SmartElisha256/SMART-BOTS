# Historical football data and expansion plan

## Current EPL baseline

The football-analytics module contains seven EPL season CSV files covering 2020/21 through
2026/27. The 2026/27 file is partial. The committed dataset metadata snapshot reports
2,380 combined records from 2020-09-12 through 2026-11-08; regenerate metadata after each
data refresh.

These files are historical, not a live feed. The existing EPL model and feature builder
are competition-specific.

## Global data expansion

Do not concatenate other competitions into the EPL training CSV. Each new competition
must first be imported into the canonical multi-competition format described in
football-analytics/GLOBAL_DATA_ARCHITECTURE.md.

The first canonical match file is data/global_matches.csv. Required fields include:

- Stable match ID and provider/source identifier.
- Stable competition ID, competition name, country and season.
- ISO-8601 match timestamp and completed status.
- Stable home and away team IDs and canonical names.
- Full-time home and away scores.

Optional fields include possession, shots, shots on target, corners, fouls, cards,
half-time scores and xG. Missing optional fields remain missing.

Validate an imported file before it is used:

    cd elisha-sports-bot/football-analytics
    python global_dataset.py --data data/global_matches.csv
    python global_dataset.py --data data/global_matches.csv --output data/global_quality_report.json

The validator checks schema, identity fields, completed status, dates, duplicate matches,
scores and optional-stat ranges. It does not verify the provider's legal terms or prove
that the source data is authentic.

## Provider and licensing requirements

Choose a provider based on the exact competitions and fields needed. Record the provider,
retrieval timestamp, source match IDs, checksums, date range, completeness and permitted use.

Publicly downloadable data is not automatically licensed for commercial redistribution or
use in a paid bot. StatsBomb Open Data contains selected competitions and event/lineup
records for research and genuine interest, with attribution requirements. Check its user
agreement and obtain written permission before using it commercially:
https://github.com/hudl/open-data

The current Node sports provider uses football-data.org v4 for selected fixtures and
standings. Its current implementation explicitly reports player availability, lineups and
team-strength data as unsupported. It is not a global event/player data source.

## Safe rollout

1. Verify source terms and data coverage.
2. Preserve raw source files and checksums.
3. Normalize competition, team and player identities.
4. Run the global dataset validator and review per-competition coverage.
5. Add one additional competition at a time.
6. Keep chronological evaluation and report missing-data coverage.
7. Add player and event-level analytics only where the provider supplies reliable records.
8. Connect validated descriptive analytics to the existing Node.js bot after tests pass.

Never mix synthetic test data with real historical records. Do not train a competition model
until its data provenance, identity mapping, sample size and evaluation are adequate.
