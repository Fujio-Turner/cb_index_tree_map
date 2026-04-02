# 📊 Index Distribution Strategies — Research Report

> **Status:** Draft · **Applies to:** Index Placement Optimizer (Beta) · **Date:** 2026-04-02

---

## 1. Current Algorithm: Greedy Disk-Size Placement

### How It Works Today

The existing `computeRebalancePlan()` uses a **single-pass greedy algorithm**:

1. Collect all indexes, group replicas together.
2. Sort replica groups **by total disk size descending** (biggest first).
3. For each index, score every candidate node via `nodeScore()` and assign to the lowest-penalty node.

**Scoring penalties (current):**

| Factor | Penalty | Weight |
|--------|---------|--------|
| Disk already on node | 1 pt per MB | Linear |
| Index count on node | 50 pts per index | Flat |
| Bucket/scope/collection concentration | 200 pts per same-keyspace index | Flat |
| Priority index memory | 2 pts per MB memory (if flagged) | Linear |
| Performance: request load | 0.001 pts per request (perf mode) | Linear |
| Performance: scan load | 0.01 pts per (requests × latency_ms) | Linear |

**Hard constraints:**
- Replica separation: replicas of the same index **never** share a node.
- Rack/zone awareness: replicas **never** share a rack (when rack data is available).

**Lumpiness Score (after):**
`score = max(0, min(100, round((1 - rawImbalance) × 100)))`
where `rawImbalance = countImb×0.30 + diskImb×0.30 + memImb×0.20 + replicaImb×0.20`

### Strengths
- Simple, fast, deterministic.
- Handles the common case well (balance by size + count).
- Rack-zone awareness built in.

### Weaknesses
- Single-pass: no backtracking or swapping phase.
- Treats all indexes equally (no weight differentiation beyond disk size).
- Bucket concentration penalty is a fixed constant (200), not adaptive to cluster shape.
- Performance mode weights are hand-tuned magic numbers.

---

## 2. Placement Constraints (Apply to ALL Strategies)

Every distribution strategy **must** enforce the following constraints. They are not optional optimizations — they are hard or soft rules that protect cluster availability, performance, and operational sanity.

---

### Constraint 1: Replica Separation (Hard)

> **Replicas of the same index must never be placed on the same node.**

When an index has `replicaTotal > 1`, each replica (including the primary, replica 1, replica 2, …) **must** live on a different physical node. If the algorithm cannot find a valid node for a replica (e.g., more replicas than nodes), it should flag an error rather than silently co-locating.

**Implementation — universal guard in every scoring function:**
```javascript
function isReplicaBlocked(nodeName, idx, usedNodes) {
  // usedNodes = nodes already assigned to other replicas of this same index
  return usedNodes.includes(nodeName);
}
// In any nodeScore / placement function:
if (isReplicaBlocked(nodeName, idx, usedNodes)) return -Infinity; // hard block
```

**Lumpiness Score impact:** The existing `replicaImb` component (20% weight) penalizes any plan that co-locates replicas. With this hard constraint properly enforced, `replicaImb` should always be 0 in proposed plans.

---

### Constraint 2: Rack / Zone / Server Group Awareness (Hard, when configured)

> **Replicas of the same index must not be placed in the same Couchbase Server Group (rack/zone). If no groups are assigned (empty/blank), this constraint is skipped.**

Couchbase clusters can organize nodes into **Server Groups** (also called racks or zones). When group data is present, replicas must be spread across different groups for true HA — surviving an entire rack failure requires replicas in separate racks.

**Behavior:**
- If `nodeRackZones[nodeName]` is empty, `null`, `undefined`, or `""` for **all** nodes → constraint is **inactive**. Treat the cluster as having no group topology.
- If **any** node has a non-empty group value → constraint is **active** for all replica placement decisions.

**Implementation:**
```javascript
const hasRackZones = Object.values(nodeRackZones).some(r => r);

function isRackBlocked(nodeName, idx, usedNodes) {
  if (!hasRackZones) return false; // no groups configured — skip
  const myRack = nodeRackZones[nodeName];
  if (!myRack) return false; // this node has no group — allow
  // Check if any already-used replica node shares this rack
  for (const usedNode of usedNodes) {
    if (nodeRackZones[usedNode] === myRack) return true; // blocked
  }
  return false;
}

// In any nodeScore / placement function:
if (isRackBlocked(nodeName, idx, usedNodes)) return -Infinity; // hard block
```

**Edge case:** If there are more replicas than distinct groups, the algorithm must relax this constraint for the excess replicas and log a warning (e.g., "3 replicas but only 2 server groups — one group will hold 2 replicas").

---

### Constraint 3: Keyspace Concentration — Collection Spread (Soft)

> **Indexes for a specific `bucket.scope.collection` should be spread across nodes and groups, not concentrated on a single node or group.**

This is a **soft constraint** (penalty-based, not a hard block). If one node holds all indexes for a collection, any issue on that node takes down all query paths for that collection's data.

**The penalty should apply at two levels:**

| Level | Penalty | Rationale |
|-------|---------|-----------|
| **Per-node** | Penalize placing another index from `bucket:scope:collection` on a node that already has N indexes from that keyspace | Prevents single-node concentration |
| **Per-group** | Penalize placing another index from `bucket:scope:collection` in a group that already has a disproportionate share | Prevents single-rack concentration (when groups are configured) |

**Implementation — adaptive penalty (replaces the current flat 200 pts):**
```javascript
function keyspaceConcentrationPenalty(nodeName, idx, nodeTotals, groupTotals) {
  const ks = idx.bucket + ':' + idx.scope + ':' + idx.collection;

  // Per-node: how many from this keyspace are already on this node?
  const nodeKsCount = nodeTotals[nodeName].buckets[ks] || 0;
  // Ideal: totalKsCount / nodeCount
  const totalKsCount = globalKeyspaceCounts[ks] || 1;
  const idealPerNode = totalKsCount / nodeCount;
  // Penalty grows quadratically as node exceeds its fair share
  const nodeOverload = Math.max(0, nodeKsCount - idealPerNode);
  const nodePenalty = nodeOverload * nodeOverload * 200;

  // Per-group: same logic at the group level (if groups exist)
  let groupPenalty = 0;
  if (hasRackZones && nodeRackZones[nodeName]) {
    const group = nodeRackZones[nodeName];
    const groupKsCount = groupTotals[group].buckets[ks] || 0;
    const nodesInGroup = groupNodeCounts[group];
    const idealPerGroup = totalKsCount * (nodesInGroup / nodeCount);
    const groupOverload = Math.max(0, groupKsCount - idealPerGroup);
    groupPenalty = groupOverload * groupOverload * 150;
  }

  return nodePenalty + groupPenalty;
}
```

**Key difference from current:** The current algorithm uses a flat `200 × count` penalty. The proposed version uses a **quadratic overload** penalty relative to the ideal share, which is lenient when a node is at or below its fair share but aggressively penalizes over-concentration.

---

### Constraint 4: Minimize Index Moves (Soft, Configurable)

> **Moving/rebuilding indexes is expensive. The optimizer should offer a mode that minimizes the number of indexes moved, trading off perfect balance for operational cost.**

**The problem today:** The current greedy algorithm places indexes from scratch (ignoring current placement), which often proposes moving 50–80% of indexes. In contrast, AI-generated plans (Plan B) typically recommend moving only 10–20% because they consider the cost of movement.

**Proposed UI control:**
```html
<label class="label cursor-pointer gap-2">
  <input type="checkbox" id="minimizeMoves" class="checkbox checkbox-sm" />
  <span>Minimize index moves (prefer current placement)</span>
</label>
<input type="range" id="moveThreshold" min="5" max="100" value="20"
       class="range range-xs" />
<span id="moveThresholdLabel">Target: ≤20% moves</span>
```

**Implementation — "sticky placement" bonus:**
```javascript
const minimizeMoves = document.getElementById('minimizeMoves').checked;
const moveThresholdPct = parseInt(document.getElementById('moveThreshold').value);

function stickyBonus(nodeName, idx) {
  if (!minimizeMoves) return 0;
  // Large bonus for keeping an index where it already is
  if (nodeName === idx.currentNode) {
    return 500; // significant bonus to stay in place
  }
  return 0;
}

// In nodeScore:
// score += stickyBonus(nodeName, idx);
```

**Two-pass approach (for tighter control):**
```javascript
function computePlanWithMoveBudget(maxMovePct) {
  const maxMoves = Math.floor(allIndexes.length * maxMovePct / 100);

  // Pass 1: Run the chosen strategy unconstrained → get "ideal" plan
  const idealPlan = computeUnconstrainedPlan();

  // Pass 2: Sort proposed moves by "improvement value" (how much each
  // move contributes to the lumpiness score improvement)
  const rankedMoves = idealPlan.moves
    .map(m => ({ ...m, value: computeMoveValue(m, idealPlan) }))
    .sort((a, b) => b.value - a.value);

  // Take only the top N moves
  const acceptedMoves = rankedMoves.slice(0, maxMoves);

  // Build final assignment: start from current placement, apply only accepted moves
  const finalAssignment = buildCurrentAssignment();
  acceptedMoves.forEach(m => {
    removeFrom(finalAssignment, m.fromNode, m);
    addTo(finalAssignment, m.toNode, m);
  });

  return finalAssignment;
}
```

**Move value scoring:**
```
moveValue(m) = scoreDelta         // how much lumpiness improves
             - moveCost(m)        // penalty based on index size (bigger = more expensive to rebuild)

moveCost(m) = disk_size / maxDiskSize  // normalized 0–1, bigger indexes cost more to move
```

**This means:** Even with "minimize moves" on, the algorithm will still move the indexes that produce the **biggest balance improvement per byte moved**.

---

### Constraint Summary Matrix

| # | Constraint | Type | When Active | Default |
|---|-----------|------|-------------|---------|
| 1 | Replica separation | **Hard** | Always | Always on |
| 2 | Rack/zone/group separation | **Hard** | When any node has a non-empty group | Auto-detected |
| 3 | Keyspace concentration (collection spread) | **Soft** (penalty) | Always | Always on, adaptive |
| 4 | Minimize index moves | **Soft** (configurable) | User checkbox + slider | Off (full rebalance) |

---

## 3. Proposed Distribution Strategies

Each strategy below describes a different philosophy for distributing indexes. They can be implemented as selectable **strategy presets** in the optimizer UI (e.g., a dropdown or radio group next to the existing "Performance mode" toggle).

---

### Strategy A: Weighted Reservoir Sampling

**Category:** Weighted Random Sampling
**Best for:** Very large clusters (50+ nodes, 1000+ indexes) where deterministic greedy placement is too slow or gets stuck in local minima.

**Concept:**
Instead of scoring every node for every index, use a randomized weighted approach. Each node is assigned a "capacity key" inversely proportional to its current load. Indexes are placed using random keys biased toward underloaded nodes.

**Algorithm:**
```
For each index i with weight w_i (e.g., disk_size):
  For each candidate node n:
    key_n = random()^(1 / remaining_capacity_n)
  Assign index i to the node with the highest key
  Update remaining_capacity_n
```

**Implementation in `computeRebalancePlan()`:**
```javascript
// Strategy: weighted-reservoir
// Constraints 1–3 enforced via shared guard functions (see §2)
function reservoirScore(nodeName, idx, usedNodes) {
  if (isReplicaBlocked(nodeName, idx, usedNodes)) return -Infinity;  // Constraint 1
  if (isRackBlocked(nodeName, idx, usedNodes)) return -Infinity;     // Constraint 2
  const t = nodeTotals[nodeName];
  const idealDisk = totalDiskAll / nodeCount;
  const remaining = Math.max(1, idealDisk - t.disk);
  // Randomized key biased toward nodes with more remaining capacity
  let score = Math.pow(Math.random(), 1 / remaining);
  score -= keyspaceConcentrationPenalty(nodeName, idx, nodeTotals, groupTotals); // Constraint 3
  score += stickyBonus(nodeName, idx);                                           // Constraint 4
  return score;
}
```

**Pros:**
- Avoids deterministic local minima; running multiple times produces different valid plans.
- Scales well to huge clusters.
- Can be run N times and the best result (by lumpiness score) kept.

**Cons:**
- Non-deterministic: same input → different output each run.
- Harder to explain "why" an index moved to a specific node.
- Requires multiple runs to converge on a good plan.

**Tuning knobs:**
- Number of iterations (run N times, keep best).
- Weight function: `disk_size`, `memory_used`, or composite.

---

### Strategy B: Inverse Frequency / Balanced Class Weighting

**Category:** Reweighting Formulas
**Best for:** Clusters with extreme skew — e.g., one bucket has 80% of all indexes, or a few "hot" indexes dominate scan load.

**Concept:**
Assign each index a **placement weight** that is inversely proportional to how common its bucket/scope/collection is. Rare keyspaces get higher placement priority; overrepresented keyspaces get spread aggressively.

**Formulas:**
```
weight_keyspace = total_indexes / (num_distinct_keyspaces × count_in_keyspace)

Per-index placement weight:
  w_i = weight_keyspace(i) × disk_size_i
```

Then use the existing greedy placer, but replace `disk_size` sorting with `w_i` sorting, and add `w_i` to the node penalty instead of raw disk.

**Implementation sketch:**
```javascript
// Strategy: inverse-frequency
// Constraints 1–4 enforced via shared guard functions (see §2)
const keyspaceCounts = {};
allIndexes.forEach(idx => {
  const ks = idx.bucket + ':' + idx.scope + ':' + idx.collection;
  keyspaceCounts[ks] = (keyspaceCounts[ks] || 0) + 1;
});
const numKeyspaces = Object.keys(keyspaceCounts).length;

allIndexes.forEach(idx => {
  const ks = idx.bucket + ':' + idx.scope + ':' + idx.collection;
  const freqWeight = allIndexes.length / (numKeyspaces * keyspaceCounts[ks]);
  idx.placementWeight = freqWeight * idx.disk_size;
});

// Sort by placementWeight desc instead of disk_size desc
function inverseFreqScore(nodeName, idx, usedNodes) {
  if (isReplicaBlocked(nodeName, idx, usedNodes)) return -Infinity;  // Constraint 1
  if (isRackBlocked(nodeName, idx, usedNodes)) return -Infinity;     // Constraint 2
  const t = nodeTotals[nodeName];
  let penalty = t.weightedLoad;  // sum of placementWeight already on node
  penalty += keyspaceConcentrationPenalty(nodeName, idx, nodeTotals, groupTotals); // Constraint 3
  return -penalty + stickyBonus(nodeName, idx);                                    // Constraint 4
}
```

**Pros:**
- Naturally spreads rare/important keyspaces across all nodes.
- Reduces bucket concentration more effectively than a flat 200-pt penalty.
- Adaptive: penalty scales with actual cluster composition.

**Cons:**
- Can over-prioritize tiny indexes from rare keyspaces.
- Doesn't account for performance characteristics.

**Tuning knobs:**
- Frequency exponent: `1/count`, `1/sqrt(count)`, or `1/log(count+1)`.
- Whether to factor in `memory_used` or `num_requests` alongside `disk_size`.

---

### Strategy C: Stratified Placement

**Category:** Stratified Sampling + Weighting
**Best for:** Clusters where indexes naturally group by bucket/tier/SLA and each group should be **evenly distributed independently**.

**Concept:**
Divide indexes into strata (groups) — by bucket, by SLA tier, by size class, or by "hot/warm/cold" — then run the greedy placer **within each stratum** to ensure each stratum is independently balanced across nodes.

**Algorithm:**
```
1. Define strata (e.g., by bucket, or by size quartile)
2. For each stratum:
   a. Calculate ideal per-node allocation = stratum_size / node_count
   b. Run greedy placement ONLY for this stratum's indexes
   c. Apply post-stratification weight:
      adjustment = ideal_allocation / actual_allocation
3. Combine all strata assignments
4. Resolve conflicts (two strata want the same node → second-best)
```

**Implementation sketch:**
```javascript
// Strategy: stratified
// Constraints 1–4 enforced via shared guard functions (see §2)
function computeStratifiedPlan() {
  // Group indexes by bucket.scope.collection (the keyspace stratum)
  const strata = {};
  allIndexes.forEach(idx => {
    const stratum = idx.bucket + ':' + idx.scope + ':' + idx.collection;
    if (!strata[stratum]) strata[stratum] = [];
    strata[stratum].push(idx);
  });

  const globalAssignment = {};
  nodeNames.forEach(n => { globalAssignment[n] = []; });
  const globalTotals = {};
  nodeNames.forEach(n => { globalTotals[n] = { disk: 0, count: 0, buckets: {} }; });

  // Process strata in order of total size (largest first)
  const sortedStrata = Object.entries(strata)
    .sort((a, b) => {
      const sA = a[1].reduce((s, x) => s + x.disk_size, 0);
      const sB = b[1].reduce((s, x) => s + x.disk_size, 0);
      return sB - sA;
    });

  sortedStrata.forEach(([stratumName, indexes]) => {
    // Group replicas within this stratum
    const replicaGroups = buildReplicaGroups(indexes);

    Object.values(replicaGroups).forEach(replicas => {
      const usedNodes = [];
      replicas.sort((a, b) => a._replicaIndex - b._replicaIndex);
      replicas.forEach(idx => {
        let bestNode = null, bestScore = -Infinity;
        nodeNames.forEach(n => {
          if (isReplicaBlocked(n, idx, usedNodes)) return;           // Constraint 1
          if (isRackBlocked(n, idx, usedNodes)) return;              // Constraint 2
          let sc = -(globalTotals[n].disk);
          sc -= keyspaceConcentrationPenalty(n, idx, globalTotals, groupTotals); // Constraint 3
          sc += stickyBonus(n, idx);                                             // Constraint 4
          if (sc > bestScore) { bestScore = sc; bestNode = n; }
        });
        if (!bestNode) bestNode = nodeNames[0]; // fallback
        usedNodes.push(bestNode);
        globalAssignment[bestNode].push(idx);
        globalTotals[bestNode].disk += idx.disk_size;
        globalTotals[bestNode].count++;
        const ks = idx.bucket + ':' + idx.scope + ':' + idx.collection;
        globalTotals[bestNode].buckets[ks] = (globalTotals[bestNode].buckets[ks] || 0) + 1;
      });
    });
  });

  return globalAssignment;
}
```

**Pros:**
- Guarantees each bucket/keyspace is spread across nodes (not just penalized).
- Natural fit for multi-tenant clusters.
- Easy to explain: "each bucket's indexes are independently balanced."

**Cons:**
- More complex; strata ordering matters.
- May not produce globally optimal disk balance (optimizes per-stratum first).
- Conflict resolution between strata adds complexity.

**Tuning knobs:**
- Stratum definition: by bucket, by bucket+scope, by SLA tier, by size quartile.
- Priority ordering of strata.

---

### Strategy D: Multiprocessor Scheduling (LPT)

**Category:** Distributing/Partitioning Weighted Items
**Best for:** Pure disk/memory balance — when the primary goal is making every node carry roughly the same total weight, regardless of keyspace diversity.

**Concept:**
Treat nodes as "processors" and indexes as "jobs" with processing time = disk_size (or any weight). Use the **Longest Processing Time (LPT)** algorithm: sort jobs by weight descending, assign each to the processor with the smallest current total. This is a well-known 4/3-approximation to the makespan minimization problem.

**Algorithm:**
```
1. Sort all indexes by disk_size descending
2. For each index:
   a. Assign to the node with the smallest current total disk
   b. (Respecting replica separation constraints)
3. Done
```

**Implementation sketch:**
```javascript
// Strategy: lpt-scheduling
// Constraints 1–4 enforced via shared guard functions (see §2)
function computeLPTPlan() {
  const replicaGroups = buildReplicaGroups(allIndexes);
  // Sort groups by total disk desc (biggest first — core LPT rule)
  const sortedGroups = Object.values(replicaGroups)
    .sort((a, b) => {
      const sA = a.reduce((s, x) => s + x.disk_size, 0);
      const sB = b.reduce((s, x) => s + x.disk_size, 0);
      return sB - sA;
    });

  const assignment = {};
  const loads = {};
  const nodeBuckets = {}; // for Constraint 3
  nodeNames.forEach(n => { assignment[n] = []; loads[n] = 0; nodeBuckets[n] = {}; });

  sortedGroups.forEach(replicas => {
    const usedNodes = [];
    replicas.sort((a, b) => a._replicaIndex - b._replicaIndex);
    replicas.forEach(idx => {
      let bestNode = null, bestScore = -Infinity;
      nodeNames.forEach(n => {
        if (isReplicaBlocked(n, idx, usedNodes)) return;             // Constraint 1
        if (isRackBlocked(n, idx, usedNodes)) return;                // Constraint 2
        // LPT core: prefer node with lowest load
        let sc = -(loads[n]);
        sc -= keyspaceConcentrationPenalty(n, idx,                   // Constraint 3
              { [n]: { buckets: nodeBuckets[n] } }, groupTotals);
        sc += stickyBonus(n, idx);                                   // Constraint 4
        if (sc > bestScore) { bestScore = sc; bestNode = n; }
      });
      if (!bestNode) bestNode = nodeNames[0]; // fallback
      usedNodes.push(bestNode);
      assignment[bestNode].push(idx);
      loads[bestNode] += idx.disk_size;
      const ks = idx.bucket + ':' + idx.scope + ':' + idx.collection;
      nodeBuckets[bestNode][ks] = (nodeBuckets[bestNode][ks] || 0) + 1;
    });
  });

  return assignment;
}
```

**Pros:**
- Simplest possible algorithm.
- Excellent disk balance — provably within 4/3 of optimal.
- Fast: O(n log n) for sorting + O(n × k) for placement.
- Easy to understand and explain.

**Cons:**
- Ignores keyspace diversity entirely (may concentrate one bucket's indexes on one node).
- Ignores performance metrics (requests, latency).
- No memory or count balancing — purely disk-driven.

**Tuning knobs:**
- Weight function: `disk_size`, `memory_used`, `disk_size + memory_used`, or composite.
- Multi-dimensional variant: maintain separate load trackers for disk/mem/count and use a combined metric.

---

### Strategy E: Importance Sampling / IPW (Inverse Probability Weighting)

**Category:** Reweighting for even effective distribution
**Best for:** Performance-focused optimization — distribute indexes so that every node handles roughly equal **query load**, not just equal disk.

**Concept:**
Reweight each index by its "importance" (scan requests, latency impact, or a composite query load metric), then distribute so that the **weighted load** is even across nodes. High-importance indexes are spread first; low-importance ones fill gaps.

**Formulas:**
```
importance_i = num_requests_i × avg_scan_latency_i
  (i.e., total scan time contributed by this index)

target_load_per_node = Σ importance_i / num_nodes

For each index, placement weight:
  ipw_i = target_load_per_node / current_node_load
```

**Implementation sketch:**
```javascript
// Strategy: importance-sampling
// Constraints 1–4 enforced via shared guard functions (see §2)
function computeIPWPlan() {
  // Calculate importance for each index
  allIndexes.forEach(idx => {
    idx.importance = idx.num_requests * (idx.avg_scan_latency / 1e6); // req × latency_ms
    // Floor to prevent zero-importance indexes from being ignored
    idx.importance = Math.max(idx.importance, idx.disk_size / (1024 * 1024));
  });

  const totalImportance = allIndexes.reduce((s, x) => s + x.importance, 0);
  const targetPerNode = totalImportance / nodeCount;

  const replicaGroups = buildReplicaGroups(allIndexes);
  // Sort groups by total importance desc (hottest first)
  const sortedGroups = Object.values(replicaGroups)
    .sort((a, b) => {
      const iA = a.reduce((s, x) => s + x.importance, 0);
      const iB = b.reduce((s, x) => s + x.importance, 0);
      return iB - iA;
    });

  const assignment = {};
  const loads = {};
  const nodeBuckets = {};
  nodeNames.forEach(n => { assignment[n] = []; loads[n] = 0; nodeBuckets[n] = {}; });

  sortedGroups.forEach(replicas => {
    const usedNodes = [];
    replicas.sort((a, b) => a._replicaIndex - b._replicaIndex);
    replicas.forEach(idx => {
      let bestNode = null, bestScore = -Infinity;
      nodeNames.forEach(n => {
        if (isReplicaBlocked(n, idx, usedNodes)) return;             // Constraint 1
        if (isRackBlocked(n, idx, usedNodes)) return;                // Constraint 2
        const gap = targetPerNode - loads[n]; // how much capacity remains
        let sc = gap;
        sc -= keyspaceConcentrationPenalty(n, idx,                   // Constraint 3
              { [n]: { buckets: nodeBuckets[n] } }, groupTotals);
        sc += stickyBonus(n, idx);                                   // Constraint 4
        if (sc > bestScore) { bestScore = sc; bestNode = n; }
      });
      if (!bestNode) bestNode = nodeNames[0]; // fallback
      usedNodes.push(bestNode);
      assignment[bestNode].push(idx);
      loads[bestNode] += idx.importance;
      const ks = idx.bucket + ':' + idx.scope + ':' + idx.collection;
      nodeBuckets[bestNode][ks] = (nodeBuckets[bestNode][ks] || 0) + 1;
    });
  });

  return assignment;
}
```

**Pros:**
- Directly optimizes for query load balance.
- Hot indexes are guaranteed to be spread across nodes.
- Natural fit for performance-sensitive clusters.

**Cons:**
- Requires accurate `num_requests` and `avg_scan_latency` data (needs stats loaded).
- May produce poor disk balance if hot indexes are small.
- Cold indexes (zero requests) get placed arbitrarily.

**Tuning knobs:**
- Importance formula: `requests`, `requests × latency`, `requests × rows_returned`, or custom.
- Minimum importance floor (so cold indexes still get balanced).
- Whether to include a disk component in the importance metric.

---

## 4. Comparison Matrix

| Strategy | Disk Balance | Keyspace Diversity | Performance Balance | Move Efficiency | Complexity | Deterministic | Best Cluster Size |
|----------|-------------|-------------------|-------------------|----------------|-----------|--------------|------------------|
| **Current (Greedy)** | ★★★★ | ★★★ | ★★ (perf mode) | ★ (moves 50–80%) | Low | Yes | Any |
| **A: Reservoir** | ★★★ | ★★★ | ★★ | ★★★ (w/ sticky) | Medium | No | 50+ nodes |
| **B: Inverse Freq** | ★★★ | ★★★★★ | ★★ | ★★★ (w/ sticky) | Low | Yes | Any |
| **C: Stratified** | ★★★ | ★★★★★ | ★★ | ★★★ (w/ sticky) | Medium | Yes | Multi-tenant |
| **D: LPT Schedule** | ★★★★★ | ★★★ | ★ | ★★★ (w/ sticky) | Very Low | Yes | Any |
| **E: IPW** | ★★ | ★★★ | ★★★★★ | ★★★ (w/ sticky) | Low | Yes | Any (with stats) |

> **Note on constraint columns:** All strategies now enforce Constraints 1–3 (replica separation, rack/zone, keyspace spread). Keyspace Diversity ratings above reflect how well each strategy handles Constraint 3 *beyond* the baseline penalty. Move Efficiency reflects Constraint 4 support — all strategies support it via the shared `stickyBonus` + move-budget wrapper, but the "w/ sticky" column shows it requires the checkbox to be enabled.

---

## 5. Implementation Recommendations

### Approach: Strategy Dropdown

Add a `<select>` control to the Plan A section of the optimizer tab:

```html
<select id="rebalanceStrategy" class="select select-sm">
  <option value="greedy">Greedy (Current Default)</option>
  <option value="lpt">Disk-Balanced (LPT)</option>
  <option value="inverse-freq">Keyspace-Balanced (Inverse Freq)</option>
  <option value="stratified">Stratified (Per-Bucket)</option>
  <option value="importance">Performance-Optimized (IPW)</option>
  <option value="reservoir">Randomized (Reservoir)</option>
</select>
```

### Integration Points

All strategies share the same:
- **Input:** `allIndexes` array, `nodeNames`, `replicaGroups`, `nodeRackZones`, `groupTotals`, `globalKeyspaceCounts`
- **Output:** `{ assignment, nodeTotals, moves, alterStmts }` — same shape as current `computeRebalancePlan()`
- **Hard constraints:** Replica separation (§2 C1), rack-zone awareness (§2 C2) — applied universally via `isReplicaBlocked()` and `isRackBlocked()`
- **Soft constraints:** Keyspace concentration (§2 C3) via `keyspaceConcentrationPenalty()`, move minimization (§2 C4) via `stickyBonus()` + `computePlanWithMoveBudget()` wrapper
- **Scoring:** Lumpiness score computed identically for all strategies

### Suggested Implementation Order

1. **Strategy D (LPT)** — simplest to implement, provides a good "pure balance" baseline.
2. **Strategy B (Inverse Freq)** — addresses the most common complaint (bucket concentration).
3. **Strategy E (IPW)** — natural upgrade path from current "performance mode."
4. **Strategy C (Stratified)** — most complex but highest value for multi-tenant.
5. **Strategy A (Reservoir)** — only needed for very large clusters or "try multiple plans" UX.

### Hybrid Approach

The most practical implementation may be a **hybrid** that combines strategies using the existing scoring framework. All branches enforce the 4 constraints through the shared helper functions:

```javascript
function nodeScore(nodeName, idx, usedNodes, strategy) {
  // ── Hard constraints (always enforced) ──
  if (isReplicaBlocked(nodeName, idx, usedNodes)) return -Infinity; // C1
  if (isRackBlocked(nodeName, idx, usedNodes)) return -Infinity;    // C2

  // ── Soft constraints (always applied) ──
  const ksPenalty = keyspaceConcentrationPenalty(nodeName, idx, nodeTotals, groupTotals); // C3
  const sticky = stickyBonus(nodeName, idx);                                              // C4

  // ── Strategy-specific scoring ──
  let raw;
  switch (strategy) {
    case 'lpt':
      raw = -(nodeTotals[nodeName].disk);
      break;
    case 'inverse-freq':
      const freqWeight = totalIndexes / (numKeyspaces * keyspaceCounts[ks]);
      raw = -(nodeTotals[nodeName].weightedDisk + idx.disk_size * freqWeight);
      break;
    case 'importance':
      raw = -(nodeTotals[nodeName].totalImportance);
      break;
    case 'stratified':
      raw = -(stratumLoad[nodeName] * 2 + globalLoad[nodeName]);
      break;
    case 'greedy':
    default:
      raw = currentScoringLogic(nodeName, idx);
  }

  return raw - ksPenalty + sticky;
}
```

When Constraint 4 ("Minimize moves") is enabled, the plan is further post-processed through `computePlanWithMoveBudget()` which keeps only the highest-value moves up to the user's threshold.

---

## 6. References

- **Longest Processing Time (LPT):** Graham, R.L. (1969). "Bounds on multiprocessing timing anomalies." SIAM Journal on Applied Mathematics.
- **Weighted Reservoir Sampling:** Efraimidis & Spirakis (2006). "Weighted random sampling with a reservoir."
- **Inverse Frequency Weighting:** Common in NLP/ML — see scikit-learn `compute_class_weight('balanced')`.
- **Importance Sampling / IPW:** Horvitz-Thompson estimator (1952); widely used in causal inference and survey statistics.
- **Stratified Sampling:** Neyman (1934). "On the two different aspects of the representative method."
