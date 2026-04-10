import json
import os
from datetime import datetime
from pathlib import Path

import pandas as pd
import pyarrow.parquet as pq


BASE_PATH = Path("/Users/aayushpaliwal/Downloads/player_data")
OUTPUT_DIR = Path("Frontend")

GRID_SIZE = 32
IMAGE_SIZE = 1024
BIN_SIZE = IMAGE_SIZE / GRID_SIZE
MOVEMENT_EVENTS = {"Position", "BotPosition"}
SAMPLE_RATE = 8

MAP_CONFIG = {
    "AmbroseValley": {"scale": 900, "origin_x": -370, "origin_z": -473},
    "GrandRift": {"scale": 581, "origin_x": -290, "origin_z": -290},
    "Lockdown": {"scale": 1000, "origin_x": -500, "origin_z": -500},
}

DATA_FILE = OUTPUT_DIR / "data.json"
HEATMAP_FILE = OUTPUT_DIR / "heatmaps.json"
METADATA_FILE = OUTPUT_DIR / "metadata.json"
DATA_BUNDLE_FILE = OUTPUT_DIR / "data.bundle.js"


def parse_session_date(folder_name: str) -> str:
    return datetime.strptime(f"{folder_name}_2026", "%B_%d_%Y").strftime("%Y-%m-%d")


def parse_ids_from_filename(filename: str) -> tuple[str | None, str | None]:
    user_id, _, remainder = filename.partition("_")
    return user_id or None, remainder or None


def load_all_data(base_path: Path) -> pd.DataFrame:
    frames = []
    file_count = 0

    for day_dir in sorted(base_path.iterdir()):
        if day_dir.name.startswith(".") or not day_dir.is_dir():
            continue

        try:
            session_date = parse_session_date(day_dir.name)
        except ValueError:
            continue

        for file_path in sorted(day_dir.iterdir()):
            if file_path.name.startswith(".") or not file_path.is_file():
                continue

            try:
                table = pq.read_table(file_path)
                df = table.to_pandas()
            except Exception as exc:
                print(f"Skipping {file_path}: {str(exc)[:140]}")
                continue

            fallback_user_id, fallback_match_id = parse_ids_from_filename(file_path.name)

            if "event" in df.columns:
                df["event"] = df["event"].apply(
                    lambda value: value.decode("utf-8") if isinstance(value, bytes) else value
                )

            if "user_id" not in df.columns:
                df["user_id"] = fallback_user_id
            else:
                df["user_id"] = df["user_id"].fillna(fallback_user_id)

            if "match_id" not in df.columns:
                df["match_id"] = fallback_match_id
            else:
                df["match_id"] = df["match_id"].fillna(fallback_match_id)

            df["user_id"] = df["user_id"].astype(str)
            df["match_id"] = df["match_id"].astype(str)
            df["session_date"] = session_date
            df["source_file"] = file_path.name

            frames.append(df)
            file_count += 1

    if not frames:
        raise ValueError("No data loaded. Check BASE_PATH or parquet compatibility.")

    print(f"Loaded {file_count} parquet files")
    return pd.concat(frames, ignore_index=True)


def enrich_data(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["user_id"] = df["user_id"].replace({"None": pd.NA}).fillna("unknown")
    df["match_id"] = df["match_id"].replace({"None": pd.NA}).fillna("unknown")
    df["map_id"] = df["map_id"].astype(str)
    df["event"] = df["event"].astype(str)
    df["is_bot"] = df["user_id"].str.fullmatch(r"\d+")
    df["ts"] = pd.to_datetime(df["ts"])

    df = df.sort_values(["match_id", "user_id", "ts", "event"]).reset_index(drop=True)
    df["ts_rel"] = df.groupby("match_id")["ts"].transform(lambda values: (values - values.min()).dt.total_seconds())
    return df


def map_coordinates(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["px"] = pd.NA
    df["py"] = pd.NA
    df["in_bounds"] = False

    for map_name, cfg in MAP_CONFIG.items():
        mask = df["map_id"] == map_name
        if not mask.any():
            continue

        u = (df.loc[mask, "x"] - cfg["origin_x"]) / cfg["scale"]
        v = (df.loc[mask, "z"] - cfg["origin_z"]) / cfg["scale"]

        px = u * IMAGE_SIZE
        py = (1 - v) * IMAGE_SIZE

        in_bounds = px.between(0, IMAGE_SIZE) & py.between(0, IMAGE_SIZE)

        df.loc[mask, "px"] = px.clip(0, IMAGE_SIZE).round(2)
        df.loc[mask, "py"] = py.clip(0, IMAGE_SIZE).round(2)
        df.loc[mask, "in_bounds"] = in_bounds

    return df


def sample_player_movement(group: pd.DataFrame) -> pd.DataFrame:
    if len(group) <= SAMPLE_RATE:
        return group

    sampled = group.iloc[::SAMPLE_RATE]
    if sampled.index[-1] != group.index[-1]:
        sampled = pd.concat([sampled, group.iloc[[-1]]])

    return sampled


def reduce_data(df: pd.DataFrame) -> pd.DataFrame:
    movement = df[df["event"].isin(MOVEMENT_EVENTS)].copy()
    events = df[~df["event"].isin(MOVEMENT_EVENTS)].copy()

    movement["sample_index"] = movement.groupby(["match_id", "user_id"]).cumcount()
    sampled = movement[movement["sample_index"] % SAMPLE_RATE == 0].copy()

    last_rows = movement.groupby(["match_id", "user_id"], as_index=False).tail(1)
    movement = pd.concat([sampled, last_rows], ignore_index=True)
    movement = movement.drop_duplicates(
        subset=["match_id", "user_id", "ts_rel", "event", "px", "py"]
    ).drop(columns=["sample_index"], errors="ignore")

    reduced = pd.concat([movement, events], ignore_index=True)
    reduced = reduced.sort_values(["map_id", "session_date", "match_id", "user_id", "ts_rel", "event"])
    reduced = reduced.reset_index(drop=True)
    print(f"Reduced render dataset to {len(reduced)} rows")
    return reduced


def empty_grid() -> list[list[int]]:
    return [[0 for _ in range(GRID_SIZE)] for _ in range(GRID_SIZE)]


def add_heatmap_grids(group: pd.DataFrame) -> dict[str, list[list[int]]]:
    kills = empty_grid()
    deaths = empty_grid()
    traffic = empty_grid()

    valid_rows = group.dropna(subset=["px", "py"])
    for _, row in valid_rows.iterrows():
        cell_x = min(GRID_SIZE - 1, max(0, int(float(row["px"]) // BIN_SIZE)))
        cell_y = min(GRID_SIZE - 1, max(0, int(float(row["py"]) // BIN_SIZE)))

        if row["event"] in {"Kill", "BotKill"}:
            kills[cell_y][cell_x] += 1
        elif row["event"] in {"Killed", "BotKilled", "KilledByStorm"}:
            deaths[cell_y][cell_x] += 1
        elif row["event"] in MOVEMENT_EVENTS:
            traffic[cell_y][cell_x] += 1

    return {"kills": kills, "deaths": deaths, "traffic": traffic}


def compute_heatmaps(df: pd.DataFrame) -> dict:
    by_map = {}
    by_date = {}
    by_match = {}

    for map_id, group in df.groupby("map_id"):
        by_map[map_id] = add_heatmap_grids(group)

    for (session_date, map_id), group in df.groupby(["session_date", "map_id"]):
        by_date.setdefault(session_date, {})[map_id] = add_heatmap_grids(group)

    for match_id, group in df.groupby("match_id"):
        by_match[match_id] = {
            "map_id": group["map_id"].iloc[0],
            "session_date": group["session_date"].iloc[0],
            "grids": add_heatmap_grids(group),
        }

    return {"by_map": by_map, "by_date": by_date, "by_match": by_match}


def build_match_summaries(df: pd.DataFrame) -> list[dict]:
    summaries = []

    for match_id, group in df.groupby("match_id"):
        summaries.append(
            {
                "match_id": match_id,
                "map_id": group["map_id"].iloc[0],
                "session_date": group["session_date"].iloc[0],
                "duration_s": round(float(group["ts_rel"].max()), 2),
                "players": int(group["user_id"].nunique()),
                "humans": int(group.loc[~group["is_bot"], "user_id"].nunique()),
                "bots": int(group.loc[group["is_bot"], "user_id"].nunique()),
                "kills": int(group["event"].isin(["Kill", "BotKill"]).sum()),
                "deaths": int(group["event"].isin(["Killed", "BotKilled", "KilledByStorm"]).sum()),
                "storm_deaths": int((group["event"] == "KilledByStorm").sum()),
                "loot_events": int((group["event"] == "Loot").sum()),
            }
        )

    return sorted(summaries, key=lambda item: (item["session_date"], item["map_id"], item["match_id"]))


def build_metadata(mapped_df: pd.DataFrame, raw_df: pd.DataFrame) -> dict:
    match_summaries = build_match_summaries(raw_df)

    return {
        "maps": sorted(mapped_df["map_id"].dropna().unique().tolist()),
        "dates": sorted(mapped_df["session_date"].dropna().unique().tolist()),
        "events": sorted(mapped_df["event"].dropna().unique().tolist()),
        "total_matches": int(raw_df["match_id"].nunique()),
        "total_players": int(raw_df["user_id"].nunique()),
        "out_of_bounds_rows": int((~mapped_df["in_bounds"]).sum()),
        "matches": match_summaries,
    }


def write_json(path: Path, payload) -> None:
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, separators=(",", ":"))


def write_bundle(path: Path, render_records, heatmaps, metadata) -> None:
    bundle = (
        "window.__LILA_BOOTSTRAP__ = "
        + json.dumps(
            {
                "data": render_records,
                "heatmaps": heatmaps,
                "metadata": metadata,
            },
            separators=(",", ":"),
        )
        + ";"
    )
    path.write_text(bundle, encoding="utf-8")


def main() -> None:
    OUTPUT_DIR.mkdir(exist_ok=True)

    raw_df = load_all_data(BASE_PATH)
    raw_df = enrich_data(raw_df)
    raw_df = map_coordinates(raw_df)

    render_df = reduce_data(raw_df)

    render_columns = [
        "map_id",
        "match_id",
        "user_id",
        "is_bot",
        "px",
        "py",
        "ts_rel",
        "session_date",
        "event",
        "in_bounds",
    ]

    render_df = render_df[render_columns].copy()
    render_df["px"] = render_df["px"].astype(float).round(2)
    render_df["py"] = render_df["py"].astype(float).round(2)
    render_df["ts_rel"] = render_df["ts_rel"].astype(float).round(2)
    render_df = render_df[render_df["in_bounds"]].reset_index(drop=True)

    render_records = render_df.to_dict(orient="records")
    heatmaps = compute_heatmaps(raw_df[raw_df["in_bounds"]].copy())
    metadata = build_metadata(render_df, raw_df)

    write_json(DATA_FILE, render_records)
    write_json(HEATMAP_FILE, heatmaps)
    write_json(METADATA_FILE, metadata)
    write_bundle(DATA_BUNDLE_FILE, render_records, heatmaps, metadata)

    print(f"Wrote {len(render_records)} render rows to {DATA_FILE}")
    print(f"Wrote heatmaps to {HEATMAP_FILE}")
    print(f"Wrote metadata to {METADATA_FILE}")
    print(f"Wrote file-safe bundle to {DATA_BUNDLE_FILE}")


if __name__ == "__main__":
    main()
