# Historical season analysis

The `SEASON [league name] [year]` command builds a descriptive table from completed fixtures returned by the configured sports data provider.

Examples:
```text
SEASON Premier League 2023
SEASON 39 2022
```

The final argument is the season's starting year as expected by the provider. For many European leagues, a season labelled 2022/23 uses `2022`.

The report includes matches analyzed, goals, average goals per match, points, played/win/draw/loss records, goal difference, and home/away splits. Only completed fixtures with valid scores are counted.

## Requirements and limits
- Set `SPORTS_DATA_PROVIDER=api-football` and configure `SPORTS_API_KEY`.
- The provider account must allow access to the selected league and historical season. Historical coverage depends on the provider's plan.
- Demo/mock providers may not implement historical fixtures; the command reports when data is unavailable.
- This module produces descriptive summaries only, not match-outcome probabilities or betting recommendations.
- Run tests from `elisha-sports-bot` with `npm test`.
