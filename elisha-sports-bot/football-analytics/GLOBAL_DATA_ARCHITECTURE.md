# SMART-BOTS global football data architecture

## Purpose

This document defines the provider-neutral data foundation for worldwide team, player,
competition and match analysis. The existing EPL training pipeline remains separate until
each new competition has passed source, identity, coverage and quality checks.

This is a staged architecture, not a claim that the repository already contains worldwide
historical data or fully trained models for every competition.

## Current baseline

At the time of this design:

- The repository has seven EPL season CSV files: 2020/21 through 2026/27.
- The 2026/27 file is partial, not a completed season.
- data/dataset_metadata.json reports 2,380 combined rows dated 2020-09-12 through
  2026-11-08. Regenerate the metadata after any data refresh.
- The existing Python model is EPL-focused and its feature builder expects normalized
  match-level data. Do not concatenate other leagues into that model without a competition
  identifier and a validation plan.
- The existing Node provider is based on football-data.org v4 despite the legacy
  ApiFootballProvider class name. It provides selected competition fixtures and tables;
  its current implementation explicitly reports player availability, lineups and team
  strength as unsupported.

## Target data domains

1. Competition and season registry: stable competition IDs, country, gender, format,
   season boundaries, provider IDs and coverage notes.
2. Team registry: stable internal team IDs, provider IDs, canonical names and dated aliases.
3. Player registry: stable internal player IDs, provider IDs, names, positions and dated
   team memberships.
4. Match records: stable match IDs, competition, season, kickoff, status, teams, venue,
   referee and final score.
5. Match statistics: possession, shots, shots on target, corners, fouls and cards, each
   with source and availability metadata.
6. Event data: goals, assists, substitutions, cards, shots, passes, carries, duels and
   event timestamps where the provider licence and coverage permit.
7. Lineups and player appearances: starters, substitutes, minutes, formation and
   player-match statistics.
8. Context records: injuries, suspensions, weather and other time-sensitive information,
   each with a source timestamp and an explicit available/unavailable state.

## Canonical match CSV contract

The first global import format is data/global_matches.csv. It must contain:

| Field | Meaning |
|---|---|
| match_id | Stable provider match ID, namespaced by source if necessary |
| source | Provider or dataset identifier |
| competition_id | Stable internal competition ID |
| competition_name | Display name |
| country | Country or international region |
| season | Season label, for example 2025/2026 |
| match_date | ISO-8601 timestamp with timezone |
| status | Completed status only |
| home_team_id, away_team_id | Stable internal team IDs |
| home_team, away_team | Canonical display names |
| home_goals, away_goals | Non-negative integer full-time score |

Optional columns include half-time scores, possession, shots, shots on target, corners,
fouls, cards and xG. Missing optional statistics must remain missing; they must not be
silently converted to zero.

Use global_dataset.py to validate the contract and produce a coverage report:

    python global_dataset.py --data data/global_matches.csv
    python global_dataset.py --data data/global_matches.csv --output data/global_quality_report.json

The validator rejects synthetic rows, unfinished fixtures, duplicate IDs, duplicate
competition/date/team fixtures, invalid scores, invalid dates and impossible possession
percentages. It does not establish the authenticity or licence of a provider's data.

## Identity and deduplication rules

- Never join teams using display names alone.
- Maintain internal IDs and a dated alias map for each provider's IDs and names.
- Preserve the provider's original IDs and raw payloads for traceability.
- Namespace source match IDs when IDs can collide between providers.
- Keep women's, men's, youth and reserve competitions distinct.
- Treat a rescheduled fixture as one match with an updated kickoff, not as a second match.
- Keep source attribution and retrieval timestamps for every imported record.

## Provider strategy

Use a provider adapter per source and normalize its output into the canonical contract.
Keep raw provider responses immutable. Store a manifest with provider, retrieval time,
date range, row count, checksum, licence status and transformation version.

The current football-data.org adapter is useful for its supported competitions, but it is
not a global event/player data solution. Before expanding coverage, select a provider that
contractually covers the competitions and fields required by the product.

StatsBomb Open Data provides selected competitions with match, event and lineup JSON. Its
repository says the data is shared for research and genuine interest and requires attribution
(and logo use for published analysis). Check its user agreement and obtain written permission
before using it in a paid or commercial bot:
https://github.com/hudl/open-data

Do not assume that a dataset being publicly downloadable means it can be redistributed or
used commercially. Keep provider terms, attribution and permitted uses in the source registry.

## Model architecture

Build separate analytical models from the shared data foundation:

- Team performance: rolling form, home/away splits, attack/defence rates and Elo-style
  strength history.
- Player performance: appearances, minutes, event contributions and position-adjusted
  descriptive metrics where reliable player data exists.
- Shot quality: xG analysis from shot-level event data with documented provider definitions.
- Tactical summaries: formations, pressing and possession patterns only when event or
  tracking data supports those claims.
- Competition analytics: standings, season summaries and historical trends.
- Data quality and monitoring: freshness, completeness, source drift and model evaluation.

Do not train a model for a competition until its historical sample, identity mapping,
feature coverage and chronological evaluation are adequate. Prefer competition-aware models
or hierarchical models over blindly mixing different leagues.

## Validation and release gates

1. Validate source terms and coverage.
2. Preserve raw downloads and checksums.
3. Normalize competition, team and player identities.
4. Run global_dataset.py and review per-competition coverage.
5. Check duplicates, missing values, impossible statistics and season completeness.
6. Split evaluation chronologically; never use future records to build earlier features.
7. Report sample sizes and missing-feature coverage beside every metric.
8. Compare each model with simple baselines and calibrate only on a separate calibration
   window.
9. Release only after automated tests and a manual data-quality review pass.

## Rollout

- Phase 1: retain the existing EPL pipeline; add canonical global schema and validation.
- Phase 2: import one additional competition using a licensed source and verified IDs.
- Phase 3: add competition-aware team summaries and player records.
- Phase 4: add event-level xG and tactical analysis for competitions with event coverage.
- Phase 5: add additional leagues in batches, with per-competition quality reports.
- Phase 6: expose descriptive analytics through the existing Node.js service and bot.

The 150,000+ match long-term target is a capacity and coverage ambition, not a required
minimum for useful analytics. Data quality, provenance and coverage per competition matter
more than a large unverified row count.
