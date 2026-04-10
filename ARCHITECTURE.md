# Architecture

## What I Built And Why

I built a static browser-based telemetry explorer with a lightweight Python preprocessing step.

- Frontend: vanilla HTML/CSS/JS + Canvas
  - Reason: fastest way to ship a responsive visualization tool without introducing framework overhead
- Data pipeline: Python + pandas + pyarrow
  - Reason: parquet support is mature, transformation logic is compact, and iteration speed is high
- Hosting model: static frontend assets
  - Reason: the dataset is small enough to precompute for a take-home, which avoids standing up a backend and makes deployment simpler on Netlify/Vercel/GitHub Pages

## Data Flow

1. Raw parquet files are read from the provided `player_data/` folders.
2. The pipeline decodes `event` from bytes to strings.
3. `session_date` is derived from the folder name (`February_10` -> `2026-02-10`).
4. `is_bot` is inferred from numeric `user_id` values.
5. `ts_rel` is computed per `match_id` so playback can reconstruct a match timeline.
6. World coordinates are mapped to minimap pixels.
7. Movement rows are downsampled for rendering, while event rows are kept intact.
8. Three frontend payloads are emitted:
   - `data.json`: reduced render dataset
   - `metadata.json`: filter data + match summaries
   - `heatmaps.json`: precomputed 32x32 grids for traffic, kills, and deaths
9. `data.bundle.js` is also emitted so the app works when opened directly from disk and not only through a web server.
10. The browser loads those static assets and renders the selected scope onto the minimap canvas.

## Coordinate Mapping

The README provided map-specific `scale`, `origin_x`, and `origin_z` values for each map. I used those values directly.

For a world position `(x, z)`:

```text
u = (x - origin_x) / scale
v = (z - origin_z) / scale

pixel_x = u * 1024
pixel_y = (1 - v) * 1024
```

Important details:

- only `x` and `z` are used for 2D plotting
- `y` is elevation and intentionally ignored
- `pixel_y` is flipped because the minimap image origin is top-left
- generated coordinates are clamped/validated against the 1024x1024 minimap bounds

I also added automated validation to confirm:

- all rendered coordinates are in bounds
- metadata totals match raw parquet truth
- sampled match summaries still align with the raw data

## Assumptions / Ambiguities

| Area | Assumption | Handling |
|---|---|---|
| Date | `ts` is not a wall-clock timestamp | Derived `session_date` from folder names |
| Bot detection | Numeric `user_id` means bot | Implemented directly from README guidance |
| Local viewing | Evaluators may open `index.html` directly | Added `data.bundle.js` so the app still loads without a server |
| Heatmap UX | Designers may inspect both a single match and broader trends | Precomputed heatmaps by map, by date+map, and by match |

## Major Tradeoffs

| Decision | Chosen Option | Alternative | Why |
|---|---|---|---|
| Rendering | Canvas 2D | SVG / React charting | Better for dense path/event overlays and fast enough for this data size |
| Data serving | Static JSON/JS | Backend API | Faster to ship and easier to host for a take-home |
| Heatmaps | Precomputed grids | Compute in browser on every filter change | Precompute keeps interaction snappy and logic simple |
| Sampling | Downsample movement only | Render all movement points | Reduced visual clutter and payload size without losing event fidelity |
| Frontend stack | Vanilla JS | React | Lower setup cost and simpler deployment for a single-purpose tool |
