# Release Notes

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
