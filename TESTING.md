# Testing Guide

## Automated Validation

Run:

```bash
./.venv/bin/python validate_tool.py
```

What it checks:

- raw parquet ingestion loads correctly
- expected maps, events, and session dates are present
- generated frontend rows stay within minimap bounds
- render data has no missing `match_id` or `user_id`
- metadata totals match the raw dataset
- sampled match summaries match raw parquet truth
- heatmap payload structure is present and valid

## Manual Smoke Test

Open [`Frontend/index.html`](/Users/aayushpaliwal/PycharmProjects/LilaGaming/Frontend/index.html) and verify:

1. Map, date, and match dropdowns populate immediately.
2. Changing map/date/match resets playback to the beginning.
3. Human and bot journeys are both visible on at least one match.
4. Kill, death, loot, and storm markers all appear with distinct styling.
5. Heatmap switches between kill, death, and traffic overlays.
6. Tooltip shows correct event, player type, match, and time.
7. "All matches" view changes stats and heatmaps for the selected day.
8. Zoom and pan move the full scene together.
9. No desktop page scrolling is needed in the final layout.

## Submission Confidence Checks

Before submission, manually truth-check at least:

- 1 match on `AmbroseValley`
- 1 match on `GrandRift`
- 1 match on `Lockdown`

For each one, compare the UI against raw parquet counts for:

- unique actors
- humans vs bots
- loot events
- storm deaths
- movement path presence
