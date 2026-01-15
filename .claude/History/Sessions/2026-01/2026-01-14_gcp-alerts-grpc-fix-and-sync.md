# Session Summary: GCP Alerts gRPC Fix & Policy Sync

**Date:** 2026-01-14
**Duration:** Medium session
**Type:** Debugging & Operations

## Tasks Completed

### 1. Diagnosed gcp-alerts Tool Hanging Issue
**Problem:** `gcp-alerts sync --dry-run` was hanging indefinitely when fetching policies

**Investigation:**
- Tool fetched source project (33 policies) successfully
- Hung on destination project fetch
- gcloud CLI worked fine for both projects
- Created debug scripts to isolate the issue

**Root Cause:** The `@google-cloud/monitoring` library uses gRPC, which has compatibility issues with bun runtime. gRPC client hangs indefinitely while REST API works perfectly.

**Evidence:**
- gRPC client: Hung for 15+ seconds, then timed out
- REST API: Completed in 639ms (source) and 297ms (destination)

---

### 2. Fixed gcp-alerts Tool - Switched to REST API
**Solution:** Rewrote the tool to use GCP Monitoring REST API instead of gRPC client

**Changes:**
- Removed `@google-cloud/monitoring` gRPC dependency
- Added `getAccessToken()` using `gcloud auth application-default print-access-token`
- Added `apiRequest()` helper for authenticated REST calls
- Implemented pagination support for large policy lists
- All existing functionality preserved (list, sync, delete, --dry-run, --confirm, --json, --force)

**Location:** `.claude/bin/gcp-alerts/gcp-alerts.ts`

---

### 3. Synced Alert Policies: aodapn-sp01 Projects
**Source:** `spapngl-aodapn-sp01` (33 policies)
**Destination:** `spapncgl-aodapn-sp01` (2 existing)

**Results:**
| Result | Count |
|--------|-------|
| Created | 30 |
| Skipped | 2 |
| Errors | 1 |

**Error:** `BQ Streamer Processing Lag` - Had hardcoded `project_id = "spapngl-aodapn-sp01"` in filter, can't monitor cross-project resources

**Policies Created:**
- 13x Atmosphere NetOps Process Not Running alerts
- 6x DB alerts (CPU, Disk, Memory utilization, Deadlocks, Server Down)
- MIA Lock Waits, MIA Wait event types
- NIS Instance Repair Alarm, NIS Versioning Error, Orphaned NIS node
- APT command executed
- Atmosphere NetOps Disk/CPU/DR Disk utilization alerts

---

### 4. Synced Alert Policies: saas-gke Projects
**Source:** `spapngl-saas-gke1` (9 policies)
**Destination:** `spapncgl-saas-gke2` (3 existing)

**Results:**
| Result | Count |
|--------|-------|
| Created | 6 |
| Skipped | 3 |
| Errors | 0 |

**Policies Created:**
- Cluster Autoscaler Errors
- Pod volume utilization
- External Secret Error
- Container Stuck In Restarts
- Node Allocatable ephemeral storage
- Pod OOM Error

---

## Capture for Future Reference

- **bun + gRPC incompatibility:** Google Cloud client libraries using gRPC may hang in bun runtime; use REST API instead
- gcp-alerts now uses REST API at `https://monitoring.googleapis.com/v3`
- Token obtained via: `gcloud auth application-default print-access-token`
- Some alert policies have hardcoded project IDs in filters - these fail cross-project sync
- REST API pagination: check `nextPageToken` in response

## Technical Details

**REST API Endpoints Used:**
```
GET  /v3/projects/{project}/alertPolicies     # List policies
POST /v3/projects/{project}/alertPolicies     # Create policy
DELETE /v3/projects/{project}/alertPolicies/{id}  # Delete policy
```

**Key Fix Pattern:**
```typescript
// Instead of gRPC client:
// const client = new AlertPolicyServiceClient();
// const [policies] = await client.listAlertPolicies({...});

// Use REST API:
const token = await getAccessToken();
const response = await fetch(url, {
  headers: { Authorization: `Bearer ${token}` }
});
```
