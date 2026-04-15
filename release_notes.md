# Release Notes

## v2.6.1 (2026-04-14)

### New Features

- **Copy JSON / Copy CSV buttons on Duplicate Index Finder table** — The "All Relationships" table now has **Copy JSON** and **Copy CSV** buttons that copy the full table data to clipboard. The exported data includes all visible columns plus hidden columns: **Last Scan A**, **Last Scan B**, **Definition A** (SQL++ CREATE INDEX for Index A), and **Definition B** (SQL++ CREATE INDEX for Index B).

### Stats

- **Files changed:** 4 (`index.html`, `package.json`, `README.md`, `release_notes.md`)
- Updated version badge to v2.6.1.

---

## v2.6.0 (2026-04-14)

### New Features

- **🔍 Duplicate Index Finder Tab** — A new top-level tab that analyzes your `system:indexes` data to find duplicate, overlapping, and similar GSI indexes within the same bucket.scope.collection. Features include:
  - **Interactive Similarity Graph** — Force-directed network visualization where nodes represent indexes and edges represent relationships. Node size scales with connection degree; edges are color-coded by relationship type (red = Exact Duplicate, orange = Same Fields, blue = Replaces/Covered-by, gray = Similar).
  - **Automatic Relationship Classification** — Index pairs are classified as Exact Duplicate, Same Fields (same fields in different order), Replaces / Covered-by, or Similar based on field overlap analysis.
  - **Never-Scanned Highlighting** — Indexes that have never been scanned appear as faded nodes with dashed outlines, making cleanup candidates immediately visible in the graph.
  - **Collection Color-Coding** — Nodes are colored by their target collection for quick visual grouping across the graph.
  - **Adjustable Similarity Threshold** — Slider control to set minimum similarity percentage (0–100%) for filtering relationships.
  - **Category Filters** — Click stat cards to filter the graph by relationship type (All, Exact Duplicates, Same Fields, Replaces/Covered-by, Similar).
  - **Hide Isolated Toggle** — Option to hide indexes with no relationships, focusing the view on problematic clusters.
  - **Detail Panel** — Click any node or edge in the graph to see full index details, field lists, WHERE clauses, and relationship descriptions.
  - **Respects Global Filters** — The Duplicate Index Finder uses the global Bucket, Scope, Collection, and Field filters from the filter bar.

### Stats

- **Files changed:** 4 (`index.html`, `package.json`, `README.md`, `release_notes.md`)
- Updated version badge to v2.6.0.

---

## v2.5.2-1 (2026-04-09)

### Bug Fix

- **`estClassifyRelationship is not defined` runtime error** — The `estClassifyRelationship` function was added to `lib/pure.js` (Node.js / Jest) but not to `index.html` (browser). Clicking "Compare to Existing" threw a `ReferenceError` and failed to render results. Fixed by adding the browser-side copy of the function in `index.html` alongside the other duplicated estimator functions.

### Stats

- **Files changed:** 4 (`index.html`, `package.json`, `README.md`, `release_notes.md`)
- Updated version badge to v2.5.2-1.

---

## v2.5.2 (2026-04-06)

### Improvements

- **Smarter Index Comparison Scoring** — The "Compare to Existing" overlay now accounts for WHERE clause differences when classifying relationships. An existing index with a WHERE clause (narrower data subset) can no longer be classified as "POSSIBLE REPLACE" for a new index without a WHERE clause. Mismatched WHERE indexes are now correctly classified as "SIMILAR" with a note explaining the data scope difference.

- **Same Fields / Different Order Detection** — Indexes with identical fields but in a different key order are now classified as **SAME FIELDS** (previously shown as "SIMILAR 100%") and sorted near the top of results. The description notes that field order affects query covering and performance.

- **Exact Duplicate Sort Fix** — Fixed a bug where EXACT DUPLICATE indexes were sorted to the bottom instead of the top. Caused by JavaScript `||` treating `0` as falsy in the sort comparator; replaced with `??` (nullish coalescing).

- **Comparison Overlay Hide/Show Details** — Each existing index card in the comparison overlay now has a collapsible details section. The collapsed view shows the SQL++ CREATE INDEX statement (with matching field highlighting), data size, and item count. A "Show Details" toggle reveals full stats, field list, and WHERE clause. A global "Show All Details / Hide All Details" button controls all cards at once.

- **Extracted `estClassifyRelationship` to `lib/pure.js`** — The index relationship classification logic is now a standalone testable function, shared between the UI and unit tests.

### UI Cleanup

- Removed all emoji and SVG icons from the comparison overlay for a cleaner look.
- Changed collapsed stats label from "Disk" to "Data" (uses `data_size` instead of `disk_size`) since MOI indexes don't have disk.
- SQL++ CREATE INDEX in collapsed view now word-wraps properly, keeping the "Show Details" button and similarity gauges pinned to the right.

### Tests

- Added 22 new unit tests for `estClassifyRelationship` covering: exact duplicates, same-fields (same/different order), replaces (with WHERE guard), covered-by, similar, none, WHERE mismatch behavior, scope/collection matching, and sort order.
- All **395 tests pass**.

### Stats

- **Files changed:** 4 (`index.html`, `lib/pure.js`, `tests/estimator.test.js`, `package.json`)
- Updated version badge to v2.5.2.

---

## v2.5.1 (2026-04-02)

### New Features

- **📋 INFER Schema Support in Index Estimator** — The New Index Estimator now accepts the output of `INFER `bucket`` in addition to a plain JSON document. When INFER output is detected, a flavor picker appears so you can select which document type/flavor to estimate against. Each INFER schema is automatically converted into a representative sample document using sample values and property types.

- **📑 Meta() Input Tab in Index Estimator** — Added a dedicated **Meta** input tab alongside the Sample JSON / INFER tab. Paste document metadata (from SDK or REST API) to support indexes on `meta().expiration`, `meta().cas`, `meta().type`, and other meta fields. Auto-fills the Document ID field from `meta.id` when present.

- **🔧 Full meta() Field Support in Index Parsing** — The index parser now handles all `meta().*` field references (e.g., `meta().expiration`, `meta().cas`, `meta().type`), not just `meta().id`. Field values are resolved from the Meta input and sized using CollatJSON encoding.

### UX Improvements

- **🎨 Input State Indicators** — Estimator input fields now use three color-coded states: **yellow** (needs input), **green** (user-provided), and **blue** (auto-filled). Provides clear visual feedback on which fields have been manually set vs auto-populated.

- **Estimator field table meta() row highlighting** — Meta fields in the estimator results table now display with a distinct accent background for easy identification.

### Stats

- **Files changed:** 3 (`index.html`, `lib/pure.js`, `tests/estimator.test.js`)
- Updated version badge to v2.5.1.

---

## v2.5.0 (2026-04-02)

### New Features

- **📐 New Index Size Estimator Tab** *(Beta)* — Paste a sample JSON document, a sample Document ID/Key, and a `CREATE INDEX` statement to estimate how much disk and memory a new index will consume **before you create it**. Uses actual Couchbase indexer internals — CollatJSON binary encoding, forward + back index dual-store layout, 2-byte entry trailers, and MOI skiplist node overhead (52 bytes) — to produce accurate size estimates for **Plasma**, **MOI / Nitro**, and **ForestDB** storage engines. Supports composite indexes, array indexes (`DISTINCT ARRAY`), partial indexes (`WHERE` clause), and nested field paths. Configurable parameters include number of documents, replicas, array length, and resident ratio, with an interactive results chart comparing all engines side-by-side.

### Stats

- Updated version badge to v2.5.0.

---

## v2.4.0 (2026-04-02)

### New Features

- *(Add release notes here)*

### Stats

- Updated version badge to v2.4.0.

---

## v2.3.3 (2026-04-02)

### Bug Fixes

- **🔧 "Unique Only" filter now correctly removes replica indexes** — The `dedup()` function and `buildReplicaMap()` were using raw index names that included `(replica N)` suffixes from the Stats API, causing every index to appear unique. Both now strip the suffix before keying, so `Unique Only` properly reduces 58 → 29 indexes. (#53)

- **🔧 Filter dropdown counts update when "Unique Only" is toggled** — `cascadeFilters()` now applies `dedup()` to the filter pool when `Unique Only` is checked, so all dropdown counts (buckets, scopes, collections, indexes, scan filter) reflect unique-only totals.

- **🔧 Index dropdown no longer lists `(replica 1)` duplicates** — The index filter dropdown now strips replica suffixes and deduplicates entries, showing clean index names.

- **🔧 Index filter matches both original and replica entries** — `matchFilter()` now compares using stripped names so selecting `idx_field1` matches both `idx_field1` and `idx_field1 (replica 1)`.

- **🔧 Replica badges hidden in Analysis tab when "Unique Only" is active** — Metric tables, Never Scanned table, and the "Show more" modal all suppress `(replica x)` badges when `Unique Only` is checked.

### New Features

- **🏷️ Primary index badge `[P]`** — Primary indexes (`#primary`) are now marked with a purple **P** badge in Stats, System Indexes, and Analysis tables, plus a `[P]` suffix in the index dropdown. Handles both `isPrimary` flag (system data) and `#primary` name pattern (stats data). (#53)

- **🛠️ Dev debug panel (`?dev=true`)** — Append `?dev=true` to the URL to show a fixed black bar at the bottom of the page. Click to expand a diagnostic panel with filter state, data counts, dedup results, replica map, and sample items. "Copy All" button copies the full JSON dump to clipboard. (#53)

- **📁 Dev volume mount in docker-compose** — `index.html` is now bind-mounted into the container so code changes are live on refresh without rebuilding the Docker image.

### Stats

- **Files changed:** 4 (`index.html`, `package.json`, `README.md`, `release_notes.md`, `docker-compose.yml`)
- Updated version badge to v2.3.3.

---

## v2.3.2 (2026-04-01)

### New Features

- **📅 Days-Since-Last-Scan Filter** — The scan history filter dropdown now includes 6 day-range buckets (`1-7 days`, `8-30 days`, `31-90 days`, `91d-6mo`, `6mo-1y`, `1y+`) with per-range index counts, making it easy to find indexes that haven't been scanned in a specific time window. (#47)

- **📝 Index Definition in Stats Detail Modal** — The Index Stats Detail Modal now shows the full `CREATE INDEX` statement (with a Copy button) when system indexes data is loaded, so you can see the index definition alongside its runtime stats. (#49)

- **⏱️ Relative Time-Ago for Last Scan** — The "Last Scan Time" row in the Stats Detail Modal now shows a relative time badge (e.g., `3d ago`, `2mo ago`) next to the ISO timestamp for quick at-a-glance recency. (#49)

- **🧪 Test Suite** — Added a comprehensive test suite with 97 pure function unit tests (`tests/pure.test.js`) and 12 server API integration tests (`tests/server.test.js`). Pure functions are extracted into `lib/pure.js` for testability. Run with `npm test`. (#48)

### UX Improvements

- Scan filter dropdown widened to accommodate day-range labels.
- Updated version badge to v2.3.2.

### Stats

- **Files changed:** 8 (`index.html`, `lib/pure.js`, `tests/pure.test.js`, `tests/server.test.js`, `package.json`, `package-lock.json`, `.gitignore`, `TESTING.md`)
- **Lines:** +4,651 / −5

---

## v2.3.1 (2026-03-20)

### New Features

- **🎯 Performance Placement Strategy** — The Index Placement Optimizer now supports two placement strategies via a **Greedy / Performance** radio toggle:
  - **Greedy** (default) — Balances indexes by disk size, memory, and index count. Best when all indexes have roughly equal query load.
  - **Performance** — Factors in scan requests, latency (`avgScanLatencyNs`, `totalScanDuration`, `numRowsReturned`, `scanBytesRead`), and index size to spread hot (heavily queried) indexes across different nodes, avoiding hot-spots. The algorithm adds two new penalty factors: **Request load** (0.001 pts per request already on node) and **Scan load** (0.01 pts per scan-ms on node). Replica groups are sorted by a composite weight of disk size + scan load instead of disk size alone.
  - The selected strategy is included in `_meta.placementStrategy` in both Plan A (built-in) and Plan B (AI) exports, so the AI receives strategy-specific instructions.

- **🔢 Critical Count Check for AI Plans** — AI export instructions now include an explicit **CRITICAL COUNT CHECK** that tells the AI exactly how many total index entries the input contains and requires the AI to output the same count. This prevents the AI from silently dropping or merging indexes.

- **⚠️ AI Dropped Index Detection** — When loading an AI plan (Plan B), the tool now validates the total index count returned by the AI against the expected count. If the AI dropped indexes:
  - A prominent **error alert** shows exactly how many indexes were dropped.
  - A collapsible **"Show N missing indexes"** detail table lists every dropped index with its name, bucket, scope.collection, node, and disk size.
  - The status message shows a warning instead of a success indicator.

- **⚠️ File-Based Rebalance Warning** — A new warning banner at the top of the Index Placement Optimizer tab alerts users that `ALTER INDEX` with the `nodes` clause is **not supported** when file-based rebalance is enabled on the cluster, with links to the relevant Couchbase documentation.

### Issues Fixed

- **#42 — Optimizer used unfiltered node data for current distribution** — The "Current Distribution" and "Plan B: Current" tables in the Index Placement Optimizer now correctly use the filtered stats data instead of the unfiltered `globalStatsFlat`, ensuring that node-level filters are respected in the before/after comparisons and bar charts.

- **#44 — AI export now includes scan/latency metrics** — The topology export for both hashed (obfuscated) and plain modes now includes `avgScanLatencyNs`, `totalScanDuration`, `numRowsReturned`, and `scanBytesRead` fields per index, giving the AI enough data to make performance-aware placement decisions.

### UX Improvements

- Updated version badge to v2.3.1.
- The "How does it decide?" explanation in the Proposed Moves section now dynamically reflects the selected placement strategy and shows the additional Performance penalty factors when in Performance mode.
- Plan A built-in rebalance now tracks per-node request and scan load totals for Performance mode scoring.

### Stats

- **Files changed:** 1 (`index.html`)
- **Lines:** +123 / −20

---

## v2.2.0 (2026-03-16)

### New Features

- **⭐ Priority Index(es)** — In the Index Placement Optimizer tab, users can now mark specific indexes as "priority" via checkboxes in the index table. Priority indexes are placed on nodes with the **least memory load** so that more of the index stays resident in RAM, reducing disk I/O and improving query latency. Priority selections are respected by both **Plan A** (built-in greedy algorithm adds a memory-based penalty to steer priority indexes to lighter nodes) and **Plan B** (AI export includes priority indexes in `_meta.priorityIndexes` with instructions to place them on low-memory nodes). The moves table shows "Priority — placed for best memory" reasoning for any prioritized index that was moved.

### UX Improvements

- Updated version badge to v2.2.0.

---

## v2.0.1 (2026-03-10)

### Issues Fixed

- **#27 — Clarify Disk Size vs Data Size with footnotes** ([issue](https://github.com/Fujio-Turner/cb_index_tree_map/issues/27)) — Added `*` and `**` annotation markers to all Disk Size and Data Size labels throughout the Stats API, Analysis, and treemap tooltip UIs. Added a Footnotes section at the bottom of the page explaining that Disk Size is compressed on-disk size and Data Size is uncompressed logical size, and that Data > Disk is normal due to Plasma compression. Updated Bloat column tooltip to explain values < 1.0x vs > 1.0x.

- **#28 — Improved Index Storage Breakdown chart** ([issue](https://github.com/Fujio-Turner/cb_index_tree_map/issues/28)) — Replaced the "Top Disk Size: Data vs Disk" stacked bar with a new **Index Storage Breakdown** chart showing three segments: Useful Disk (blue), Fragmentation waste (red), and Compression Savings (green dashed). Tooltips now show compression percentage and fragmentation details. Chart instances are properly disposed before re-init to prevent memory leaks.

- **#29 — Improved Disk vs Memory chart** ([issue](https://github.com/Fujio-Turner/cb_index_tree_map/issues/29)) — Replaced the stacked "Disk vs In-Memory" bar chart with a grouped bar chart showing **Disk\*** and **Memory** as side-by-side bars. Tooltips now include resident %, records in memory, and records on disk. Chart instances are properly disposed before re-init.

- **#30 — Color-coded node badges in Analysis tab tables** ([issue](https://github.com/Fujio-Turner/cb_index_tree_map/issues/30)) — Node names in the Analysis tab's Top/Bottom leaderboard tables, Never Scanned table, and Insight Detail Modal now display as color-coded badges (matching the replica color scheme) instead of plain text. Added `buildNodeColors()` and `nodeBadge()` helper functions with a persistent `globalNodeColors` map.

- **#31 — Removed per-node Cache Hit and Scan Latency bar charts from Stats API tab** ([issue](https://github.com/Fujio-Turner/cb_index_tree_map/issues/31)) — Removed the Cache Hit % and Avg Scan Latency bar charts that appeared below each per-node treemap in the Stats API tab, simplifying the layout.

### New Features

- **Bar By Node view for Item Count Distribution** — Added a "Bar By Node" toggle to the Index Item Count Distribution chart in the Analysis tab, showing a stacked bar chart with per-node breakdown across percentile buckets.

- **Filter dropdown index counts** — Bucket, Scope, Collection, and Scan filter dropdowns now show the count of unique indexes at each level (e.g., `my_bucket (42)`). Scan filter shows counts for scanned vs never-scanned.

### UX Improvements

- Updated version badge to v2.0.1.

### Stats

- **Files changed:** 1 (`index.html`)
- **Lines:** +72 / −36

---

## v2.0.0 (2026-03-08)

### New Features

- **💃 Index Placement Optimizer tab** ([issue #17](https://github.com/Fujio-Turner/cb_index_tree_map/issues/17)) — A full index rebalance planner for Couchbase GSI indexes, available when Stats API data is loaded with at least 2 nodes.

  - **Plan A: Built-in Rebalance** — An automatic greedy placement algorithm that computes an optimized distribution of indexes across nodes. Indexes are sorted by total disk size (largest first) and placed one-by-one using a scoring function that penalizes disk imbalance, index count imbalance, and bucket/scope/collection concentration. Replica separation is enforced as a hard constraint.
  - **Plan B: AI-Assisted Rebalance** — A 3-step workflow to export your index topology, send it to any AI (ChatGPT, Claude, Gemini, etc.), and import the AI's proposed arrangement back:
    - **Obfuscated mode** (default ON) — All identifying names are replaced with 4-character base62 hashes (FNV-1a) for privacy before sending to the AI.
    - **AI Optimize TOON** (default ON) — Output encoded using [TOON (Token-Oriented Object Notation)](https://toonformat.dev/) for 30–60% fewer tokens vs JSON. Library loaded dynamically from CDN (`@toon-format/toon@2.1.0`).
    - **AI Response import** — Paste, file upload, or drag & drop the AI's JSON response. The tool de-hashes names, computes a Lumpiness Score, and generates ALTER INDEX statements.
    - **AI Reasoning display** — The AI's explanation is auto-formatted with bulleted lists, color-coded node badges, bold metrics, and de-obfuscated names.
  - **Lumpiness Score: Before → After** — Radial gauge comparison of current vs proposed distribution scores.
  - **Current vs Proposed Distribution** — Side-by-side per-node tables and bar charts showing index count, disk, memory, and bucket count.
  - **Proposed Moves table** — Lists every index that would move, with source → destination nodes, disk size, and reasoning.
  - **ALTER INDEX Statements** — Ready-to-run N1QL `ALTER INDEX ... WITH {"action": "move", ...}` statements with copy button and collapsible toggle.

- **🔍 Index Stats Detail Modal** ([issue #22](https://github.com/Fujio-Turner/cb_index_tree_map/issues/22)) — Click the "Stats" button on any index row in the Stats API tab to open a comprehensive detail modal:
  - **Efficiency Grade** (A–F) with score out of 100 (35% cache hit + 35% residency + 30% latency).
  - **Storage Breakdown** — Horizontal stacked bar showing Data vs Disk Overhead vs Memory.
  - **Health Gauges** — Four radial gauges for Fragmentation, Cache Hit %, Resident %, and Build Progress.
  - **Scan Outcomes** — Pie chart of Successful vs Errors vs Timeouts.
  - **Cache Performance** — Pie chart of Cache Hits vs Misses.
  - **Full stats table** grouped by category (Storage & Size, Cache & Residency, Scan Performance, Derived Metrics, Indexing & Mutation, Timestamps, Array Index) with tooltips on every metric.

- **#23 — Node filter for multi-node selection** ([issue](https://github.com/Fujio-Turner/cb_index_tree_map/issues/23)) — Replaced the single-select node dropdown with a multi-select checkbox dropdown, allowing filtering by one or more index nodes simultaneously.

- **#24 — Scan filter for never-scanned indexes** ([issue](https://github.com/Fujio-Turner/cb_index_tree_map/issues/24)) — Added a scan history filter dropdown with three options: All, Exclude Never Scanned, and Only Never Scanned. Filters apply across all tabs.

### UX Improvements

- **Byte count badge** on the Plan B export shows exact payload size, updated in real-time when toggling Obfuscated or TOON modes.
- **Format-aware AI instructions** — `_instructions` field adapts based on TOON vs JSON output format.
- **Stat badges with color-coded thresholds** — Bloat, fragmentation, cache hit %, residency, latency, and pending docs all display color-coded badges (green/yellow/red) in the detail modal.
- **Easter egg** — An animated GIF at the bottom of the Index Placement Optimizer tab. 🕺
- Updated version badge to v2.0.0.

### Stats

- **Files changed:** 2 (`index.html`, `docs/move-it-move-it.md`)
- **Lines:** +1234 / −71

---

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
