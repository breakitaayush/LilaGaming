# LILA BLACK Player Journey Visualizer

Web-based map telemetry explorer for LILA BLACK production gameplay data. The tool helps a level designer inspect player routes, combat zones, storm deaths, loot activity, and overall map usage across 5 days of live matches.

## Live Demo

- Hosted URL: `https://github.com/breakitaayush/LilaGaming`

## Tech Stack

- Frontend: vanilla HTML, CSS, JavaScript, Canvas 2D
- Data pipeline: Python, pandas, pyarrow
- Data format: generated static JSON + JS bootstrap bundle for zero-backend hosting

## What The Tool Supports

- Loads and parses the provided parquet telemetry
- Plots player journeys on the correct minimap
- Separates humans and bots visually
- Marks kills, deaths, loot, and storm deaths distinctly
- Filters by map, date, and match
- Playback/timeline for match progression
- Heatmaps for kill zones, death zones, and traffic
- Works as a static frontend and can also be opened directly from disk via `data.bundle.js`

## Repo Structure

```text
main.py                # data ingestion + transformation pipeline
validate_tool.py       # automated validation against raw parquet
TESTING.md             # manual smoke-test checklist
ARCHITECTURE.md        # one-page design/decision doc
INSIGHTS.md            # three data-backed gameplay insights
Frontend/
  index.html           # app shell
  script.js            # rendering, filters, playback, heatmaps
  style.css            # single-page dashboard layout
  data.json            # reduced render dataset
  metadata.json        # filter + summary metadata
  heatmaps.json        # precomputed heatmap grids
  data.bundle.js       # file-safe bootstrap payload
  minimaps/            # supplied map images
```

## Setup

### 1. Create / activate the Python environment

This repo was built with a local virtual environment at `.venv`.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install pandas pyarrow
```

### 2. Place the raw dataset

By default the ingestion script reads from:

```text
/Users/aayushpaliwal/Downloads/player_data
```

If your dataset lives somewhere else, update `BASE_PATH` in [`main.py`](/Users/aayushpaliwal/PycharmProjects/LilaGaming/main.py).

### 3. Regenerate frontend assets

```bash
./.venv/bin/python main.py
```

This regenerates:

- [`Frontend/data.json`](/Users/aayushpaliwal/PycharmProjects/LilaGaming/Frontend/data.json)
- [`Frontend/metadata.json`](/Users/aayushpaliwal/PycharmProjects/LilaGaming/Frontend/metadata.json)
- [`Frontend/heatmaps.json`](/Users/aayushpaliwal/PycharmProjects/LilaGaming/Frontend/heatmaps.json)
- [`Frontend/data.bundle.js`](/Users/aayushpaliwal/PycharmProjects/LilaGaming/Frontend/data.bundle.js)

### 4. Open the app

Options:

1. Open [`Frontend/index.html`](/Users/aayushpaliwal/PycharmProjects/LilaGaming/Frontend/index.html) directly in the browser.
2. Or serve `Frontend/` with any static host/server.

Because the repo also generates [`Frontend/data.bundle.js`](/Users/aayushpaliwal/PycharmProjects/LilaGaming/Frontend/data.bundle.js), the app still works when opened directly as a local file.

## Environment Variables

None required.

## Validation

Automated validation:

```bash
./.venv/bin/python validate_tool.py
```

This checks:

- parquet ingestion
- expected maps/events/dates
- coordinate bounds
- missing IDs
- metadata consistency
- sample match summaries vs raw data
- heatmap payload structure

Manual smoke-test steps are listed in [`TESTING.md`](/Users/aayushpaliwal/PycharmProjects/LilaGaming/TESTING.md).

## Feature Walkthrough

1. Choose a `Map`, `Session Date`, and either a specific `Match` or `All matches`.
2. Toggle `Humans`, `Bots`, `Paths`, and event layers depending on the question you want to answer.
3. Use the playback slider or `Play / Pause / Replay` controls to watch a match unfold over time.
4. Switch heatmaps to `Kill zones`, `Death zones`, or `High traffic` to see macro patterns.
5. Hover any visible point to inspect event type, actor type, match, and timeline position.
6. Use zoom/pan to inspect congested regions without leaving the single-page dashboard.

## Notes / Assumptions

- `ts` in parquet is treated as match-relative time, not wall-clock time.
- `session_date` is derived from the folder name because the parquet timestamp is not a calendar timestamp.
- `y` is elevation only and is ignored for 2D minimap plotting.
- Bots are identified from numeric `user_id` values, per the README.
- Heatmaps are precomputed for `map`, `date + map`, and `match` scopes for responsive UI filtering.

## Deployment Notes

The frontend is static and can be deployed easily on:

- Netlify
- Vercel
- GitHub Pages

Recommended deployment target:

- publish the `Frontend/` directory as a static site
- keep the generated data assets committed in the repo

## Submission Checklist

- [x] Add the real hosted URL at the top of this README
- [x] Player paths render on the minimap
- [x] Humans and bots are visually distinct
- [x] Kill, death, loot, and storm events are marked
- [x] Filtering by map/date/match works
- [x] Playback/timeline works
- [x] Heatmaps work
- [x] Architecture doc included
- [x] Insights doc included
- [x] Testing docs included
