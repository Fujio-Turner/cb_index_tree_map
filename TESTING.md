# Testing

## Quick Start

```bash
npm install
npm test
```

## Test Structure

```
tests/
├── pure.test.js        # 97 tests — pure/logic functions (no DOM or browser needed)
├── rebalance.test.js   # 53 tests — rebalance/placement optimizer strategies & constraints
└── server.test.js      # 12 tests — HTTP server API & static file serving

lib/
└── pure.js             # Extracted pure functions from index.html & server.js (shared by tests)
```

## Test Suites

### `tests/pure.test.js` — Pure Function Tests

Unit tests for all logic functions extracted into `lib/pure.js`. These mirror the inline `<script>` functions in `index.html` and can run in Node.js without a browser.

| Group | What It Checks |
|---|---|
| **`fmt`** | Human-readable byte formatting (0 B, KB, MB, GB, TB, fractional values) |
| **`truncPart`** | String truncation with `..` ellipsis for long labels |
| **`fmtCompact`** | Compact number formatting (K, M, B suffixes, null handling) |
| **`fmtNs`** | Nanosecond-to-human conversion (ns, µs, ms, s) |
| **`wildcardMatch`** | Glob-style wildcard matching (`*_id`, `addr.*`, case insensitivity) |
| **`safeName`** | Filename sanitization (special chars, `.json` suffix, URI decoding, dot collapsing) |
| **`isArrayIndex`** | Detects array indexes via `ALL`, `ARRAY`, `DISTINCT` keywords |
| **`hasDocTypeFirst`** | Checks if first index key is a doc-type field (`type`, `docType`, `_class`, `class`) |
| **`getWhereFields`** | Extracts field names from a WHERE clause string |
| **`getIndexFields`** | Extracts field names from index keys, skipping N1QL reserved words |
| **`findWhereFieldsInIndex`** | Finds fields that appear in both WHERE clause and index keys |
| **`findDuplicateKeys`** | Detects duplicate field names within index keys |
| **`buildCreateIndex`** | Generates `CREATE INDEX` / `CREATE PRIMARY INDEX` N1QL statements (default scope, named scope/collection, WHERE, replicas) |
| **`dedup`** | Deduplicates index entries by `bucket:scope:collection:name` key |
| **`matchNodeFilter`** | Node-level filter: empty list matches all, specific list filters |
| **`matchFilter`** | Global filter logic — bucket, scope, collection, index name, field wildcards, and all scan filters |
| **`matchFilter` → day-range scan filters** | The 6 "Days Since Last Scan" range filters added in issue #47: `1-7 days`, `8-30 days`, `31-90 days`, `91d-6mo`, `6mo-1y`, `1y+`. Tests include boundary values and never-scanned exclusion |
| **`SCAN_DAY_RANGES`** | Validates the constant has 6 contiguous ranges with no gaps, ending at Infinity |
| **`parseSystemJSON`** | Parses `SELECT *, meta() FROM system:indexes` output — standard arrays, `{results:[]}` wrappers, FTS suffix, error handling |
| **`parseStatsNodeJSON`** | Parses GSI stats API JSON — 2-part keys (`bucket:index`), 4-part keys (`bucket:scope:coll:index`), indexer extraction, bloat ratio calculation |
| **`buildTree`** | Builds nested `bucket → scope → collection → index` tree for treemap charts, with `useVal` toggle |

### `tests/rebalance.test.js` — Rebalance / Placement Optimizer Tests

Unit and regression tests for the Index Placement Optimizer strategies and constraints, extracted into `lib/pure.js`.

| Group | What It Checks |
|---|---|
| **`isReplicaBlocked`** | Hard constraint: replicas of the same index never on the same node |
| **`isRackBlocked`** | Hard constraint: replicas never in the same server group/rack (skipped when no groups configured) |
| **`ksConcentrationPenalty`** | Soft constraint: adaptive quadratic penalty for keyspace over-concentration on a node or group |
| **`stickyBonus`** | Soft constraint: placement bonus for keeping indexes on their current node (minimize moves) |
| **`buildReplicaGroups`** | Groups primary + replica indexes by base name, stripping `(replica N)` suffixes |
| **`computeRebalancePlan` — all strategies** | Basic operation for greedy, lpt, inverse-freq, stratified, importance, reservoir — valid plan shape, all indexes accounted for |
| **`computeRebalancePlan` — replica separation** | No two replicas share a node in proposed plan (all strategies) |
| **`computeRebalancePlan` — rack/zone** | Replicas placed in different racks when groups are configured |
| **`computeRebalancePlan` — keyspace spread** | Dominant bucket's indexes are spread across nodes, not concentrated |
| **`computeRebalancePlan` — minimize moves** | With move cap enabled, fewer indexes are moved; moves stay within threshold |
| **`computeRebalancePlan` — LPT disk balance** | LPT strategy produces better disk balance than others for skewed sizes |
| **`computeRebalancePlan` — importance spread** | Hot indexes are spread across nodes instead of concentrated |
| **`computeRebalancePlan` — edge cases** | Returns null for <2 nodes, handles 0-size indexes, minimal clusters |

### `tests/server.test.js` — Server API Tests

Integration tests that spin up the HTTP server on a random port and exercise the full request/response cycle.

| Group | What It Checks |
|---|---|
| **Static files** | `GET /` serves `index.html` with correct content-type |
| | `GET /index.html` returns the HTML document |
| | `GET /nonexistent` returns 404 |
| **File API — PUT** | Creates a `.json` file in the `data/` directory |
| **File API — GET (single)** | Retrieves saved file content as JSON |
| **File API — GET (list)** | `GET /api/files` lists all saved files with name, size, modified |
| **File API — DELETE (single)** | Removes a specific file, returns `{deleted: filename}` |
| **File API — DELETE (not found)** | Returns 404 for non-existent file |
| **File API — PUT (invalid)** | Returns 400 when body is not valid JSON |
| **File API — POST** | `POST` also works to create files (same as PUT) |
| **Unknown route** | Returns 404 JSON for unrecognized `/api/` paths |

> Test files are prefixed with `_test_` and cleaned up automatically before and after the suite runs.

## Keeping Tests in Sync

The functions in `lib/pure.js` are copies of the inline functions in `index.html`. When you change a function in `index.html`, update the corresponding function in `lib/pure.js` to match, then run `npm test` to verify.
