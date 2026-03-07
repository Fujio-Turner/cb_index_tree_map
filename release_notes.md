# Release Notes

## v1.3.0 (2026-03-07)

### Issues Fixed

- **#20 — Treemap zoom & pan controls** ([issue](https://github.com/Fujio-Turner/cb_index_tree_map/issues/20))
  - Added **zoom & pan toolbar** (🏠 ➕ ➖ ⬆️ ⬅️ ➡️ ⬇️) above each Stats API treemap for navigating large index landscapes.
  - Zoom level badge shows current scale (50%–500%).
  - Treemaps now use a clipped viewport container with `roam:false` and `nodeClick:false` to prevent built-in drill-down, keeping navigation via the toolbar only.
  - Clicking any treemap box (including parent groups) highlights and scrolls to the matching table row.

- **#13 — System Indexes tab improvements** ([issue](https://github.com/Fujio-Turner/cb_index_tree_map/issues/13))
  - Replaced the **Index Count by Replicas** pie chart with a **🏷️ Most Commonly Indexed Fields** word cloud (moved from Analysis tab).
  - Added **Pie / Bar toggle** to the **Index Count by Bucket** chart — switch between a pie chart (by bucket) and a stacked bar chart (by collection per bucket.scope).

### New Features

- **📦 Index Item Count Distribution** — New chart in the Analysis tab (replacing the word cloud slot) showing how indexes are distributed across 10 percentile buckets by item count. Includes **Bar / Pie toggle** and tooltips with count, min, max, and avg per bucket.
- **Pie / Bar toggle for Disk & Memory by Bucket** — Analysis tab disk and memory bucket charts now support switching between pie and stacked bar (by scope) views.
- **`fmtCompact()` utility** — New compact number formatter (e.g., 1.2M, 450K) used in item distribution tooltips.

### UX Improvements

- Word cloud moved from Analysis tab to System Indexes tab for immediate visibility when loading `system:indexes` data.
- Analysis tab now shows a placeholder prompt when only system data is loaded (no Stats API).
- Updated version badge to v1.3.0.

### Stats

- **Files changed:** 1 (`index.html`)
- **Lines:** +129 / −36

---

## v1.2.0 (2026-03-06)

### Issues Fixed

- **#18 — `treemap` => `System Indexes`** ([issue](https://github.com/Fujio-Turner/cb_index_tree_map/issues/18))
  - Renamed the "Treemap" tab to **📊 System Indexes**.
  - Replaced the single treemap chart with a **2×2 chart grid**:
    - **Index Count by Replicas** — Pie chart showing how many indexes have 0, 1, 2, 3+ replicas, using the existing replica color scheme.
    - **Days Since Last Scan** — Bar chart bucketing indexes by recency (Today, 1–7d, 8–30d, 31–90d, 91d–6mo, 6mo–1y, 1y+, Never), with "Never" highlighted in red.
    - **Index Breakdown** — Nested pie showing Primary vs Non-Primary (inner ring) and With WHERE vs No WHERE (outer ring).
    - **Index Count by Collection per Bucket.Scope** — Stacked bar chart with bucket.scope on the x-axis and collections as stacks, sorted alphabetically. Shows unique indexes only (replicas excluded).
  - Updated all references from "Treemap" to "System Indexes" across tabs, comments, and placeholder text.

- **#16 — Stats API node badges** ([issue](https://github.com/Fujio-Turner/cb_index_tree_map/issues/16))
  - Node labels in the Stats API tab now display as **color-coded badges** (e.g., `Node 1 of 2`) matching the replica color scheme.
  - Badges update dynamically when nodes are added or removed via `updateNodeLabels()`.
  - Node headers in the rendered stats view also show the colored badge with total node count.

- **#15 — Performance Insights show bucket.scope.collection** ([issue](https://github.com/Fujio-Turner/cb_index_tree_map/issues/15))
  - All 7 insight sections in the Analysis tab's **⚡ Performance Insights** panel now show `bucket.scope.collection` context beneath each index name.
  - Long keyspace paths are auto-truncated with a hover tooltip showing the full path.

### New Features

- **Unique Only filter** — Added a **Unique Only** checkbox to the global filter bar that removes replica copies, showing only distinct indexes. Applies across System Indexes, Stats API, and Analysis tabs.

### UX Improvements

- `Disk Size` / `Data Size` toggle tooltips updated from "treemap" to "charts".
- System Indexes load status now shows unique count vs total (including replicas).
- Activity distribution bar tooltips moved to outer container for better hover behavior.
- Updated version badge to v1.2.0.

### Stats

- **Files changed:** 1 (`index.html`)
- **Lines:** +88 / −25

---

## v1.1.0 (2026-03-03)

### New Features

- **📐 Lumpiness Score** — A new composite score (0–100) that measures how evenly GSI indexes are distributed across index nodes.
  - Displayed as a radial progress gauge in the **Stats API** tab (when multiple nodes are loaded) and as an inline badge in the **Analysis** tab summary.
  - Weighted formula: 30% index count balance + 30% disk size balance + 20% memory balance + 20% replica spread.
  - Color-coded ratings: Excellent (90+), Good (75+), Fair (60+), Poor (40+), Critical (<40).
  - Per-node breakdown table shows index count, disk, and memory for each node.
  - Detailed tooltips explain each sub-metric (Count Imbalance, Disk Imbalance, Memory Imbalance, Replica Co-location).
  - Helps identify hot spots, uneven memory pressure, and inconsistent query latency across nodes.

---

## v1.0.2 (2026-03-03)

### Issues Fixed

- **#7 — Analysis bar chart for disk also include Data too** ([issue](https://github.com/Fujio-Turner/cb_index_tree_map/issues/7))
  - Added a new **Top Disk Size: Data vs Disk** stacked bar chart in the Analysis tab, replacing the plain disk-only bar chart.
  - Each bar shows disk overhead (blue) and actual data size (lighter blue) with a percentage label showing the data-to-disk ratio.
  - Tooltips now include bucket, scope, and collection context.

- **#8 — 7 Ideas for more insights in analysis tab** ([issue](https://github.com/Fujio-Turner/cb_index_tree_map/issues/8))
  - Added a new **⚡ Performance Insights** panel in the Analysis tab (half-width, beside the word cloud) with 7 insight sections:
    - **🎯 Index Efficiency Score** — Weighted A–F grade per index (35% cache hit + 35% residency + 30% latency). Shows overall grade and 3 worst indexes.
    - **📤 Rows Returned / Request** — Identifies indexes with high rows-per-scan ratios that may indicate broad or inefficient queries.
    - **📊 Scan I/O per Request** — Highlights indexes with heavy bytes-read-per-scan, candidates for covered indexes or tighter predicates.
    - **⏳ Indexing Backlog** — Surfaces indexes with non-zero `num_docs_pending + num_docs_queued` that may be serving stale data.
    - **🧠 Memory Efficiency** — Ranks indexes by items per MB of RAM to find memory-hungry indexes.
    - **🌡️ Index Activity Distribution** — Hot/Warm/Cold/Frozen stacked bar showing how many indexes are actively serving queries vs. idle.
    - **🗑️ Wasted Resources** — Shows total disk and memory consumed by never-scanned indexes.
  - Each insight section has a **"Show all →"** button that opens a modal with the full sorted list (up to 100 items).
  - Added an **Insight Detail Modal** for viewing full ranked tables.

### UX Improvements

- Added **collapse/expand toggle** (▼/▶) for the `system:indexes` JSON textarea — auto-collapses after loading data, shows ✓ when data is present.
- Added **per-node collapse/expand toggles** for Stats API node JSON textareas.
- Added **Collapse all / Expand all** buttons for Stats API nodes — auto-collapses all nodes after successful load.
- Stacked Disk vs In-Memory bar chart tooltips now include bucket.scope.collection context.
- Word cloud moved from full-width to half-width layout, paired with the new Performance Insights panel.
- Summary stats card moved above the word cloud + insights row for better visual hierarchy.
- Never-scanned indexes table now has a scrollable container with pinned headers.
- Added version badge (v1.0.2) to the navbar.

### Stats

- **Files changed:** 1 (`index.html`)
- **Lines:** +197 / −16

---

## v1.0.1 (2026-03-03)

### Issues Fixed

- **#1 — HTML improvements for tabs** ([issue](https://github.com/Fujio-Turner/cb_index_tree_map/issues/1))
  - Added color styling to tabs using DaisyUI for a clearer, more classic tab look.
  - Added a **Copy / Copied** button (blue → green) for the `SELECT *, meta() FROM system:indexes` query on the Tree Map tab.
  - Added a **Copy / Copied** button for the `curl` stats API command on the Stats API tab, with a **Secure** checkbox that toggles the URL to `https` and port `19102`.

- **#2 — Dropdown filter improvements for bucket, scope, and collection** ([issue](https://github.com/Fujio-Turner/cb_index_tree_map/issues/2))
  - Filter dropdowns now show counts at each level (e.g. `All Buckets (10)`).
  - Cascading filter logic: selecting a bucket limits scopes, collections, and indexes to only those within that bucket; selecting a scope further narrows collections and indexes, and so on.
  - Charts now auto-reprocess when filters change — no manual reload needed.

- **#3 — Treemap table from `system:indexes`** ([issue](https://github.com/Fujio-Turner/cb_index_tree_map/issues/3))
  - Added a table view generated from the `system:indexes` JSON output.
  - Columns include bucket, scope, collection, full `CREATE INDEX` definition, and analytical checks:
    - Whether the index has a `WHERE` clause (YES / NO).
    - Whether it is an array index (YES / NO).
    - Whether common doc-type fields (`docType`, `type`, `_class`, `class`) appear as the first index key.
    - Whether `WHERE` clause fields are duplicated in the index keys.
    - Whether duplicate fields exist within the same index definition.
  - Table columns are sortable.

- **#4 — Analysis chart improvements** ([issue](https://github.com/Fujio-Turner/cb_index_tree_map/issues/4))
  - Replaced the **Top Fragmentation %** bar chart with a stacked **Index Disk vs. Memory** bar chart.
  - Each bar shows disk usage (dark color) and in-memory usage (lighter/transparent shade) so the split is immediately visible.

### Stats

- **Files changed:** 1 (`index.html`)
- **Lines:** +141 / −15
