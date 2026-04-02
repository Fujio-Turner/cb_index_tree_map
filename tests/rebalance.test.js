const {
  isReplicaBlocked, isRackBlocked, ksConcentrationPenalty,
  stickyBonus, buildReplicaGroups, computeRebalancePlan,
} = require('../lib/pure');

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

function makeIndex(name, bucket, scope, collection, diskSize, opts = {}) {
  return {
    fullKey: `${bucket}:${scope}:${collection}:${name}`,
    name, bucket, scope, collection,
    disk_size: diskSize,
    memory_used: opts.memory_used || Math.floor(diskSize * 0.3),
    items_count: opts.items_count || 1000,
    num_requests: opts.num_requests || 100,
    avg_scan_latency: opts.avg_scan_latency || 50000,
    num_rows_returned: opts.num_rows_returned || 500,
    total_scan_duration: opts.total_scan_duration || 0,
    _replicaNodes: opts._replicaNodes || ['node1'],
    _replicaTotal: opts._replicaTotal || 1,
    _replicaIndex: opts._replicaIndex || 1,
  };
}

function makeCluster(nodes) {
  return nodes.map(n => ({ nodeName: n.name, flat: n.indexes }));
}

function defaultOpts(overrides = {}) {
  return {
    nodeRackZones: {},
    priorityIndexes: new Set(),
    rebalanceStrategy: 'greedy',
    rebalanceMode: 'greedy',
    minimizeMoves: false,
    moveThresholdPct: 20,
    ...overrides,
  };
}

function runPlan(filtered, overrides = {}) {
  return computeRebalancePlan({ filtered, ...defaultOpts(overrides) });
}

function totalAssigned(plan) {
  return Object.values(plan.assignment).reduce((s, arr) => s + arr.length, 0);
}

// ────────────────────────────────────────────
// isReplicaBlocked  (Constraint 1)
// ────────────────────────────────────────────
describe('isReplicaBlocked', () => {
  test('returns true when nodeName is in usedNodes', () => {
    expect(isReplicaBlocked('node1', ['node1', 'node2'])).toBe(true);
  });

  test('returns false when nodeName is NOT in usedNodes', () => {
    expect(isReplicaBlocked('node3', ['node1', 'node2'])).toBe(false);
  });

  test('returns false for empty usedNodes array', () => {
    expect(isReplicaBlocked('node1', [])).toBe(false);
  });
});

// ────────────────────────────────────────────
// isRackBlocked  (Constraint 2)
// ────────────────────────────────────────────
describe('isRackBlocked', () => {
  test('returns false when all rack zones are empty/null (no racks configured)', () => {
    expect(isRackBlocked('n1', ['n2'], {})).toBe(false);
    expect(isRackBlocked('n1', ['n2'], { n1: null, n2: null })).toBe(false);
  });

  test('returns false when nodeName has no rack assigned', () => {
    expect(isRackBlocked('n1', ['n2'], { n2: 'rackA' })).toBe(false);
  });

  test('returns true when nodeName rack matches a usedNode rack', () => {
    expect(isRackBlocked('n1', ['n2'], { n1: 'rackA', n2: 'rackA' })).toBe(true);
  });

  test('returns false when nodeName rack differs from all usedNodes racks', () => {
    expect(isRackBlocked('n1', ['n2'], { n1: 'rackA', n2: 'rackB' })).toBe(false);
  });

  test('handles mixed: some nodes have racks, some don\'t', () => {
    const zones = { n1: 'rackA', n2: null, n3: 'rackA' };
    expect(isRackBlocked('n1', ['n3'], zones)).toBe(true);
    expect(isRackBlocked('n1', ['n2'], zones)).toBe(false);
    expect(isRackBlocked('n2', ['n1'], zones)).toBe(false);
  });
});

// ────────────────────────────────────────────
// ksConcentrationPenalty  (Constraint 3)
// ────────────────────────────────────────────
describe('ksConcentrationPenalty', () => {
  test('returns 0 when node is at or below its fair share of a keyspace', () => {
    const nodeTotals = { n1: { buckets: { 'b:s:c': 2 } }, n2: { buckets: { 'b:s:c': 2 } } };
    const globalKsCounts = { 'b:s:c': 4 };
    const idx = { bucket: 'b', scope: 's', collection: 'c' };
    expect(ksConcentrationPenalty('n1', idx, nodeTotals, globalKsCounts, 2, {}, {}, {})).toBe(0);
  });

  test('returns quadratic penalty when node exceeds fair share', () => {
    const nodeTotals = { n1: { buckets: { 'b:s:c': 5 } }, n2: { buckets: { 'b:s:c': 1 } } };
    const globalKsCounts = { 'b:s:c': 6 };
    const idx = { bucket: 'b', scope: 's', collection: 'c' };
    const penalty = ksConcentrationPenalty('n1', idx, nodeTotals, globalKsCounts, 2, {}, {}, {});
    // fair share = 6/2 = 3, overload = 5 - 3 = 2, penalty = 2*2*200 = 800
    expect(penalty).toBe(800);
  });

  test('includes group-level penalty when rack zones are configured', () => {
    const nodeTotals = { n1: { buckets: { 'b:s:c': 5 } }, n2: { buckets: { 'b:s:c': 1 } } };
    const globalKsCounts = { 'b:s:c': 6 };
    const idx = { bucket: 'b', scope: 's', collection: 'c' };
    const zones = { n1: 'rackA', n2: 'rackB' };
    const groupTotals = { rackA: { buckets: { 'b:s:c': 5 } } };
    const groupNodeCounts = { rackA: 1, rackB: 1 };
    const penalty = ksConcentrationPenalty('n1', idx, nodeTotals, globalKsCounts, 2, zones, groupTotals, groupNodeCounts);
    // node penalty: (5-3)^2 * 200 = 800
    // group penalty: idealPerGroup = 6*(1/2) = 3, gOverload = 5-3 = 2, 2*2*150 = 600
    expect(penalty).toBe(800 + 600);
  });

  test('returns 0 for empty/untracked keyspaces', () => {
    const nodeTotals = { n1: { buckets: {} } };
    const globalKsCounts = {};
    const idx = { bucket: 'x', scope: 'y', collection: 'z' };
    expect(ksConcentrationPenalty('n1', idx, nodeTotals, globalKsCounts, 2, {}, {}, {})).toBe(0);
  });
});

// ────────────────────────────────────────────
// stickyBonus  (Constraint 4)
// ────────────────────────────────────────────
describe('stickyBonus', () => {
  test('returns 0 when minimizeMoves is false', () => {
    expect(stickyBonus('node1', { currentNode: 'node1' }, false)).toBe(0);
  });

  test('returns 500 when minimizeMoves is true and nodeName matches currentNode', () => {
    expect(stickyBonus('node1', { currentNode: 'node1' }, true)).toBe(500);
  });

  test('returns 0 when minimizeMoves is true but nodeName differs from currentNode', () => {
    expect(stickyBonus('node2', { currentNode: 'node1' }, true)).toBe(0);
  });
});

// ────────────────────────────────────────────
// buildReplicaGroups
// ────────────────────────────────────────────
describe('buildReplicaGroups', () => {
  test('groups primary + replicas together by base name', () => {
    const indexes = [
      { bucket: 'b', scope: 's', collection: 'c', name: 'idx1' },
      { bucket: 'b', scope: 's', collection: 'c', name: 'idx1 (replica 1)' },
      { bucket: 'b', scope: 's', collection: 'c', name: 'idx1 (replica 2)' },
    ];
    const groups = buildReplicaGroups(indexes);
    expect(Object.keys(groups)).toHaveLength(1);
    expect(groups['b:s:c:idx1']).toHaveLength(3);
  });

  test('strips " (replica 1)", " (replica 2)" suffixes', () => {
    const indexes = [
      { bucket: 'b', scope: 's', collection: 'c', name: 'idx1 (replica 1)' },
    ];
    const groups = buildReplicaGroups(indexes);
    expect(groups['b:s:c:idx1']).toHaveLength(1);
  });

  test('different keyspaces with same index name are separate groups', () => {
    const indexes = [
      { bucket: 'b1', scope: 's', collection: 'c', name: 'idx1' },
      { bucket: 'b2', scope: 's', collection: 'c', name: 'idx1' },
    ];
    const groups = buildReplicaGroups(indexes);
    expect(Object.keys(groups)).toHaveLength(2);
    expect(groups['b1:s:c:idx1']).toHaveLength(1);
    expect(groups['b2:s:c:idx1']).toHaveLength(1);
  });

  test('handles indexes with no replicas (each in its own group)', () => {
    const indexes = [
      { bucket: 'b', scope: 's', collection: 'c', name: 'idx1' },
      { bucket: 'b', scope: 's', collection: 'c', name: 'idx2' },
    ];
    const groups = buildReplicaGroups(indexes);
    expect(Object.keys(groups)).toHaveLength(2);
    expect(groups['b:s:c:idx1']).toHaveLength(1);
    expect(groups['b:s:c:idx2']).toHaveLength(1);
  });
});

// ────────────────────────────────────────────
// computeRebalancePlan  — Strategy tests
// ────────────────────────────────────────────
describe('computeRebalancePlan', () => {
  const STRATEGIES = ['greedy', 'lpt', 'inverse-freq', 'stratified', 'importance', 'reservoir'];

  // ── a) Basic operation (all strategies) ──
  describe('basic operation (all strategies)', () => {
    const filtered = makeCluster([
      { name: 'node1', indexes: [
        makeIndex('idx_a', 'travel', '_default', '_default', 10000),
        makeIndex('idx_b', 'travel', '_default', '_default', 20000),
        makeIndex('idx_c', 'beer', 'inv', 'items', 15000),
      ]},
      { name: 'node2', indexes: [
        makeIndex('idx_d', 'beer', 'inv', 'items', 5000),
      ]},
      { name: 'node3', indexes: [
        makeIndex('idx_e', 'travel', 'routes', 'flights', 8000),
      ]},
    ]);

    STRATEGIES.forEach(strategy => {
      test(`${strategy}: returns a valid plan object`, () => {
        const plan = runPlan(filtered, { rebalanceStrategy: strategy });
        expect(plan).not.toBeNull();
        expect(plan).toHaveProperty('moves');
        expect(plan).toHaveProperty('alterStmts');
        expect(plan).toHaveProperty('assignment');
        expect(plan).toHaveProperty('nodeTotals');
        expect(plan).toHaveProperty('nodeNames');
        expect(plan).toHaveProperty('_debug');
      });

      test(`${strategy}: all indexes are accounted for`, () => {
        const plan = runPlan(filtered, { rebalanceStrategy: strategy });
        expect(totalAssigned(plan)).toBe(5);
      });

      test(`${strategy}: afterScore is a number between 0 and 100`, () => {
        const plan = runPlan(filtered, { rebalanceStrategy: strategy });
        expect(typeof plan.afterScore).toBe('number');
        expect(plan.afterScore).toBeGreaterThanOrEqual(0);
        expect(plan.afterScore).toBeLessThanOrEqual(100);
      });
    });
  });

  // ── b) Constraint 1: Replica separation ──
  describe('Constraint 1: Replica separation', () => {
    STRATEGIES.forEach(strategy => {
      test(`${strategy}: no two replicas of the same index share a node`, () => {
        const filtered = makeCluster([
          { name: 'node1', indexes: [
            makeIndex('idx_x', 'b', 's', 'c', 10000, { _replicaTotal: 2, _replicaIndex: 1, _replicaNodes: ['node1', 'node2'] }),
            makeIndex('idx_x (replica 1)', 'b', 's', 'c', 10000, { _replicaTotal: 2, _replicaIndex: 2, _replicaNodes: ['node1', 'node2'] }),
          ]},
          { name: 'node2', indexes: [
            makeIndex('idx_y', 'b', 's', 'c', 8000, { _replicaTotal: 2, _replicaIndex: 1, _replicaNodes: ['node2', 'node3'] }),
            makeIndex('idx_y (replica 1)', 'b', 's', 'c', 8000, { _replicaTotal: 2, _replicaIndex: 2, _replicaNodes: ['node2', 'node3'] }),
          ]},
          { name: 'node3', indexes: [] },
        ]);

        const plan = runPlan(filtered, { rebalanceStrategy: strategy });
        // Check no two indexes with same base name share a node
        for (const [nodeName, indexes] of Object.entries(plan.assignment)) {
          const baseNames = indexes.map(i => i.name.replace(/ \(replica \d+\)$/, ''));
          const unique = new Set(baseNames);
          expect(unique.size).toBe(baseNames.length);
        }
      });
    });
  });

  // ── c) Constraint 2: Rack/zone awareness ──
  describe('Constraint 2: Rack/zone awareness', () => {
    const filtered = makeCluster([
      { name: 'n1', indexes: [
        makeIndex('idx_r', 'b', 's', 'c', 10000, { _replicaTotal: 2, _replicaIndex: 1 }),
        makeIndex('idx_r (replica 1)', 'b', 's', 'c', 10000, { _replicaTotal: 2, _replicaIndex: 2 }),
      ]},
      { name: 'n2', indexes: [] },
      { name: 'n3', indexes: [] },
      { name: 'n4', indexes: [] },
    ]);
    const nodeRackZones = { n1: 'rackA', n2: 'rackA', n3: 'rackB', n4: 'rackB' };

    ['greedy', 'lpt'].forEach(strategy => {
      test(`${strategy}: replicas are placed in different racks`, () => {
        const plan = runPlan(filtered, { rebalanceStrategy: strategy, nodeRackZones });

        // Find where idx_r and idx_r (replica 1) ended up
        const placements = {};
        for (const [nodeName, indexes] of Object.entries(plan.assignment)) {
          indexes.forEach(idx => {
            const baseName = idx.name.replace(/ \(replica \d+\)$/, '');
            if (!placements[baseName]) placements[baseName] = [];
            placements[baseName].push(nodeName);
          });
        }

        for (const [, nodes] of Object.entries(placements)) {
          if (nodes.length < 2) continue;
          const racks = nodes.map(n => nodeRackZones[n]);
          const uniqueRacks = new Set(racks);
          expect(uniqueRacks.size).toBe(racks.length);
        }
      });
    });
  });

  // ── d) Constraint 3: Keyspace concentration ──
  describe('Constraint 3: Keyspace concentration', () => {
    test('dominant bucket indexes are spread across nodes, not concentrated', () => {
      // 20 indexes in bucket "big", 2 in bucket "small", across 3 nodes
      const bigIndexes = Array.from({ length: 20 }, (_, i) =>
        makeIndex(`idx_big_${i}`, 'big', '_default', '_default', 5000)
      );
      const smallIndexes = [
        makeIndex('idx_sm_0', 'small', '_default', '_default', 5000),
        makeIndex('idx_sm_1', 'small', '_default', '_default', 5000),
      ];
      // Put all on node1 initially
      const filtered = makeCluster([
        { name: 'node1', indexes: [...bigIndexes, ...smallIndexes] },
        { name: 'node2', indexes: [] },
        { name: 'node3', indexes: [] },
      ]);

      const plan = runPlan(filtered, { rebalanceStrategy: 'greedy' });

      // Count bucket "big" indexes per node
      const bigCounts = {};
      for (const [nodeName, indexes] of Object.entries(plan.assignment)) {
        bigCounts[nodeName] = indexes.filter(i => i.bucket === 'big').length;
      }
      const counts = Object.values(bigCounts);
      const max = Math.max(...counts);
      const min = Math.min(...counts);
      // Should not be concentrated: max should be at most ~2x min (with some rounding)
      expect(max - min).toBeLessThanOrEqual(3);
    });
  });

  // ── e) Constraint 4: Minimize moves ──
  describe('Constraint 4: Minimize moves', () => {
    test('minimizeMoves=true produces fewer moves than false', () => {
      const indexes = Array.from({ length: 12 }, (_, i) =>
        makeIndex(`idx_${i}`, 'b', '_default', '_default', 1000 * (i + 1))
      );
      const filtered = makeCluster([
        { name: 'node1', indexes: indexes.slice(0, 8) },
        { name: 'node2', indexes: indexes.slice(8, 10) },
        { name: 'node3', indexes: indexes.slice(10, 12) },
      ]);

      const planNoMinimize = runPlan(filtered, { minimizeMoves: false });
      const planMinimize = runPlan(filtered, { minimizeMoves: true, moveThresholdPct: 10 });

      expect(planMinimize.moves.length).toBeLessThanOrEqual(planNoMinimize.moves.length);
    });
  });

  // ── f) Strategy-specific behavior ──
  describe('Strategy-specific behavior', () => {
    test('LPT produces good disk balance with wildly different sizes', () => {
      const indexes = [
        makeIndex('huge1', 'b', '_default', '_default', 10000000),
        makeIndex('huge2', 'b', '_default', '_default', 8000000),
        makeIndex('med1', 'b', '_default', '_default', 500000),
        makeIndex('med2', 'b', '_default', '_default', 400000),
        makeIndex('tiny1', 'b', '_default', '_default', 1000),
        makeIndex('tiny2', 'b', '_default', '_default', 2000),
      ];
      const filtered = makeCluster([
        { name: 'node1', indexes },
        { name: 'node2', indexes: [] },
        { name: 'node3', indexes: [] },
      ]);

      const lptPlan = runPlan(filtered, { rebalanceStrategy: 'lpt' });
      const lptDisks = lptPlan.afterDiskPerNode;
      const lptRange = Math.max(...lptDisks) - Math.min(...lptDisks);

      const greedyPlan = runPlan(filtered, { rebalanceStrategy: 'greedy' });
      const greedyDisks = greedyPlan.afterDiskPerNode;
      const greedyRange = Math.max(...greedyDisks) - Math.min(...greedyDisks);

      // LPT should have equal or better (lower) disk range than greedy
      expect(lptRange).toBeLessThanOrEqual(greedyRange);
    });

    test('Importance strategy spreads hot indexes', () => {
      // All hot indexes on node1
      const hotIndexes = Array.from({ length: 6 }, (_, i) =>
        makeIndex(`hot_${i}`, 'b', '_default', '_default', 5000, { num_requests: 100000, avg_scan_latency: 500000 })
      );
      const coldIndexes = Array.from({ length: 6 }, (_, i) =>
        makeIndex(`cold_${i}`, 'b', '_default', '_default', 5000, { num_requests: 1, avg_scan_latency: 1000 })
      );
      const filtered = makeCluster([
        { name: 'node1', indexes: hotIndexes },
        { name: 'node2', indexes: coldIndexes },
        { name: 'node3', indexes: [] },
      ]);

      const plan = runPlan(filtered, { rebalanceStrategy: 'importance' });
      // Hot indexes should not all remain on node1
      const hotOnNode1 = plan.assignment['node1'].filter(i => i.name.startsWith('hot_')).length;
      expect(hotOnNode1).toBeLessThan(6);
    });
  });

  // ── g) Regression: move count stays within threshold ──
  describe('Regression: move count stays within threshold', () => {
    test('moves.length <= Math.floor(totalIndexes * threshold)', () => {
      const indexes = Array.from({ length: 30 }, (_, i) =>
        makeIndex(`idx_${i}`, i < 15 ? 'b1' : 'b2', '_default', '_default', 1000 * (i + 1))
      );
      const filtered = makeCluster([
        { name: 'node1', indexes: indexes.slice(0, 20) },
        { name: 'node2', indexes: indexes.slice(20, 25) },
        { name: 'node3', indexes: indexes.slice(25) },
      ]);

      const plan = runPlan(filtered, { minimizeMoves: true, moveThresholdPct: 20 });
      const maxMoves = Math.max(1, Math.floor(30 * 0.20));
      expect(plan.moves.length).toBeLessThanOrEqual(maxMoves);
    });
  });

  // ── h) Edge cases ──
  describe('Edge cases', () => {
    test('2 nodes, 1 index each → may produce 0 moves', () => {
      const filtered = makeCluster([
        { name: 'node1', indexes: [makeIndex('idx_a', 'b', '_default', '_default', 5000)] },
        { name: 'node2', indexes: [makeIndex('idx_b', 'b', '_default', '_default', 5000)] },
      ]);
      const plan = runPlan(filtered);
      expect(plan).not.toBeNull();
      expect(plan.moves.length).toBe(0);
    });

    test('returns null for fewer than 2 nodes', () => {
      const filtered = makeCluster([
        { name: 'node1', indexes: [makeIndex('idx_a', 'b', '_default', '_default', 5000)] },
      ]);
      const plan = runPlan(filtered);
      expect(plan).toBeNull();
    });

    test('handles indexes with 0 disk_size', () => {
      const filtered = makeCluster([
        { name: 'node1', indexes: [
          makeIndex('idx_zero', 'b', '_default', '_default', 0),
          makeIndex('idx_one', 'b', '_default', '_default', 0),
        ]},
        { name: 'node2', indexes: [] },
      ]);
      const plan = runPlan(filtered);
      expect(plan).not.toBeNull();
      expect(totalAssigned(plan)).toBe(2);
      expect(plan.afterScore).toBeGreaterThanOrEqual(0);
      expect(plan.afterScore).toBeLessThanOrEqual(100);
    });
  });

  describe('priority indexes (memory affinity)', () => {
    // Node1 has low memory, node2 has high memory already.
    // Priority index should land on the low-memory node.
    // Reservoir excluded: non-deterministic randomness can outweigh the scaled priority penalty
    // Importance excluded: its primary signal (scan load gap) dominates over memory affinity
    const strategies = ['greedy', 'lpt', 'inverse-freq', 'stratified'];

    strategies.forEach(strategy => {
      test(`${strategy}: priority index lands on lower-memory node than without priority`, () => {
        // Same cluster, run with and without priority — the priority index should
        // end up on a node with less accumulated memory when priority is enabled.
        const MB = 1024 * 1024;
        const prioIdx = makeIndex('idx_prio', 'b1', '_default', '_default', 1000, {
          memory_used: 1 * MB, _replicaNodes: ['node2'], _replicaTotal: 1, _replicaIndex: 1,
        });
        const filtered = makeCluster([
          { name: 'node1', indexes: [
            makeIndex('idx_a', 'b2', '_default', '_default', 1000, { memory_used: 1 * MB }),
          ]},
          { name: 'node2', indexes: [
            prioIdx,
            makeIndex('idx_heavy1', 'b3', '_default', '_default', 1000, { memory_used: 1000 * MB }),
            makeIndex('idx_heavy2', 'b4', '_default', '_default', 1000, { memory_used: 1000 * MB }),
          ]},
          { name: 'node3', indexes: [
            makeIndex('idx_c', 'b5', '_default', '_default', 1000, { memory_used: 250 * MB }),
            makeIndex('idx_d', 'b6', '_default', '_default', 1000, { memory_used: 250 * MB }),
          ]},
        ]);

        // Run WITHOUT priority
        const planNoPrio = runPlan(filtered, { rebalanceStrategy: strategy, priorityIndexes: new Set() });
        // Run WITH priority
        const planPrio = runPlan(filtered, { rebalanceStrategy: strategy, priorityIndexes: new Set([prioIdx.fullKey]) });

        expect(planPrio).not.toBeNull();

        // Find which node got idx_prio in each plan
        function findPrioNode(plan) {
          for (const [n, idxs] of Object.entries(plan.assignment)) {
            if (idxs.some(x => x.name === 'idx_prio')) return n;
          }
          return null;
        }
        const noPrioNode = findPrioNode(planNoPrio);
        const prioNode = findPrioNode(planPrio);

        // With priority enabled, the node's memory should be <= without priority
        const memWithPrio = planPrio.nodeTotals[prioNode].mem;
        const memWithoutPrio = planNoPrio.nodeTotals[noPrioNode].mem;
        expect(memWithPrio).toBeLessThanOrEqual(memWithoutPrio);
      });
    });
  });
});
