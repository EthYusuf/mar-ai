# Changelog

All notable changes to mar-ai are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-11-17

### Added

- **Potential & Forecast MCP** (`potential`), the seventh built-in server. All sources are free, official and need no login.
  - `trend_potential`: daily interest for 1-4 topics (Wikipedia pageviews), a 30-day forecast with an 80% range, momentum, phase (rising, peaking, cooling, steady, emerging) and a 0-100 potential score with its breakdown.
  - `seasonality`: the typical year month by month over 2-8 years, peak and low months, seasonality strength and the best launch window.
  - `market_potential`: online audience, internet share, population, GDP per capita or mobile subscriptions by country, projected to 2030 (Our World in Data: ITU, UN WPP 2024, World Bank).
- **Forecast-ready line charts**: dashed forecast line, shaded 80% range, a forecast zone, peak markers, a proportional date axis, end-of-line labels with leader lines, a crosshair tooltip that lists every series with its range, keyboard navigation (← →), a table view for every chart and a reveal animation that respects reduced-motion settings.
- **`chart_ref` hand-off**: MCP tools save chart data to disk and return a short id; `show_chart({ chart_ref })` draws it exactly, so the model never retypes numbers.
- Time-series charts in the existing servers:
  - YouTube: views per video, a 5-video median, expected views for the next upload, like rate and momentum; median-view and like-rate comparison charts.
  - Meta Ad Library: new ads per week and how long the ads have been running.
  - Trends & News: rising-search volume and daily news volume.
  - Instagram: engagement per post; engagement-rate and follower comparison charts.
- `potansiyel-analizi` (potential analysis) skill and new Trend Radar suggestions.
- KPI cards can show a 0-100 meter, for example a potential score.

### Changed

- Reports are charts-first: the system prompt and every skill draw a line chart for anything with a time dimension and keep text short.
- Trend Radar now covers potential, forecasts and campaign timing.
- MCP requests identify the project in their User-Agent, as API etiquette asks.

### Removed

- `interest_over_time` (Trends & News), superseded by `trend_potential`, which adds the forecast and the metrics.

## [0.1.0] - 2026-11-17

First public beta.

- Electron desktop app: chat on one side, live report panels on the other (KPI cards, charts, ad cards, Reels storyboard, insights, tables), PDF export and local history.
- Claude Agent SDK engine running on the user's own Claude session (bundled Claude Code, no API key field).
- Six free, no-login MCP servers: Meta Ad Library, Instagram (public view), YouTube, Trends & News, Web research and Browser control (computer use).
- Chromium browser detection (Chrome, Edge, Brave, Vivaldi, Chromium, Opera, Opera GX) with a picker in Settings.
- First-run wizard, dark and light themes, four accent colors, resizable layout, Turkish and English UI.
- Auto-update through GitHub Releases and a one-click download link in the README.

[0.2.0]: https://github.com/EthYusuf/mar-ai/releases/tag/v0.2.0
[0.1.0]: https://github.com/EthYusuf/mar-ai/releases/tag/v0.1.0
