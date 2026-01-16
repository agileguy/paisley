# Session: Tai Chi Program PDF Generation

**Date:** 2026-01-16
**Duration:** ~45 minutes
**Focus:** Created 4-week Tai Chi program with illustrated PDFs for older beginners

---

## Summary

Built a complete 4-week Tai Chi learning program with 14 lesson markdown files, 9 custom SVG movement diagrams, and a TypeScript PDF generator. Converted all lessons to print-ready PDFs using Chrome headless.

---

## What Was Done

### 1. Research & Content Creation
- Researched Tai Chi fundamentals for older beginners
- Created comprehensive 4-week progressive program
- 14 lesson files covering: standing meditation, warm-ups, breathing, and 8-form movements
- Safety guidelines for seniors (balance, joint protection, pacing)

### 2. SVG Illustrations Created
Located at `~/Documents/TaiChi-Program/images/`:
- `basic-stance.svg` - Proper standing posture with annotations
- `warm-up.svg` - 5 essential warm-up exercises
- `breathing.svg` - 4-phase Qigong breathing diagram
- `commencement.svg` - Opening movement phases
- `parting-wild-horse.svg` - Weight shifting movement
- `wave-hands.svg` - Cloud hands lateral movement
- `brush-knee.svg` - Stepping movement with arm coordination
- `grasping-bird.svg` - 4-part compound movement (Ward Off, Roll Back, Press, Push)
- `single-whip.svg` - Final position with beak hand detail

### 3. PDF Generation System
Created `~/Documents/TaiChi-Program/generate-pdfs.ts`:
- Markdown to HTML conversion
- Print-friendly CSS with @page rules
- SVG embedding for each lesson
- Batch HTML generation

### 4. Chrome Headless Conversion
- Used `--no-pdf-header-footer` flag to remove browser artifacts
- Generated 17 PDFs (14 lessons + overview + variants)
- File sizes 183KB-480KB with embedded graphics

---

## Key Learnings

### Chrome Headless PDF Flags
```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="output.pdf" "file://$(pwd)/input.html"
```

### SVG Text Label Fix
Split long labels into multiple `<text>` elements to prevent clipping:
```xml
<!-- Instead of one long label -->
<text x="158" y="98">Shoulders</text>
<text x="158" y="108">relaxed</text>
```

---

## Files Created/Modified

### New Files
- `~/Documents/TaiChi-Program/README.md` - Program overview
- `~/Documents/TaiChi-Program/lessons/*.md` - 14 lesson files
- `~/Documents/TaiChi-Program/images/*.svg` - 9 SVG diagrams
- `~/Documents/TaiChi-Program/generate-pdfs.ts` - Generator script
- `~/Documents/TaiChi-Program/html/*.pdf` - 17 generated PDFs

### Modified Files
- `~/.claude/Skills/CORE/Aesthetic.md` - Added Chrome Headless PDF Generation section

---

## Style Guide Update

Added comprehensive "Chrome Headless PDF Generation" section to Aesthetic.md covering:
- Chrome headless commands and flags
- Print-ready HTML template with CSS
- SVG best practices for PDFs
- TypeScript/Bun generator pattern
- Complete workflow summary

---

## Output Location

```
~/Documents/TaiChi-Program/
├── README.md
├── generate-pdfs.ts
├── lessons/
│   ├── day-01-02-standing-meditation.md
│   ├── day-03-04-warm-up-routine.md
│   └── ... (14 files total)
├── images/
│   ├── basic-stance.svg
│   ├── breathing.svg
│   └── ... (9 SVGs total)
└── html/
    ├── 00-overview.pdf
    ├── day-01-02-standing-meditation.pdf
    └── ... (17 PDFs total)
```

---

## Tags
#tai-chi #pdf-generation #svg #chrome-headless #style-guide #health
