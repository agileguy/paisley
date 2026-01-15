#!/usr/bin/env bun

/**
 * Colored ASCII sleep chart
 * Run: bun ~/.claude/Tools/ihealth/sleep-chart.ts
 */

import { homedir } from 'os';
import { join } from 'path';
import { readFileSync, readdirSync, existsSync } from 'fs';

const CONFIG_DIR = join(homedir(), '.config', 'ihealth');
const DATA_DIR = join(CONFIG_DIR, 'data');

// Load and merge data (same logic as ihealth.ts)
function loadData() {
  const files = existsSync(DATA_DIR) ? readdirSync(DATA_DIR).filter(f => f.endsWith('.json')) : [];
  if (files.length === 0) return null;
  files.sort().reverse();

  const metricsByName = new Map();
  for (const file of files) {
    try {
      const content = readFileSync(join(DATA_DIR, file), 'utf-8');
      const data = JSON.parse(content);
      if (data.data?.metrics) {
        for (const metric of data.data.metrics) {
          const existing = metricsByName.get(metric.name);
          if (existing) {
            const existingDates = new Set(existing.data.map((d: any) => d.date));
            const newData = metric.data.filter((d: any) => !existingDates.has(d.date));
            existing.data.push(...newData);
          } else {
            metricsByName.set(metric.name, { ...metric, data: [...metric.data] });
          }
        }
      }
    } catch (e) {}
  }
  return metricsByName.get('sleep_analysis');
}

const sleepMetric = loadData();
if (!sleepMetric) {
  console.error('No sleep data found. Run: ihealth sync');
  process.exit(1);
}

// Filter to last 7 days
const cutoff = new Date();
cutoff.setDate(cutoff.getDate() - 7);
const data = sleepMetric.data
  .filter((d: any) => new Date(d.date) >= cutoff)
  .sort((a: any, b: any) => a.date.localeCompare(b.date));

// ANSI colors
const c = {
  deep: '\x1b[38;5;33m',   // Blue
  rem: '\x1b[38;5;135m',   // Purple
  core: '\x1b[38;5;44m',   // Cyan
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  green: '\x1b[38;5;40m',
  yellow: '\x1b[38;5;220m',
  red: '\x1b[38;5;196m',
  white: '\x1b[38;5;255m',
  box: '\x1b[38;5;240m',
};

const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

console.log();
console.log(c.white + c.bold + '  ╔════════════════════════════════════════════════════════════════╗' + c.reset);
console.log(c.white + c.bold + '  ║              💤  WEEKLY SLEEP SUMMARY  💤                      ║' + c.reset);
console.log(c.white + c.bold + '  ╚════════════════════════════════════════════════════════════════╝' + c.reset);
console.log();

const scale = 2;

data.forEach((d: any) => {
  const dateObj = new Date(d.date);
  const day = days[dateObj.getDay()];
  const dateStr = d.date.split(' ')[0].slice(5);

  const deep = Math.round((d.deep || 0) * scale);
  const rem = Math.round((d.rem || 0) * scale);
  const core = Math.round((d.core || 0) * scale);

  const coreBar = c.core + '█'.repeat(core) + c.reset;
  const remBar = c.rem + '█'.repeat(rem) + c.reset;
  const deepBar = c.deep + '█'.repeat(deep) + c.reset;

  const total = d.totalSleep || 0;
  let statusColor = c.red;
  let status = '✗';
  if (total >= 7) { statusColor = c.green; status = '✓'; }
  else if (total >= 5) { statusColor = c.yellow; status = '~'; }

  const totalStr = total.toFixed(1).padStart(4) + 'h';
  const barStr = coreBar + remBar + deepBar;

  console.log(`  ${c.dim}${day} ${dateStr}${c.reset} ${c.box}│${c.reset}${barStr}${c.box}│${c.reset} ${statusColor}${c.bold}${totalStr}${c.reset} ${statusColor}${status}${c.reset}`);
});

console.log();
console.log(c.dim + '            0    2    4    6    8   10   12 hours' + c.reset);
console.log(c.dim + '            ├────┼────┼────┼────┼────┼────┤' + c.reset);
console.log();
console.log(`  ${c.bold}Legend:${c.reset}  ${c.core}██${c.reset} Core   ${c.rem}██${c.reset} REM   ${c.deep}██${c.reset} Deep`);
console.log();

const totals = data.map((d: any) => d.totalSleep || 0);
const avg = totals.reduce((a: number, b: number) => a + b, 0) / totals.length;
const min = Math.min(...totals);
const max = Math.max(...totals);
const minDay = data.find((d: any) => (d.totalSleep || 0) === min);
const maxDay = data.find((d: any) => (d.totalSleep || 0) === max);

console.log(c.box + '  ┌───────────────────────────────────────┐' + c.reset);
console.log(c.box + '  │' + c.reset + c.bold + '           WEEKLY STATS                ' + c.reset + c.box + '│' + c.reset);
console.log(c.box + '  ├───────────────────────────────────────┤' + c.reset);
console.log(c.box + '  │' + c.reset + `  Average:  ${c.yellow}${c.bold}${avg.toFixed(1)}h${c.reset}  ${c.dim}(target: 7-9h)${c.reset}     ` + c.box + '│' + c.reset);
console.log(c.box + '  │' + c.reset + `  Best:     ${c.green}${c.bold}${max.toFixed(1)}h${c.reset}  ${c.dim}(${maxDay?.date.split(' ')[0].slice(5)})${c.reset}          ` + c.box + '│' + c.reset);
console.log(c.box + '  │' + c.reset + `  Worst:    ${c.red}${c.bold}${min.toFixed(1)}h${c.reset}  ${c.dim}(${minDay?.date.split(' ')[0].slice(5)})${c.reset}          ` + c.box + '│' + c.reset);
console.log(c.box + '  └───────────────────────────────────────┘' + c.reset);
console.log();

const deficit = (7 * 7) - totals.reduce((a: number, b: number) => a + b, 0);
if (deficit > 0) {
  console.log(`  ${c.red}${c.bold}⚠  Sleep debt this week: ${deficit.toFixed(1)} hours${c.reset}`);
} else {
  console.log(`  ${c.green}${c.bold}✓  No sleep debt this week!${c.reset}`);
}
console.log();
