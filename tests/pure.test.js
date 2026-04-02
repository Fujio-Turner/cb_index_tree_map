const {
  fmt, truncPart, fmtCompact, fmtNs, wildcardMatch, safeName,
  isArrayIndex, hasDocTypeFirst, getWhereFields, getIndexFields,
  findWhereFieldsInIndex, findDuplicateKeys, buildCreateIndex,
  dedup, matchNodeFilter, matchFilter, SCAN_DAY_RANGES,
  parseSystemJSON, parseStatsNodeJSON, buildTree,
} = require('../lib/pure');

// ────────────────────────────────────────────
// fmt  – human-readable byte sizes
// ────────────────────────────────────────────
describe('fmt', () => {
  test('zero / null', () => {
    expect(fmt(0)).toBe('0 B');
    expect(fmt(null)).toBe('0 B');
  });
  test('bytes', () => expect(fmt(512)).toBe('512 B'));
  test('kilobytes', () => expect(fmt(1024)).toBe('1 KB'));
  test('megabytes', () => expect(fmt(1048576)).toBe('1 MB'));
  test('gigabytes', () => expect(fmt(1073741824)).toBe('1 GB'));
  test('terabytes', () => expect(fmt(1099511627776)).toBe('1 TB'));
  test('fractional MB', () => expect(fmt(1572864)).toBe('1.5 MB'));
});

// ────────────────────────────────────────────
// truncPart
// ────────────────────────────────────────────
describe('truncPart', () => {
  test('short string unchanged', () => expect(truncPart('abc', 10)).toBe('abc'));
  test('truncates long string', () => {
    const r = truncPart('abcdefghijklmno', 10);
    expect(r.length).toBeLessThanOrEqual(10);
    expect(r).toContain('..');
  });
});

// ────────────────────────────────────────────
// fmtCompact
// ────────────────────────────────────────────
describe('fmtCompact', () => {
  test('null → dash', () => expect(fmtCompact(null)).toBe('—'));
  test('small number', () => expect(fmtCompact(42)).toBe('42'));
  test('thousands', () => expect(fmtCompact(1500)).toBe('1.5K'));
  test('millions', () => expect(fmtCompact(2000000)).toBe('2M'));
  test('billions', () => expect(fmtCompact(3500000000)).toBe('3.5B'));
});

// ────────────────────────────────────────────
// fmtNs  – nanoseconds to human string
// ────────────────────────────────────────────
describe('fmtNs', () => {
  test('zero', () => expect(fmtNs(0)).toBe('0'));
  test('nanoseconds', () => expect(fmtNs(500)).toBe('500 ns'));
  test('microseconds', () => expect(fmtNs(5000)).toBe('5.0 µs'));
  test('milliseconds', () => expect(fmtNs(5000000)).toBe('5.0 ms'));
  test('seconds', () => expect(fmtNs(2500000000)).toBe('2.50 s'));
});

// ────────────────────────────────────────────
// wildcardMatch
// ────────────────────────────────────────────
describe('wildcardMatch', () => {
  test('exact match', () => expect(wildcardMatch('city', 'city')).toBe(true));
  test('case insensitive', () => expect(wildcardMatch('City', 'city')).toBe(true));
  test('wildcard prefix', () => expect(wildcardMatch('*_id', 'user_id')).toBe(true));
  test('wildcard suffix', () => expect(wildcardMatch('addr.*', 'addr.street')).toBe(true));
  test('no match', () => expect(wildcardMatch('foo', 'bar')).toBe(false));
  test('middle wildcard', () => expect(wildcardMatch('a*z', 'abcz')).toBe(true));
});

// ────────────────────────────────────────────
// safeName  (server.js & lib/pure.js)
// ────────────────────────────────────────────
describe('safeName', () => {
  test('appends .json', () => expect(safeName('myfile')).toBe('myfile.json'));
  test('keeps .json', () => expect(safeName('myfile.json')).toBe('myfile.json'));
  test('sanitizes special chars', () => expect(safeName('my/file name!')).toBe('my_file_name_.json'));
  test('collapses dots', () => expect(safeName('a..b')).toBe('a.b.json'));
  test('decodes URI', () => expect(safeName('hello%20world')).toBe('hello_world.json'));
});

// ────────────────────────────────────────────
// isArrayIndex
// ────────────────────────────────────────────
describe('isArrayIndex', () => {
  test('non-array', () => expect(isArrayIndex(['`city`', '`zip`'])).toBe(false));
  test('ALL keyword', () => expect(isArrayIndex(['ALL `phones`'])).toBe(true));
  test('DISTINCT', () => expect(isArrayIndex(['DISTINCT ARRAY v FOR v IN items END'])).toBe(true));
  test('null/empty', () => {
    expect(isArrayIndex(null)).toBe(false);
    expect(isArrayIndex([])).toBe(false);
  });
});

// ────────────────────────────────────────────
// hasDocTypeFirst
// ────────────────────────────────────────────
describe('hasDocTypeFirst', () => {
  test('type first', () => expect(hasDocTypeFirst(['`type`', '`name`'])).toBe(true));
  test('doctype first', () => expect(hasDocTypeFirst(['`docType`', '`id`'])).toBe(true));
  test('_class first', () => expect(hasDocTypeFirst(['`_class`'])).toBe(true));
  test('other first', () => expect(hasDocTypeFirst(['`name`', '`type`'])).toBe(false));
  test('empty', () => expect(hasDocTypeFirst([])).toBe(false));
});

// ────────────────────────────────────────────
// getWhereFields / getIndexFields
// ────────────────────────────────────────────
describe('getWhereFields', () => {
  test('extracts fields from WHERE', () => {
    expect(getWhereFields('`type` = "user" AND `active` = true')).toEqual(
      expect.arrayContaining(['type', 'active', 'user', 'true'])
    );
  });
  test('empty', () => expect(getWhereFields('')).toEqual([]));
  test('null', () => expect(getWhereFields(null)).toEqual([]));
});

describe('getIndexFields', () => {
  test('simple keys', () => {
    expect(getIndexFields(['`city`', '`zip`'])).toEqual(['city', 'zip']);
  });
  test('skips reserved words', () => {
    expect(getIndexFields(['ALL `phones`'])).toEqual(['phones']);
  });
  test('null', () => expect(getIndexFields(null)).toEqual([]));
});

// ────────────────────────────────────────────
// findWhereFieldsInIndex / findDuplicateKeys
// ────────────────────────────────────────────
describe('findWhereFieldsInIndex', () => {
  test('finds overlap', () => {
    const keys = ['`type`', '`name`'];
    const cond = '`type` = "hotel"';
    expect(findWhereFieldsInIndex(keys, cond)).toEqual(['type']);
  });
  test('no overlap', () => {
    expect(findWhereFieldsInIndex(['`name`'], '`status` = 1')).toEqual([]);
  });
  test('no condition', () => expect(findWhereFieldsInIndex(['`x`'], '')).toEqual([]));
});

describe('findDuplicateKeys', () => {
  test('finds dupes', () => {
    expect(findDuplicateKeys(['`city`', '`zip`', '`city`'])).toEqual(['city']);
  });
  test('no dupes', () => expect(findDuplicateKeys(['`city`', '`zip`'])).toEqual([]));
  test('null', () => expect(findDuplicateKeys(null)).toEqual([]));
});

// ────────────────────────────────────────────
// buildCreateIndex
// ────────────────────────────────────────────
describe('buildCreateIndex', () => {
  test('primary index default scope', () => {
    const stmt = buildCreateIndex({ bucket: 'travel', scope: '_default', collection: '_default', name: '#primary', isPrimary: true, replica: 0 });
    expect(stmt).toBe('CREATE PRIMARY INDEX `#primary` ON `travel`');
  });
  test('secondary index with WHERE and replica', () => {
    const stmt = buildCreateIndex({ bucket: 'travel', scope: '_default', collection: '_default', name: 'idx_city', isPrimary: false, keys: ['`city`', '`state`'], condition: '`type` = "hotel"', replica: 1 });
    expect(stmt).toBe('CREATE INDEX `idx_city` ON `travel`(`city`, `state`) WHERE `type` = "hotel" WITH {"num_replica":1}');
  });
  test('named scope/collection', () => {
    const stmt = buildCreateIndex({ bucket: 'app', scope: 'inventory', collection: 'items', name: 'idx1', isPrimary: false, keys: ['`sku`'], condition: '', replica: 0 });
    expect(stmt).toBe('CREATE INDEX `idx1` ON `app`.`inventory`.`items`(`sku`)');
  });
});

// ────────────────────────────────────────────
// dedup
// ────────────────────────────────────────────
describe('dedup', () => {
  test('removes duplicates by key', () => {
    const items = [
      { bucket: 'b', scope: 's', collection: 'c', name: 'idx1' },
      { bucket: 'b', scope: 's', collection: 'c', name: 'idx1' },
      { bucket: 'b', scope: 's', collection: 'c', name: 'idx2' },
    ];
    expect(dedup(items)).toHaveLength(2);
  });
  test('empty array', () => expect(dedup([])).toEqual([]));
});

// ────────────────────────────────────────────
// matchNodeFilter
// ────────────────────────────────────────────
describe('matchNodeFilter', () => {
  test('empty nodes = match all', () => expect(matchNodeFilter('node1', { nodes: [] })).toBe(true));
  test('node in list', () => expect(matchNodeFilter('node1', { nodes: ['node1', 'node2'] })).toBe(true));
  test('node not in list', () => expect(matchNodeFilter('node3', { nodes: ['node1'] })).toBe(false));
});

// ────────────────────────────────────────────
// matchFilter  (including new day-range filters)
// ────────────────────────────────────────────
describe('matchFilter', () => {
  const base = { bucket: 'b1', scope: 's1', collection: 'c1', name: 'idx1', keys: ['`city`'] };
  const emptyF = { bucket: '', scope: '', collection: '', index: '', scan: '', fields: '' };

  test('all empty filters match', () => {
    expect(matchFilter(base, emptyF)).toBe(true);
  });

  test('bucket filter', () => {
    expect(matchFilter(base, { ...emptyF, bucket: 'b1' })).toBe(true);
    expect(matchFilter(base, { ...emptyF, bucket: 'other' })).toBe(false);
  });

  test('scope filter', () => {
    expect(matchFilter(base, { ...emptyF, scope: 's1' })).toBe(true);
    expect(matchFilter(base, { ...emptyF, scope: 'other' })).toBe(false);
  });

  test('collection filter', () => {
    expect(matchFilter(base, { ...emptyF, collection: 'c1' })).toBe(true);
    expect(matchFilter(base, { ...emptyF, collection: 'other' })).toBe(false);
  });

  test('index name filter', () => {
    expect(matchFilter(base, { ...emptyF, index: 'idx1' })).toBe(true);
    expect(matchFilter(base, { ...emptyF, index: 'idx2' })).toBe(false);
  });

  test('fields filter', () => {
    expect(matchFilter(base, { ...emptyF, fields: 'city' })).toBe(true);
    expect(matchFilter(base, { ...emptyF, fields: 'zip' })).toBe(false);
  });

  test('wildcard fields filter', () => {
    expect(matchFilter(base, { ...emptyF, fields: 'ci*' })).toBe(true);
    expect(matchFilter(base, { ...emptyF, fields: '*ty' })).toBe(true);
  });

  // ── Scan filters ──
  test('exclude-never hides never-scanned', () => {
    const never = { ...base, last_known_scan_time: 0 };
    expect(matchFilter(never, { ...emptyF, scan: 'exclude-never' })).toBe(false);
  });

  test('exclude-never shows scanned', () => {
    const scanned = { ...base, last_known_scan_time: Date.now() * 1e6 };
    expect(matchFilter(scanned, { ...emptyF, scan: 'exclude-never' })).toBe(true);
  });

  test('only-never shows never-scanned', () => {
    const never = { ...base, last_known_scan_time: 0 };
    expect(matchFilter(never, { ...emptyF, scan: 'only-never' })).toBe(true);
  });

  test('only-never hides scanned', () => {
    const scanned = { ...base, last_known_scan_time: Date.now() * 1e6 };
    expect(matchFilter(scanned, { ...emptyF, scan: 'only-never' })).toBe(false);
  });

  // ── Day-range scan filters (issue #47) ──
  describe('day-range scan filters', () => {
    function itemScannedDaysAgo(days) {
      const ts = (Date.now() - days * 86400000) * 1e6; // nanosecond timestamp (Date.now() is ms × 1e6 = ns)
      return { ...base, last_known_scan_time: ts };
    }

    test('never-scanned excluded from all day ranges', () => {
      const never = { ...base, last_known_scan_time: 0 };
      SCAN_DAY_RANGES.forEach(r => {
        expect(matchFilter(never, { ...emptyF, scan: r.value })).toBe(false);
      });
    });

    test('1-7 days: 3 days ago matches', () => {
      expect(matchFilter(itemScannedDaysAgo(3), { ...emptyF, scan: 'days-1-7' })).toBe(true);
    });

    test('1-7 days: 10 days ago does NOT match', () => {
      expect(matchFilter(itemScannedDaysAgo(10), { ...emptyF, scan: 'days-1-7' })).toBe(false);
    });

    test('8-30 days: 15 days ago matches', () => {
      expect(matchFilter(itemScannedDaysAgo(15), { ...emptyF, scan: 'days-8-30' })).toBe(true);
    });

    test('31-90 days: 60 days ago matches', () => {
      expect(matchFilter(itemScannedDaysAgo(60), { ...emptyF, scan: 'days-31-90' })).toBe(true);
    });

    test('91d-6mo: 120 days ago matches', () => {
      expect(matchFilter(itemScannedDaysAgo(120), { ...emptyF, scan: 'days-91-182' })).toBe(true);
    });

    test('6mo-1y: 200 days ago matches', () => {
      expect(matchFilter(itemScannedDaysAgo(200), { ...emptyF, scan: 'days-183-365' })).toBe(true);
    });

    test('1y+: 400 days ago matches', () => {
      expect(matchFilter(itemScannedDaysAgo(400), { ...emptyF, scan: 'days-366-inf' })).toBe(true);
    });

    test('boundary: 7 days = inside 1-7', () => {
      expect(matchFilter(itemScannedDaysAgo(7), { ...emptyF, scan: 'days-1-7' })).toBe(true);
    });

    test('boundary: 8 days = inside 8-30, outside 1-7', () => {
      expect(matchFilter(itemScannedDaysAgo(8), { ...emptyF, scan: 'days-1-7' })).toBe(false);
      expect(matchFilter(itemScannedDaysAgo(8), { ...emptyF, scan: 'days-8-30' })).toBe(true);
    });
  });
});

// ────────────────────────────────────────────
// SCAN_DAY_RANGES constant
// ────────────────────────────────────────────
describe('SCAN_DAY_RANGES', () => {
  test('has 6 ranges', () => expect(SCAN_DAY_RANGES).toHaveLength(6));
  test('ranges are contiguous (no gaps)', () => {
    for (let i = 1; i < SCAN_DAY_RANGES.length; i++) {
      expect(SCAN_DAY_RANGES[i].min).toBe(SCAN_DAY_RANGES[i - 1].max + 1);
    }
  });
  test('last range is unbounded', () => {
    expect(SCAN_DAY_RANGES[SCAN_DAY_RANGES.length - 1].max).toBe(Infinity);
  });
});

// ────────────────────────────────────────────
// parseSystemJSON
// ────────────────────────────────────────────
describe('parseSystemJSON', () => {
  test('parses standard system:indexes output', () => {
    const input = JSON.stringify([
      { indexes: { name: 'idx1', keyspace_id: 'travel', scope_id: 'inventory', bucket_id: 'travel', using: 'gsi', state: 'online', index_key: ['`city`'], condition: '`type`="hotel"', is_primary: false, metadata: { num_replica: 1 } } }
    ]);
    const flat = parseSystemJSON(input);
    expect(flat).toHaveLength(1);
    expect(flat[0].name).toBe('idx1');
    expect(flat[0].bucket).toBe('travel');
    expect(flat[0].scope).toBe('inventory');
    expect(flat[0].keys).toEqual(['`city`']);
    expect(flat[0].replica).toBe(1);
  });

  test('parses {results: [...]} wrapper', () => {
    const input = JSON.stringify({ results: [{ name: 'primary', keyspace_id: 'beer', using: 'gsi', state: 'online', is_primary: true }] });
    const flat = parseSystemJSON(input);
    expect(flat).toHaveLength(1);
    expect(flat[0].isPrimary).toBe(true);
  });

  test('FTS index gets [FTS] suffix', () => {
    const input = JSON.stringify([{ indexes: { name: 'fts1', keyspace_id: 'b', using: 'fts', state: 'online' } }]);
    const flat = parseSystemJSON(input);
    expect(flat[0].name).toBe('fts1 [FTS]');
  });

  test('throws on invalid JSON', () => {
    expect(() => parseSystemJSON('not json')).toThrow('Invalid JSON');
  });

  test('throws on non-array non-results object', () => {
    expect(() => parseSystemJSON('{"foo":"bar"}')).toThrow('Expected array');
  });
});

// ────────────────────────────────────────────
// parseStatsNodeJSON
// ────────────────────────────────────────────
describe('parseStatsNodeJSON', () => {
  test('parses 2-part key (bucket:index)', () => {
    const input = JSON.stringify({ 'travel:idx_city': { disk_size: 1024, data_size: 2048, items_count: 100 } });
    const { indexer, flat } = parseStatsNodeJSON(input, 'disk_size');
    expect(indexer).toBeNull();
    expect(flat).toHaveLength(1);
    expect(flat[0].bucket).toBe('travel');
    expect(flat[0].scope).toBe('_default');
    expect(flat[0].name).toBe('idx_city');
    expect(flat[0].disk_size).toBe(1024);
    expect(flat[0].data_size).toBe(2048);
    expect(flat[0].value).toBe(1024);
  });

  test('parses 4-part key (bucket:scope:coll:index)', () => {
    const input = JSON.stringify({ 'app:inv:items:idx_sku': { disk_size: 500 } });
    const { flat } = parseStatsNodeJSON(input, 'disk_size');
    expect(flat[0].bucket).toBe('app');
    expect(flat[0].scope).toBe('inv');
    expect(flat[0].collection).toBe('items');
    expect(flat[0].name).toBe('idx_sku');
  });

  test('extracts indexer object', () => {
    const input = JSON.stringify({ indexer: { indexer_state: 'Active', memory_used: 999 }, 'b:idx': { disk_size: 100 } });
    const { indexer, flat } = parseStatsNodeJSON(input, 'disk_size');
    expect(indexer).toEqual({ indexer_state: 'Active', memory_used: 999 });
    expect(flat).toHaveLength(1);
  });

  test('throws on invalid JSON', () => {
    expect(() => parseStatsNodeJSON('bad', 'disk_size')).toThrow('Invalid JSON');
  });

  test('bloat_ratio calculated correctly', () => {
    const input = JSON.stringify({ 'b:idx': { disk_size: 300, data_size: 100 } });
    const { flat } = parseStatsNodeJSON(input, 'disk_size');
    expect(flat[0].bloat_ratio).toBe(3);
  });

  test('bloat_ratio 0 when data_size is 0', () => {
    const input = JSON.stringify({ 'b:idx': { disk_size: 300, data_size: 0 } });
    const { flat } = parseStatsNodeJSON(input, 'disk_size');
    expect(flat[0].bloat_ratio).toBe(0);
  });
});

// ────────────────────────────────────────────
// buildTree
// ────────────────────────────────────────────
describe('buildTree', () => {
  test('builds nested tree from flat list', () => {
    const flat = [
      { bucket: 'b1', scope: 's1', collection: 'c1', name: 'idx1', value: 100 },
      { bucket: 'b1', scope: 's1', collection: 'c1', name: 'idx2', value: 200 },
      { bucket: 'b2', scope: 's2', collection: 'c2', name: 'idx3', value: 50 },
    ];
    const tree = buildTree(flat, true);
    expect(tree).toHaveLength(2);
    expect(tree[0].name).toBe('b1');
    expect(tree[0].children[0].name).toBe('s1');
    expect(tree[0].children[0].children[0].name).toBe('c1');
    expect(tree[0].children[0].children[0].children).toHaveLength(2);
  });

  test('useVal=false sets all values to 1', () => {
    const flat = [{ bucket: 'b', scope: 's', collection: 'c', name: 'i', value: 999 }];
    const tree = buildTree(flat, false);
    expect(tree[0].children[0].children[0].children[0].value).toBe(1);
  });

  test('empty input', () => expect(buildTree([], true)).toEqual([]));
});
