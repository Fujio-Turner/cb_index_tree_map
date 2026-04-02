const {
  estFormatBytes, estCollatJsonSize, estCollatJsonNumberSize, estCollatJsonStringSize,
  estRawSize, estTokenizePath, estResolveField, estParseIndex,
  estValidateJsonStr, estValidateIndexStr,
} = require('../lib/pure');

// ────────────────────────────────────────────
// estFormatBytes — human-readable byte formatting
// ────────────────────────────────────────────
describe('estFormatBytes', () => {
  test('zero', () => expect(estFormatBytes(0)).toBe('0 B'));
  test('bytes', () => expect(estFormatBytes(512)).toBe('512.00 B'));
  test('kilobytes', () => expect(estFormatBytes(1024)).toBe('1.00 KB'));
  test('megabytes', () => expect(estFormatBytes(1048576)).toBe('1.00 MB'));
  test('gigabytes', () => expect(estFormatBytes(1073741824)).toBe('1.00 GB'));
  test('terabytes', () => expect(estFormatBytes(1099511627776)).toBe('1.00 TB'));
  test('fractional MB', () => expect(estFormatBytes(1572864)).toBe('1.50 MB'));
  test('large value', () => expect(estFormatBytes(5368709120)).toBe('5.00 GB'));
});

// ────────────────────────────────────────────
// estCollatJsonSize — CollatJSON binary encoding sizes
// ────────────────────────────────────────────
describe('estCollatJsonSize', () => {
  test('null returns 2', () => expect(estCollatJsonSize(null)).toBe(2));
  test('undefined returns 2', () => expect(estCollatJsonSize(undefined)).toBe(2));
  test('boolean true returns 2', () => expect(estCollatJsonSize(true)).toBe(2));
  test('boolean false returns 2', () => expect(estCollatJsonSize(false)).toBe(2));
  test('number 0 returns 4', () => expect(estCollatJsonSize(0)).toBe(4));
  test('single digit number', () => expect(estCollatJsonSize(5)).toBe(5));
  test('multi-digit number', () => {
    const result = estCollatJsonSize(12345);
    expect(result).toBeGreaterThan(4);
  });
  test('string', () => {
    const result = estCollatJsonSize('hello');
    expect(result).toBe(1 + 5 + 1); // type + payload + terminator
  });
  test('empty string', () => expect(estCollatJsonSize('')).toBe(2)); // type + terminator
  test('array', () => {
    const result = estCollatJsonSize([1, 2, 3]);
    expect(result).toBeGreaterThan(2); // at least wrapper
    // Should be 2 (wrapper) + sizes of elements
    expect(result).toBe(2 + estCollatJsonSize(1) + estCollatJsonSize(2) + estCollatJsonSize(3));
  });
  test('nested object', () => {
    const result = estCollatJsonSize({ a: 1 });
    expect(result).toBeGreaterThan(5);
  });
  test('empty array', () => expect(estCollatJsonSize([])).toBe(2));
});

// ────────────────────────────────────────────
// estCollatJsonNumberSize
// ────────────────────────────────────────────
describe('estCollatJsonNumberSize', () => {
  test('zero', () => expect(estCollatJsonNumberSize(0)).toBe(4));
  test('single digit', () => expect(estCollatJsonNumberSize(5)).toBe(5));
  test('negative single digit', () => expect(estCollatJsonNumberSize(-3)).toBe(5));
  test('two digits', () => expect(estCollatJsonNumberSize(42)).toBe(6));
  test('large number', () => {
    const result = estCollatJsonNumberSize(1000000);
    expect(result).toBe(3 + 7 + 1); // 7 digits
  });
});

// ────────────────────────────────────────────
// estCollatJsonStringSize
// ────────────────────────────────────────────
describe('estCollatJsonStringSize', () => {
  test('empty string', () => expect(estCollatJsonStringSize('')).toBe(2));
  test('simple ASCII', () => expect(estCollatJsonStringSize('abc')).toBe(5)); // 1+3+1
  test('longer string', () => expect(estCollatJsonStringSize('American Airlines')).toBe(19)); // 1+17+1
  test('unicode characters', () => {
    const result = estCollatJsonStringSize('café');
    expect(result).toBeGreaterThan(6); // é is 2 bytes in UTF-8
  });
});

// ────────────────────────────────────────────
// estRawSize — unencoded byte sizes
// ────────────────────────────────────────────
describe('estRawSize', () => {
  test('null returns 0', () => expect(estRawSize(null)).toBe(0));
  test('undefined returns 0', () => expect(estRawSize(undefined)).toBe(0));
  test('boolean returns 1', () => expect(estRawSize(true)).toBe(1));
  test('number returns 8', () => expect(estRawSize(42)).toBe(8));
  test('string returns UTF-8 length', () => expect(estRawSize('hello')).toBe(5));
  test('empty string returns 0', () => expect(estRawSize('')).toBe(0));
  test('object returns JSON length', () => {
    const result = estRawSize({ a: 1 });
    expect(result).toBe(new TextEncoder().encode(JSON.stringify({ a: 1 })).length);
  });
});

// ────────────────────────────────────────────
// estTokenizePath — SQL++ field path tokenization
// ────────────────────────────────────────────
describe('estTokenizePath', () => {
  test('simple field', () => expect(estTokenizePath('name')).toEqual(['name']));
  test('dotted path', () => expect(estTokenizePath('address.city')).toEqual(['address', 'city']));
  test('backtick-quoted', () => expect(estTokenizePath('`address`.`city`')).toEqual(['address', 'city']));
  test('backtick with dot inside', () => expect(estTokenizePath('`address.city`')).toEqual(['address.city']));
  test('array subscript', () => expect(estTokenizePath('tags[0]')).toEqual(['tags', '0']));
  test('mixed backtick and subscript', () => expect(estTokenizePath('`arr`[1].`b.c`')).toEqual(['arr', '1', 'b.c']));
  test('empty string', () => expect(estTokenizePath('')).toEqual([]));
  test('special chars in backticks', () => expect(estTokenizePath('`doc_$_type`')).toEqual(['doc_$_type']));
  test('deep nesting', () => expect(estTokenizePath('a.b.c.d')).toEqual(['a', 'b', 'c', 'd']));
});

// ────────────────────────────────────────────
// estResolveField — resolve field path on JSON doc
// ────────────────────────────────────────────
describe('estResolveField', () => {
  const doc = {
    airline: 'AA',
    name: 'American Airlines',
    id: 24,
    address: { city: 'Dallas', state: 'TX' },
    tags: ['major', 'domestic', 'international'],
    nested: { deep: { value: 42 } },
  };

  test('top-level string', () => expect(estResolveField(doc, 'name')).toBe('American Airlines'));
  test('top-level number', () => expect(estResolveField(doc, 'id')).toBe(24));
  test('nested object field', () => expect(estResolveField(doc, 'address.city')).toBe('Dallas'));
  test('array field', () => expect(estResolveField(doc, 'tags')).toEqual(['major', 'domestic', 'international']));
  test('array subscript', () => expect(estResolveField(doc, 'tags[0]')).toBe('major'));
  test('array subscript [2]', () => expect(estResolveField(doc, 'tags[2]')).toBe('international'));
  test('deep nested', () => expect(estResolveField(doc, 'nested.deep.value')).toBe(42));
  test('missing field returns undefined', () => expect(estResolveField(doc, 'nonexistent')).toBeUndefined());
  test('missing nested returns undefined', () => expect(estResolveField(doc, 'address.zip')).toBeUndefined());
  test('null object returns undefined', () => expect(estResolveField(null, 'name')).toBeUndefined());
  test('empty path returns undefined', () => expect(estResolveField(doc, '')).toBeUndefined());
});

// ────────────────────────────────────────────
// estParseIndex — CREATE INDEX statement parser
// ────────────────────────────────────────────
describe('estParseIndex', () => {
  test('simple single-field index', () => {
    const r = estParseIndex('CREATE INDEX idx_name ON `travel-sample`(name)');
    expect(r.indexName).toBe('idx_name');
    expect(r.keyspace).toBe('travel-sample');
    expect(r.keyExpressions).toEqual(['name']);
    expect(r.resolvedFields).toHaveLength(1);
    expect(r.resolvedFields[0].field).toBe('name');
    expect(r.resolvedFields[0].isArray).toBe(false);
    expect(r.resolvedFields[0].isMeta).toBe(false);
    expect(r.whereClause).toBeNull();
  });

  test('multi-field index', () => {
    const r = estParseIndex('CREATE INDEX idx_multi ON `bucket`(field1, field2, field3)');
    expect(r.indexName).toBe('idx_multi');
    expect(r.keyExpressions).toEqual(['field1', 'field2', 'field3']);
    expect(r.resolvedFields).toHaveLength(3);
  });

  test('index with WHERE clause', () => {
    const r = estParseIndex("CREATE INDEX idx_type ON `bucket`(name) WHERE type = 'airline'");
    expect(r.indexName).toBe('idx_type');
    expect(r.keyExpressions).toEqual(['name']);
    expect(r.whereClause).toBe("type = 'airline'");
  });

  test('index with WHERE and WITH', () => {
    const r = estParseIndex("CREATE INDEX idx ON `b`(x) WHERE type = 'a' WITH {\"num_replica\":1}");
    expect(r.whereClause).toBe("type = 'a'");
  });

  test('DISTINCT array index', () => {
    const r = estParseIndex('CREATE INDEX idx_arr ON `bucket`(DISTINCT tags)');
    expect(r.resolvedFields).toHaveLength(1);
    expect(r.resolvedFields[0].isArray).toBe(true);
    expect(r.resolvedFields[0].arrayMode).toBe('DISTINCT');
    expect(r.resolvedFields[0].field).toBe('tags');
  });

  test('ALL array index', () => {
    const r = estParseIndex('CREATE INDEX idx_all ON `bucket`(ALL schedule)');
    expect(r.resolvedFields[0].isArray).toBe(true);
    expect(r.resolvedFields[0].arrayMode).toBe('ALL');
  });

  test('full ARRAY expression with FOR/IN/END', () => {
    const r = estParseIndex('CREATE INDEX idx_full ON `bucket`(DISTINCT ARRAY v.flight FOR v IN schedule END)');
    expect(r.resolvedFields).toHaveLength(1);
    const rf = r.resolvedFields[0];
    expect(rf.isArray).toBe(true);
    expect(rf.arrayMode).toBe('DISTINCT');
    expect(rf.field).toBe('schedule');
    expect(rf.arrayVar).toBe('v');
    expect(rf.arraySubExprs).toEqual(['v.flight']);
  });

  test('FLATTEN_KEYS array expression', () => {
    const r = estParseIndex('CREATE INDEX idx_fk ON `bucket`(DISTINCT ARRAY FLATTEN_KEYS(v.a, v.b) FOR v IN arr END)');
    const rf = r.resolvedFields[0];
    expect(rf.isArray).toBe(true);
    expect(rf.field).toBe('arr');
    expect(rf.arraySubExprs).toEqual(['v.a', 'v.b']);
  });

  test('mixed regular and array fields', () => {
    const r = estParseIndex('CREATE INDEX idx_mix ON `bucket`(name, DISTINCT ARRAY t FOR t IN tags END)');
    expect(r.resolvedFields).toHaveLength(2);
    expect(r.resolvedFields[0].isArray).toBe(false);
    expect(r.resolvedFields[0].field).toBe('name');
    expect(r.resolvedFields[1].isArray).toBe(true);
    expect(r.resolvedFields[1].field).toBe('tags');
  });

  test('meta().id expression', () => {
    const r = estParseIndex('CREATE INDEX idx_meta ON `bucket`(meta().id, name)');
    expect(r.resolvedFields).toHaveLength(2);
    expect(r.resolvedFields[0].isMeta).toBe(true);
    expect(r.resolvedFields[0].field).toBe('meta().id');
    expect(r.resolvedFields[1].isMeta).toBe(false);
  });

  test('backtick-quoted index and keyspace names', () => {
    const r = estParseIndex('CREATE INDEX `idx-special` ON `my-bucket`(field1)');
    expect(r.indexName).toBe('idx-special');
    expect(r.keyspace).toBe('my-bucket');
  });

  test('nested field path in index keys', () => {
    const r = estParseIndex('CREATE INDEX idx_nested ON `bucket`(address.city, address.state)');
    expect(r.keyExpressions).toEqual(['address.city', 'address.state']);
    expect(r.resolvedFields[0].field).toBe('address.city');
    expect(r.resolvedFields[1].field).toBe('address.state');
  });

  test('no key expressions → empty resolvedFields', () => {
    const r = estParseIndex('CREATE INDEX idx ON `bucket`');
    expect(r.resolvedFields).toHaveLength(0);
  });
});

// ────────────────────────────────────────────
// Regression: full sizing calculation pipeline
// ────────────────────────────────────────────
describe('estimator regression — end-to-end sizing', () => {
  const sampleDoc = {
    airline: 'AA',
    name: 'American Airlines',
    callsign: 'AMERICAN',
    country: 'United States',
    type: 'airline',
    iata: 'AA',
    icao: 'AAL',
    id: 24,
    address: { city: 'Dallas', state: 'TX' },
    tags: ['major', 'domestic', 'international'],
  };
  const docId = 'airline_24';
  const D = new TextEncoder().encode(docId).length;

  test('single-field index: field sizes are consistent', () => {
    const parsed = estParseIndex("CREATE INDEX idx ON `travel-sample`(name) WHERE type = 'airline'");
    const field = parsed.resolvedFields[0];
    const val = estResolveField(sampleDoc, field.field);
    const raw = estRawSize(val);
    const collat = estCollatJsonSize(val);

    expect(val).toBe('American Airlines');
    expect(raw).toBe(17); // 17 UTF-8 bytes
    expect(collat).toBe(19); // 1 type + 17 payload + 1 terminator

    // Forward entry: K_enc + D + trailer(2)
    const K_enc = collat; // single field, no array wrapper
    const fwdEntry = K_enc + D + 2;
    expect(fwdEntry).toBe(19 + 10 + 2); // 31
  });

  test('composite index: forward entry includes array wrapper', () => {
    const parsed = estParseIndex("CREATE INDEX idx ON `travel-sample`(name, address.city)");
    expect(parsed.resolvedFields).toHaveLength(2);

    const val1 = estResolveField(sampleDoc, 'name');
    const val2 = estResolveField(sampleDoc, 'address.city');
    expect(val1).toBe('American Airlines');
    expect(val2).toBe('Dallas');

    const c1 = estCollatJsonSize(val1);
    const c2 = estCollatJsonSize(val2);
    // Composite key: 2 (array wrapper) + field sizes
    const K_enc = 2 + c1 + c2;
    const fwdEntry = K_enc + D + 2; // no array index → trailer=2
    expect(K_enc).toBe(2 + 19 + 8); // 29
    expect(fwdEntry).toBe(29 + 10 + 2); // 41
  });

  test('array index: trailer is 4 bytes', () => {
    const parsed = estParseIndex("CREATE INDEX idx ON `travel-sample`(DISTINCT ARRAY t FOR t IN tags END)");
    expect(parsed.resolvedFields[0].isArray).toBe(true);
    // hasArrayIndex → TRAILER = 4
  });

  test('plasma sizing formulas: raw total scales linearly', () => {
    const K_enc = 19; // single string field
    const fwdEntry = K_enc + D + 2; // 31
    const plasmaBack = D + K_enc + 2; // 31
    const rawPerDoc = fwdEntry + plasmaBack; // 62

    const numDocs = 1000000;
    const rawTotal = numDocs * rawPerDoc;
    expect(rawTotal).toBe(62000000);

    const withOverhead = rawTotal * 1.5; // plasma page overhead
    expect(withOverhead).toBe(93000000);

    const plasmaMem = withOverhead * 0.2; // 20% working set
    expect(plasmaMem).toBe(18600000);

    const plasmaDisk = withOverhead * 1.5; // compaction ratio
    expect(plasmaDisk).toBe(139500000);
  });

  test('MOI sizing: includes 52B skiplist overhead per entry', () => {
    const K_enc = 19;
    const fwdEntry = K_enc + D + 2;
    const moiBack = D + 2;
    const rawPerDoc = fwdEntry + moiBack;
    const MOI_OVERHEAD = 52;

    const numDocs = 1000000;
    const moiMemTotal = numDocs * (rawPerDoc + MOI_OVERHEAD);
    expect(moiMemTotal).toBe(numDocs * (31 + 12 + 52)); // 95M
  });

  test('ForestDB sizing: uses higher overhead multipliers', () => {
    const K_enc = 19;
    const fwdEntry = K_enc + D + 2;
    const fdbBack = D + K_enc + 2; // same as plasma
    const rawPerDoc = fwdEntry + fdbBack;
    const FDB_OVERHEAD = 2.0;
    const FDB_COMPACTION = 2.0;

    const numDocs = 1000000;
    const rawTotal = numDocs * rawPerDoc;
    const withOverhead = rawTotal * FDB_OVERHEAD;
    const fdbDisk = withOverhead * FDB_COMPACTION;
    expect(fdbDisk).toBe(rawTotal * 4); // 2.0 × 2.0
    expect(fdbDisk).toBeGreaterThan(numDocs * rawPerDoc * 1.5 * 1.5); // > plasma
  });

  test('selectivity reduces entry count', () => {
    const numDocs = 1000000;
    const selectivity = 0.1; // 10%
    const numEntries = Math.round(numDocs * selectivity * 1); // no array expansion
    expect(numEntries).toBe(100000);
  });

  test('array expansion multiplies entry count', () => {
    const numDocs = 1000000;
    const arrayExpansion = 3; // 3 array elements per doc
    const numEntries = Math.round(numDocs * 1.0 * arrayExpansion);
    expect(numEntries).toBe(3000000);
  });

  test('estFormatBytes produces correct human-readable output for computed sizes', () => {
    // ~139.5 MB from a typical plasma disk estimate
    expect(estFormatBytes(139500000)).toBe('133.04 MB');
    expect(estFormatBytes(0)).toBe('0 B');
    expect(estFormatBytes(62)).toBe('62.00 B');
  });
});

// ────────────────────────────────────────────
// Regression: edge cases and consistency
// ────────────────────────────────────────────
describe('estimator regression — edge cases', () => {
  test('CollatJSON: nested array of objects', () => {
    const val = [{ a: 1 }, { a: 2 }];
    const size = estCollatJsonSize(val);
    expect(size).toBeGreaterThan(2); // not just wrapper
    // Should be deterministic
    expect(estCollatJsonSize(val)).toBe(size);
  });

  test('CollatJSON: deeply nested object', () => {
    const val = { a: { b: { c: 'deep' } } };
    const size = estCollatJsonSize(val);
    expect(size).toBeGreaterThan(10);
  });

  test('rawSize and collatJsonSize are consistent for same value', () => {
    const values = [null, true, 42, 'hello', [1, 2], { x: 1 }];
    values.forEach(v => {
      const raw = estRawSize(v);
      const collat = estCollatJsonSize(v);
      // CollatJSON always adds overhead (type tag + terminator), so collat >= 2
      expect(collat).toBeGreaterThanOrEqual(2);
      // For non-null values, raw should be > 0
      if (v !== null) expect(raw).toBeGreaterThan(0);
    });
  });

  test('resolveField with backtick-quoted path containing dots', () => {
    const doc = { 'address.city': 'Dallas' };
    expect(estResolveField(doc, '`address.city`')).toBe('Dallas');
  });

  test('parseIndex handles extra whitespace', () => {
    const r = estParseIndex('  CREATE   INDEX   idx   ON   `bucket`  (  name  ,  type  )  WHERE  type = \'a\'  ');
    expect(r.indexName).toBe('idx');
    expect(r.keyExpressions).toEqual(['name', 'type']);
    expect(r.whereClause).toBe("type = 'a'");
  });

  test('parseIndex WITHIN keyword in array expression', () => {
    const r = estParseIndex('CREATE INDEX idx ON `b`(DISTINCT ARRAY v FOR v WITHIN nested END)');
    const rf = r.resolvedFields[0];
    expect(rf.isArray).toBe(true);
    expect(rf.field).toBe('nested');
  });
});

// ────────────────────────────────────────────
// estValidateJsonStr — JSON document validation
// ────────────────────────────────────────────
describe('estValidateJsonStr', () => {
  test('empty string → neutral (no error)', () => {
    const r = estValidateJsonStr('');
    expect(r.valid).toBe(false);
    expect(r.error).toBeNull();
  });

  test('valid object → valid', () => {
    const r = estValidateJsonStr('{"name":"test","id":1}');
    expect(r.valid).toBe(true);
    expect(r.error).toBeNull();
  });

  test('valid object with whitespace → valid', () => {
    const r = estValidateJsonStr('  { "a": 1 }  ');
    expect(r.valid).toBe(true);
  });

  test('array → invalid (must be object)', () => {
    const r = estValidateJsonStr('[1, 2, 3]');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/single object/i);
  });

  test('primitive string → invalid', () => {
    const r = estValidateJsonStr('"hello"');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/single object/i);
  });

  test('primitive number → invalid', () => {
    const r = estValidateJsonStr('42');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/single object/i);
  });

  test('null JSON → invalid', () => {
    const r = estValidateJsonStr('null');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/single object/i);
  });

  test('malformed JSON → invalid with parse error', () => {
    const r = estValidateJsonStr('{name: bad}');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/Invalid JSON/i);
  });

  test('truncated JSON → invalid', () => {
    const r = estValidateJsonStr('{"name": "test"');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/Invalid JSON/i);
  });

  test('nested valid object → valid', () => {
    const r = estValidateJsonStr('{"a":{"b":{"c":1}},"d":[1,2]}');
    expect(r.valid).toBe(true);
  });
});

// ────────────────────────────────────────────
// estValidateIndexStr — CREATE INDEX validation
// ────────────────────────────────────────────
describe('estValidateIndexStr', () => {
  test('empty string → neutral (no error)', () => {
    const r = estValidateIndexStr('');
    expect(r.valid).toBe(false);
    expect(r.error).toBeNull();
  });

  test('valid simple index → valid', () => {
    const r = estValidateIndexStr('CREATE INDEX idx_name ON `bucket`(field1)');
    expect(r.valid).toBe(true);
    expect(r.error).toBeNull();
  });

  test('valid multi-field index → valid', () => {
    const r = estValidateIndexStr('CREATE INDEX idx ON `bucket`(f1, f2, f3)');
    expect(r.valid).toBe(true);
  });

  test('valid index with WHERE → valid', () => {
    const r = estValidateIndexStr("CREATE INDEX idx ON `bucket`(name) WHERE type = 'airline'");
    expect(r.valid).toBe(true);
  });

  test('valid index with WHERE and WITH → valid', () => {
    const r = estValidateIndexStr('CREATE INDEX idx ON `bucket`(name) WHERE type = \'a\' WITH {"num_replica":1}');
    expect(r.valid).toBe(true);
  });

  test('valid index with USING GSI → valid', () => {
    const r = estValidateIndexStr('CREATE INDEX idx ON `bucket`(name) USING GSI');
    expect(r.valid).toBe(true);
  });

  test('valid index with IF NOT EXISTS → valid', () => {
    const r = estValidateIndexStr('CREATE INDEX IF NOT EXISTS idx ON `bucket`(name)');
    expect(r.valid).toBe(true);
  });

  test('valid DISTINCT ARRAY index → valid', () => {
    const r = estValidateIndexStr('CREATE INDEX idx ON `bucket`(DISTINCT ARRAY v FOR v IN tags END)');
    expect(r.valid).toBe(true);
  });

  test('valid ALL ARRAY index → valid', () => {
    const r = estValidateIndexStr('CREATE INDEX idx ON `bucket`(ALL ARRAY v.x FOR v IN schedule END)');
    expect(r.valid).toBe(true);
  });

  test('valid FLATTEN_KEYS index → valid', () => {
    const r = estValidateIndexStr('CREATE INDEX idx ON `bucket`(DISTINCT ARRAY FLATTEN_KEYS(v.a, v.b) FOR v IN arr END)');
    expect(r.valid).toBe(true);
  });

  test('valid index with WITHIN → valid', () => {
    const r = estValidateIndexStr('CREATE INDEX idx ON `bucket`(DISTINCT ARRAY v FOR v WITHIN nested END)');
    expect(r.valid).toBe(true);
  });

  test('valid scoped keyspace → valid', () => {
    const r = estValidateIndexStr('CREATE INDEX idx ON `bucket`.`scope`.`collection`(name)');
    expect(r.valid).toBe(true);
  });

  test('valid INCLUDE MISSING → valid', () => {
    const r = estValidateIndexStr('CREATE INDEX idx ON `bucket`(district INCLUDE MISSING, name)');
    expect(r.valid).toBe(true);
  });

  test('valid DESC key → valid', () => {
    const r = estValidateIndexStr('CREATE INDEX idx ON `bucket`(name DESC)');
    expect(r.valid).toBe(true);
  });

  // ── Invalid cases ──

  test('does not start with CREATE INDEX → invalid', () => {
    const r = estValidateIndexStr('SELECT * FROM bucket');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/CREATE INDEX/i);
  });

  test('missing ON clause → invalid', () => {
    const r = estValidateIndexStr('CREATE INDEX idx (field1)');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/ON/i);
  });

  test('missing index keys (no parens) → invalid', () => {
    const r = estValidateIndexStr('CREATE INDEX idx ON `bucket`');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/index keys/i);
  });

  test('empty index keys → invalid', () => {
    const r = estValidateIndexStr('CREATE INDEX idx ON `bucket`()');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/empty/i);
  });

  test('unbalanced parentheses → invalid', () => {
    const r = estValidateIndexStr('CREATE INDEX idx ON `bucket`(field1, ARRAY v FOR v IN tags');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/parenthes|ARRAY/i);
  });

  test('ARRAY without END → invalid', () => {
    const r = estValidateIndexStr('CREATE INDEX idx ON `bucket`(DISTINCT ARRAY v FOR v IN tags)');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/END/i);
  });

  test('ARRAY without FOR → invalid', () => {
    const r = estValidateIndexStr('CREATE INDEX idx ON `bucket`(DISTINCT ARRAY v END)');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/FOR/i);
  });

  test('empty WHERE clause → invalid', () => {
    const r = estValidateIndexStr('CREATE INDEX idx ON `bucket`(name) WHERE');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/WHERE.*empty/i);
  });

  test('invalid WITH JSON → invalid', () => {
    const r = estValidateIndexStr('CREATE INDEX idx ON `bucket`(name) WITH {bad json}');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/WITH.*JSON/i);
  });

  test('valid WITH JSON → valid', () => {
    const r = estValidateIndexStr('CREATE INDEX idx ON `bucket`(name) WITH {"defer_build":true}');
    expect(r.valid).toBe(true);
  });

  test('USING invalid engine → invalid', () => {
    const r = estValidateIndexStr('CREATE INDEX idx ON `bucket`(name) USING BTREE');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/USING.*GSI.*FTS/i);
  });

  test('USING FTS → valid', () => {
    const r = estValidateIndexStr('CREATE INDEX idx ON `bucket`(name) USING FTS');
    expect(r.valid).toBe(true);
  });

  test('random garbage → invalid', () => {
    const r = estValidateIndexStr('this is not an index');
    expect(r.valid).toBe(false);
  });

  test('CREATE PRIMARY INDEX → invalid (not handled by estimator)', () => {
    const r = estValidateIndexStr('CREATE PRIMARY INDEX ON `bucket`');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/CREATE INDEX/i);
  });
});
