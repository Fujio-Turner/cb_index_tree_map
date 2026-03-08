# 💃 Index Placement Optimizer

> **Status:** Beta · **Added in:** v1.4.0 · **Updated in:** v2.0.0 · **Issue:** [#17](https://github.com/Fujio-Turner/cb_index_tree_map/issues/17)

## Overview

The **Index Placement Optimizer** tab is an index rebalance planner for Couchbase GSI indexes. It analyzes how indexes are distributed across index nodes and produces two rebalancing options:

- **Plan A (Built-in):** An automatic greedy algorithm that computes an optimized distribution and generates ready-to-run `ALTER INDEX` statements.
- **Plan B (AI-assisted):** Export your current index topology as privacy-safe, token-optimized data → give it to an AI → import the AI's proposed arrangement back, and the tool de-hashes it, scores it, and generates `ALTER INDEX` statements.

---

## Prerequisites

- **Stats API data loaded** in the Stats API tab with **at least 2 nodes**. The rebalancer needs multi-node data to compute moves.
- **System Indexes data** (optional) — used to generate a stronger hash salt for obfuscation. If not loaded, the salt is derived from Stats API data instead.

---

## Plan A: Built-in Rebalance

### How the Algorithm Works

1. **Collects all indexes** across all nodes with their disk size, memory usage, item count, request count, bucket/scope/collection, and replica information.
2. **Groups replicas** — indexes that are copies of each other (e.g. `idx_foo` and `idx_foo (replica 1)`) are grouped together so they're assigned as a unit.
3. **Sorts groups by total disk size** (largest first) — big indexes get placed first to ensure they land on the least-loaded nodes.
4. **Greedy placement** — for each index, scores every node and picks the best one based on:
   - **Disk balance** — penalizes nodes that already have more disk usage
   - **Count balance** — penalizes nodes that already have more indexes
   - **Bucket/scope/collection diversity** — penalizes placing another index from the same bucket on a node that already has many from that bucket (avoids concentration)
   - **Replica separation** — replicas of the same index are **never** placed on the same node (hard constraint for HA)
   - **Large index preference** — big indexes are only moved when it significantly improves balance
5. **Generates moves** — only indexes whose proposed node differs from their current node become a "move".

### What You See

| Section | Description |
|---------|-------------|
| **Lumpiness Score: Before → After** | Radial gauges showing the current score, proposed score, and the delta. Score is 0–100 (100 = perfectly balanced). Weighted: 30% index count + 30% disk size + 20% memory + 20% replica spread. |
| **Current vs Proposed Distribution** | Side-by-side tables showing per-node index count, disk, memory, and bucket count — before and after. |
| **Disk per Node bar charts** | Visual comparison of disk distribution across nodes, current vs proposed. |
| **Proposed Moves table** | Each index that would move, showing: index name, bucket, scope.collection, disk size, source node → destination node, and a reason why. |
| **ALTER INDEX Statements (N)** | Ready-to-run N1QL statements with a count badge. Hidden by default with a ▶ Show/▼ Hide toggle; Copy button always visible. Links to [Couchbase ALTER INDEX docs](https://docs.couchbase.com/cloud/n1ql/n1ql-language-reference/alterindex.html). |

### ALTER INDEX Statement Format

```sql
ALTER INDEX `index_name` ON `bucket`.`scope`.`collection`
WITH {"action": "move", "nodes": ["node1:8091", "node2:8091"]};
```

The `nodes` array includes **all** nodes where the index (including its replicas) should live after the move.

---

## Plan B: AI-Assisted Rebalance

### Workflow (3-Step UI)

The Plan B section uses a vertical **stepper layout** to guide you through the process:

| Step | Title | What You Do |
|------|-------|-------------|
| **1** Configure Export Options | Toggle **Obfuscated** (privacy) and **AI Optimize TOON** (token savings) checkboxes |
| **2** Copy & Send to AI | Click **📋 Copy for AI**, then paste into any AI (ChatGPT, Claude, Gemini, etc.). Optionally preview the exported data. |
| **3** Import AI Response | Paste the AI's rearranged JSON, upload a file, or drag & drop → click **🚀 Load AI Plan**. The tool de-hashes names, scores the plan, and generates ALTER INDEX statements. |

### Privacy: Obfuscated Mode (Default ON)

When the **Obfuscated** checkbox is checked (default), all identifying names are replaced with **4-character base62 hashes** before being sent to the AI:

| Field | Example Real Value | Hashed Value |
|-------|-------------------|--------------|
| Node name | `192.168.1.101:8091` | `k2Mn` |
| Bucket | `travel-sample` | `a1Bx` |
| Scope | `inventory` | `c3Dy` |
| Collection | `airline` | `e4Fz` |
| Index name | `idx_airline_country` | `g5Hw` |
| Composite ID | `travel-sample:inventory:airline:idx_airline_country` | `a1Bx:c3Dy:e4Fz:g5Hw` |

**Hash details:**
- Algorithm: FNV-1a 32-bit → base62 encoded to 4 characters
- Character set: `0-9a-zA-Z` (62 chars), giving ~14.7 million unique values per position — more than sufficient for any cluster
- Salt: derived from the `system:indexes` JSON (which is unique per cluster). If system data isn't loaded, the salt comes from the stats data.
- The hash is deterministic — same input + same salt always produces the same hash, so the AI can reference indexes consistently.
- **Token savings:** Compared to the previous 8-char hex hashes, composite IDs shrink from 35 chars (`8:8:8:8`) to 19 chars (`4:4:4:4`) — roughly **46% fewer characters** on hash fields. For large clusters with hundreds of indexes across multiple nodes, this significantly reduces AI token consumption.

**When Obfuscated is OFF:** Real bucket/scope/collection/index/node names are sent. Use this only if you trust the AI with your cluster metadata.

### Token Optimization: AI Optimize TOON (Default ON)

When the **AI Optimize TOON** checkbox is checked (default), the output is encoded using [TOON (Token-Oriented Object Notation)](https://toonformat.dev/) instead of JSON:

- **Library:** `@toon-format/toon@2.1.0` loaded dynamically from jsDelivr CDN
- **Savings:** Typically **30–60% fewer tokens** compared to formatted JSON, especially effective for this use case since the data is uniform arrays of objects (indexes per node)
- **Round-trippable:** TOON is lossless — the AI can work with it and return either TOON or JSON

When TOON is OFF, standard pretty-printed JSON is used.

**Byte count badge:** Displayed next to the Copy button showing the exact payload size. Toggling Obfuscated or TOON updates the size in real-time so you can compare.

### Format-Aware Instructions

The `_instructions` field is **conditional on the output format**:

- **TOON mode:** The instructions include a preamble explaining that the input is in TOON format, with a reference to `toonformat.dev` and a description of the typed array header syntax (`"nodeHash"[count]{field1,field2,...}:` followed by CSV rows). This helps the AI correctly parse the compact notation.
- **JSON mode:** The instructions omit the TOON preamble since the data is standard JSON.

Both variants include the core optimization rules and the explicit instruction that the AI's response must use **plain CSV strings** (not JSON objects) for each index entry.

### Request Data Schema

The exported data includes `_instructions` telling the AI what to optimize for, and a `_response_schema` showing the exact structure the AI must return. When encoded as TOON, each index is a compact CSV row rather than a verbose JSON object:

```
nodes:
  "k2Mn"[42]{id,bucket,scope,collection,index,size,memoryUsed,itemsCount,requests,replicaIndex,replicaTotal,inMemoryPercent,fragPercent,cacheHitPercent}:
    "a1Bx:c3Dy:e4Fz:g5Hw",a1Bx,c3Dy,e4Fz,g5Hw,1048576,524288,50000,1200,1,2,95,12,88
_instructions: "This input is in TOON format (Token-Oriented Object Notation, see toonformat.dev)..."
_response_schema:
  nodes:
    "k2Mn"[1]{id,bucket,scope,collection,index,...}:
      <hashId>,<bucket>,<scope>,<collection>,<index>,<size>,<memoryUsed>,...
  description: "Explain WHY this arrangement is better..."
  _meta:
    nodeCount: 0
    totalIndexes: 0
_meta:
  nodeCount: 3
  totalIndexes: 42
  generatedAt: "2026-03-07T..."
```

The AI returns its response as **JSON with CSV string arrays** — each index entry is a comma-separated string where the first value is the composite hash ID. The tool parses both string entries and object entries for compatibility.

### AI Response: `description` Field

The `_response_schema` asks the AI to include a `description` field explaining **why** the proposed arrangement is better. When obfuscated mode is on, the AI will reference indexes by their hashes — the tool automatically **de-obfuscates** the description text, replacing all hashes with real names before displaying it.

Example flow:
- AI says: *"Moved `g5Hw` from `k2Mn` to `p7Qr` to reduce bucket `a1Bx` concentration"*
- Tool displays: *"Moved `idx_airline_country` from `192.168.1.101:8091` to `192.168.1.102:8091` to reduce bucket `travel-sample` concentration"*

**Rich formatting:** The AI reasoning text is automatically formatted for readability:
- Multi-sentence text is split into a **bulleted list**
- Composite hash IDs are rendered as **badges**
- Node hashes are shown as **color-coded badges** matching the node colors used in the rest of the UI
- Numbers with units (MB, bytes, etc.) and comparisons (139 vs 137) are **bolded**

### Importing AI Response

Three ways to get the AI's response back into the tool:

1. **Paste** — paste the JSON directly into the textarea
2. **File upload** — click "select a JSON file" to browse
3. **Drag & drop** — drag a `.json` file onto the drop zone

Then click **🚀 Load AI Plan** to process it.

### Plan B Results

After loading, the tool shows:

| Section | Description |
|---------|-------------|
| **💬 AI Reasoning** | The de-obfuscated description from the AI, auto-formatted with bullets, badges, and bold metrics |
| **Lumpiness Score comparison** | Current → AI Plan B score with delta |
| **Current vs AI Plan B distribution** | Per-node comparison tables |
| **AI Moves table** | Every index the AI moved, with from/to nodes |
| **ALTER INDEX Statements (N)** | Ready-to-run N1QL for the AI's plan with a count badge. Hidden by default with ▶ Show/▼ Hide toggle; Copy button always visible |

---

## Lumpiness Score

Both plans are scored using the same **Lumpiness Score** (0–100):

| Weight | Factor | What it measures |
|--------|--------|-----------------|
| 30% | Index count balance | How evenly the number of indexes is spread across nodes |
| 30% | Disk size balance | How evenly total on-disk bytes are spread |
| 20% | Memory balance | How evenly RAM usage is spread |
| 20% | Replica co-location | % of replicated indexes that have copies on the same node (should be 0%) |

| Score | Rating |
|-------|--------|
| 90–100 | Excellent |
| 75–89 | Good |
| 60–74 | Fair |
| 40–59 | Poor |
| 0–39 | Critical |

---

## Easter Egg 🕺

A certain animated GIF lives at the bottom of the page. Because you like to move it, move it.

![I like to move it](https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExaXR6Z3M5emNpdHIzaXN6cWVvd3g1cGowN3JqMWUzazlhZWkzMW5haiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/XbgzkpzueQjzepnhLy/giphy.gif)
