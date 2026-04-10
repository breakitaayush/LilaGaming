import json
from pathlib import Path

import pandas as pd

import main


ROOT = Path(__file__).resolve().parent
FRONTEND = ROOT / "Frontend"
DATA_PATH = FRONTEND / "data.json"
METADATA_PATH = FRONTEND / "metadata.json"
HEATMAP_PATH = FRONTEND / "heatmaps.json"

MOVEMENT_EVENTS = {"Position", "BotPosition"}
ALLOWED_EVENTS = {
    "Position",
    "BotPosition",
    "Kill",
    "Killed",
    "BotKill",
    "BotKilled",
    "KilledByStorm",
    "Loot",
}
ALLOWED_MAPS = {"AmbroseValley", "GrandRift", "Lockdown"}
EXPECTED_DATES = {
    "2026-02-10",
    "2026-02-11",
    "2026-02-12",
    "2026-02-13",
    "2026-02-14",
}


class Validator:
    def __init__(self) -> None:
        self.failures: list[str] = []
        self.checks: list[tuple[str, bool, str]] = []

    def check(self, name: str, condition: bool, details: str = "") -> None:
        self.checks.append((name, condition, details))
        if not condition:
            self.failures.append(f"{name}: {details}")

    def report(self) -> int:
        print("\nValidation Results")
        print("==================")
        for name, ok, details in self.checks:
            status = "PASS" if ok else "FAIL"
            suffix = f" - {details}" if details else ""
            print(f"[{status}] {name}{suffix}")

        if self.failures:
            print("\nFailures")
            print("--------")
            for failure in self.failures:
                print(f"- {failure}")
            return 1

        print("\nAll validation checks passed.")
        return 0


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def validate() -> int:
    validator = Validator()

    validator.check("Frontend data.json exists", DATA_PATH.exists(), str(DATA_PATH))
    validator.check("Frontend metadata.json exists", METADATA_PATH.exists(), str(METADATA_PATH))
    validator.check("Frontend heatmaps.json exists", HEATMAP_PATH.exists(), str(HEATMAP_PATH))
    if validator.failures:
        return validator.report()

    render_records = load_json(DATA_PATH)
    metadata = load_json(METADATA_PATH)
    heatmaps = load_json(HEATMAP_PATH)

    raw_df = main.load_all_data(main.BASE_PATH)
    raw_df = main.enrich_data(raw_df)
    raw_df = main.map_coordinates(raw_df)

    render_df = pd.DataFrame(render_records)

    validator.check("Raw rows loaded", len(raw_df) > 0, f"{len(raw_df)} rows")
    validator.check("Render rows loaded", len(render_df) > 0, f"{len(render_df)} rows")
    validator.check("Allowed maps only", set(raw_df["map_id"].unique()) == ALLOWED_MAPS, str(sorted(raw_df["map_id"].unique())))
    validator.check("Allowed events only", set(raw_df["event"].unique()) == ALLOWED_EVENTS, str(sorted(raw_df["event"].unique())))
    validator.check("Expected dates present", set(raw_df["session_date"].unique()) == EXPECTED_DATES, str(sorted(raw_df["session_date"].unique())))

    validator.check(
        "Render rows all in bounds",
        render_df["px"].between(0, 1024).all() and render_df["py"].between(0, 1024).all(),
        f"px={render_df['px'].min()}..{render_df['px'].max()}, py={render_df['py'].min()}..{render_df['py'].max()}",
    )
    validator.check("No NaN match IDs in render data", render_df["match_id"].notna().all())
    validator.check("No NaN user IDs in render data", render_df["user_id"].notna().all())
    validator.check(
        "Movement rows exist in render data",
        render_df["event"].isin(MOVEMENT_EVENTS).any(),
        f"{int(render_df['event'].isin(MOVEMENT_EVENTS).sum())} movement rows",
    )

    validator.check("Metadata date list correct", set(metadata.get("dates", [])) == EXPECTED_DATES, str(metadata.get("dates", [])))
    validator.check("Metadata map list correct", set(metadata.get("maps", [])) == ALLOWED_MAPS, str(metadata.get("maps", [])))
    validator.check(
        "Metadata total match count matches raw",
        metadata.get("total_matches") == int(raw_df["match_id"].nunique()),
        f"metadata={metadata.get('total_matches')} raw={raw_df['match_id'].nunique()}",
    )
    validator.check(
        "Metadata total player count matches raw",
        metadata.get("total_players") == int(raw_df["user_id"].nunique()),
        f"metadata={metadata.get('total_players')} raw={raw_df['user_id'].nunique()}",
    )
    validator.check(
        "Metadata out_of_bounds_rows matches raw",
        metadata.get("out_of_bounds_rows") == int((~raw_df["in_bounds"]).sum()),
        f"metadata={metadata.get('out_of_bounds_rows')} raw={(~raw_df['in_bounds']).sum()}",
    )

    summary_index = {item["match_id"]: item for item in metadata.get("matches", [])}
    validator.check(
        "Metadata has one summary per match",
        len(summary_index) == int(raw_df["match_id"].nunique()),
        f"summaries={len(summary_index)} raw={raw_df['match_id'].nunique()}",
    )

    sampled_matches = metadata.get("matches", [])[:5] + metadata.get("matches", [])[len(metadata.get("matches", [])) // 2: len(metadata.get("matches", [])) // 2 + 5]
    seen = set()
    unique_sampled_matches = []
    for match in sampled_matches:
        if match["match_id"] not in seen:
            unique_sampled_matches.append(match["match_id"])
            seen.add(match["match_id"])

    for match_id in unique_sampled_matches[:8]:
        group = raw_df[raw_df["match_id"] == match_id]
        summary = summary_index[match_id]
        validator.check(
            f"Summary players match for {match_id[:8]}",
            summary["players"] == int(group["user_id"].nunique()),
            f"summary={summary['players']} raw={group['user_id'].nunique()}",
        )
        validator.check(
            f"Summary humans match for {match_id[:8]}",
            summary["humans"] == int(group.loc[~group["is_bot"], "user_id"].nunique()),
            f"summary={summary['humans']} raw={group.loc[~group['is_bot'], 'user_id'].nunique()}",
        )
        validator.check(
            f"Summary bots match for {match_id[:8]}",
            summary["bots"] == int(group.loc[group["is_bot"], "user_id"].nunique()),
            f"summary={summary['bots']} raw={group.loc[group['is_bot'], 'user_id'].nunique()}",
        )
        validator.check(
            f"Summary loot matches for {match_id[:8]}",
            summary["loot_events"] == int((group["event"] == "Loot").sum()),
            f"summary={summary['loot_events']} raw={(group['event'] == 'Loot').sum()}",
        )

        render_group = render_df[(render_df["match_id"] == match_id) & (render_df["event"].isin(MOVEMENT_EVENTS))]
        raw_group = group[group["event"].isin(MOVEMENT_EVENTS)]
        validator.check(
            f"Render movement exists for {match_id[:8]}",
            len(render_group) > 0 or len(raw_group) == 0,
            f"render={len(render_group)} raw={len(raw_group)}",
        )

    validator.check("Heatmaps include by_map", isinstance(heatmaps.get("by_map"), dict))
    validator.check("Heatmaps include by_date", isinstance(heatmaps.get("by_date"), dict))
    validator.check("Heatmaps include by_match", isinstance(heatmaps.get("by_match"), dict))

    for map_id in ALLOWED_MAPS:
        validator.check(
            f"Heatmap grids exist for {map_id}",
            map_id in heatmaps["by_map"],
            f"maps available={list(heatmaps['by_map'].keys())}",
        )

    if heatmaps.get("by_map"):
        sample_grid = next(iter(heatmaps["by_map"].values()))
        for key in ("kills", "deaths", "traffic"):
            grid = sample_grid[key]
            validator.check(f"Heatmap {key} is 32x32", len(grid) == 32 and all(len(row) == 32 for row in grid))

    return validator.report()


if __name__ == "__main__":
    raise SystemExit(validate())
