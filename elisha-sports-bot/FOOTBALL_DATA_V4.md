# football-data.org v4 provider notes

The `api-football` provider setting is retained for compatibility with the app's existing provider factory, but it now connects to football-data.org v4.

## Configuration

- Set `SPORTS_DATA_PROVIDER=api-football`.
- Set `SPORTS_API_BASE_URL=https://api.football-data.org/v4` unless using a compatible proxy.
- Set `FOOTBALL_DATA_API_KEY` to your football-data.org token. The older `SPORTS_API_KEY` variable is accepted as an alias.
- Set `SPORTS_API_LEAGUE_ID` to a football-data.org competition code such as `PL` (Premier League). Common league names and codes are normalized by the provider.
- `SPORTS_API_SEASON` is the starting year of the season, as expected by football-data.org v4.

## Coverage and limitations

Fixtures and results are requested by competition and date range; historical season requests use the provider's `season` filter. Standings are read from the v4 standings response. The v4 integration does not provide the app's previous team-form, head-to-head, injuries, lineup, or team-strength data. Those methods return empty/null values or an explicit `unsupported` status rather than inventing information.

The provider is tested with mocked HTTP responses. Configure a valid token and a competition available under your football-data.org plan to verify live access; competition coverage and rate limits depend on that account.
