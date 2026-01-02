# Session: Grafana Provisioner & Jamaica Prep

**Date:** 2025-12-29
**Duration:** ~1.5 hours

## Summary

Extended Grafana alert provisioner with export format support, researched Dunn's River Falls, converted PDFs to JPEG, and prepared for Jamaica trip.

## Work Completed

### 1. Grafana Alert Provisioner - remove-alert.py
- Created `remove-alert.py` script for deleting alert rules
- Features: remove by name or UID, `--list`, `--dry-run`, `-f/--force`
- Updated README.md with documentation
- Tested full workflow: add → list → remove alerts

### 2. Testing Workflow
```bash
# Add alert
python scripts/add-alert.py examples/cpu-alert.json

# List alerts
python scripts/remove-alert.py --list

# Remove alert
python scripts/remove-alert.py -f "High CPU Usage"
```

### 3. Jamaica Trip Preparation
- Retrieved calendar events for next 3 days
- Reviewed trip details: Dec 30 - Jan 6, Ocean Coral Spring Resort
- **Fixed name error:** Updated "Ada" → "Arin" (respecting chosen name)
- Regenerated Jamaica PDF with corrected traveler list

### 4. News Check
Retrieved top news headlines for Dec 28-29, 2025:
- Trump-Zelenskyy peace talks at Mar-a-Lago (95% to security deal)
- Trump-Netanyahu meeting scheduled for Gaza ceasefire
- China military drills around Taiwan (largest ever)
- Bomb cyclone bringing severe winter weather to US
- Brigitte Bardot died at 91

### 4. Export Format Support for add-alert.py
- Added auto-detection of Grafana export format (`apiVersion` + `groups`)
- Extracts rules from nested groups structure
- Maps folder names to UIDs automatically
- Successfully imported/removed 8 Dumbo alerts to cni-dev Grafana

### 5. Dunn's River Falls Research
- Researched for family visit today
- Admission: $25 USD adults, $17 USD children (4-12)
- What to bring: water shoes, waterproof pouch, towel, change of clothes
- Hours: 8:30 AM - 4:00 PM, arrive by 2 PM for climb
- Climb duration: 45 min - 1.5 hours

### 6. PDF to JPEG Conversion
- Converted 9 PDFs in ~/Downloads/Vault/ to JPEG
- Used macOS qlmanage + sips workflow
- Documents: passports, health cards, birth certificate, citizenship, etc.

### 7. Flight Information Retrieved
- Tomorrow: WestJet 2226, YYC → MBJ, 10:00 AM - 6:24 PM
- Confirmation: ARZNPO

## Commits

**grafana-alert-provisioner repo:**
- `3d39f79` - Add remove-alert.py script for deleting alert rules
- `5f6aadd` - Add support for Grafana export format in add-alert.py

**paisley repo:**
- `abef628` - Fix traveler name in Jamaica trip research (Ada → Arin)

## Key Learning

**Always use Arin's preferred name** - documented in `~/.claude/History/Learnings/family.md`:
> Important: Always refer to Arin by chosen name (not birth name Ada).

## Upcoming

**Tomorrow (Dec 30):** Jamaica trip begins
- WestJet 2226, YYC → MBJ, 10:00 AM - 6:24 PM
- Confirmation: ARZNPO
- Travelers: Dan, Sarah, Rachelle, Arin, Brooklyn

## Grafana Instances Used

| Instance | URL | Purpose |
|----------|-----|---------|
| Personal | https://grafana.agileguy.ca | Testing with GCP datasource |
| Work (cni-dev) | https://grafana.na1.cni-dev.appneta.com | Dumbo alerts (Prometheus) |

## Repositories Updated
- https://github.com/agileguy/grafana-alert-provisioner
- https://github.com/agileguy/paisley
