# Insights

## 1. AmbroseValley has a clear high-pressure convergence zone

### What caught my eye

AmbroseValley’s strongest traffic, kill, and death heatmap cells overlap in the same area instead of spreading evenly across the map.

### Evidence

- AmbroseValley is the most played map in the dataset:
  - `566` matches
  - `48,754` movement events
  - `1,799` kill events
- The hottest AmbroseValley heatmap cells cluster tightly:
  - Top traffic cell: `834` movement events at grid `(13, 15)`
  - Top kill cell: `65` kills at grid `(13, 15)`
  - Top death cell: `42` deaths at grid `(13, 15)`
- That same cell being top-ranked for all three signals suggests a repeated convergence point rather than a random hotspot.

### Actionable takeaway

Yes.

Likely affected metrics:

- combat density
- survival time through mid-map rotations
- route diversity
- area utilization balance

Action items:

- inspect that POI/choke in the tool at match level to see whether fights are caused by loot pull, pathing funnel, or extraction pressure
- add alternate cover or a secondary route if fights are too deterministic
- if the hotspot is desirable, strengthen the visual identity and combat readability of that space instead of trying to flatten it

### Why a level designer should care

If one zone repeatedly owns traffic, kills, and deaths, it shapes the whole match rhythm. That can be a feature if intentional, or a balance problem if it causes the rest of the map to feel ignored.

## 2. GrandRift and Lockdown appear more punishing from storm pressure than AmbroseValley

### What caught my eye

Storm deaths are a much larger share of total deaths on GrandRift and Lockdown than on AmbroseValley.

### Evidence

- Storm death share by map:
  - AmbroseValley: `3.37%`
  - GrandRift: `9.62%`
  - Lockdown: `9.19%`
- Raw storm death counts:
  - AmbroseValley: `17`
  - GrandRift: `5`
  - Lockdown: `17`
- Even with fewer total matches, GrandRift and Lockdown both show materially higher storm-death pressure as a percentage of deaths.

### Actionable takeaway

Yes.

Likely affected metrics:

- extraction success
- death source mix
- frustration during late rotations
- retention if players feel they are losing to the environment rather than choices

Action items:

- inspect late-match playback on GrandRift and Lockdown to see whether players are being pinched by route scarcity, poor cover, or extract placement
- test safer fallback lanes or slightly more readable rotation guidance
- monitor whether storm deaths are concentrated in specific cells, especially near known route bottlenecks

### Why a level designer should care

Storm pressure is valuable when it creates urgency, but it becomes a problem if it overwhelms navigation and encounter decisions. A higher storm-death share is a good signal to inspect late-game route design.

## 3. Lockdown shows separated movement and combat pockets, which suggests route zones and fight zones are not the same

### What caught my eye

On Lockdown, the highest-traffic area is not the same as the highest-combat area.

### Evidence

- Lockdown top traffic cell: `419` movement events at grid `(6, 19)`
- Lockdown top loot cell: `137` loot events at grid `(6, 19)`
- Lockdown top kill cells: `17` kills at grids `(19, 17)` and `(19, 16)`
- Lockdown top death cell: `12` deaths at grid `(19, 16)`

This suggests one region is being used heavily for movement/looting while another region is where combat is actually resolving.

### Actionable takeaway

Yes.

Likely affected metrics:

- encounter predictability
- route risk/reward balance
- loot contest rate
- combat pacing

Action items:

- inspect whether the movement/loot zone is too safe relative to the combat zone
- if intended, reinforce the contrast so players clearly understand “route space” vs “fight space”
- if unintended, move some value or cover to create more contested transitions between the two areas

### Why a level designer should care

When movement space and combat space are decoupled, the map can either gain strong macro structure or feel compartmentalized. This is exactly the kind of pattern that a telemetry tool should surface for level design review.
