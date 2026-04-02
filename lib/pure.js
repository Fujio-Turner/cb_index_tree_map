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

// ── Rebalance pure functions (extracted from index.html computeRebalancePlan) ──

function isReplicaBlocked(nodeName, usedNodes) {
  return usedNodes.includes(nodeName);
}

function isRackBlocked(nodeName, usedNodes, nodeRackZones) {
  const hasRackZones = Object.values(nodeRackZones).some(r => r);
  if (!hasRackZones) return false;
  const myRack = nodeRackZones[nodeName];
  if (!myRack) return false;
  for (const u of usedNodes) { if (nodeRackZones[u] === myRack) return true; }
  return false;
}

function ksConcentrationPenalty(nodeName, idx, nodeTotals, globalKeyspaceCounts, nodeCount, nodeRackZones, groupTotals, groupNodeCounts) {
  const ks = idx.bucket + ':' + idx.scope + ':' + idx.collection;
  const nodeKsCount = nodeTotals[nodeName].buckets[ks] || 0;
  const totalKsCount = globalKeyspaceCounts[ks] || 1;
  const idealPerNode = totalKsCount / nodeCount;
  const nodeOverload = Math.max(0, nodeKsCount - idealPerNode);
  let penalty = nodeOverload * nodeOverload * 200;
  const hasRackZones = Object.values(nodeRackZones).some(r => r);
  if (hasRackZones && nodeRackZones[nodeName]) {
    const g = nodeRackZones[nodeName];
    const gKs = (groupTotals[g] && groupTotals[g].buckets[ks]) || 0;
    const nodesInGroup = groupNodeCounts[g] || 1;
    const idealPerGroup = totalKsCount * (nodesInGroup / nodeCount);
    const gOverload = Math.max(0, gKs - idealPerGroup);
    penalty += gOverload * gOverload * 150;
  }
  return penalty;
}

function stickyBonus(nodeName, idx, minimizeMoves) {
  if (!minimizeMoves) return 0;
  return nodeName === idx.currentNode ? 500 : 0;
}

function buildReplicaGroups(allIndexes) {
  const replicaGroups = {};
  allIndexes.forEach(idx => {
    const baseKey = idx.bucket + ':' + idx.scope + ':' + idx.collection + ':' + idx.name.replace(/ \(replica \d+\)$/, '');
    if (!replicaGroups[baseKey]) replicaGroups[baseKey] = [];
    replicaGroups[baseKey].push(idx);
  });
  return replicaGroups;
}

function computeRebalancePlan(opts) {
  const {
    filtered, nodeRackZones, priorityIndexes, rebalanceStrategy,
    rebalanceMode, minimizeMoves, moveThresholdPct
  } = opts;

  const nodeNames = filtered.map(n => n.nodeName);
  const nodeCount = nodeNames.length;
  if (nodeCount < 2) return null;
  const strategy = rebalanceStrategy || 'greedy';

  // Collect all indexes with their current placement
  const allIndexes = [];
  filtered.forEach(node => {
    node.flat.forEach(idx => {
      allIndexes.push({
        fullKey: idx.fullKey, name: idx.name, bucket: idx.bucket, scope: idx.scope, collection: idx.collection,
        disk_size: idx.disk_size || 0, memory_used: idx.memory_used || 0, items_count: idx.items_count || 0,
        num_requests: idx.num_requests || 0, avg_scan_latency: idx.avg_scan_latency || 0,
        num_rows_returned: idx.num_rows_returned || 0, total_scan_duration: idx.total_scan_duration || 0,
        currentNode: node.nodeName,
        _replicaNodes: idx._replicaNodes || [node.nodeName], _replicaTotal: idx._replicaTotal || 1, _replicaIndex: idx._replicaIndex || 1
      });
    });
  });

  // Group replicas
  const replicaGroups = buildReplicaGroups(allIndexes);

  // Build proposed assignment
  const assignment = {};
  nodeNames.forEach(n => { assignment[n] = []; });

  // Track node totals
  const nodeTotals = {};
  nodeNames.forEach(n => { nodeTotals[n] = { disk: 0, mem: 0, count: 0, buckets: {}, requests: 0, scanLoad: 0 }; });

  // Shared constraint helpers
  const hasRackZones = Object.values(nodeRackZones).some(r => r);

  // Global keyspace counts
  const globalKeyspaceCounts = {};
  allIndexes.forEach(idx => {
    const ks = idx.bucket + ':' + idx.scope + ':' + idx.collection;
    globalKeyspaceCounts[ks] = (globalKeyspaceCounts[ks] || 0) + 1;
  });

  // Group-level tracking for rack/zone
  const groupTotals = {};
  const groupNodeCounts = {};
  if (hasRackZones) {
    nodeNames.forEach(n => {
      const g = nodeRackZones[n] || '_none';
      if (!groupTotals[g]) groupTotals[g] = { buckets: {} };
      groupNodeCounts[g] = (groupNodeCounts[g] || 0) + 1;
    });
  }

  function _isReplicaBlocked(nodeName, usedNodes) { return isReplicaBlocked(nodeName, usedNodes); }
  function _isRackBlocked(nodeName, usedNodes) { return isRackBlocked(nodeName, usedNodes, nodeRackZones); }
  function _ksConcentrationPenalty(nodeName, idx) { return ksConcentrationPenalty(nodeName, idx, nodeTotals, globalKeyspaceCounts, nodeCount, nodeRackZones, groupTotals, groupNodeCounts); }
  function _stickyBonus(nodeName, idx) { return stickyBonus(nodeName, idx, minimizeMoves); }

  function priorityPenalty(nodeName, idx) {
    if (!priorityIndexes || !priorityIndexes.has(idx.fullKey)) return 0;
    return nodeTotals[nodeName].mem / (1024 * 1024) * 2;
  }

  function recordAssignment(nodeName, idx) {
    const t = nodeTotals[nodeName];
    t.disk += idx.disk_size; t.mem += idx.memory_used; t.count++;
    t.requests += idx.num_requests;
    t.scanLoad += idx.num_requests * (idx.avg_scan_latency / 1e6);
    const bk = idx.bucket + ':' + idx.scope + ':' + idx.collection;
    t.buckets[bk] = (t.buckets[bk] || 0) + 1;
    if (hasRackZones) {
      const g = nodeRackZones[nodeName] || '_none';
      if (!groupTotals[g]) groupTotals[g] = { buckets: {} };
      groupTotals[g].buckets[bk] = (groupTotals[g].buckets[bk] || 0) + 1;
    }
  }

  // Strategy: Greedy
  function scoreGreedy(nodeName, idx, usedNodes) {
    if (_isReplicaBlocked(nodeName, usedNodes)) return -Infinity;
    if (_isRackBlocked(nodeName, usedNodes)) return -Infinity;
    const t = nodeTotals[nodeName];
    const diskP = t.disk / (1024 * 1024);
    const countP = t.count * 50;
    const ksP = _ksConcentrationPenalty(nodeName, idx);
    const priP = priorityPenalty(nodeName, idx);
    let perfP = 0;
    if (rebalanceMode === 'performance') {
      perfP = t.requests * 0.001 + t.scanLoad * 0.01;
    }
    return -(diskP + countP + ksP + priP + perfP) + _stickyBonus(nodeName, idx);
  }

  // Strategy: LPT
  function scoreLPT(nodeName, idx, usedNodes) {
    if (_isReplicaBlocked(nodeName, usedNodes)) return -Infinity;
    if (_isRackBlocked(nodeName, usedNodes)) return -Infinity;
    return -(nodeTotals[nodeName].disk) - _ksConcentrationPenalty(nodeName, idx) - priorityPenalty(nodeName, idx) + _stickyBonus(nodeName, idx);
  }

  // Strategy: Inverse Frequency
  const numKeyspaces = Object.keys(globalKeyspaceCounts).length || 1;
  allIndexes.forEach(idx => {
    const ks = idx.bucket + ':' + idx.scope + ':' + idx.collection;
    const freqWeight = allIndexes.length / (numKeyspaces * (globalKeyspaceCounts[ks] || 1));
    idx._placementWeight = freqWeight * idx.disk_size;
  });
  function scoreInverseFreq(nodeName, idx, usedNodes) {
    if (_isReplicaBlocked(nodeName, usedNodes)) return -Infinity;
    if (_isRackBlocked(nodeName, usedNodes)) return -Infinity;
    let wLoad = 0;
    assignment[nodeName].forEach(a => { wLoad += (a._placementWeight || 0); });
    return -(wLoad + idx._placementWeight) - _ksConcentrationPenalty(nodeName, idx) - priorityPenalty(nodeName, idx) + _stickyBonus(nodeName, idx);
  }

  // Strategy: Importance / IPW
  allIndexes.forEach(idx => {
    idx._importance = idx.num_requests * (idx.avg_scan_latency / 1e6);
    idx._importance = Math.max(idx._importance, idx.disk_size / (1024 * 1024));
  });
  const totalImportance = allIndexes.reduce((s, x) => s + x._importance, 0);
  const targetImportancePerNode = totalImportance / nodeCount;
  function scoreImportance(nodeName, idx, usedNodes) {
    if (_isReplicaBlocked(nodeName, usedNodes)) return -Infinity;
    if (_isRackBlocked(nodeName, usedNodes)) return -Infinity;
    const gap = targetImportancePerNode - nodeTotals[nodeName].scanLoad;
    return gap - _ksConcentrationPenalty(nodeName, idx) - priorityPenalty(nodeName, idx) + _stickyBonus(nodeName, idx);
  }

  // Strategy: Reservoir
  const totalDiskAll = allIndexes.reduce((s, x) => s + x.disk_size, 0);
  function scoreReservoir(nodeName, idx, usedNodes) {
    if (_isReplicaBlocked(nodeName, usedNodes)) return -Infinity;
    if (_isRackBlocked(nodeName, usedNodes)) return -Infinity;
    const idealDisk = totalDiskAll / nodeCount;
    const remaining = Math.max(1, idealDisk - nodeTotals[nodeName].disk);
    let sc = Math.pow(Math.random(), 1 / remaining);
    sc -= _ksConcentrationPenalty(nodeName, idx) * 0.001;
    sc -= priorityPenalty(nodeName, idx) * 0.001;
    sc += _stickyBonus(nodeName, idx) * 0.001;
    return sc;
  }

  // Pick scoring function
  const scoreFns = { greedy: scoreGreedy, lpt: scoreLPT, 'inverse-freq': scoreInverseFreq, importance: scoreImportance, reservoir: scoreReservoir };
  let scoreFn = scoreFns[strategy] || scoreGreedy;

  // Strategy: Stratified
  if (strategy === 'stratified') {
    const strata = {};
    allIndexes.forEach(idx => {
      const ks = idx.bucket + ':' + idx.scope + ':' + idx.collection;
      if (!strata[ks]) strata[ks] = [];
      strata[ks].push(idx);
    });
    const sortedStrata = Object.entries(strata).sort((a, b) => {
      const sA = a[1].reduce((s, x) => s + x.disk_size, 0);
      const sB = b[1].reduce((s, x) => s + x.disk_size, 0);
      return sB - sA;
    });
    sortedStrata.forEach(([, stratumIndexes]) => {
      const stratumGroups = {};
      stratumIndexes.forEach(idx => {
        const bk = idx.bucket + ':' + idx.scope + ':' + idx.collection + ':' + idx.name.replace(/ \(replica \d+\)$/, '');
        if (!stratumGroups[bk]) stratumGroups[bk] = [];
        stratumGroups[bk].push(idx);
      });
      const sorted = Object.entries(stratumGroups).sort((a, b) => {
        return b[1].reduce((s, x) => s + x.disk_size, 0) - a[1].reduce((s, x) => s + x.disk_size, 0);
      });
      sorted.forEach(([, replicas]) => {
        const usedNodes = [];
        replicas.sort((a, b) => a._replicaIndex - b._replicaIndex);
        replicas.forEach(idx => {
          let bestNode = null, bestScore = -Infinity;
          nodeNames.forEach(n => {
            if (_isReplicaBlocked(n, usedNodes)) return;
            if (_isRackBlocked(n, usedNodes)) return;
            let sc = -(nodeTotals[n].disk);
            sc -= _ksConcentrationPenalty(n, idx);
            sc -= priorityPenalty(n, idx);
            sc += _stickyBonus(n, idx);
            if (sc > bestScore) { bestScore = sc; bestNode = n; }
          });
          if (!bestNode) bestNode = nodeNames[0];
          usedNodes.push(bestNode);
          assignment[bestNode].push({ ...idx, fromNode: idx.currentNode, toNode: bestNode });
          recordAssignment(bestNode, idx);
        });
      });
    });
  } else {
    // Generic placement loop for all non-stratified strategies
    const sortedGroups = Object.entries(replicaGroups).sort((a, b) => {
      const sA = a[1].reduce((s, x) => s + x.disk_size, 0);
      const sB = b[1].reduce((s, x) => s + x.disk_size, 0);
      if (strategy === 'importance') {
        const iA = a[1].reduce((s, x) => s + (x._importance || 0), 0);
        const iB = b[1].reduce((s, x) => s + (x._importance || 0), 0);
        return iB - iA;
      }
      if (strategy === 'inverse-freq') {
        const wA = a[1].reduce((s, x) => s + (x._placementWeight || 0), 0);
        const wB = b[1].reduce((s, x) => s + (x._placementWeight || 0), 0);
        return wB - wA;
      }
      if (strategy === 'greedy' && rebalanceMode === 'performance') {
        const loadA = a[1].reduce((s, x) => s + x.num_requests + (x.num_requests * (x.avg_scan_latency / 1e6)) * 0.5, 0);
        const loadB = b[1].reduce((s, x) => s + x.num_requests + (x.num_requests * (x.avg_scan_latency / 1e6)) * 0.5, 0);
        return (sB + loadB * 100) - (sA + loadA * 100);
      }
      return sB - sA;
    });

    sortedGroups.forEach(([, replicas]) => {
      const usedNodes = [];
      replicas.sort((a, b) => a._replicaIndex - b._replicaIndex);
      replicas.forEach(idx => {
        let bestNode = null, bestScore = -Infinity;
        nodeNames.forEach(n => {
          const sc = scoreFn(n, idx, usedNodes);
          if (sc > bestScore) { bestScore = sc; bestNode = n; }
        });
        if (!bestNode) bestNode = nodeNames[0];
        usedNodes.push(bestNode);
        assignment[bestNode].push({ ...idx, fromNode: idx.currentNode, toNode: bestNode });
        recordAssignment(bestNode, idx);
      });
    });
  }

  // Generate moves: only where toNode !== fromNode
  let moves = [];
  for (const [nodeName, indexes] of Object.entries(assignment)) {
    indexes.forEach(idx => {
      if (idx.fromNode !== idx.toNode) {
        moves.push(idx);
      }
    });
  }

  // Move-budget cap
  if (minimizeMoves && moves.length > 0) {
    const maxMoves = Math.max(1, Math.floor(allIndexes.length * moveThresholdPct / 100));
    if (moves.length > maxMoves) {
      moves.sort((a, b) => b.disk_size - a.disk_size);
      const dropped = moves.slice(maxMoves);
      moves = moves.slice(0, maxMoves);
      dropped.forEach(m => {
        const aList = assignment[m.toNode];
        const i = aList.findIndex(x => x.fullKey === m.fullKey);
        if (i >= 0) aList.splice(i, 1);
        assignment[m.fromNode].push({ ...m, toNode: m.fromNode });
        const bk = m.bucket + ':' + m.scope + ':' + m.collection;
        const tFrom = nodeTotals[m.toNode];
        tFrom.disk -= m.disk_size; tFrom.mem -= m.memory_used; tFrom.count--;
        tFrom.buckets[bk] = Math.max(0, (tFrom.buckets[bk] || 0) - 1);
        const tTo = nodeTotals[m.fromNode];
        tTo.disk += m.disk_size; tTo.mem += m.memory_used; tTo.count++;
        tTo.buckets[bk] = (tTo.buckets[bk] || 0) + 1;
      });
    }
  }

  // Generate ALTER INDEX statements
  const alterStmts = [];
  const movesByIndex = {};
  moves.forEach(m => {
    const baseName = m.name.replace(/ \(replica \d+\)$/, '');
    const ks = m.scope !== '_default' || m.collection !== '_default' ? `\`${m.bucket}\`.\`${m.scope}\`.\`${m.collection}\`` : `\`${m.bucket}\``;
    const key = baseName + '||' + ks;
    if (!movesByIndex[key]) movesByIndex[key] = { baseName, ks, nodes: new Set() };
    movesByIndex[key].nodes.add(m.toNode);
  });
  for (const [key, info] of Object.entries(movesByIndex)) {
    for (const [nodeName, indexes] of Object.entries(assignment)) {
      indexes.forEach(idx => {
        const bn = idx.name.replace(/ \(replica \d+\)$/, '');
        const iks = idx.scope !== '_default' || idx.collection !== '_default' ? `\`${idx.bucket}\`.\`${idx.scope}\`.\`${idx.collection}\`` : `\`${idx.bucket}\``;
        if (bn + '||' + iks === key) info.nodes.add(nodeName);
      });
    }
  }
  for (const [, info] of Object.entries(movesByIndex)) {
    const nodeList = [...info.nodes].map(n => `"${n}"`).join(', ');
    alterStmts.push(`ALTER INDEX \`${info.baseName}\` ON ${info.ks}\nWITH {"action": "move", "nodes": [${nodeList}]};`);
  }

  // Compute after metrics (beforeScore skipped — depends on DOM/global state)
  const afterDiskPerNode = nodeNames.map(n => nodeTotals[n].disk);
  const afterCountPerNode = nodeNames.map(n => nodeTotals[n].count);
  const afterMemPerNode = nodeNames.map(n => nodeTotals[n].mem);
  const totalDisk = afterDiskPerNode.reduce((s, d) => s + d, 0);
  const totalCount = afterCountPerNode.reduce((s, c) => s + c, 0);
  const totalMem = afterMemPerNode.reduce((s, m) => s + m, 0);
  const idealDisk = totalDisk / nodeCount;
  const idealCount = totalCount / nodeCount;
  const idealMem = totalMem / nodeCount;
  const diskImb = idealDisk > 0 ? afterDiskPerNode.reduce((s, d) => s + Math.abs(d - idealDisk), 0) / totalDisk : 0;
  const countImb = idealCount > 0 ? afterCountPerNode.reduce((s, c) => s + Math.abs(c - idealCount), 0) / totalCount : 0;
  const memImb = idealMem > 0 ? afterMemPerNode.reduce((s, m) => s + Math.abs(m - idealMem), 0) / totalMem : 0;

  // Check replica co-location in proposed
  let replicaImb = 0;
  const proposedReplicaMap = {};
  for (const [nodeName, indexes] of Object.entries(assignment)) {
    indexes.forEach(idx => {
      if (!proposedReplicaMap[idx.fullKey]) proposedReplicaMap[idx.fullKey] = [];
      proposedReplicaMap[idx.fullKey].push(nodeName);
    });
  }
  const rKeys = Object.entries(proposedReplicaMap).filter(([, ns]) => ns.length > 1);
  if (rKeys.length) { let co = 0; rKeys.forEach(([, ns]) => { if (new Set(ns).size < ns.length) co++; }); replicaImb = co / rKeys.length; }
  const rawImb = countImb * 0.30 + diskImb * 0.30 + memImb * 0.20 + replicaImb * 0.20;
  const afterScoreVal = Math.max(0, Math.min(100, Math.round((1 - rawImb) * 100)));

  // Build debug/insight payload
  const _debug = {
    strategy: strategy,
    rebalanceMode: rebalanceMode,
    minimizeMoves: minimizeMoves,
    moveThresholdPct: moveThresholdPct,
    constraints: {
      replicaSeparation: true,
      rackZoneActive: hasRackZones,
      rackZones: Object.entries(nodeRackZones).filter(([, v]) => v).reduce((o, [k, v]) => { o[k] = v; return o; }, {}),
      keyspaceCounts: globalKeyspaceCounts,
      groupNodeCounts: hasRackZones ? groupNodeCounts : null
    },
    totalIndexes: allIndexes.length,
    totalMoves: moves.length,
    movePct: allIndexes.length ? Math.round(moves.length / allIndexes.length * 100) : 0,
    beforeScore: null,
    afterScore: afterScoreVal,
    scoreDelta: null,
    imbalance: { countImb: Math.round(countImb * 1000) / 10, diskImb: Math.round(diskImb * 1000) / 10, memImb: Math.round(memImb * 1000) / 10, replicaImb: Math.round(replicaImb * 1000) / 10 },
    perNode: nodeNames.map(n => {
      const t = nodeTotals[n];
      const beforeNode = filtered.find(x => x.nodeName === n);
      const bDisk = beforeNode ? beforeNode.flat.reduce((s, x) => s + (x.disk_size || 0), 0) : 0;
      const bCount = beforeNode ? beforeNode.flat.length : 0;
      const bMem = beforeNode ? beforeNode.flat.reduce((s, x) => s + (x.memory_used || 0), 0) : 0;
      return { node: n, rackZone: nodeRackZones[n] || null, before: { disk: bDisk, mem: bMem, count: bCount }, after: { disk: t.disk, mem: t.mem, count: t.count }, delta: { disk: t.disk - bDisk, mem: t.mem - bMem, count: t.count - bCount }, keyspaces: Object.entries(t.buckets).map(([k, v]) => ({ keyspace: k, count: v })).sort((a, b) => b.count - a.count) };
    }),
    moves: moves.map(m => ({ name: m.name, bucket: m.bucket, scope: m.scope, collection: m.collection, disk_size: m.disk_size, memory_used: m.memory_used, num_requests: m.num_requests, avg_scan_latency: m.avg_scan_latency, from: m.fromNode, to: m.toNode, importance: m._importance || null, placementWeight: m._placementWeight || null }))
  };

  return { moves, alterStmts, assignment, nodeTotals, nodeNames, afterScore: afterScoreVal, afterDiskPerNode, afterCountPerNode, afterMemPerNode, _debug };
}

module.exports = {
  fmt, truncPart, fmtCompact, fmtNs, wildcardMatch, safeName,
  isArrayIndex, hasDocTypeFirst, getWhereFields, getIndexFields,
  findWhereFieldsInIndex, findDuplicateKeys, buildCreateIndex,
  dedup, matchNodeFilter, matchFilter, SCAN_DAY_RANGES,
  parseSystemJSON, parseStatsNodeJSON, buildTree,
  isReplicaBlocked, isRackBlocked, ksConcentrationPenalty,
  stickyBonus, buildReplicaGroups, computeRebalancePlan,
};
