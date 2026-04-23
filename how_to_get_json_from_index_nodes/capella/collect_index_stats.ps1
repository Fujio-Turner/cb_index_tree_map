# --------------------------------------------------------------------------
# Couchbase Capella – Collect Index Stats (Windows PowerShell)
#
# Prerequisites:
#   - Your public IP must be in the Capella "Allowed IP" list.
#   - PowerShell 5.1+ (built-in on Windows 10/11).
#
# Usage:
#   .\collect_index_stats.ps1 `
#       -ClusterHost "your-cluster.cloud.couchbase.com" `
#       -Username "Administrator"
#
#   You will be prompted for the password securely via Get-Credential
#   if -Credential is not provided.
#
# Optional:
#   -Credential  PSCredential object (prompted if omitted)
#   -OutputDir   Directory for saved JSON files (default: .\collected_stats)
#   -MgmtPort    Management port (default: 18091)
#   -IndexPort   Index stats port (default: 19102)
# --------------------------------------------------------------------------

param(
    [Parameter(Mandatory=$true)]
    [string]$ClusterHost,

    [Parameter(Mandatory=$false)]
    [string]$Username,

    [Parameter(Mandatory=$false)]
    [PSCredential]$Credential,

    [string]$OutputDir = ".\collected_stats",
    [int]$MgmtPort = 18091,
    [int]$IndexPort = 19102
)

$ErrorActionPreference = "Stop"

# Resolve credentials: prefer -Credential, fall back to prompting with -Username
if (-not $Credential) {
    if ($Username) {
        $Credential = Get-Credential -UserName $Username -Message "Enter Couchbase password for $Username"
    } else {
        $Credential = Get-Credential -Message "Enter Couchbase credentials"
    }
}

$PlainUser = $Credential.UserName
$PlainPass = $Credential.GetNetworkCredential().Password
$Base64Auth = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("${PlainUser}:${PlainPass}"))
$AuthHeader = @{ Authorization = "Basic $Base64Auth" }

# TLS 1.2 required for Capella
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

Write-Host "============================================"
Write-Host " Couchbase Capella Index Stats Collector"
Write-Host "============================================"
Write-Host "Cluster : $ClusterHost"
Write-Host "Output  : $OutputDir"
Write-Host ""

# ------------------------------------------------------------------
# Step 1: Fetch the cluster map
# ------------------------------------------------------------------
$MgmtUrl = "https://${ClusterHost}:${MgmtPort}/pools/default/"
Write-Host ">> Fetching cluster map from $MgmtUrl ..."

try {
    $ClusterMapResponse = Invoke-WebRequest -Uri $MgmtUrl -Headers $AuthHeader -Method Get -TimeoutSec 30 -UseBasicParsing
    $ClusterMap = $ClusterMapResponse.Content | ConvertFrom-Json
} catch {
    Write-Host "Error: Failed to fetch cluster map. Check hostname, credentials, and that your IP is in the Capella Allowed IP list." -ForegroundColor Red
    Write-Host "  $_" -ForegroundColor Red
    exit 1
}

# ------------------------------------------------------------------
# Step 2: Find index nodes
# ------------------------------------------------------------------
$IndexNodes = @()
foreach ($node in $ClusterMap.nodes) {
    if ($node.services -contains "index") {
        $hostname = $node.hostname
        # Strip brackets and port suffix
        # Handles: "host:8091", "[::1]:8091"
        if ($hostname -match '^\[(.+)\](?::\d+)?$') {
            $hostname = $Matches[1]
        } elseif ($hostname -match '^(.+):\d+$') {
            $hostname = $Matches[1]
        }
        $IndexNodes += $hostname
    }
}

if ($IndexNodes.Count -eq 0) {
    Write-Host "Error: No index nodes found in the cluster map." -ForegroundColor Red
    exit 1
}

Write-Host ">> Found $($IndexNodes.Count) index node(s):"
foreach ($n in $IndexNodes) { Write-Host "   - $n" }
Write-Host ""

# ------------------------------------------------------------------
# Step 3: Collect stats from each index node (preserve raw JSON)
# ------------------------------------------------------------------
$Collected = 0
$Failed = 0
foreach ($node in $IndexNodes) {
    $SafeName = $node -replace '[^a-zA-Z0-9]', '_'
    $OutFile = Join-Path $OutputDir "index_stats_${SafeName}_${Timestamp}.json"
    $StatsUrl = "https://${node}:${IndexPort}/api/v1/stats?pretty=true"

    Write-Host ">> Collecting stats from ${node}:${IndexPort} ..."

    try {
        $StatsResponse = Invoke-WebRequest -Uri $StatsUrl -Headers $AuthHeader -Method Get -TimeoutSec 30 -UseBasicParsing
        # Save raw JSON response directly — no parse/re-serialize round-trip
        [System.IO.File]::WriteAllText((Resolve-Path $OutputDir | Join-Path -ChildPath (Split-Path $OutFile -Leaf)), $StatsResponse.Content)
        $Size = (Get-Item $OutFile).Length
        Write-Host "   ✅ Saved $OutFile ($Size bytes)" -ForegroundColor Green
        $Collected++
    } catch {
        Write-Host "   ❌ Failed: $_" -ForegroundColor Red
        Write-Host "      Check that your IP is in the Capella Allowed IP list and the node is reachable." -ForegroundColor Yellow
        $Failed++
    }
}

Write-Host ""
Write-Host "============================================"
Write-Host " Done. Collected ${Collected}/$($IndexNodes.Count) file(s) in ${OutputDir}/"
if ($Failed -gt 0) {
    Write-Host " ⚠️  ${Failed} node(s) failed." -ForegroundColor Yellow
}
Write-Host "============================================"
