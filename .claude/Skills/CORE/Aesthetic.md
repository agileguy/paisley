# PAI Visual Aesthetic System

**A clean, modern aesthetic built on four colors: Orange, Black, Gray, and White.**

---

## Core Concept: Bold Simplicity

Every visualization uses a constrained palette for maximum impact and brand consistency. The limited color scheme creates instant recognition and professional polish.

**The Philosophy:** *"Clarity through constraint."*
- Orange provides warmth, energy, and focal points
- Black grounds everything in sophistication
- Gray creates hierarchy and depth
- White delivers clarity and contrast

---

## The PAI Brand Colors

### Primary Palette (MANDATORY)

```css
/* Orange - Primary Accent */
--pai-orange:        #FF6B35;   /* Primary brand orange */
--pai-orange-light:  #FF8C61;   /* Lighter variant for hover/highlights */
--pai-orange-dark:   #E55A2B;   /* Darker variant for emphasis */
--pai-orange-glow:   rgba(255, 107, 53, 0.4);  /* For glow effects */

/* Black - Backgrounds */
--pai-black:         #000000;   /* Pure black */
--pai-black-soft:    #0a0a0a;   /* Slightly softer black */
--pai-black-rich:    #111111;   /* Rich black for cards */

/* Gray - Secondary/Supporting */
--pai-gray-100:      #f5f5f5;   /* Lightest gray */
--pai-gray-200:      #e5e5e5;   /* Light gray */
--pai-gray-300:      #d4d4d4;   /* Medium-light gray */
--pai-gray-400:      #a3a3a3;   /* Medium gray */
--pai-gray-500:      #737373;   /* True medium gray */
--pai-gray-600:      #525252;   /* Medium-dark gray */
--pai-gray-700:      #404040;   /* Dark gray */
--pai-gray-800:      #262626;   /* Very dark gray */
--pai-gray-900:      #171717;   /* Near-black gray */

/* White - Text/Lines */
--pai-white:         #FFFFFF;   /* Pure white */
--pai-white-soft:    #FAFAFA;   /* Soft white */
--pai-white-muted:   #E0E0E0;   /* Muted white for secondary text */
```

### Color Usage Guidelines

| Element Type | Color | Usage |
|--------------|-------|-------|
| **Primary Accent** | Orange (#FF6B35) | CTAs, highlights, key focal points, links |
| **Background** | Black (#000000) | Page backgrounds, dark sections |
| **Cards/Panels** | Dark Gray (#171717-#262626) | Elevated surfaces on black |
| **Primary Text** | White (#FFFFFF) | Headlines, body text on dark |
| **Secondary Text** | Gray (#a3a3a3) | Subtitles, captions, metadata |
| **Borders** | Gray (#404040) | Subtle dividers and outlines |
| **Hover States** | Orange Light (#FF8C61) | Interactive element feedback |
| **Glow Effects** | Orange @ 40% | Emphasis, selection states |

### Color Hierarchy

1. **BLACK is the FOUNDATION** — All backgrounds start here
2. **WHITE for PRIMARY CONTENT** — Text, icons, key lines
3. **ORANGE for ACCENTS** — Headlines, CTAs, focal points, energy
4. **GRAY for SUPPORTING** — Secondary text, borders, depth layers

---

## CSS Variables Template

```css
:root {
  /* Core Brand Colors */
  --color-primary: #FF6B35;
  --color-primary-light: #FF8C61;
  --color-primary-dark: #E55A2B;

  /* Backgrounds */
  --bg-primary: #000000;
  --bg-secondary: #111111;
  --bg-tertiary: #1a1a1a;
  --bg-elevated: #262626;

  /* Text */
  --text-primary: #FFFFFF;
  --text-secondary: #a3a3a3;
  --text-muted: #737373;

  /* Borders & Dividers */
  --border-subtle: #333333;
  --border-default: #404040;
  --border-emphasis: #525252;

  /* Interactive States */
  --hover-bg: rgba(255, 107, 53, 0.1);
  --focus-ring: rgba(255, 107, 53, 0.5);
  --active-bg: rgba(255, 107, 53, 0.2);

  /* Effects */
  --glow-orange: 0 0 20px rgba(255, 107, 53, 0.4);
  --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);
}
```

---

## Application Examples

### Dark Mode (Default)
```css
body {
  background: var(--bg-primary);      /* Black */
  color: var(--text-primary);          /* White */
}

h1, h2, h3 {
  color: var(--color-primary);         /* Orange */
}

p {
  color: var(--text-secondary);        /* Gray */
}

a {
  color: var(--color-primary);         /* Orange */
}

.card {
  background: var(--bg-elevated);      /* Dark gray */
  border: 1px solid var(--border-subtle);
}

.button-primary {
  background: var(--color-primary);    /* Orange */
  color: var(--bg-primary);            /* Black text */
}
```

### Gradients (When Needed)
```css
/* Orange gradient for emphasis */
.gradient-orange {
  background: linear-gradient(135deg, #FF6B35 0%, #FF8C61 100%);
}

/* Dark gradient for depth */
.gradient-dark {
  background: linear-gradient(180deg, #1a1a1a 0%, #000000 100%);
}

/* Subtle gray gradient */
.gradient-gray {
  background: linear-gradient(180deg, #262626 0%, #171717 100%);
}
```

---

## Glow Effects

Orange glows create emphasis and energy:

```css
/* Subtle glow */
.glow-subtle {
  box-shadow: 0 0 15px rgba(255, 107, 53, 0.3);
}

/* Medium glow */
.glow-medium {
  box-shadow: 0 0 25px rgba(255, 107, 53, 0.4);
}

/* Strong glow */
.glow-strong {
  box-shadow: 0 0 40px rgba(255, 107, 53, 0.5);
}

/* Text glow */
.text-glow {
  text-shadow: 0 0 20px rgba(255, 107, 53, 0.5);
}

/* Animated glow */
@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 20px rgba(255, 107, 53, 0.3); }
  50% { box-shadow: 0 0 35px rgba(255, 107, 53, 0.5); }
}
```

---

## Typography Colors

```css
/* Headlines - Orange for impact */
h1 { color: #FF6B35; }
h2 { color: #FFFFFF; }
h3 { color: #FFFFFF; }

/* Body text - White and Gray */
p { color: #e5e5e5; }
.text-secondary { color: #a3a3a3; }
.text-muted { color: #737373; }

/* Links - Orange */
a { color: #FF6B35; }
a:hover { color: #FF8C61; }

/* Code - Gray background */
code {
  background: #262626;
  color: #FF6B35;
}
```

---

## Component Patterns

### Cards
```css
.card {
  background: #171717;
  border: 1px solid #333333;
  border-radius: 12px;
}

.card:hover {
  border-color: #FF6B35;
  box-shadow: 0 0 20px rgba(255, 107, 53, 0.2);
}
```

### Buttons
```css
.btn-primary {
  background: #FF6B35;
  color: #000000;
}

.btn-primary:hover {
  background: #FF8C61;
}

.btn-secondary {
  background: transparent;
  border: 1px solid #FF6B35;
  color: #FF6B35;
}

.btn-secondary:hover {
  background: rgba(255, 107, 53, 0.1);
}
```

### Progress/Indicators
```css
.progress-bar {
  background: #333333;
}

.progress-fill {
  background: linear-gradient(90deg, #FF6B35, #FF8C61);
}
```

---

## Absolute Rules

1. **ONLY FOUR COLORS** — Orange, Black, Gray, White (and their shades)
2. **NO OTHER ACCENT COLORS** — No blue, purple, green, cyan, etc.
3. **BLACK BACKGROUNDS** — Always default to black or near-black
4. **ORANGE FOR EMPHASIS** — Use sparingly for maximum impact
5. **WHITE FOR READABILITY** — Primary text is always white on dark
6. **GRAY FOR HIERARCHY** — Create depth with gray variations
7. **CONSISTENT APPLICATION** — Same colors across all outputs

---

## Quick Reference

| Purpose | Hex Code | Name |
|---------|----------|------|
| Primary Accent | `#FF6B35` | PAI Orange |
| Accent Light | `#FF8C61` | Orange Light |
| Background | `#000000` | Black |
| Card Background | `#171717` | Near Black |
| Primary Text | `#FFFFFF` | White |
| Secondary Text | `#a3a3a3` | Medium Gray |
| Muted Text | `#737373` | Dark Gray |
| Borders | `#404040` | Border Gray |

---

**This is the PAI brand: Bold orange energy on sophisticated black, with gray depth and white clarity.**

---

## PDF Generation Styles

When generating PDFs from markdown (using `md-to-pdf` or similar tools), apply these rules for professional output.

### Universal PDF Stylesheet

Save as `styles.css` alongside your markdown, or reference from a shared location:

```css
/* ===========================================
   PAI Universal PDF Styles
   Use with: bunx md-to-pdf file.md --stylesheet styles.css
   =========================================== */

/* Page Break Control - Keep headings with content */
h1, h2, h3, h4, h5, h6 {
  page-break-after: avoid;
  page-break-inside: avoid;
}

/* Keep lists and tables with their preceding content */
ul, ol, table {
  page-break-before: avoid;
  page-break-inside: avoid;
}

/* Table Styling - Left-justified headers */
th {
  text-align: left;
  font-weight: 600;
}

td {
  text-align: left;
}

/* Keep table header rows together */
thead {
  display: table-header-group;
}

tbody {
  page-break-inside: avoid;
}

/* Prevent orphans and widows */
p {
  orphans: 3;
  widows: 3;
}
```

### Usage

**Method 1: External Stylesheet (Recommended)**
```bash
bunx md-to-pdf document.md --stylesheet /path/to/styles.css
```

**Method 2: YAML Frontmatter**
```yaml
---
pdf_options:
  margin: 20mm
  format: Letter
---
```

**Method 3: Manual Page Breaks**
Insert where you need a forced page break:
```html
<div style="page-break-before: always;"></div>
```

### Key Rules

| Rule | CSS Property | Purpose |
|------|--------------|---------|
| Keep headings with content | `page-break-after: avoid` | Headings never orphaned at page bottom |
| Left-align table headers | `th { text-align: left }` | Professional, readable tables |
| Avoid breaking tables | `page-break-inside: avoid` | Tables stay together when possible |
| Control orphans/widows | `orphans: 3; widows: 3` | Minimum lines at page top/bottom |

### Shared Stylesheet Location

Store the universal stylesheet at:
```
~/.claude/Skills/CORE/pdf-styles.css
```

Reference in any markdown conversion:
```bash
bunx md-to-pdf document.md --stylesheet ~/.claude/Skills/CORE/pdf-styles.css
```

---

## Chrome Headless PDF Generation

For complex documents with embedded SVGs, images, and custom layouts, use Chrome headless for pixel-perfect PDF output.

### Chrome Headless Command

```bash
# Single file
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless \
  --disable-gpu \
  --no-pdf-header-footer \
  --print-to-pdf="output.pdf" \
  "file://$(pwd)/input.html"

# Batch conversion
cd /path/to/html && for f in *.html; do \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    --headless --disable-gpu --no-pdf-header-footer \
    --print-to-pdf="${f%.html}.pdf" "file://$(pwd)/$f" 2>/dev/null && \
  echo "Created: ${f%.html}.pdf"; \
done
```

### Key Chrome Flags

| Flag | Purpose |
|------|---------|
| `--headless` | Run without UI |
| `--disable-gpu` | Prevent GPU-related issues |
| `--no-pdf-header-footer` | **CRITICAL**: Removes browser date/URL/page numbers |
| `--print-to-pdf="file.pdf"` | Output path |

### Print-Ready HTML Template

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document Title</title>
  <style>
    @page {
      margin: 0.6in;
      size: letter;
    }

    @media print {
      html, body {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .no-print { display: none !important; }
      .page-break { page-break-before: always; }
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #333;
      max-width: 7in;
      margin: 0 auto;
      padding: 20px;
    }

    h1 {
      font-size: 22pt;
      color: #2d5a3d;
      border-bottom: 3px solid #2d5a3d;
      padding-bottom: 8px;
      margin-bottom: 5px;
    }

    h2 {
      font-size: 14pt;
      color: #3d7a5d;
      margin-top: 20px;
      margin-bottom: 10px;
      border-bottom: 1px solid #ddd;
      padding-bottom: 5px;
    }

    h3 {
      font-size: 12pt;
      color: #4d8a6d;
      margin-top: 15px;
      margin-bottom: 8px;
    }

    p { margin-bottom: 10px; }

    ul, ol {
      margin-left: 20px;
      margin-bottom: 12px;
    }

    li { margin-bottom: 5px; }

    table {
      border-collapse: collapse;
      width: 100%;
      margin: 15px 0;
      font-size: 10pt;
    }

    th, td {
      border: 1px solid #ddd;
      padding: 8px 10px;
      text-align: left;
    }

    th {
      background: #f5f5f5;
      font-weight: 600;
    }

    tr:nth-child(even) { background: #fafafa; }

    blockquote {
      border-left: 3px solid #2d5a3d;
      padding-left: 15px;
      margin: 15px 0;
      color: #555;
      font-style: italic;
    }

    /* Image containers for embedded SVGs */
    .image-container {
      text-align: center;
      margin: 20px 0;
      padding: 15px;
      background: #fafafa;
      border-radius: 8px;
    }

    .image-container img,
    .image-container svg {
      max-width: 100%;
      height: auto;
    }

    /* Callout boxes */
    .safety-box {
      background: #fff8e6;
      border: 1px solid #f0c36d;
      border-left: 4px solid #e6a817;
      padding: 12px 15px;
      margin: 15px 0;
      border-radius: 4px;
    }

    .tip-box {
      background: #e8f5e9;
      border: 1px solid #a5d6a7;
      border-left: 4px solid #2d5a3d;
      padding: 12px 15px;
      margin: 15px 0;
      border-radius: 4px;
    }

    .footer {
      margin-top: 30px;
      padding-top: 15px;
      border-top: 1px solid #ddd;
      font-size: 9pt;
      color: #888;
      font-style: italic;
      text-align: center;
    }
  </style>
</head>
<body>
  <!-- Content here -->
</body>
</html>
```

### SVG Best Practices for PDFs

1. **Split long text labels** - Break multi-word labels into separate `<text>` elements:
   ```xml
   <!-- BAD: May get clipped -->
   <text x="158" y="100">Shoulders relaxed</text>

   <!-- GOOD: Split into lines -->
   <text x="158" y="98">Shoulders</text>
   <text x="158" y="108">relaxed</text>
   ```

2. **Use viewBox for scaling** - Always include viewBox for responsive sizing:
   ```xml
   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 450 300" width="450" height="300">
   ```

3. **Embed SVGs directly** - Inline SVGs render better than `<img>` references:
   ```html
   <div class="image-container">
     <svg><!-- Full SVG content --></svg>
   </div>
   ```

4. **Light backgrounds for print** - Use `fill="#f8f9fa"` for SVG backgrounds (prints well)

### TypeScript/Bun Generator Pattern

For batch PDF generation with embedded images:

```typescript
#!/usr/bin/env bun
import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { join, basename } from "path";
import { existsSync } from "fs";

const CSS = `/* Print CSS here */`;

// Map lessons to their images
const lessonImages: Record<string, string[]> = {
  "lesson-01": ["diagram-1.svg"],
  "lesson-02": ["diagram-2.svg", "diagram-3.svg"],
};

async function loadSvg(filename: string): Promise<string> {
  const path = join(IMAGES_DIR, filename);
  return existsSync(path) ? await readFile(path, 'utf-8') : '';
}

async function generateHtml(mdContent: string, lessonName: string): Promise<string> {
  const images = lessonImages[lessonName] || [];
  let imageHtml = '';

  for (const img of images) {
    const svg = await loadSvg(img);
    if (svg) imageHtml += `<div class="image-container">${svg}</div>\n`;
  }

  // Convert markdown to HTML and inject images
  return `<!DOCTYPE html>...${imageHtml}...`;
}
```

### Workflow Summary

1. **Write content** in Markdown
2. **Create SVGs** for diagrams (use viewBox, split long labels)
3. **Generate HTML** with embedded CSS and inline SVGs
4. **Convert to PDF** with Chrome headless using `--no-pdf-header-footer`
