const {
  dupPrepIndex, dupComparePair, dupBuildGraph, dupScanBadge,
  estNormalizeFields, buildCreateIndex,
} = require('../lib/pure');

// ────────────────────────────────────────────
// Helper: make a mock system index object
// ────────────────────────────────────────────
function mkIdx(name, bucket, scope, collection, keys, condition) {
  return {
    fullKey: `${bucket}:${scope}:${collection}:${name}`,
    bucket, scope, collection, name,
    keys: keys || [],
    condition: condition || '',
    isPrimary: false,
    replica: 0,
    state: 'online',
    type: 'gsi',
  };
}

// ────────────────────────────────────────────
// dupPrepIndex — enriches raw index with derived fields
// ────────────────────────────────────────────
describe('dupPrepIndex', () => {
  test('sets _id to fullKey', () => {
    const idx = mkIdx('idx1', 'b', 's', 'c', ['`name`']);
    const p = dupPrepIndex(idx);
    expect(p._id).toBe('b:s:c:idx1');
  });

  test('sets _target to bucket:scope:collection', () => {
    const idx = mkIdx('idx1', 'travel', 'inventory', 'hotel', ['`city`']);
    const p = dupPrepIndex(idx);
    expect(p._target).toBe('travel:inventory:hotel');
  });

  test('normalizes fields via estNormalizeFields', () => {
    const idx = mkIdx('idx1', 'b', 's', 'c', ['`Name`', '`Address`.`City`']);
    const p = dupPrepIndex(idx);
    expect(p._fields).toEqual(expect.arrayContaining(['name']));
    expect(p._fields.every(f => f === f.toLowerCase())).toBe(true);
  });

  test('normalizes WHERE clause to lowercase trimmed', () => {
    const idx = mkIdx('idx1', 'b', 's', 'c', ['`type`'], "  Type = 'airline'  ");
    const p = dupPrepIndex(idx);
    expect(p._where).toBe("type = 'airline'");
  });

  test('generates _create via buildCreateIndex', () => {
    const idx = mkIdx('idx1', 'b', '_default', '_default', ['`name`']);
    const p = dupPrepIndex(idx);
    expect(p._create).toContain('CREATE INDEX');
    expect(p._create).toContain('idx1');
  });

  test('handles empty keys', () => {
    const idx = mkIdx('primary1', 'b', 's', 'c', []);
    const p = dupPrepIndex(idx);
    expect(p._fields).toEqual([]);
  });

  test('handles empty condition', () => {
    const idx = mkIdx('idx1', 'b', 's', 'c', ['`x`'], '');
    const p = dupPrepIndex(idx);
    expect(p._where).toBe('');
  });
});

// ────────────────────────────────────────────
// dupComparePair — pairwise comparison of prepared indexes
// ────────────────────────────────────────────
describe('dupComparePair', () => {
  function prep(name, bucket, scope, collection, keys, condition) {
    return dupPrepIndex(mkIdx(name, bucket, scope, collection, keys, condition));
  }

  test('exact duplicates → type exact, strength 100', () => {
    const a = prep('idx1', 'b', 's', 'c', ['`name`', '`city`']);
    const b = prep('idx2', 'b', 's', 'c', ['`name`', '`city`']);
    const r = dupComparePair(a, b);
    expect(r).not.toBeNull();
    expect(r.type).toBe('exact');
    expect(r.strength).toBe(100);
    expect(r.fieldSimilarity).toBe(100);
    expect(r.orderSimilarity).toBe(100);
  });

  test('same fields different order → same-fields', () => {
    const a = prep('idx1', 'b', 's', 'c', ['`name`', '`city`']);
    const b = prep('idx2', 'b', 's', 'c', ['`city`', '`name`']);
    const r = dupComparePair(a, b);
    expect(r).not.toBeNull();
    expect(r.type).toBe('same-fields');
    expect(r.strength).toBeGreaterThanOrEqual(90);
  });

  test('superset → replaces-covered-by', () => {
    const a = prep('idx1', 'b', 's', 'c', ['`name`', '`city`', '`zip`']);
    const b = prep('idx2', 'b', 's', 'c', ['`name`', '`city`']);
    const r = dupComparePair(a, b);
    expect(r).not.toBeNull();
    expect(r.type).toBe('replaces-covered-by');
    expect(r.strength).toBeGreaterThanOrEqual(75);
  });

  test('subset → replaces-covered-by (reversed direction)', () => {
    const a = prep('idx1', 'b', 's', 'c', ['`name`']);
    const b = prep('idx2', 'b', 's', 'c', ['`name`', '`city`', '`zip`']);
    const r = dupComparePair(a, b);
    expect(r).not.toBeNull();
    expect(r.type).toBe('replaces-covered-by');
  });

  test('partial overlap ≥30% → similar', () => {
    const a = prep('idx1', 'b', 's', 'c', ['`name`', '`city`']);
    const b = prep('idx2', 'b', 's', 'c', ['`name`', '`zip`']);
    const r = dupComparePair(a, b);
    expect(r).not.toBeNull();
    expect(r.type).toBe('similar');
    expect(r.fieldSimilarity).toBeGreaterThanOrEqual(30);
  });

  test('no overlap → null', () => {
    const a = prep('idx1', 'b', 's', 'c', ['`name`', '`city`']);
    const b = prep('idx2', 'b', 's', 'c', ['`zip`', '`country`']);
    const r = dupComparePair(a, b);
    expect(r).toBeNull();
  });

  test('different collection → null (no cross-collection match)', () => {
    const a = prep('idx1', 'b', 's', 'c1', ['`name`']);
    const b = prep('idx2', 'b', 's', 'c2', ['`name`']);
    const r = dupComparePair(a, b);
    expect(r).toBeNull();
  });

  test('different bucket → null', () => {
    const a = prep('idx1', 'b1', 's', 'c', ['`name`']);
    const b = prep('idx2', 'b2', 's', 'c', ['`name`']);
    const r = dupComparePair(a, b);
    expect(r).toBeNull();
  });

  test('exact duplicate with WHERE clause', () => {
    const a = prep('idx1', 'b', 's', 'c', ['`name`'], "type = 'airline'");
    const b = prep('idx2', 'b', 's', 'c', ['`name`'], "type = 'airline'");
    const r = dupComparePair(a, b);
    expect(r).not.toBeNull();
    expect(r.type).toBe('exact');
  });

  test('same fields but different WHERE → same-fields', () => {
    const a = prep('idx1', 'b', 's', 'c', ['`name`'], "type = 'airline'");
    const b = prep('idx2', 'b', 's', 'c', ['`name`'], "type = 'hotel'");
    const r = dupComparePair(a, b);
    expect(r).not.toBeNull();
    expect(r.type).toBe('same-fields');
  });

  test('source and target are set to _id values', () => {
    const a = prep('idx1', 'b', 's', 'c', ['`name`']);
    const b = prep('idx2', 'b', 's', 'c', ['`name`']);
    const r = dupComparePair(a, b);
    expect(r.source).toBe('b:s:c:idx1');
    expect(r.target).toBe('b:s:c:idx2');
  });

  test('fieldSimilarity and orderSimilarity are populated', () => {
    const a = prep('idx1', 'b', 's', 'c', ['`alpha`', '`bravo`']);
    const b = prep('idx2', 'b', 's', 'c', ['`bravo`', '`alpha`']);
    const r = dupComparePair(a, b);
    expect(r).not.toBeNull();
    expect(typeof r.fieldSimilarity).toBe('number');
    expect(typeof r.orderSimilarity).toBe('number');
    expect(r.fieldSimilarity).toBe(100);
    expect(r.orderSimilarity).toBe(0); // reversed
  });

  test('low overlap below 30% → null', () => {
    const a = prep('idx1', 'b', 's', 'c', ['`alpha`', '`bravo`', '`charlie`', '`delta`']);
    const b = prep('idx2', 'b', 's', 'c', ['`alpha`', '`xray`', '`yankee`', '`zulu`']);
    // intersection=1/union=7 = 14% < 30%
    const r = dupComparePair(a, b);
    expect(r).toBeNull();
  });
});

// ────────────────────────────────────────────
// dupBuildGraph — full graph construction from index list
// ────────────────────────────────────────────
describe('dupBuildGraph', () => {
  test('returns prepared array and edges array', () => {
    const items = [mkIdx('idx1', 'b', 's', 'c', ['`name`'])];
    const g = dupBuildGraph(items);
    expect(g).toHaveProperty('prepared');
    expect(g).toHaveProperty('edges');
    expect(Array.isArray(g.prepared)).toBe(true);
    expect(Array.isArray(g.edges)).toBe(true);
  });

  test('single index → no edges', () => {
    const g = dupBuildGraph([mkIdx('idx1', 'b', 's', 'c', ['`name`'])]);
    expect(g.edges).toHaveLength(0);
    expect(g.prepared).toHaveLength(1);
  });

  test('two exact duplicates → one edge of type exact', () => {
    const items = [
      mkIdx('idx1', 'b', 's', 'c', ['`name`', '`city`']),
      mkIdx('idx2', 'b', 's', 'c', ['`name`', '`city`']),
    ];
    const g = dupBuildGraph(items);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0].type).toBe('exact');
  });

  test('three indexes with pairwise relationships', () => {
    const items = [
      mkIdx('idx1', 'b', 's', 'c', ['`name`', '`city`']),
      mkIdx('idx2', 'b', 's', 'c', ['`name`', '`city`']),
      mkIdx('idx3', 'b', 's', 'c', ['`name`', '`city`', '`zip`']),
    ];
    const g = dupBuildGraph(items);
    // idx1-idx2: exact, idx1-idx3: covered-by, idx2-idx3: covered-by
    expect(g.edges).toHaveLength(3);
    expect(g.edges.filter(e => e.type === 'exact')).toHaveLength(1);
    expect(g.edges.filter(e => e.type === 'replaces-covered-by')).toHaveLength(2);
  });

  test('indexes in different collections produce no edges', () => {
    const items = [
      mkIdx('idx1', 'b', 's', 'c1', ['`name`']),
      mkIdx('idx2', 'b', 's', 'c2', ['`name`']),
    ];
    const g = dupBuildGraph(items);
    expect(g.edges).toHaveLength(0);
    expect(g.prepared).toHaveLength(2);
  });

  test('indexes in different buckets produce no edges', () => {
    const items = [
      mkIdx('idx1', 'b1', 's', 'c', ['`name`']),
      mkIdx('idx2', 'b2', 's', 'c', ['`name`']),
    ];
    const g = dupBuildGraph(items);
    expect(g.edges).toHaveLength(0);
  });

  test('non-overlapping indexes in same collection → no edges', () => {
    const items = [
      mkIdx('idx1', 'b', 's', 'c', ['`name`']),
      mkIdx('idx2', 'b', 's', 'c', ['`zip`']),
    ];
    const g = dupBuildGraph(items);
    expect(g.edges).toHaveLength(0);
  });

  test('mixed collections: only same-collection pairs produce edges', () => {
    const items = [
      mkIdx('idx1', 'b', 's', 'c1', ['`name`', '`city`']),
      mkIdx('idx2', 'b', 's', 'c1', ['`name`', '`city`']),
      mkIdx('idx3', 'b', 's', 'c2', ['`name`', '`city`']),
    ];
    const g = dupBuildGraph(items);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0].source).toContain('c1');
    expect(g.edges[0].target).toContain('c1');
  });

  test('prepared items have _fields, _where, _create', () => {
    const items = [mkIdx('idx1', 'b', 's', 'c', ['`name`'], "type = 'x'")];
    const g = dupBuildGraph(items);
    const p = g.prepared[0];
    expect(p._fields.length).toBeGreaterThan(0);
    expect(p._where).toBe("type = 'x'");
    expect(p._create).toContain('CREATE INDEX');
  });

  test('empty input → empty result', () => {
    const g = dupBuildGraph([]);
    expect(g.prepared).toHaveLength(0);
    expect(g.edges).toHaveLength(0);
  });

  test('large same-collection set: N*(N-1)/2 pair comparisons', () => {
    const items = [];
    for (let i = 0; i < 5; i++) {
      items.push(mkIdx(`idx${i}`, 'b', 's', 'c', ['`name`', '`city`']));
    }
    const g = dupBuildGraph(items);
    // 5 identical indexes → 10 exact edges
    expect(g.edges).toHaveLength(10);
    g.edges.forEach(e => expect(e.type).toBe('exact'));
  });

  test('edge desc is populated', () => {
    const items = [
      mkIdx('idx1', 'b', 's', 'c', ['`name`']),
      mkIdx('idx2', 'b', 's', 'c', ['`name`']),
    ];
    const g = dupBuildGraph(items);
    expect(typeof g.edges[0].desc).toBe('string');
    expect(g.edges[0].desc.length).toBeGreaterThan(0);
  });
});

// ────────────────────────────────────────────
// dupScanBadge — scan recency label
// ────────────────────────────────────────────
describe('dupScanBadge', () => {
  test('zero → never', () => {
    expect(dupScanBadge(0)).toBe('never');
  });

  test('null → never', () => {
    expect(dupScanBadge(null)).toBe('never');
  });

  test('undefined → never', () => {
    expect(dupScanBadge(undefined)).toBe('never');
  });

  test('just now → today', () => {
    const now = Date.now() * 1e6; // nanoseconds
    expect(dupScanBadge(now)).toBe('today');
  });

  test('3 days ago → 1-7d', () => {
    const ns = (Date.now() - 3 * 86400000) * 1e6;
    expect(dupScanBadge(ns)).toBe('1-7d');
  });

  test('15 days ago → 8-30d', () => {
    const ns = (Date.now() - 15 * 86400000) * 1e6;
    expect(dupScanBadge(ns)).toBe('8-30d');
  });

  test('60 days ago → 31-90d', () => {
    const ns = (Date.now() - 60 * 86400000) * 1e6;
    expect(dupScanBadge(ns)).toBe('31-90d');
  });

  test('120 days ago → 91d-6mo', () => {
    const ns = (Date.now() - 120 * 86400000) * 1e6;
    expect(dupScanBadge(ns)).toBe('91d-6mo');
  });

  test('300 days ago → 6mo-1y', () => {
    const ns = (Date.now() - 300 * 86400000) * 1e6;
    expect(dupScanBadge(ns)).toBe('6mo-1y');
  });

  test('400 days ago → 1y+', () => {
    const ns = (Date.now() - 400 * 86400000) * 1e6;
    expect(dupScanBadge(ns)).toBe('1y+');
  });

  test('boundary: exactly 7 days → 1-7d', () => {
    const ns = (Date.now() - 7 * 86400000) * 1e6;
    expect(dupScanBadge(ns)).toBe('1-7d');
  });

  test('boundary: exactly 30 days → 8-30d', () => {
    const ns = (Date.now() - 30 * 86400000) * 1e6;
    expect(dupScanBadge(ns)).toBe('8-30d');
  });

  test('boundary: exactly 90 days → 31-90d', () => {
    const ns = (Date.now() - 90 * 86400000) * 1e6;
    expect(dupScanBadge(ns)).toBe('31-90d');
  });

  test('boundary: exactly 182 days → 91d-6mo', () => {
    const ns = (Date.now() - 182 * 86400000) * 1e6;
    expect(dupScanBadge(ns)).toBe('91d-6mo');
  });

  test('boundary: exactly 365 days → 6mo-1y', () => {
    const ns = (Date.now() - 365 * 86400000) * 1e6;
    expect(dupScanBadge(ns)).toBe('6mo-1y');
  });
});
