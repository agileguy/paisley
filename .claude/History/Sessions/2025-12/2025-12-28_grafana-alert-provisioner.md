# Session: Grafana Alert Provisioner

**Date:** 2025-12-28
**Duration:** ~45 minutes

## Summary

Created a complete Python toolset for programmatically managing Grafana alert rules via the Alerting Provisioning API.

## Work Completed

### 1. Repository Setup
- Created GitHub repo `agileguy/grafana-alert-provisioner`
- Cloned to `~/repos/grafana-alert-provisioner`
- Added Python boilerplate: .gitignore, Dockerfile, requirements.txt, README.md

### 2. add-alert.py Script
- Imports Grafana alerts from JSON files
- Supports Service Account Tokens (API keys deprecated in Grafana 12.3)
- Features: dry-run validation, multiple file support, folder override
- Handles create vs update based on UID existence

### 3. remove-alert.py Script
- Removes alerts by name or UID
- `--list` to show all provisioned alerts
- `--dry-run` to preview deletion
- `-f/--force` to skip confirmation prompt

### 4. Example Alert
- Created `examples/cpu-alert.json` for Google Cloud Monitoring
- Uses stackdriver datasource (uid: ff5jlf6dsbuo0f)
- Monitors CPU utilization > 80% for 5 minutes

### 5. Environment Configuration
- Added GRAFANA_URL and GRAFANA_TOKEN to `~/.claude/.env`
- Target: https://grafana.agileguy.ca

## Technical Details

### API Endpoint
```
POST /api/v1/provisioning/alert-rules  (create)
PUT  /api/v1/provisioning/alert-rules/{uid}  (update)
DELETE /api/v1/provisioning/alert-rules/{uid}  (delete)
GET  /api/v1/provisioning/alert-rules  (list)
```

### Authentication
Service Account Token via Bearer header (API keys deprecated Jan 2025)

### Key Discovery
- `folderUID` is mandatory for alert creation
- Created "Alerts" folder via `/api/folders` endpoint

## Usage Examples

```bash
# Activate venv
cd ~/repos/grafana-alert-provisioner
source .venv/bin/activate

# Add alert
python scripts/add-alert.py examples/cpu-alert.json

# List alerts
python scripts/remove-alert.py --list

# Remove alert
python scripts/remove-alert.py -f "High CPU Usage"
```

## Commits
- `29a5949` - Initial commit: Grafana alert provisioner tool
- `3d39f79` - Add remove-alert.py script for deleting alert rules

## Repository
https://github.com/agileguy/grafana-alert-provisioner

## Related
- Grafana instance: https://grafana.agileguy.ca
- Datasource: Google Cloud Monitoring (stackdriver)
