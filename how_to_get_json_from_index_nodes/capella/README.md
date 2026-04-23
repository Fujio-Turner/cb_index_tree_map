# Couchbase Capella – Index Stats Collector

Scripts to collect GSI Index stats JSON from **Couchbase Capella** (DBaaS) directly from your laptop — no SSH required.

## How It Works

1. Connects to your Capella cluster's management endpoint (`https://<host>:18091/pools/default/`).
2. Discovers all nodes running the **Index** service from the cluster map.
3. Curls each index node's stats API (`https://<index-node>:19102/api/v1/stats?pretty=true`).
4. Saves the JSON files locally.

## Before You Start — Capella Setup

You need two things from Capella before running these scripts: your **cluster connection hostname** and your **IP on the allowed list**.

### Step 1: Allow Your IP Address

Capella blocks all traffic by default. You must add your laptop's public IP to the cluster's **Allowed IP** list.

1. Log into [Capella UI](https://cloud.couchbase.com/).
2. Navigate to your cluster → **Settings** → **Allowed IP Addresses**.
3. Click **Add Allowed IP** and enter your public IP (or use "Add Current IP").

📖 Full docs: [Allow IP Addresses](https://docs.couchbase.com/cloud/clusters/allow-ip-address.html)

> **Tip:** Not sure what your public IP is? Visit [whatismyip.com](https://whatismyip.com) or run `curl -s ifconfig.me` in your terminal.

### Step 2: Get Your Cluster Connection Hostname

This is the hostname you'll pass to the script (e.g., `cb-12345.cloud.couchbase.com`).

1. Log into [Capella UI](https://cloud.couchbase.com/).
2. Navigate to your cluster → **Connect** tab.
3. Copy the **Connection String** — it will look something like:
   ```
   couchbases://cb-12345.cloud.couchbase.com
   ```
4. Strip the `couchbases://` prefix — use just: `cb-12345.cloud.couchbase.com`

📖 Full docs: [Connect to Your Cluster](https://docs.couchbase.com/cloud/get-started/connect.html)

### Step 3: Database Credentials

You need a database user with **admin** or **read-only admin** access.

1. In the Capella UI, go to your cluster → **Settings** → **Database Access**.
2. Create or verify you have a user with appropriate permissions.

📖 Full docs: [Configure Database Credentials](https://docs.couchbase.com/cloud/clusters/manage-database-users.html)

## Prerequisites

- Capella setup completed (Steps 1–3 above).
- **Mac/Linux**: `curl` and `python3` installed (both ship with macOS).
- **Windows**: PowerShell 5.1+ (built-in on Windows 10/11).

## Usage

### Mac / Linux

```bash
chmod +x collect_index_stats.sh

./collect_index_stats.sh \
    -h your-cluster.cloud.couchbase.com \
    -u Administrator \
    -p YourPassword
```

### Windows (PowerShell)

```powershell
.\collect_index_stats.ps1 `
    -ClusterHost "your-cluster.cloud.couchbase.com" `
    -Username "Administrator" `
    -Password "YourPassword"
```

## Options

| Option | Bash flag | PowerShell param | Default | Description |
|--------|-----------|------------------|---------|-------------|
| Cluster hostname | `-h` | `-ClusterHost` | *(required)* | Your Capella cluster hostname |
| Username | `-u` | `-Username` | *(required)* | Couchbase admin username |
| Password | `-p` | `-Password` | *(required)* | Couchbase admin password |
| Output directory | `-o` | `-OutputDir` | `./collected_stats` | Where JSON files are saved |
| Management port | `-m` | `-MgmtPort` | `18091` | Capella management port |
| Index stats port | `-i` | `-IndexPort` | `19102` | Index stats API port |

## Output

Files are saved as:

```
collected_stats/index_stats_{hostname}_{YYYYMMDD_HHMMSS}.json
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Connection refused / timeout | Add your public IP to Capella's **Allowed IP** list |
| 401 Unauthorized | Check username and password |
| No index nodes found | Verify your cluster has the Index service enabled |
| Certificate errors | The scripts skip cert verification (`-k` / `TrustAllCertsPolicy`) which is fine for Capella |

## Using the Collected Stats

Load the downloaded JSON into the **CB Index Analyzer** tool:

1. `npm start`
2. Open the UI and upload/paste the JSON.
