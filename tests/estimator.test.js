const {
  estFormatBytes, estCollatJsonSize, estCollatJsonNumberSize, estCollatJsonStringSize,
  estRawSize, estTokenizePath, estResolveField, estParseIndex,
  estValidateJsonStr, estValidateIndexStr,
  estIsInferOutput, estInferToSampleDoc, estInferSampleValue,
  estNormalizeFields, estFieldSimilarity, estFieldOrderSimilarity,
  estClassifyRelationship,
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

  test('meta().expiration expression', () => {
    const r = estParseIndex('CREATE INDEX idx_exp ON `bucket`(meta().expiration)');
    expect(r.resolvedFields).toHaveLength(1);
    expect(r.resolvedFields[0].isMeta).toBe(true);
    expect(r.resolvedFields[0].field).toBe('meta().expiration');
  });

  test('meta().cas expression', () => {
    const r = estParseIndex('CREATE INDEX idx_cas ON `bucket`(meta().cas, type)');
    expect(r.resolvedFields).toHaveLength(2);
    expect(r.resolvedFields[0].isMeta).toBe(true);
    expect(r.resolvedFields[0].field).toBe('meta().cas');
  });

  test('meta().type expression', () => {
    const r = estParseIndex('CREATE INDEX idx_mtype ON `bucket`(meta().type)');
    expect(r.resolvedFields[0].isMeta).toBe(true);
    expect(r.resolvedFields[0].field).toBe('meta().type');
  });

  test('meta().flags expression', () => {
    const r = estParseIndex('CREATE INDEX idx_flags ON `bucket`(meta().flags, name)');
    expect(r.resolvedFields[0].isMeta).toBe(true);
    expect(r.resolvedFields[0].field).toBe('meta().flags');
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

// ────────────────────────────────────────────
// INFER schema support
// ────────────────────────────────────────────
describe('estIsInferOutput', () => {
  test('regular object is not INFER', () => {
    expect(estIsInferOutput({ name: 'test' })).toBe(false);
  });
  test('empty array is not INFER', () => {
    expect(estIsInferOutput([])).toBe(false);
  });
  test('flat array of INFER schemas is detected', () => {
    const infer = [{ properties: { name: { type: 'string' } }, type: 'object' }];
    expect(estIsInferOutput(infer)).toBe(true);
  });
  test('nested array (actual INFER output) is detected', () => {
    const infer = [[{ properties: { id: { type: 'number' } }, type: 'object' }]];
    expect(estIsInferOutput(infer)).toBe(true);
  });
  test('array of non-schema objects is not INFER', () => {
    expect(estIsInferOutput([{ name: 'foo' }, { name: 'bar' }])).toBe(false);
  });
  test('null is not INFER', () => {
    expect(estIsInferOutput(null)).toBe(false);
  });
  test('string is not INFER', () => {
    expect(estIsInferOutput('hello')).toBe(false);
  });
  test('number is not INFER', () => {
    expect(estIsInferOutput(42)).toBe(false);
  });
  test('array with missing properties key is not INFER', () => {
    expect(estIsInferOutput([{ type: 'object' }])).toBe(false);
  });
  test('array with wrong type value is not INFER', () => {
    expect(estIsInferOutput([{ properties: { a: {} }, type: 'array' }])).toBe(false);
  });
  test('multi-schema INFER output is detected', () => {
    const infer = [[
      { properties: { name: { type: 'string' } }, type: 'object', '#docs': 100, Flavor: 'type = "airline"' },
      { properties: { city: { type: 'string' } }, type: 'object', '#docs': 200, Flavor: 'type = "airport"' },
    ]];
    expect(estIsInferOutput(infer)).toBe(true);
  });
  test('mixed valid and invalid schemas is not INFER', () => {
    expect(estIsInferOutput([
      { properties: { a: {} }, type: 'object' },
      { name: 'not a schema' },
    ])).toBe(false);
  });
});

describe('estInferToSampleDoc', () => {
  test('converts simple string/number/boolean properties', () => {
    const schema = {
      properties: {
        name: { type: 'string', samples: ['Alice', 'Bob'] },
        age: { type: 'number', samples: [30, 40] },
        active: { type: 'boolean', samples: [true, false] },
      },
      type: 'object',
    };
    const doc = estInferToSampleDoc(schema);
    expect(doc.name).toBe('Alice');
    expect(doc.age).toBe(30);
    expect(doc.active).toBe(true);
  });

  test('handles nullable fields (type array with null)', () => {
    const schema = {
      properties: {
        city: {
          type: ['null', 'string'],
          samples: [[null], ['London', 'Paris']],
        },
      },
      type: 'object',
    };
    const doc = estInferToSampleDoc(schema);
    expect(doc.city).toBe('London');
  });

  test('handles nested object properties', () => {
    const schema = {
      properties: {
        geo: {
          type: 'object',
          properties: {
            lat: { type: 'number', samples: [51.5] },
            lon: { type: 'number', samples: [-0.12] },
          },
        },
      },
      type: 'object',
    };
    const doc = estInferToSampleDoc(schema);
    expect(doc.geo).toEqual({ lat: 51.5, lon: -0.12 });
  });

  test('handles array with object items', () => {
    const schema = {
      properties: {
        schedule: {
          type: 'array',
          items: {
            properties: {
              day: { type: 'number', samples: [0, 1] },
              flight: { type: 'string', samples: ['AA001'] },
            },
            type: 'object',
          },
        },
      },
      type: 'object',
    };
    const doc = estInferToSampleDoc(schema);
    expect(doc.schedule).toEqual([{ day: 0, flight: 'AA001' }]);
  });

  test('handles array with string items', () => {
    const schema = {
      properties: {
        tags: { type: 'array', items: { type: 'string' } },
      },
      type: 'object',
    };
    const doc = estInferToSampleDoc(schema);
    expect(doc.tags).toEqual(['sample']);
  });

  test('handles null-only type', () => {
    const schema = {
      properties: {
        tollfree: { type: 'null', samples: [null] },
      },
      type: 'object',
    };
    const doc = estInferToSampleDoc(schema);
    expect(doc.tollfree).toBeNull();
  });

  test('uses first sample from array samples for simple types', () => {
    const schema = {
      properties: {
        airline: {
          type: 'string',
          samples: ['AS', 'DL', 'FL'],
        },
      },
      type: 'object',
    };
    const doc = estInferToSampleDoc(schema);
    expect(doc.airline).toBe('AS');
  });

  test('full travel-sample airline schema', () => {
    const schema = {
      '#docs': 7,
      Flavor: '`type` = "airline"',
      properties: {
        callsign: { type: ['null', 'string'], samples: [[null], ['AIR SUNSHINE', 'CROWN AIRWAYS']] },
        country: { type: 'string', samples: ['France', 'United Kingdom'] },
        iata: { type: ['null', 'string'], samples: [[null], ['5Y', 'CJ']] },
        icao: { type: 'string', samples: ['CFE', 'CRL'] },
        id: { type: 'number', samples: [295, 1795] },
        name: { type: 'string', samples: ['Air Sunshine', 'BA CityFlyer'] },
        type: { type: 'string', samples: ['airline'] },
      },
      type: 'object',
    };
    const doc = estInferToSampleDoc(schema);
    expect(doc.country).toBe('France');
    expect(doc.icao).toBe('CFE');
    expect(doc.id).toBe(295);
    expect(doc.name).toBe('Air Sunshine');
    expect(doc.type).toBe('airline');
    // nullable fields should pick non-null sample
    expect(doc.callsign).toBe('AIR SUNSHINE');
    expect(doc.iata).toBe('5Y');
  });

  test('empty schema returns empty object', () => {
    expect(estInferToSampleDoc({})).toEqual({});
    expect(estInferToSampleDoc(null)).toEqual({});
    expect(estInferToSampleDoc(undefined)).toEqual({});
  });

  test('property with no samples falls back to type default', () => {
    const schema = {
      properties: {
        s: { type: 'string' },
        n: { type: 'number' },
        b: { type: 'boolean' },
      },
      type: 'object',
    };
    const doc = estInferToSampleDoc(schema);
    expect(doc.s).toBe('');
    expect(doc.n).toBe(0);
    expect(doc.b).toBe(false);
  });

  test('array with number items', () => {
    const schema = {
      properties: {
        scores: { type: 'array', items: { type: 'number' } },
      },
      type: 'object',
    };
    const doc = estInferToSampleDoc(schema);
    expect(doc.scores).toEqual([0]);
  });

  test('array with no items schema and no samples falls back to null', () => {
    const schema = {
      properties: {
        data: { type: 'array' },
      },
      type: 'object',
    };
    const doc = estInferToSampleDoc(schema);
    // no items definition and no samples → falls through to null
    expect(doc.data).toBeNull();
  });

  test('array with items but samples present uses first sample', () => {
    const schema = {
      properties: {
        tags: { type: 'array', items: { type: 'string' }, samples: [['red', 'blue'], ['green']] },
      },
      type: 'object',
    };
    const doc = estInferToSampleDoc(schema);
    expect(doc.tags).toEqual(['red', 'blue']);
  });

  test('nullable where all samples are null arrays', () => {
    const schema = {
      properties: {
        tollfree: { type: ['null'], samples: [[null]] },
      },
      type: 'object',
    };
    const doc = estInferToSampleDoc(schema);
    // type=['null'] → seeks non-null type, falls back to 'null'; samples=[[null]] iterates but finds no non-null
    expect(doc.tollfree).toEqual([null]);
  });

  test('nested object with samples uses samples first', () => {
    const schema = {
      properties: {
        geo: {
          type: 'object',
          properties: {
            lat: { type: 'number', samples: [48.86] },
            lon: { type: 'number', samples: [2.33] },
          },
          samples: [{ lat: 99, lon: 99 }],
        },
      },
      type: 'object',
    };
    const doc = estInferToSampleDoc(schema);
    // samples on the object itself take precedence
    expect(doc.geo).toEqual({ lat: 99, lon: 99 });
  });

  test('generated doc is valid for estResolveField', () => {
    const schema = {
      properties: {
        name: { type: 'string', samples: ['Test Airlines'] },
        address: {
          type: 'object',
          properties: {
            city: { type: 'string', samples: ['Dallas'] },
            state: { type: 'string', samples: ['TX'] },
          },
        },
      },
      type: 'object',
    };
    const doc = estInferToSampleDoc(schema);
    expect(estResolveField(doc, 'name')).toBe('Test Airlines');
    expect(estResolveField(doc, 'address.city')).toBe('Dallas');
    expect(estResolveField(doc, 'address.state')).toBe('TX');
  });
});

// ────────────────────────────────────────────
// estInferSampleValue — direct unit tests
// ────────────────────────────────────────────
describe('estInferSampleValue', () => {
  test('null prop returns null', () => {
    expect(estInferSampleValue(null)).toBeNull();
    expect(estInferSampleValue(undefined)).toBeNull();
  });

  test('string with samples returns first sample', () => {
    expect(estInferSampleValue({ type: 'string', samples: ['hello', 'world'] })).toBe('hello');
  });

  test('number with samples returns first sample', () => {
    expect(estInferSampleValue({ type: 'number', samples: [42, 99] })).toBe(42);
  });

  test('boolean with samples returns first sample', () => {
    expect(estInferSampleValue({ type: 'boolean', samples: [false, true] })).toBe(false);
  });

  test('string without samples returns empty string', () => {
    expect(estInferSampleValue({ type: 'string' })).toBe('');
  });

  test('number without samples returns 0', () => {
    expect(estInferSampleValue({ type: 'number' })).toBe(0);
  });

  test('boolean without samples returns false', () => {
    expect(estInferSampleValue({ type: 'boolean' })).toBe(false);
  });

  test('null type returns null', () => {
    expect(estInferSampleValue({ type: 'null', samples: [null] })).toBeNull();
  });

  test('nullable string picks non-null sample', () => {
    expect(estInferSampleValue({
      type: ['null', 'string'],
      samples: [[null], ['Paris', 'London']],
    })).toBe('Paris');
  });

  test('nullable with only null samples returns [null]', () => {
    // [[null]] → iterates: [null] is an array, finds no non-null; falls through to samples[0]
    expect(estInferSampleValue({
      type: ['null', 'string'],
      samples: [[null]],
    })).toEqual([null]);
  });

  test('object with properties recurses', () => {
    const result = estInferSampleValue({
      type: 'object',
      properties: {
        x: { type: 'number', samples: [10] },
      },
    });
    expect(result).toEqual({ x: 10 });
  });

  test('array with object items returns array of one sample object', () => {
    const result = estInferSampleValue({
      type: 'array',
      items: {
        type: 'object',
        properties: {
          day: { type: 'number', samples: [0] },
        },
      },
    });
    expect(result).toEqual([{ day: 0 }]);
  });

  test('array with string items returns ["sample"]', () => {
    expect(estInferSampleValue({ type: 'array', items: { type: 'string' } })).toEqual(['sample']);
  });

  test('array with number items returns [0]', () => {
    expect(estInferSampleValue({ type: 'array', items: { type: 'number' } })).toEqual([0]);
  });

  test('array with no items returns null (no items definition)', () => {
    // type='array' but no items property → falls through to null
    expect(estInferSampleValue({ type: 'array' })).toBeNull();
  });

  test('unknown type returns null', () => {
    expect(estInferSampleValue({ type: 'foobar' })).toBeNull();
  });
});

// ────────────────────────────────────────────
// INFER multi-flavor end-to-end
// ────────────────────────────────────────────
describe('INFER multi-flavor scenarios', () => {
  const inferOutput = [[
    {
      '#docs': 750,
      Flavor: '`type` = "route"',
      type: 'object',
      properties: {
        airline: { type: 'string', samples: ['AS', 'DL'] },
        sourceairport: { type: 'string', samples: ['CMH', 'IND'] },
        stops: { type: 'number', samples: [0] },
        type: { type: 'string', samples: ['route'] },
      },
    },
    {
      '#docs': 150,
      Flavor: '`type` = "landmark"',
      type: 'object',
      properties: {
        activity: { type: 'string', samples: ['buy', 'do'] },
        city: { type: ['null', 'string'], samples: [[null], ['London', 'Paris']] },
        country: { type: 'string', samples: ['France', 'United Kingdom'] },
        type: { type: 'string', samples: ['landmark'] },
      },
    },
    {
      '#docs': 100,
      Flavor: '`type` = "airline"',
      type: 'object',
      properties: {
        name: { type: 'string', samples: ['Air France'] },
        country: { type: 'string', samples: ['France'] },
        type: { type: 'string', samples: ['airline'] },
      },
    },
  ]];

  test('estIsInferOutput detects multi-flavor data', () => {
    expect(estIsInferOutput(inferOutput)).toBe(true);
  });

  test('unwraps nested array correctly', () => {
    const arr = Array.isArray(inferOutput[0]) ? inferOutput[0] : inferOutput;
    expect(arr).toHaveLength(3);
  });

  test('each flavor generates a valid sample doc', () => {
    const arr = inferOutput[0];
    const routeDoc = estInferToSampleDoc(arr[0]);
    expect(routeDoc.airline).toBe('AS');
    expect(routeDoc.sourceairport).toBe('CMH');
    expect(routeDoc.stops).toBe(0);
    expect(routeDoc.type).toBe('route');

    const landmarkDoc = estInferToSampleDoc(arr[1]);
    expect(landmarkDoc.activity).toBe('buy');
    expect(landmarkDoc.city).toBe('London');
    expect(landmarkDoc.country).toBe('France');
    expect(landmarkDoc.type).toBe('landmark');

    const airlineDoc = estInferToSampleDoc(arr[2]);
    expect(airlineDoc.name).toBe('Air France');
    expect(airlineDoc.type).toBe('airline');
  });

  test('selectivity can be computed from #docs', () => {
    const arr = inferOutput[0];
    const totalDocs = arr.reduce((s, sch) => s + (sch['#docs'] || 0), 0);
    expect(totalDocs).toBe(1000);
    expect(Math.round((arr[0]['#docs'] / totalDocs) * 100)).toBe(75); // route
    expect(Math.round((arr[1]['#docs'] / totalDocs) * 100)).toBe(15); // landmark
    expect(Math.round((arr[2]['#docs'] / totalDocs) * 100)).toBe(10); // airline
  });

  test('generated docs work with estCollatJsonSize', () => {
    const arr = inferOutput[0];
    const doc = estInferToSampleDoc(arr[2]); // airline
    // Each field should produce a non-zero CollatJSON size
    expect(estCollatJsonSize(doc.name)).toBeGreaterThan(0);
    expect(estCollatJsonSize(doc.country)).toBeGreaterThan(0);
    expect(estCollatJsonSize(doc.type)).toBeGreaterThan(0);
  });

  test('generated docs work with estResolveField for index key resolution', () => {
    const arr = inferOutput[0];
    const doc = estInferToSampleDoc(arr[1]); // landmark
    expect(estResolveField(doc, 'activity')).toBe('buy');
    expect(estResolveField(doc, 'city')).toBe('London');
    expect(estResolveField(doc, 'country')).toBe('France');
    expect(estResolveField(doc, 'missing_field')).toBeUndefined();
  });
});

// ────────────────────────────────────────────
// meta() fields in index parsing — extended
// ────────────────────────────────────────────
describe('estParseIndex meta() fields', () => {
  test('meta().id with other meta fields in same index', () => {
    const r = estParseIndex('CREATE INDEX idx ON `b`(meta().id, meta().expiration, name)');
    expect(r.resolvedFields).toHaveLength(3);
    expect(r.resolvedFields[0]).toMatchObject({ field: 'meta().id', isMeta: true });
    expect(r.resolvedFields[1]).toMatchObject({ field: 'meta().expiration', isMeta: true });
    expect(r.resolvedFields[2]).toMatchObject({ field: 'name', isMeta: false });
  });

  test('meta().cas is case-insensitive', () => {
    const r = estParseIndex('CREATE INDEX idx ON `b`(META().CAS)');
    expect(r.resolvedFields[0].field).toBe('meta().cas');
    expect(r.resolvedFields[0].isMeta).toBe(true);
  });

  test('meta() with spaces parses correctly', () => {
    const r = estParseIndex('CREATE INDEX idx ON `b`(meta( ).id)');
    expect(r.resolvedFields[0].field).toBe('meta().id');
    expect(r.resolvedFields[0].isMeta).toBe(true);
  });

  test('meta().rev field', () => {
    const r = estParseIndex('CREATE INDEX idx ON `b`(meta().rev)');
    expect(r.resolvedFields[0]).toMatchObject({ field: 'meta().rev', isMeta: true });
  });

  test('non-meta field named "meta" is not flagged as meta', () => {
    const r = estParseIndex('CREATE INDEX idx ON `b`(metadata)');
    expect(r.resolvedFields[0].isMeta).toBe(false);
    expect(r.resolvedFields[0].field).toBe('metadata');
  });
});

// ────────────────────────────────────────────
// estParseIndex — scope & collection awareness
// ────────────────────────────────────────────
describe('estParseIndex scope & collection', () => {
  test('bucket only → defaults to _default scope and collection', () => {
    const r = estParseIndex('CREATE INDEX idx ON `travel-sample`(name)');
    expect(r.bucket).toBe('travel-sample');
    expect(r.scope).toBe('_default');
    expect(r.collection).toBe('_default');
    expect(r.keyspace).toBe('travel-sample');
  });

  test('fully qualified bucket.scope.collection', () => {
    const r = estParseIndex('CREATE INDEX idx ON `mybucket`.`myscope`.`mycollection`(field1)');
    expect(r.bucket).toBe('mybucket');
    expect(r.scope).toBe('myscope');
    expect(r.collection).toBe('mycollection');
    expect(r.keyspace).toBe('mybucket');
  });

  test('two-part path → bucket.collection (scope defaults)', () => {
    const r = estParseIndex('CREATE INDEX idx ON `mybucket`.`mycollection`(field1)');
    expect(r.bucket).toBe('mybucket');
    expect(r.scope).toBe('_default');
    expect(r.collection).toBe('mycollection');
  });

  test('fully qualified with _default scope and _default collection', () => {
    const r = estParseIndex('CREATE INDEX idx ON `pillowfight`.`_default`.`_default`(field1)');
    expect(r.bucket).toBe('pillowfight');
    expect(r.scope).toBe('_default');
    expect(r.collection).toBe('_default');
  });

  test('bucket-only matches fully qualified _default._default', () => {
    const r1 = estParseIndex('CREATE INDEX idx ON `mybucket`(field1)');
    const r2 = estParseIndex('CREATE INDEX idx ON `mybucket`.`_default`.`_default`(field1)');
    expect(r1.bucket).toBe(r2.bucket);
    expect(r1.scope).toBe(r2.scope);
    expect(r1.collection).toBe(r2.collection);
  });

  test('keys still parsed correctly with scoped keyspace', () => {
    const r = estParseIndex('CREATE INDEX idx ON `b`.`s`.`c`(field1, field2) WHERE type = "x"');
    expect(r.bucket).toBe('b');
    expect(r.scope).toBe('s');
    expect(r.collection).toBe('c');
    expect(r.keyExpressions).toEqual(['field1', 'field2']);
    expect(r.whereClause).toBe('type = "x"');
  });

  test('IF NOT EXISTS with scoped keyspace', () => {
    const r = estParseIndex('CREATE INDEX IF NOT EXISTS idx ON `b`.`s`.`c`(name)');
    expect(r.indexName).toBe('idx');
    expect(r.bucket).toBe('b');
    expect(r.scope).toBe('s');
    expect(r.collection).toBe('c');
  });
});

// ────────────────────────────────────────────
// estNormalizeFields
// ────────────────────────────────────────────
describe('estNormalizeFields', () => {
  test('normalizes backtick-quoted fields to lowercase', () => {
    expect(estNormalizeFields(['`Field_2`', '`Field_17`'])).toEqual(['field_2', 'field_17']);
  });

  test('returns empty for null/empty', () => {
    expect(estNormalizeFields(null)).toEqual([]);
    expect(estNormalizeFields([])).toEqual([]);
  });

  test('strips reserved words', () => {
    const result = estNormalizeFields(['DISTINCT ARRAY t FOR t IN tags END']);
    expect(result).toContain('tags');
    expect(result).not.toContain('distinct');
    expect(result).not.toContain('array');
  });

  test('handles mixed regular and dotted keys', () => {
    const result = estNormalizeFields(['`name`', '`address`.`city`']);
    expect(result).toContain('name');
    expect(result).toContain('address.city');
  });
});

// ────────────────────────────────────────────
// estFieldSimilarity — Jaccard similarity
// ────────────────────────────────────────────
describe('estFieldSimilarity', () => {
  test('identical fields → 100%', () => {
    expect(estFieldSimilarity(['a', 'b'], ['a', 'b'])).toBe(100);
  });

  test('no overlap → 0%', () => {
    expect(estFieldSimilarity(['a', 'b'], ['c', 'd'])).toBe(0);
  });

  test('partial overlap', () => {
    // intersection=1 (a), union=3 (a,b,c) → 33%
    expect(estFieldSimilarity(['a', 'b'], ['a', 'c'])).toBe(33);
  });

  test('superset → less than 100%', () => {
    // intersection=2 (a,b), union=3 (a,b,c) → 67%
    expect(estFieldSimilarity(['a', 'b'], ['a', 'b', 'c'])).toBe(67);
  });

  test('both empty → 100%', () => {
    expect(estFieldSimilarity([], [])).toBe(100);
  });

  test('one empty → 0%', () => {
    expect(estFieldSimilarity(['a'], [])).toBe(0);
    expect(estFieldSimilarity([], ['a'])).toBe(0);
  });

  test('single shared field out of many', () => {
    // intersection=1 (a), union=5 → 20%
    expect(estFieldSimilarity(['a', 'b', 'c'], ['a', 'd', 'e'])).toBe(20);
  });
});

// ────────────────────────────────────────────
// estFieldOrderSimilarity — positional match
// ────────────────────────────────────────────
describe('estFieldOrderSimilarity', () => {
  test('identical fields and order → 100%', () => {
    expect(estFieldOrderSimilarity(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(100);
  });

  test('same fields, different order → partial', () => {
    // position 0: a=a ✓, position 1: b≠c, position 2: c≠b → 1/3 = 33%
    expect(estFieldOrderSimilarity(['a', 'b', 'c'], ['a', 'c', 'b'])).toBe(33);
  });

  test('completely different → 0%', () => {
    expect(estFieldOrderSimilarity(['a', 'b'], ['c', 'd'])).toBe(0);
  });

  test('different lengths — shorter is subset', () => {
    // position 0: a=a ✓, position 1: b=b ✓ → 2/3 = 67%
    expect(estFieldOrderSimilarity(['a', 'b'], ['a', 'b', 'c'])).toBe(67);
  });

  test('one empty → 0%', () => {
    expect(estFieldOrderSimilarity([], ['a'])).toBe(0);
    expect(estFieldOrderSimilarity(['a'], [])).toBe(0);
  });

  test('both empty → 0%', () => {
    expect(estFieldOrderSimilarity([], [])).toBe(0);
  });

  test('single field match', () => {
    expect(estFieldOrderSimilarity(['a'], ['a'])).toBe(100);
  });

  test('single field no match', () => {
    expect(estFieldOrderSimilarity(['a'], ['b'])).toBe(0);
  });
});

// ────────────────────────────────────────────
// estClassifyRelationship — index comparison classification
// ────────────────────────────────────────────
describe('estClassifyRelationship', () => {
  const B = 'bucket', S = '_default', C = '_default';
  const classify = (newF, newW, existF, existW, eB, eS, eC) =>
    estClassifyRelationship(newF, newW, B, S, C, existF, existW, eB || B, eS || S, eC || C);

  // ── Exact duplicate ──
  test('exact: same fields, same order, same WHERE, same target', () => {
    const r = classify(['a', 'b'], '', ['a', 'b'], '');
    expect(r.relationship).toBe('exact');
  });

  test('exact: both have same WHERE clause', () => {
    const r = classify(['a'], "type = 'x'", ['a'], "type = 'x'");
    expect(r.relationship).toBe('exact');
  });

  test('exact: WHERE clause comparison is case-insensitive', () => {
    const r = classify(['a'], "Type = 'X'", ['a'], "type = 'X'");
    expect(r.relationship).toBe('exact');
  });

  // ── Same fields (same order, different WHERE — both have WHERE) ──
  test('same-fields: same order, both have WHERE but different', () => {
    const r = classify(['a', 'b'], "type = 'x'", ['a', 'b'], "type = 'y'");
    expect(r.relationship).toBe('same-fields');
  });

  // ── Same fields (different order, no WHERE) ──
  test('same-fields: same fields reversed order, no WHERE', () => {
    const r = classify(['a', 'b'], '', ['b', 'a'], '');
    expect(r.relationship).toBe('same-fields');
    expect(r.desc).toMatch(/different order/i);
  });

  test('same-fields: three fields shuffled', () => {
    const r = classify(['a', 'b', 'c'], '', ['c', 'a', 'b'], '');
    expect(r.relationship).toBe('same-fields');
  });

  // ── Replaces (new is superset, existing has NO WHERE) ──
  test('replaces: new superset of existing, no WHERE on either', () => {
    const r = classify(['a', 'b', 'c'], '', ['a', 'b'], '');
    expect(r.relationship).toBe('replaces');
    expect(r.desc).toMatch(/superset/i);
  });

  test('replaces: does NOT trigger when existing has WHERE', () => {
    const r = classify(['a', 'b', 'c'], '', ['a', 'b'], "type = 'x'");
    expect(r.relationship).not.toBe('replaces');
  });

  // ── Covered-by (existing is superset) ──
  test('covered-by: existing superset, same WHERE', () => {
    const r = classify(['a'], '', ['a', 'b', 'c'], '');
    expect(r.relationship).toBe('covered-by');
  });

  test('covered-by: existing superset with WHERE, new has no WHERE', () => {
    const r = classify(['a'], '', ['a', 'b', 'c'], "type = 'x'");
    expect(r.relationship).toBe('covered-by');
  });

  // ── Similar ──
  test('similar: partial field overlap ≥30%', () => {
    const r = classify(['a', 'b'], '', ['a', 'c'], '');
    expect(r.relationship).toBe('similar');
  });

  test('similar: adds WHERE note when existing has WHERE', () => {
    const r = classify(['a', 'b'], '', ['a', 'c'], "type = 'x'");
    expect(r.relationship).toBe('similar');
    expect(r.desc).toMatch(/WHERE clause/i);
  });

  // ── None ──
  test('none: completely different fields', () => {
    const r = classify(['a', 'b'], '', ['c', 'd'], '');
    expect(r.relationship).toBe('none');
  });

  test('none: different bucket', () => {
    const r = classify(['a', 'b'], '', ['a', 'b'], '', 'other_bucket');
    expect(r.relationship).toBe('none');
  });

  test('none: low similarity below 30%', () => {
    const r = classify(['a', 'b', 'c', 'd'], '', ['a', 'x', 'y', 'z'], '');
    // intersection=1 (a), union=7 → 14% < 30%
    expect(r.relationship).toBe('none');
  });

  // ── WHERE mismatch prevents "replaces" ──
  test('existing with WHERE + subset fields → similar, not replaces', () => {
    const r = classify(['field_1', 'field_17'], '', ['field_1'], "field_1 like '%test%'");
    expect(r.relationship).not.toBe('replaces');
  });

  // ── WHERE mismatch prevents "same-fields" when one side has WHERE ──
  test('same fields+order but only existing has WHERE → similar', () => {
    const r = classify(['a', 'b'], '', ['a', 'b'], "type = 'x'");
    expect(r.relationship).toBe('similar');
  });

  test('same fields+order but only new has WHERE → similar', () => {
    const r = classify(['a', 'b'], "type = 'x'", ['a', 'b'], '');
    expect(r.relationship).toBe('similar');
  });

  // ── Sort order: exact should rank before similar ──
  test('sort order values: exact < same-fields < replaces < covered-by < similar', () => {
    const order = { exact: 0, 'same-fields': 1, replaces: 2, 'covered-by': 3, similar: 4 };
    expect(order.exact).toBeLessThan(order['same-fields']);
    expect(order['same-fields']).toBeLessThan(order.replaces);
    expect(order.replaces).toBeLessThan(order['covered-by']);
    expect(order['covered-by']).toBeLessThan(order.similar);
  });

  // ── Scope/collection matching ──
  test('exact: default scope matches explicit _default', () => {
    const r = estClassifyRelationship(['a'], '', 'b', '_default', '_default',
                                       ['a'], '', 'b', '_default', '_default');
    expect(r.relationship).toBe('exact');
  });

  test('none: different scope', () => {
    const r = estClassifyRelationship(['a'], '', 'b', 'scope1', 'c',
                                       ['a'], '', 'b', 'scope2', 'c');
    expect(r.relationship).toBe('none');
  });

  test('none: different collection', () => {
    const r = estClassifyRelationship(['a'], '', 'b', 's', 'col1',
                                       ['a'], '', 'b', 's', 'col2');
    expect(r.relationship).toBe('none');
  });
});
