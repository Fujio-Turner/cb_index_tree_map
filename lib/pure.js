// Pure functions extracted from index.html for unit testing.
// Keep in sync with the inline <script> in index.html.

function fmt(b) {
  if (b == null || b === 0) return '0 B';
  const k = 1024, s = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(Math.abs(b)) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + s[i];
}

function truncPart(s, max) {
  if (s.length <= max) return s;
  const half = Math.floor((max - 2) / 2);
  return s.slice(0, half) + '..' + s.slice(s.length - half);
}

function fmtCompact(n) {
  if (n == null) return '—';
  if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.?0+$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.?0+$/, '') + 'K';
  return n.toString();
}

function fmtNs(ns) {
  if (!ns || ns === 0) return '0';
  const ms = ns / 1e6;
  if (ms < 0.001) return ns.toFixed(0) + ' ns';
  if (ms < 1) return (ns / 1e3).toFixed(1) + ' µs';
  if (ms < 1000) return ms.toFixed(1) + ' ms';
  return (ms / 1000).toFixed(2) + ' s';
}

function wildcardMatch(pattern, str) {
  const re = new RegExp('^' + pattern.replace(/[-\/\\^$+?.()|[\]{}]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
  return re.test(str);
}

function safeName(raw) {
  let name = decodeURIComponent(raw).replace(/[^a-zA-Z0-9_\-\.]/g, '_').replace(/\.{2,}/g, '.');
  if (!name.endsWith('.json')) name += '.json';
  return name;
}

function isArrayIndex(keys) {
  return (keys || []).some(k => /\bALL\b|\bARRAY\b|\bDISTINCT\b/i.test(k));
}

function hasDocTypeFirst(keys) {
  if (!keys || !keys.length) return false;
  const first = keys[0].replace(/`/g, '').trim().toLowerCase();
  return ['doctype', 'type', '_class', 'class'].includes(first);
}

function getWhereFields(condition) {
  if (!condition) return [];
  const matches = condition.match(/`?[a-zA-Z_][a-zA-Z0-9_.]*`?/g) || [];
  return matches.map(m => m.replace(/`/g, '').toLowerCase());
}

function getIndexFields(keys) {
  if (!keys) return [];
  const fields = [];
  const skip = ['all', 'array', 'distinct', 'for', 'in', 'end', 'meta', 'id', 'xattrs', 'flatten_keys', 'least', 'ifmissing', 'object_pairs', 'null', 'desc', 'asc', 'include', 'missing', 'when', 'and', 'or', 'not', 'is', 'true', 'false', 'self'];
  keys.forEach(k => {
    const cleaned = k.replace(/"[^"]*"/g, '').replace(/`/g, '');
    const ms = cleaned.match(/[a-zA-Z_][a-zA-Z0-9_.]*/g);
    if (ms) ms.forEach(m => { if (!skip.includes(m.toLowerCase()) && m.length > 1) fields.push(m.toLowerCase()); });
  });
  return fields;
}

function findWhereFieldsInIndex(keys, condition) {
  if (!condition || !keys || !keys.length) return [];
  const wf = getWhereFields(condition), ixf = getIndexFields(keys);
  return [...new Set(wf.filter(f => ixf.includes(f)))];
}

function findDuplicateKeys(keys) {
  if (!keys) return [];
  const fields = getIndexFields(keys), seen = {}, dupes = [];
  fields.forEach(f => { if (seen[f] && !dupes.includes(f)) dupes.push(f); seen[f] = true; });
  return dupes;
}

function buildCreateIndex(idx) {
  const bucket = idx.bucket, scope = idx.scope, collection = idx.collection;
  let ks;
  if (scope !== '_default' || collection !== '_default') ks = `\`${bucket}\`.\`${scope}\`.\`${collection}\``;
  else ks = `\`${bucket}\``;
  if (idx.isPrimary) {
    let stmt = `CREATE PRIMARY INDEX \`${idx.name}\` ON ${ks}`;
    if (idx.replica > 0) stmt += ` WITH {"num_replica":${idx.replica}}`;
    return stmt;
  }
  const keys = (idx.keys || []).join(', ');
  let stmt = `CREATE INDEX \`${idx.name}\` ON ${ks}(${keys})`;
  if (idx.condition) stmt += ` WHERE ${idx.condition}`;
  if (idx.replica > 0) stmt += ` WITH {"num_replica":${idx.replica}}`;
  return stmt;
}

function dedup(arr) {
  const seen = new Set();
  return arr.filter(x => {
    const k = x.bucket + ':' + x.scope + ':' + x.collection + ':' + x.name;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function matchNodeFilter(nodeName, f) {
  return !f.nodes.length || f.nodes.includes(nodeName);
}

const SCAN_DAY_RANGES = [
  { value: 'days-1-7', label: '1-7 days', min: 1, max: 7 },
  { value: 'days-8-30', label: '8-30 days', min: 8, max: 30 },
  { value: 'days-31-90', label: '31-90 days', min: 31, max: 90 },
  { value: 'days-91-182', label: '91d-6mo', min: 91, max: 182 },
  { value: 'days-183-365', label: '6mo-1y', min: 183, max: 365 },
  { value: 'days-366-inf', label: '1y+', min: 366, max: Infinity },
];

function matchFilter(item, f, _getScanTime) {
  if (f.scan) {
    const scanTime = _getScanTime ? _getScanTime(item) : (item.last_known_scan_time || 0);
    const neverScanned = !scanTime || scanTime === 0;
    if (f.scan === 'exclude-never' && neverScanned) return false;
    if (f.scan === 'only-never' && !neverScanned) return false;
    const dr = SCAN_DAY_RANGES.find(r => r.value === f.scan);
    if (dr) {
      if (neverScanned) return false;
      const days = Math.floor((Date.now() - new Date(scanTime / 1e6).getTime()) / 86400000);
      if (days < dr.min || days > dr.max) return false;
    }
  }
  if (f.fields) {
    const patterns = f.fields.split(',').map(s => s.trim()).filter(Boolean);
    if (patterns.length) {
      const itemFields = getIndexFields(item.keys || []);
      if (!itemFields.length) return false;
      if (!patterns.every(p => itemFields.some(fi => wildcardMatch(p, fi)))) return false;
    }
  }
  return (!f.bucket || item.bucket === f.bucket) &&
         (!f.scope || item.scope === f.scope) &&
         (!f.collection || item.collection === f.collection) &&
         (!f.index || item.name === f.index);
}

function parseSystemJSON(js) {
  let d;
  try { d = JSON.parse(js); } catch { try { d = JSON.parse('[' + js + ']'); } catch { throw new Error('Invalid JSON'); } }
  if (!Array.isArray(d)) { if (d.results) d = d.results; else throw new Error('Expected array'); }
  const flat = [];
  d.forEach(r => {
    const idx = r.indexes || r;
    if (!idx.name) return;
    const isFTS = idx.using === 'fts',
      bucket = idx.bucket_id || idx.keyspace_id || 'unknown',
      scope = idx.scope_id || '_default',
      collection = idx.bucket_id ? idx.keyspace_id : '_default',
      dn = isFTS ? idx.name + ' [FTS]' : idx.name;
    flat.push({
      fullKey: `${bucket}:${scope}:${collection}:${dn}`,
      bucket, scope, collection, name: dn, value: 1,
      type: idx.using || 'gsi', state: idx.state || 'unknown',
      replica: (idx.metadata && idx.metadata.num_replica) || 0,
      condition: idx.condition || '',
      keys: idx.index_key || [],
      keysStr: (idx.index_key || []).join(', '),
      isPrimary: !!idx.is_primary,
      last_known_scan_time: (idx.metadata && idx.metadata.stats && idx.metadata.stats.last_known_scan_time) || 0,
    });
  });
  return flat;
}

function parseStatsNodeJSON(js, metric) {
  let d;
  try { d = JSON.parse(js); } catch { throw new Error('Invalid JSON'); }
  let indexer = null;
  const flat = [];
  for (const [key, s] of Object.entries(d)) {
    if (key === 'indexer') { indexer = s; continue; }
    const p = key.split(':');
    let bucket, scope, collection, name;
    if (p.length === 2) { bucket = p[0]; scope = '_default'; collection = '_default'; name = p[1]; }
    else if (p.length === 4) { bucket = p[0]; scope = p[1]; collection = p[2]; name = p[3]; }
    else { bucket = p[0]; scope = p.length > 2 ? p[1] : '_default'; collection = p.length > 3 ? p[2] : '_default'; name = p[p.length - 1]; }
    const ds = s.disk_size || 0, da = s.data_size || 0;
    flat.push({
      fullKey: key, bucket, scope, collection, name,
      value: s[metric] || ds || da || 0,
      disk_size: ds, data_size: da,
      bloat_ratio: da > 0 ? ds / da : 0,
      items_count: s.items_count || 0,
      frag_percent: s.frag_percent || 0,
      resident_percent: s.resident_percent != null ? s.resident_percent : null,
      memory_used: s.memory_used || 0,
      avg_scan_latency: s.avg_scan_latency || 0,
      last_known_scan_time: s.last_known_scan_time || 0,
      num_requests: s.num_requests || 0,
      num_docs_pending: s.num_docs_pending || 0,
      cache_hit_percent: s.cache_hit_percent || 0,
    });
  }
  return { indexer, flat };
}

function buildTree(fl, useVal) {
  const tree = {};
  fl.forEach(f => {
    if (!tree[f.bucket]) tree[f.bucket] = {};
    if (!tree[f.bucket][f.scope]) tree[f.bucket][f.scope] = {};
    if (!tree[f.bucket][f.scope][f.collection]) tree[f.bucket][f.scope][f.collection] = {};
    tree[f.bucket][f.scope][f.collection][f.name] = f;
  });
  const out = [];
  for (const [b, sc] of Object.entries(tree)) {
    const scs = [];
    for (const [s, co] of Object.entries(sc)) {
      const cos = [];
      for (const [c, ix] of Object.entries(co)) {
        const is = [];
        for (const [n, info] of Object.entries(ix)) is.push({ name: n, value: useVal ? (info.value || 1) : 1, _meta: info, _fullPath: `${b}:${s}:${c}:${n}` });
        cos.push({ name: c, children: is });
      }
      scs.push({ name: s, children: cos });
    }
    out.push({ name: b, children: scs });
  }
  return out;
}

module.exports = {
  fmt, truncPart, fmtCompact, fmtNs, wildcardMatch, safeName,
  isArrayIndex, hasDocTypeFirst, getWhereFields, getIndexFields,
  findWhereFieldsInIndex, findDuplicateKeys, buildCreateIndex,
  dedup, matchNodeFilter, matchFilter, SCAN_DAY_RANGES,
  parseSystemJSON, parseStatsNodeJSON, buildTree,
};
