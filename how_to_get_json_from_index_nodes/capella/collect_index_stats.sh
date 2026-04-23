#!/usr/bin/env bash
# --------------------------------------------------------------------------
# Couchbase Capella – Collect Index Stats (Mac / Linux)
#
# Prerequisites:
#   - Your public IP must be in the Capella "Allowed IP" list.
#   - curl and python3 (or python) must be installed.
#
# Usage:
#   ./collect_index_stats.sh \
#       -h <capella-cluster-hostname> \
#       -u <username>
#
#   The script will prompt for the password securely (not visible in
#   shell history or process list).
#
# Optional:
#   -p <password>     Password (if omitted, you will be prompted)
#   -o <output_dir>   Directory for saved JSON files (default: ./collected_stats)
#   -m <mgmt_port>    Management port (default: 18091)
#   -i <index_port>   Index stats port (default: 19102)
# --------------------------------------------------------------------------

set -euo pipefail

# Defaults
OUTPUT_DIR="./collected_stats"
MGMT_PORT="18091"
INDEX_PORT="19102"
CLUSTER_HOST=""
CB_USER=""
CB_PASS=""

usage() {
    echo "Usage: $0 -h <hostname> -u <username> [-p <password>] [-o output_dir] [-m mgmt_port] [-i index_port]"
    exit 1
}

while getopts "h:u:p:o:m:i:" opt; do
    case $opt in
        h) CLUSTER_HOST="$OPTARG" ;;
        u) CB_USER="$OPTARG" ;;
        p) CB_PASS="$OPTARG" ;;
        o) OUTPUT_DIR="$OPTARG" ;;
        m) MGMT_PORT="$OPTARG" ;;
        i) INDEX_PORT="$OPTARG" ;;
        *) usage ;;
    esac
done

if [[ -z "$CLUSTER_HOST" || -z "$CB_USER" ]]; then
    echo "Error: -h and -u are required."
    usage
fi

# Prompt for password securely if not provided via -p
if [[ -z "$CB_PASS" ]]; then
    read -rsp "Enter password for ${CB_USER}: " CB_PASS
    echo ""
    if [[ -z "$CB_PASS" ]]; then
        echo "Error: Password cannot be empty."
        exit 1
    fi
fi

# Find python
PYTHON_BIN=$(command -v python3 || command -v python || true)
if [[ -z "$PYTHON_BIN" ]]; then
    echo "Error: python3 or python is required but not found."
    exit 1
fi

# Create a temporary netrc file so credentials are not visible in the process list.
# curl reads credentials from this file instead of -u on the command line.
NETRC_FILE=$(mktemp)
chmod 600 "$NETRC_FILE"
cleanup() { rm -f "$NETRC_FILE"; }
trap cleanup EXIT

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p "$OUTPUT_DIR"

echo "============================================"
echo " Couchbase Capella Index Stats Collector"
echo "============================================"
echo "Cluster : $CLUSTER_HOST"
echo "Output  : $OUTPUT_DIR"
echo ""

# ------------------------------------------------------------------
# Step 1: Fetch the cluster map to discover index nodes
# ------------------------------------------------------------------
echo ">> Fetching cluster map from https://${CLUSTER_HOST}:${MGMT_PORT}/pools/default/ ..."

# Write netrc entry for the management endpoint
cat > "$NETRC_FILE" <<EOF
machine ${CLUSTER_HOST}
login ${CB_USER}
password ${CB_PASS}
EOF

if ! CLUSTER_MAP=$(curl -sS --fail --max-time 30 -k \
    --netrc-file "$NETRC_FILE" \
    "https://${CLUSTER_HOST}:${MGMT_PORT}/pools/default/" 2>&1); then
    echo "Error: Failed to fetch cluster map." >&2
    echo "  - Check hostname, credentials, and that your IP is in the Capella Allowed IP list." >&2
    echo "  - curl output: ${CLUSTER_MAP}" >&2
    exit 1
fi

# ------------------------------------------------------------------
# Step 2: Parse index node hostnames from the cluster map
# ------------------------------------------------------------------
INDEX_NODES=$(printf '%s' "$CLUSTER_MAP" | "$PYTHON_BIN" -c "
import sys, json
data = json.load(sys.stdin)
for node in data.get('nodes', []):
    if 'index' in node.get('services', []):
        h = node['hostname']
        # Strip brackets and port suffix
        # Handles: 'host:8091', '[::1]:8091'
        if h.startswith('['):
            import re
            m = re.match(r'^\[(.+)\](?::\d+)?$', h)
            h = m.group(1) if m else h.strip('[]')
        else:
            h = h.rsplit(':', 1)[0]
        print(h)
")

if [[ -z "$INDEX_NODES" ]]; then
    echo "Error: No index nodes found in the cluster map."
    exit 1
fi

NODE_COUNT=$(echo "$INDEX_NODES" | wc -l | tr -d ' ')
echo ">> Found ${NODE_COUNT} index node(s):"
echo "$INDEX_NODES" | sed 's/^/   - /'
echo ""

# ------------------------------------------------------------------
# Step 3: Curl each index node's stats and save locally
# ------------------------------------------------------------------
COLLECTED=0
FAILED=0
while IFS= read -r NODE; do
    SAFE_NAME=$(echo "$NODE" | sed 's/[^a-zA-Z0-9]/_/g')
    OUTFILE="${OUTPUT_DIR}/index_stats_${SAFE_NAME}_${TIMESTAMP}.json"

    # Update netrc for this node
    cat > "$NETRC_FILE" <<EOF
machine ${NODE}
login ${CB_USER}
password ${CB_PASS}
EOF

    echo ">> Collecting stats from ${NODE}:${INDEX_PORT} ..."
    HTTP_CODE=$(curl -sS -o "$OUTFILE" -w "%{http_code}" --max-time 30 -k \
        --netrc-file "$NETRC_FILE" \
        "https://${NODE}:${INDEX_PORT}/api/v1/stats?pretty=true" 2>/dev/null) || true

    if [[ "$HTTP_CODE" == "200" ]]; then
        SIZE=$(wc -c < "$OUTFILE" | tr -d ' ')
        echo "   ✅ Saved ${OUTFILE} (${SIZE} bytes)"
        COLLECTED=$((COLLECTED + 1))
    else
        echo "   ❌ Failed (HTTP ${HTTP_CODE:-000}). Check connectivity / allowed IPs."
        rm -f "$OUTFILE"
        FAILED=$((FAILED + 1))
    fi
done <<< "$INDEX_NODES"

echo ""
echo "============================================"
echo " Done. Collected ${COLLECTED}/${NODE_COUNT} file(s) in ${OUTPUT_DIR}/"
if [[ $FAILED -gt 0 ]]; then
    echo " ⚠️  ${FAILED} node(s) failed."
fi
echo "============================================"
