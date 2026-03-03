# Release Notes

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
