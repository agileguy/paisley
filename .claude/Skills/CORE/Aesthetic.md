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
