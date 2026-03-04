# 🗺️ CB Index Treemap

**Visualize & analyze your Couchbase GSI index sizes, performance, and capacity — right in your browser.**

---

## 😩 The Problem

You've got a Couchbase cluster with dozens (or hundreds) of GSI indexes scattered across buckets, scopes, and collections. You need answers to basic questions like:

- **"Can I fit more indexes on this node?"**
- **"Which indexes are eating all my disk?"**
- **"Are any of my indexes slow, fragmented, or never even used?"**
- **"What's my memory quota situation looking like?"**

Couchbase gives you the raw data, but staring at giant JSON blobs from `system:indexes` or the Stats API isn't exactly fun. You need a way to *see* it.

## 💡 How It Solves It

CB Index Treemap turns raw Couchbase JSON into interactive treemaps, bar charts, pie charts, word clouds, and sortable tables so you can instantly spot problems and understand your index landscape. Run it with Docker (`docker compose up`) and your data saves across refreshes and restarts — or just open the HTML file directly in your browser.

![CB Index Treemap Screenshot](img/sample_tree_map.png)

## 🚀 What It Can Do For You

### 📊 Treemap Tab
- Paste your `system:indexes` query output and get an interactive **treemap visualization** of every index organized by **Bucket → Scope → Collection → Index**
- Quickly see your index structure at a glance

### 📈 Stats API Tab
- Paste index node stats and get **sized treemaps** where box size = actual disk usage
- **Full sortable stats table** with every metric — Disk, Data, Bloat, Frag%, Items, Resident%, Memory, Cache%, Latency, Pending, Requests, Last Scan
- **Bar charts** for lowest cache hit % and highest scan latency
- **Node-level summary cards** showing memory used vs quota, storage allocated, and total disk
- **📐 Lumpiness Score** — When multiple index nodes are loaded, a composite score (0–100) shows how evenly indexes are distributed across nodes. Weighted by index count balance (30%), disk size balance (30%), memory balance (20%), and replica spread (20%). Color-coded ratings from Excellent to Critical with per-node breakdown details.
- **Click a treemap box** → table row highlights and scrolls into view. **Click a table row** → treemap box highlights. 🤝
- **Last Scan timestamps** displayed in **ISO 8601** format for easy comparison

### 🔍 Analysis Tab
- **Summary dashboard** — total disk, data, memory, avg fragmentation, avg resident %, never-scanned count
- **Word cloud** of most commonly indexed fields (from `system:indexes` data)
- **Pie charts** — disk and memory usage broken down by bucket
- **Top 10 / Bottom 10 leaderboards** — largest disk, highest fragmentation, lowest cache hit, highest bloat, most requests, and more
- **⚠️ Never-scanned indexes list** — indexes burning disk but never queried. Prime candidates for cleanup!

### 🔧 Global Filters
- Filter everything by **Bucket**, **Scope**, **Collection**, or **Index Name** — all tabs update instantly

### 💡 Tooltips Everywhere
- Hover over any column header, stat card, filter dropdown, or button to see a plain-English explanation of what that metric means and why it matters

---

## 📥 How to Get the Data

You need data from two Couchbase sources:

### 1. System Indexes (index structure)

Run this SQL++ query in the **Query Workbench** or **cbq shell**:

```sql
SELECT *, meta() FROM system:indexes
```

Copy the entire JSON result.

### 2. Stats API (index sizes & performance metrics)

On **each index node**, run:

```bash
curl -u <username>:<password> "http://<index-node-hostname>:9102/api/v1/stats?pretty=true"
```

> **Port 9102** is the GSI admin port. You'll need cluster credentials with admin access.

For example, if your cluster has 5 nodes (3 Data + 2 Index), you'd run this curl on each of the 2 index nodes to get stats for all indexes on that node.

---

## 🖥️ How to Use the Tool

**With Docker (recommended):** `docker compose up` then open [http://localhost:3000](http://localhost:3000). Your data saves automatically.

**Without Docker:** Just open `index.html` in your browser. Everything works, but data won't persist across refreshes.

### Treemap Tab

1. Paste your `SELECT *, meta() FROM system:indexes` JSON output into the text area
2. Click **Load & Render**
3. Explore your index structure in the treemap

### Stats API Tab

1. Paste your first index node's stats JSON into the text area
2. **Give it a name!** — Update the node name field (e.g., `idx-node1.prod.local`) so you can tell your nodes apart
3. Click **Load & Render**

#### Adding Multiple Index Nodes

Most clusters have more than one index node. To add them all:

1. Click **+ Add node**
2. A new text area appears — paste that node's stats JSON
3. **Remember to name each node** (e.g., `idx-node2.prod.local`) — this label appears as the section header and helps you identify which node is which
4. Repeat for all index nodes in your cluster
5. Click **Load & Render** — you'll get a separate treemap, charts, and stats table for each node

> 💡 **Tip:** Couchbase clusters often have index replicas, so you may see the same index name on multiple nodes. The node labels help you keep track of what lives where.

### Analysis Tab

1. Load data in the **Treemap** tab and/or the **Stats API** tab first
2. Switch to the **Analysis** tab — it combines everything into a single dashboard
3. Use the global filter bar at the top to drill down by bucket, scope, collection, or index name

### 💾 Saving & Loading (Docker mode)

When running with Docker, you don't have to re-paste your data every time:

1. After pasting data, click the **💾 Save** button (Treemap tab) or **💾 Save All Nodes** (Stats tab)
2. **Refresh the page** — your data auto-loads and renders automatically
3. Click the **💾** button in the navbar to open the **File Manager** — view, delete individual files, or wipe everything

### 🎛️ Toggle Metrics

In the Stats API tab, use the **Disk Size / Data Size** toggle to switch what the treemap boxes are sized by.

---

## 🐳 Running with Docker (Recommended)

The Docker setup adds a lightweight Node.js server so your pasted data **saves to disk** and survives page refreshes and container restarts.

```bash
docker compose up
```

Open [http://localhost:3000](http://localhost:3000) — that's it.

### What you get

- **💾 Save buttons** — click "Save" next to "Load & Render" on either tab to persist your JSON to the server
- **Auto-load on refresh** — saved data automatically repopulates the textareas and renders on page open. No more re-pasting!
- **File manager** — click the 💾 button in the navbar to see all saved files, delete individual files, or wipe everything
- **Persistent storage** — data lives in a Docker volume (`cb-index-data`), so `docker compose restart` or `docker compose down && docker compose up` keeps your data intact

### Useful commands

```bash
docker compose up -d        # run in background
docker compose restart      # restart (data persists)
docker compose down          # stop (data persists in volume)
docker compose down -v       # stop AND delete saved data
docker compose up --build    # rebuild after updating index.html
```

---

## ✅ Works On My Computer Certified ;-)

**Option A: Docker** — `docker compose up` and go to [http://localhost:3000](http://localhost:3000). Your data saves and survives restarts.

**Option B: Just the HTML** — Open `index.html` directly in your browser. Everything works, but you'll need to re-paste your data after each refresh. CDN links handle the rest (ECharts, DaisyUI, Tailwind CSS).

---

## 📄 License

See [LICENSE](LICENSE) for details.
