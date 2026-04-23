# Couchbase Index Stats Collector (Ansible)

This Ansible playbook connects to **one** Couchbase node, auto-discovers every node running the **Index** service via the cluster map (`/pools/default/`), curls their stats API, and fetches the JSON files back to your local machine.

No need to list every index node — the cluster tells us.

## Prerequisites

- [Ansible](https://docs.ansible.com/ansible/latest/installation_guide/) installed locally.
- SSH access to at least one Couchbase node in the cluster.
- Couchbase admin credentials.

## Quick Start

### 1. Create your inventory

```bash
cp inventory.ini.example inventory.ini
```

Add **one** Couchbase node (any node in the cluster):

```ini
[cb_node]
cb-node-01.example.com
```

### 2. Run the playbook

That's it — the playbook will **prompt you** for credentials securely and **auto-detect** HTTP vs HTTPS:

```bash
ansible-playbook -i inventory.ini collect_index_stats.yml
```

If you already know the cluster uses HTTPS, you can skip the detection and go straight to secure ports:

```bash
ansible-playbook -i inventory.ini collect_index_stats.yml -e "use_ssl=true"
```

> **Note:** You can also pass credentials via `-e "cb_user=... cb_password=..."` but this is less secure as they will appear in your shell history.

## How It Works

1. SSHs into the single `cb_node` host.
2. **Auto-detects HTTP vs HTTPS** — tries port `8091` (HTTP) first; if it's not reachable, falls back to `18091` (HTTPS). If `use_ssl=true` is passed, it skips HTTP and goes straight to HTTPS.
3. Curls `/pools/default/` to get the cluster map.
4. Parses the `nodes` array and finds every node whose `services` list contains `"index"`.
5. Curls each index node's stats API on the matching port (`9102` for HTTP, `19102` for HTTPS).
6. Fetches the JSON files back to your local `./collected_stats/` directory.
7. Cleans up temp files on the remote host.

## Options

| Variable     | Default             | Description                                           |
|--------------|---------------------|-------------------------------------------------------|
| `cb_user`    | *(required)*        | Couchbase admin username                              |
| `cb_password`| *(required)*        | Couchbase admin password                              |
| `use_ssl`    | `false`             | Skip auto-detect and go straight to HTTPS (18091/19102) |
| `output_dir` | `./collected_stats` | Local directory where JSON files are saved            |

## Output

Files are named:

```
index_stats_{hostname}_{YYYYMMDDTHHMMSS}.json
```

## Using the Collected Stats

Load the downloaded JSON files into the **CB Index Analyzer** tool:

1. `npm start`
2. Open the UI and upload/paste the collected JSON.
