# Session Summary: Amazon Research & CLI Help

**Date:** 2026-01-13
**Duration:** Short session
**Type:** Research & Reference

## Tasks Completed

### 1. Skylight Calendar Power Supply Research
**Request:** Find replacement power supply for broken Skylight Calendar on Amazon.ca

**Findings:**
- Skylight Calendar 15" requires: 12V DC, 2A, 5.5mm x 2.1mm barrel connector, center positive
- Original part: AP049U12200
- Skylight-branded replacement (B0DCC8ZLFD) currently unavailable

**Recommended Alternatives:**
| Product | Link | Notes |
|---------|------|-------|
| TMEZON 12V 2A | B00Q2E5IXW | Exact specs, 8ft cable - RECOMMENDED |
| FlickerStar 12V 2A | B0852HX9HV | 8 interchangeable tips |
| Tonton 12V 2A | B0CFKYK961 | ETL certified |

**Key Learning:** Skylight Calendar uses 12V (NOT 5V like Skylight Frame products)

---

### 2. GCP Alerts CLI Usage Instructions
**Request:** Show usage instructions for previously built gcp-alerts tool

**Location:** `.claude/bin/gcp-alerts/gcp-alerts.ts`

**Commands:**
```
gcp-alerts list <project-id>                     # List policies
gcp-alerts sync <source> <dest>                  # Sync policies
gcp-alerts delete <project-id> <policy-name>    # Delete policy
```

**Options:** `--name`, `--dry-run`, `--json`, `--force`

**Auth:** Uses Application Default Credentials (gcloud auth application-default login)

---

### 3. Hot Tub Fine Mesh Skimmer Research
**Request:** Find handheld sieve with long handle for removing very small debris from hot tub on Amazon.ca

**Key Finding:** Look for "silt net" or "ultra-fine mesh" products - these capture sand, hair, silt, pollen

**Top Recommendations:**
| Product | Handle | Link | Notes |
|---------|--------|------|-------|
| ProTuff Silt Net | Requires pole | B0DHY9K2Z1 | Best for finest debris, 2-year warranty |
| Triluca Fine Mesh | Requires pole | B005HKFSOQ | Premium, triple-stitched, Made in USA |
| Greenerever 3.3ft | Pole included | B08B5DSP6H | Best value all-in-one |
| 6ft Stainless Steel | 6ft pole | B0B5G563DT | Longest reach |

**Key Learning:** Professional silt nets require separate standard 1.25" pool poles

---

## Capture for Future Reference

- Skylight Calendar 15" power specs: 12V 2A, 5.5x2.1mm barrel, center positive
- gcp-alerts CLI location: `.claude/bin/gcp-alerts/gcp-alerts.ts`
- For finest hot tub debris, search "silt net" not just "skimmer"
- Amazon.ca often hides prices until added to cart
