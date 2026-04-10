const IMAGE_SIZE = 1024;
const ALL_MATCHES = "__all__";
const MOVEMENT_EVENTS = new Set(["Position", "BotPosition"]);

const COLORS = {
  human: "#57d4ff",
  bot: "#ff9d42",
  kill: "#ff5d5d",
  death: "#f8f4ec",
  loot: "#ffd966",
  storm: "#aa7cff",
};

const state = {
  data: [],
  metadata: { maps: [], dates: [], matches: [] },
  heatmaps: { by_map: {}, by_date: {}, by_match: {} },
  mapImages: {},
  currentMap: "",
  currentDate: "",
  currentMatch: ALL_MATCHES,
  maxTime: 0,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  isPlaying: false,
  interval: null,
  isPanning: false,
  panStart: null,
  visiblePoints: [],
};

const canvas = document.getElementById("mapCanvas");
const ctx = canvas.getContext("2d");
const tooltip = document.getElementById("tooltip");

async function init() {
  try {
    const bootstrap = window.__LILA_BOOTSTRAP__;
    const [data, heatmaps, metadata] = bootstrap
      ? [bootstrap.data, bootstrap.heatmaps, bootstrap.metadata]
      : await Promise.all([
          fetchJson("data.json"),
          fetchJson("heatmaps.json"),
          fetchJson("metadata.json"),
        ]);

    state.data = data;
    state.heatmaps = heatmaps;
    state.metadata = metadata;

    preloadImages();
    setupControls();
    initFilters();
    draw();
  } catch (error) {
    console.error(error);
    document.getElementById("selectionTitle").textContent = "Could not load data";
    document.getElementById("scopeLabel").textContent = "Load Error";
    document.getElementById("emptyState").classList.remove("hidden");
    document.getElementById("emptyState").textContent =
      "Data failed to load. Open the folder through a local server or regenerate data.bundle.js.";
  }
}

function fetchJson(path) {
  return fetch(path).then((response) => response.json());
}

function preloadImages() {
  const sources = {
    AmbroseValley: "minimaps/AmbroseValley_Minimap.png",
    GrandRift: "minimaps/GrandRift_Minimap.png",
    Lockdown: "minimaps/Lockdown_Minimap.jpg",
  };

  Object.entries(sources).forEach(([mapId, src]) => {
    const image = new Image();
    image.src = src;
    state.mapImages[mapId] = image;
  });
}

function setupControls() {
  [
    "heatmapSelector",
    "showPaths",
    "showHumans",
    "showBots",
    "showKills",
    "showDeaths",
    "showLoot",
    "showStorm",
  ].forEach((id) => {
    document.getElementById(id).addEventListener("change", draw);
  });

  document.getElementById("timeline").addEventListener("input", draw);
  document.getElementById("playBtn").addEventListener("click", playTimeline);
  document.getElementById("pauseBtn").addEventListener("click", pauseTimeline);
  document.getElementById("replayBtn").addEventListener("click", replayTimeline);
  document.getElementById("zoomIn").addEventListener("click", () => zoomByFactor(1.2));
  document.getElementById("zoomOut").addEventListener("click", () => zoomByFactor(0.8));
  document.getElementById("zoomReset").addEventListener("click", resetViewport);

  canvas.addEventListener("mousemove", handlePointerMove);
  canvas.addEventListener("mouseleave", () => {
    tooltip.style.display = "none";
    state.isPanning = false;
  });
  canvas.addEventListener("mousedown", startPan);
  window.addEventListener("mouseup", stopPan);
  canvas.addEventListener("wheel", handleWheel, { passive: false });
}

function initFilters() {
  const mapFilter = document.getElementById("mapFilter");
  mapFilter.innerHTML = "";

  state.metadata.maps.forEach((mapId) => {
    mapFilter.add(new Option(mapId, mapId));
  });

  state.currentMap = state.metadata.maps[0] || "";
  mapFilter.value = state.currentMap;

  mapFilter.addEventListener("change", () => {
    state.currentMap = mapFilter.value;
    state.currentMatch = ALL_MATCHES;
    resetViewport();
    populateDateOptions();
    populateMatchOptions();
    resetTimeline(true);
    draw();
  });

  document.getElementById("dateFilter").addEventListener("change", (event) => {
    state.currentDate = event.target.value;
    state.currentMatch = ALL_MATCHES;
    populateMatchOptions();
    resetTimeline(true);
    draw();
  });

  document.getElementById("matchFilter").addEventListener("change", (event) => {
    state.currentMatch = event.target.value;
    resetTimeline(true);
    draw();
  });

  populateDateOptions();
  populateMatchOptions();
}

function getMatchesForCurrentMap() {
  return state.metadata.matches.filter((match) => match.map_id === state.currentMap);
}

function populateDateOptions() {
  const dateFilter = document.getElementById("dateFilter");
  const dates = [...new Set(getMatchesForCurrentMap().map((match) => match.session_date))].sort();

  dateFilter.innerHTML = "";
  dates.forEach((date) => {
    dateFilter.add(new Option(date, date));
  });

  state.currentDate = dates.includes(state.currentDate) ? state.currentDate : dates[0] || "";
  dateFilter.value = state.currentDate;
}

function populateMatchOptions() {
  const matchFilter = document.getElementById("matchFilter");
  const matches = getMatchesForCurrentMap()
    .filter((match) => !state.currentDate || match.session_date === state.currentDate)
    .sort((a, b) => a.match_id.localeCompare(b.match_id));

  matchFilter.innerHTML = "";
  matchFilter.add(new Option("All matches", ALL_MATCHES));

  matches.forEach((match) => {
    const label = `${match.match_id.slice(0, 8)} • ${match.humans}H/${match.bots}B • ${Math.round(match.duration_s)}s`;
    matchFilter.add(new Option(label, match.match_id));
  });

  const validMatchIds = new Set([ALL_MATCHES, ...matches.map((match) => match.match_id)]);
  state.currentMatch = validMatchIds.has(state.currentMatch) ? state.currentMatch : ALL_MATCHES;
  matchFilter.value = state.currentMatch;
}

function getFilteredPoints() {
  return state.data.filter((point) => {
    if (point.map_id !== state.currentMap) {
      return false;
    }
    if (state.currentDate && point.session_date !== state.currentDate) {
      return false;
    }
    if (state.currentMatch !== ALL_MATCHES && point.match_id !== state.currentMatch) {
      return false;
    }
    return true;
  });
}

function getCurrentMatchSummary() {
  if (state.currentMatch === ALL_MATCHES) {
    return null;
  }

  return state.metadata.matches.find((match) => match.match_id === state.currentMatch) || null;
}

function draw() {
  pauseTimelineIfComplete();

  const image = state.mapImages[state.currentMap];
  if (!image) {
    return;
  }

  if (!image.complete) {
    image.onload = draw;
    return;
  }

  const filteredPoints = getFilteredPoints();
  const emptyState = document.getElementById("emptyState");

  if (!filteredPoints.length) {
    emptyState.classList.remove("hidden");
    clearCanvas();
    updateHeader([]);
    updateStats([]);
    updateTopKillers([]);
    updateInsights([]);
    document.getElementById("timeDisplay").textContent = "0.0s / 0.0s";
    return;
  }

  emptyState.classList.add("hidden");

  state.maxTime = Math.max(...filteredPoints.map((point) => point.ts_rel));
  const cutoff = getTimelineCutoff();
  const pointsInScope = filteredPoints.filter((point) => point.ts_rel <= cutoff);

  clearCanvas();
  applyViewportTransform();
  ctx.drawImage(image, 0, 0, IMAGE_SIZE, IMAGE_SIZE);
  drawHeatmapOverlay();
  drawPaths(pointsInScope);
  drawEvents(pointsInScope);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  updateHeader(filteredPoints);
  updateStats(pointsInScope);
  updateTopKillers(pointsInScope);
  updateInsights(pointsInScope);
  document.getElementById("timeDisplay").textContent = `${cutoff.toFixed(1)}s / ${state.maxTime.toFixed(1)}s`;
}

function clearCanvas() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  state.visiblePoints = [];
}

function applyViewportTransform() {
  ctx.setTransform(state.zoom, 0, 0, state.zoom, state.offsetX, state.offsetY);
}

function getTimelineCutoff() {
  const sliderValue = Number(document.getElementById("timeline").value);
  return (sliderValue / 100) * state.maxTime;
}

function drawHeatmapOverlay() {
  const mode = document.getElementById("heatmapSelector").value;
  if (mode === "none") {
    return;
  }

  const grids = getActiveHeatmapGrids();
  if (!grids || !grids[mode]) {
    return;
  }

  const grid = grids[mode];
  const cellSize = IMAGE_SIZE / grid.length;
  const maxValue = Math.max(...grid.flat(), 0);
  if (maxValue === 0) {
    return;
  }

  ctx.save();
  grid.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value === 0) {
        return;
      }
      const alpha = Math.max(0.12, value / maxValue);
      const color =
        mode === "kills"
          ? `rgba(255, 93, 93, ${alpha * 0.82})`
          : mode === "deaths"
            ? `rgba(248, 244, 236, ${alpha * 0.8})`
            : `rgba(87, 212, 255, ${alpha * 0.75})`;

      ctx.fillStyle = color;
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    });
  });
  ctx.restore();
}

function getActiveHeatmapGrids() {
  if (state.currentMatch !== ALL_MATCHES) {
    return state.heatmaps.by_match[state.currentMatch]?.grids || null;
  }

  return state.heatmaps.by_date[state.currentDate]?.[state.currentMap] || state.heatmaps.by_map[state.currentMap] || null;
}

function drawPaths(points) {
  if (!document.getElementById("showPaths").checked) {
    return;
  }

  const showHumans = document.getElementById("showHumans").checked;
  const showBots = document.getElementById("showBots").checked;
  const movementPoints = points.filter((point) => MOVEMENT_EVENTS.has(point.event));
  const grouped = new Map();

  movementPoints.forEach((point) => {
    const key = `${point.match_id}::${point.user_id}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(point);
  });

  grouped.forEach((pathPoints) => {
    const isBot = !!pathPoints[0].is_bot;
    if ((isBot && !showBots) || (!isBot && !showHumans)) {
      return;
    }

    pathPoints.sort((a, b) => a.ts_rel - b.ts_rel);
    ctx.beginPath();

    pathPoints.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.px, point.py);
      } else {
        ctx.lineTo(point.px, point.py);
      }
    });

    ctx.strokeStyle = isBot ? COLORS.bot : COLORS.human;
    ctx.lineWidth = isBot ? 1.8 : 2.4;
    ctx.setLineDash(isBot ? [10, 7] : []);
    ctx.globalAlpha = 0.8;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);

    pathPoints.forEach((point) => {
      state.visiblePoints.push({
        ...point,
        markerRadius: 6,
        tooltipType: "path",
      });
    });
  });
}

function drawEvents(points) {
  const showKills = document.getElementById("showKills").checked;
  const showDeaths = document.getElementById("showDeaths").checked;
  const showLoot = document.getElementById("showLoot").checked;
  const showStorm = document.getElementById("showStorm").checked;
  const showHumans = document.getElementById("showHumans").checked;
  const showBots = document.getElementById("showBots").checked;

  points
    .filter((point) => !MOVEMENT_EVENTS.has(point.event))
    .forEach((point) => {
      const isBot = !!point.is_bot;
      if ((isBot && !showBots) || (!isBot && !showHumans)) {
        return;
      }

      const config = getEventVisual(point.event);
      if (!config) {
        return;
      }

      if (
        (config.kind === "kill" && !showKills) ||
        (config.kind === "death" && !showDeaths) ||
        (config.kind === "loot" && !showLoot) ||
        (config.kind === "storm" && !showStorm)
      ) {
        return;
      }

      ctx.save();
      ctx.fillStyle = config.color;
      ctx.strokeStyle = "rgba(4, 9, 15, 0.8)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(point.px, point.py, config.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      state.visiblePoints.push({
        ...point,
        markerRadius: config.radius + 2,
        tooltipType: "event",
      });
    });
}

function getEventVisual(eventName) {
  if (eventName === "Kill" || eventName === "BotKill") {
    return { color: COLORS.kill, radius: 5, kind: "kill" };
  }
  if (eventName === "Killed" || eventName === "BotKilled") {
    return { color: COLORS.death, radius: 5, kind: "death" };
  }
  if (eventName === "Loot") {
    return { color: COLORS.loot, radius: 4, kind: "loot" };
  }
  if (eventName === "KilledByStorm") {
    return { color: COLORS.storm, radius: 6, kind: "storm" };
  }
  return null;
}

function updateHeader(filteredPoints) {
  const selectionTitle = document.getElementById("selectionTitle");
  const scopeLabel = document.getElementById("scopeLabel");
  const headerMetrics = document.getElementById("headerMetrics");
  const summary = getCurrentMatchSummary();

  if (summary) {
    scopeLabel.textContent = "Single Match";
    selectionTitle.textContent = `${state.currentMap} • ${summary.match_id.slice(0, 8)}`;
    headerMetrics.innerHTML = renderMetricPills([
      { label: "Duration", value: `${Math.round(summary.duration_s)}s` },
      { label: "Humans", value: summary.humans },
      { label: "Bots", value: summary.bots },
    ]);
    return;
  }

  scopeLabel.textContent = "Daily Overview";
  selectionTitle.textContent = `${state.currentMap} • ${state.currentDate}`;

  const uniqueMatches = new Set(filteredPoints.map((point) => point.match_id)).size;
  const uniquePlayers = new Set(filteredPoints.map((point) => point.user_id)).size;
  const stormDeaths = filteredPoints.filter((point) => point.event === "KilledByStorm").length;

  headerMetrics.innerHTML = renderMetricPills([
    { label: "Matches", value: uniqueMatches },
    { label: "Players", value: uniquePlayers },
    { label: "Storm deaths", value: stormDeaths },
  ]);
}

function renderMetricPills(metrics) {
  return metrics
    .map(
      (metric) => `
        <div class="metric-pill">
          <strong>${metric.value}</strong>
          <span>${metric.label}</span>
        </div>
      `
    )
    .join("");
}

function updateStats(points) {
  const statsRoot = document.getElementById("matchStats");
  const players = new Set(points.map((point) => point.user_id));
  const humans = new Set(points.filter((point) => !point.is_bot).map((point) => point.user_id));
  const bots = new Set(points.filter((point) => point.is_bot).map((point) => point.user_id));
  const kills = points.filter((point) => point.event === "Kill" || point.event === "BotKill").length;
  const deaths = points.filter((point) => point.event === "Killed" || point.event === "BotKilled").length;
  const stormDeaths = points.filter((point) => point.event === "KilledByStorm").length;
  const loot = points.filter((point) => point.event === "Loot").length;

  statsRoot.innerHTML = `
    <div class="stats-list">
      <div class="stat-row"><span>Total tracked actors</span><strong>${players.size}</strong></div>
      <div class="stat-row"><span>Humans</span><strong>${humans.size}</strong></div>
      <div class="stat-row"><span>Bots</span><strong>${bots.size}</strong></div>
      <div class="stat-row"><span>Combat events</span><strong>${kills + deaths}</strong></div>
      <div class="stat-row"><span>Storm deaths</span><strong>${stormDeaths}</strong></div>
      <div class="stat-row"><span>Loot pickups</span><strong>${loot}</strong></div>
    </div>
  `;
}

function updateTopKillers(points) {
  const topKillers = document.getElementById("topKillers");
  const counts = {};

  points.forEach((point) => {
    if (point.event !== "Kill" && point.event !== "BotKill") {
      return;
    }
    counts[point.user_id] = (counts[point.user_id] || 0) + 1;
  });

  const rows = Object.entries(counts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5);

  if (!rows.length) {
    topKillers.innerHTML = `<p class="muted">No kill events in the visible playback window.</p>`;
    return;
  }

  topKillers.innerHTML = `
    <div class="killer-list">
      ${rows
        .map(([playerId, count]) => {
          const label = /^\d+$/.test(playerId) ? "Bot" : "Human";
          return `<div class="killer-row"><span>${playerId.slice(0, 12)} <span class="muted">(${label})</span></span><strong>${count}</strong></div>`;
        })
        .join("")}
    </div>
  `;
}

function updateInsights(points) {
  const insightsRoot = document.getElementById("designInsights");
  const grids = getActiveHeatmapGrids();
  const topTraffic = findTopHeatCell(grids?.traffic);
  const topKills = findTopHeatCell(grids?.kills);
  const stormDeaths = points.filter((point) => point.event === "KilledByStorm").length;
  const totalDeaths = points.filter((point) => ["Killed", "BotKilled", "KilledByStorm"].includes(point.event)).length;
  const stormRate = totalDeaths ? ((stormDeaths / totalDeaths) * 100).toFixed(1) : "0.0";

  insightsRoot.innerHTML = `
    <div class="insight-list">
      <div>
        <strong>Traffic focus</strong>
        <p class="insight-note">${topTraffic ? `Peak movement density is centered near grid ${topTraffic.label} with ${topTraffic.value} tracked movement events.` : "No movement density available for this scope."}</p>
      </div>
      <div>
        <strong>Combat hotspot</strong>
        <p class="insight-note">${topKills ? `The hottest combat pocket is around grid ${topKills.label} with ${topKills.value} kill events.` : "No kill hotspot detected in this selection."}</p>
      </div>
      <div>
        <strong>Storm pressure</strong>
        <p class="insight-note">${stormRate}% of visible deaths come from the storm. This helps show whether late rotations are punishing too hard for this scope.</p>
      </div>
    </div>
  `;
}

function findTopHeatCell(grid) {
  if (!grid) {
    return null;
  }

  let best = null;
  grid.forEach((row, y) => {
    row.forEach((value, x) => {
      if (!best || value > best.value) {
        best = { value, x, y, label: `${String.fromCharCode(65 + x)}${y + 1}` };
      }
    });
  });
  return best && best.value > 0 ? best : null;
}

function handlePointerMove(event) {
  if (state.isPanning) {
    const { x, y } = getCanvasCoordinates(event);
    const deltaX = x - state.panStart.x;
    const deltaY = y - state.panStart.y;
    state.offsetX += deltaX;
    state.offsetY += deltaY;
    state.panStart = { x, y };
    draw();
    return;
  }

  const worldPoint = screenToWorld(event);
  const nearest = findNearestVisiblePoint(worldPoint.x, worldPoint.y);

  if (!nearest) {
    tooltip.style.display = "none";
    return;
  }

  tooltip.style.display = "block";
  tooltip.style.left = `${event.pageX + 14}px`;
  tooltip.style.top = `${event.pageY + 14}px`;
  tooltip.innerHTML = `
    <strong>${nearest.event}</strong><br>
    ${nearest.is_bot ? "Bot" : "Human"} • ${nearest.user_id}<br>
    Match ${nearest.match_id.slice(0, 8)}<br>
    ${nearest.ts_rel.toFixed(1)}s
  `;
}

function findNearestVisiblePoint(x, y) {
  let closest = null;
  let bestDistance = Infinity;

  state.visiblePoints.forEach((point) => {
    const dx = point.px - x;
    const dy = point.py - y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const threshold = (point.markerRadius || 6) + 10 / state.zoom;

    if (distance <= threshold && distance < bestDistance) {
      closest = point;
      bestDistance = distance;
    }
  });

  return closest;
}

function startPan(event) {
  state.isPanning = true;
  state.panStart = getCanvasCoordinates(event);
}

function stopPan() {
  state.isPanning = false;
  state.panStart = null;
}

function handleWheel(event) {
  event.preventDefault();
  const factor = event.deltaY < 0 ? 1.12 : 0.9;
  zoomByFactor(factor, getCanvasCoordinates(event));
}

function zoomByFactor(factor, pivot = { x: canvas.width / 2, y: canvas.height / 2 }) {
  const nextZoom = clamp(state.zoom * factor, 0.65, 5);
  const worldX = (pivot.x - state.offsetX) / state.zoom;
  const worldY = (pivot.y - state.offsetY) / state.zoom;

  state.zoom = nextZoom;
  state.offsetX = pivot.x - worldX * state.zoom;
  state.offsetY = pivot.y - worldY * state.zoom;
  draw();
}

function resetViewport() {
  state.zoom = 1;
  state.offsetX = 0;
  state.offsetY = 0;
  draw();
}

function screenToWorld(event) {
  const { x, y } = getCanvasCoordinates(event);
  return {
    x: (x - state.offsetX) / state.zoom,
    y: (y - state.offsetY) / state.zoom,
  };
}

function getCanvasCoordinates(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
  };
}

function playTimeline() {
  if (state.isPlaying) {
    return;
  }

  state.isPlaying = true;
  state.interval = window.setInterval(() => {
    const slider = document.getElementById("timeline");
    const nextValue = Number(slider.value) + 1;
    if (nextValue > 100) {
      pauseTimeline();
      return;
    }
    slider.value = String(nextValue);
    draw();
  }, 80);
}

function pauseTimeline() {
  if (state.interval) {
    window.clearInterval(state.interval);
    state.interval = null;
  }
  state.isPlaying = false;
}

function replayTimeline() {
  const slider = document.getElementById("timeline");
  slider.value = "0";
  draw();
  pauseTimeline();
  playTimeline();
}

function resetTimeline(resetToStart = false) {
  pauseTimeline();
  document.getElementById("timeline").value = resetToStart ? "0" : "100";
}

function pauseTimelineIfComplete() {
  if (Number(document.getElementById("timeline").value) >= 100) {
    pauseTimeline();
  }
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

window.addEventListener("load", init);
