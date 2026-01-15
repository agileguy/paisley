#!/usr/bin/env bun

/**
 * ihealth - CLI for extracting health data from Google Drive
 *
 * Reads Health Auto Export JSON files from Google Drive's Health folder
 * and provides structured access to health metrics.
 *
 * Usage:
 *   ihealth sync                     Download latest health data from Google Drive
 *   ihealth list                     List available metrics in local data
 *   ihealth steps [--days N]         Get step count data
 *   ihealth heart [--days N]         Get heart rate data
 *   ihealth sleep [--days N]         Get sleep analysis
 *   ihealth workouts [--days N]      Get workout data
 *   ihealth bp [--days N]            Get blood pressure data
 *   ihealth summary [--days N]       Get health summary
 *   ihealth auth                     Authenticate with Google Drive
 *   ihealth --help                   Show help
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG_DIR = join(homedir(), '.config', 'ihealth');
const DATA_DIR = join(CONFIG_DIR, 'data');
const TOKEN_FILE = join(CONFIG_DIR, 'token.json');
const CREDENTIALS_FILE = join(CONFIG_DIR, 'credentials.json');
const API_KEY_FILE = join(CONFIG_DIR, 'api_key.json');

// Google Drive folder name to search for
const HEALTH_FOLDER_NAME = 'Health';

// Default number of days to show
const DEFAULT_DAYS = 7;

// Environment variable names
const ENV = {
  CLIENT_ID: 'IHEALTH_CLIENT_ID',
  CLIENT_SECRET: 'IHEALTH_CLIENT_SECRET',
  API_KEY: 'IHEALTH_API_KEY',
  ACCESS_TOKEN: 'IHEALTH_ACCESS_TOKEN',
  REFRESH_TOKEN: 'IHEALTH_REFRESH_TOKEN',
};

// ============================================================================
// Types
// ============================================================================

interface HealthMetric {
  name: string;
  units: string;
  data: Array<{
    qty: number;
    date: string;
  }>;
}

interface HeartRateMetric {
  name: string;
  units: string;
  data: Array<{
    date: string;
    Min: number;
    Avg: number;
    Max: number;
  }>;
}

interface BloodPressureMetric {
  name: string;
  units: string;
  data: Array<{
    date: string;
    systolic: number;
    diastolic: number;
  }>;
}

interface SleepMetric {
  name: string;
  data: Array<{
    date: string;
    totalSleep?: number;
    asleep?: number;
    core?: number;
    deep?: number;
    rem?: number;
    inBed?: number;
    sleepStart?: string;
    sleepEnd?: string;
  }>;
}

interface Workout {
  id: string;
  name: string;
  start: string;
  end: string;
  duration: number;
  location?: string;
  activeEnergyBurned?: { qty: number; units: string };
  distance?: { qty: number; units: string };
  heartRateData?: Array<{ date: string; Min: number; Avg: number; Max: number }>;
}

interface HealthData {
  data: {
    metrics: Array<HealthMetric | HeartRateMetric | BloodPressureMetric | SleepMetric>;
    workouts: Workout[];
  };
}

interface GoogleCredentials {
  installed?: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
  };
  web?: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
  };
}

interface TokenData {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
}

// ============================================================================
// Utility Functions
// ============================================================================

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function parseDate(dateStr: string): Date {
  // Handle "yyyy-MM-dd HH:mm:ss Z" format
  return new Date(dateStr);
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function filterByDays<T extends { date: string }>(data: T[], days: number): T[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return data.filter(d => parseDate(d.date) >= cutoff);
}

function loadLocalData(): HealthData | null {
  const files = existsSync(DATA_DIR) ? readdirSync(DATA_DIR).filter(f => f.endsWith('.json')) : [];
  if (files.length === 0) return null;

  // Sort by filename (assuming date-based naming) and get most recent
  files.sort().reverse();

  // Merge all data files - combine metrics with same name
  const metricsByName = new Map<string, HealthData['data']['metrics'][0]>();
  const allWorkouts: Workout[] = [];
  const seenWorkoutIds = new Set<string>();

  for (const file of files) {
    try {
      const content = readFileSync(join(DATA_DIR, file), 'utf-8');
      const data: HealthData = JSON.parse(content);

      // Merge metrics by name, combining data arrays
      if (data.data?.metrics) {
        for (const metric of data.data.metrics) {
          const existing = metricsByName.get(metric.name);
          if (existing) {
            // Merge data arrays, deduplicating by date
            const existingDates = new Set((existing as any).data.map((d: any) => d.date));
            const newData = (metric as any).data.filter((d: any) => !existingDates.has(d.date));
            (existing as any).data.push(...newData);
          } else {
            // Clone the metric to avoid mutating original
            metricsByName.set(metric.name, { ...metric, data: [...(metric as any).data] } as any);
          }
        }
      }

      // Deduplicate workouts by ID
      if (data.data?.workouts) {
        for (const workout of data.data.workouts) {
          if (!seenWorkoutIds.has(workout.id)) {
            seenWorkoutIds.add(workout.id);
            allWorkouts.push(workout);
          }
        }
      }
    } catch (e) {
      // Skip invalid files
    }
  }

  return {
    data: {
      metrics: Array.from(metricsByName.values()),
      workouts: allWorkouts
    }
  };
}

function getMetricByName(data: HealthData, name: string, exact = false): HealthMetric | HeartRateMetric | BloodPressureMetric | SleepMetric | null {
  // Try exact match first
  let metric = data.data.metrics.find(m => m.name.toLowerCase() === name.toLowerCase());

  // Fall back to includes match if not exact mode
  if (!metric && !exact) {
    metric = data.data.metrics.find(m =>
      m.name.toLowerCase().includes(name.toLowerCase())
    );
  }
  return metric || null;
}

// ============================================================================
// Google Drive API Functions
// ============================================================================

function getApiKey(): string | null {
  // Check env first
  if (process.env[ENV.API_KEY]) {
    return process.env[ENV.API_KEY]!;
  }
  // Then check file
  if (existsSync(API_KEY_FILE)) {
    try {
      const data = JSON.parse(readFileSync(API_KEY_FILE, 'utf-8'));
      return data.api_key || null;
    } catch {
      return null;
    }
  }
  return null;
}

async function getCredentials(): Promise<GoogleCredentials | null> {
  // Check env first
  const clientId = process.env[ENV.CLIENT_ID];
  const clientSecret = process.env[ENV.CLIENT_SECRET];

  if (clientId && clientSecret) {
    return {
      installed: {
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uris: ['http://localhost']
      }
    };
  }

  // Fall back to file
  if (!existsSync(CREDENTIALS_FILE)) {
    return null;
  }
  return JSON.parse(readFileSync(CREDENTIALS_FILE, 'utf-8'));
}

async function getToken(): Promise<TokenData | null> {
  // Check env first
  const accessToken = process.env[ENV.ACCESS_TOKEN];
  const refreshToken = process.env[ENV.REFRESH_TOKEN];

  if (accessToken && refreshToken) {
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: Date.now() + 3600000 // Assume 1 hour if from env
    };
  }

  // Fall back to file
  if (!existsSync(TOKEN_FILE)) {
    return null;
  }
  return JSON.parse(readFileSync(TOKEN_FILE, 'utf-8'));
}

async function saveToken(token: TokenData): Promise<void> {
  writeFileSync(TOKEN_FILE, JSON.stringify(token, null, 2));
}

async function refreshAccessToken(credentials: GoogleCredentials, token: TokenData): Promise<TokenData> {
  const config = credentials.installed || credentials.web;
  if (!config) throw new Error('Invalid credentials format');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.client_id,
      client_secret: config.client_secret,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token'
    })
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.statusText}`);
  }

  const newToken = await response.json() as { access_token: string; expires_in: number };
  const updatedToken: TokenData = {
    ...token,
    access_token: newToken.access_token,
    expiry_date: Date.now() + (newToken.expires_in * 1000)
  };

  await saveToken(updatedToken);
  return updatedToken;
}

async function getValidToken(): Promise<{ token: TokenData; credentials: GoogleCredentials }> {
  const credentials = await getCredentials();
  if (!credentials) {
    throw new Error('No credentials found. Run: ihealth auth');
  }

  let token = await getToken();
  if (!token) {
    throw new Error('Not authenticated. Run: ihealth auth');
  }

  // Refresh if expired (with 5 min buffer)
  if (token.expiry_date < Date.now() + 300000) {
    token = await refreshAccessToken(credentials, token);
  }

  return { token, credentials };
}

async function findHealthFolder(accessToken: string): Promise<string | null> {
  const query = encodeURIComponent(`name='${HEALTH_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder'`);
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to search Drive: ${response.statusText}`);
  }

  const result = await response.json() as { files: Array<{ id: string; name: string }> };
  return result.files[0]?.id || null;
}

async function listFilesInFolder(accessToken: string, folderId: string): Promise<Array<{ id: string; name: string; modifiedTime: string }>> {
  // Support both application/json and text/json MIME types
  const query = encodeURIComponent(`'${folderId}' in parents and (mimeType='application/json' or mimeType='text/json' or name contains '.json')`);
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=30`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to list files: ${response.statusText}`);
  }

  const result = await response.json() as { files: Array<{ id: string; name: string; modifiedTime: string }> };
  return result.files;
}

async function downloadFile(accessToken: string, fileId: string): Promise<string> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }

  return response.text();
}

// ============================================================================
// Commands
// ============================================================================

async function cmdAuth(): Promise<void> {
  ensureConfigDir();

  const credentials = await getCredentials();
  if (!credentials) {
    console.log(`
Setup Google Drive API access:

1. Go to https://console.cloud.google.com/apis/credentials
2. Create a new project (or select existing)
3. Enable the Google Drive API
4. Create OAuth 2.0 credentials (Desktop app)
5. Download the credentials JSON
6. Save it to: ${CREDENTIALS_FILE}

Then run: ihealth auth
`);
    return;
  }

  const config = credentials.installed || credentials.web;
  if (!config) {
    console.error('Invalid credentials format');
    process.exit(1);
  }

  // Generate auth URL
  const scopes = encodeURIComponent('https://www.googleapis.com/auth/drive.readonly');
  const redirectUri = encodeURIComponent(config.redirect_uris[0] || 'urn:ietf:wg:oauth:2.0:oob');
  const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${config.client_id}&redirect_uri=${redirectUri}&response_type=code&scope=${scopes}&access_type=offline&prompt=consent`;

  console.log(`
Open this URL in your browser to authorize:

${authUrl}

After authorizing, you'll get a code. Run:
  ihealth auth --code YOUR_CODE
`);
}

async function cmdAuthWithCode(code: string): Promise<void> {
  const credentials = await getCredentials();
  if (!credentials) {
    console.error('No credentials found. Run: ihealth auth');
    process.exit(1);
  }

  const config = credentials.installed || credentials.web;
  if (!config) {
    console.error('Invalid credentials format');
    process.exit(1);
  }

  const redirectUri = config.redirect_uris[0] || 'urn:ietf:wg:oauth:2.0:oob';

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.client_id,
      client_secret: config.client_secret,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`Authentication failed: ${error}`);
    process.exit(1);
  }

  const tokenData = await response.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const token: TokenData = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expiry_date: Date.now() + (tokenData.expires_in * 1000)
  };

  await saveToken(token);
  console.log('Authentication successful! Token saved.');
  console.log('Run: ihealth sync');
}

async function cmdSync(): Promise<void> {
  ensureConfigDir();

  console.log('Syncing health data from Google Drive...');

  const { token } = await getValidToken();

  // Find Health folder
  const folderId = await findHealthFolder(token.access_token);
  if (!folderId) {
    console.error(`Folder "${HEALTH_FOLDER_NAME}" not found in Google Drive`);
    process.exit(1);
  }

  console.log(`Found Health folder: ${folderId}`);

  // List JSON files
  const files = await listFilesInFolder(token.access_token, folderId);
  if (files.length === 0) {
    console.log('No JSON files found in Health folder');
    return;
  }

  console.log(`Found ${files.length} health data files`);

  // Download recent files (last 7 days worth)
  let downloaded = 0;
  for (const file of files.slice(0, 7)) {
    const localPath = join(DATA_DIR, file.name);
    if (existsSync(localPath)) {
      console.log(`  Skipping (exists): ${file.name}`);
      continue;
    }

    console.log(`  Downloading: ${file.name}`);
    const content = await downloadFile(token.access_token, file.id);
    writeFileSync(localPath, content);
    downloaded++;
  }

  console.log(`\nSync complete. Downloaded ${downloaded} new files.`);
  console.log(`Data stored in: ${DATA_DIR}`);
}

function cmdList(): void {
  const data = loadLocalData();
  if (!data) {
    console.error('No local data. Run: ihealth sync');
    process.exit(1);
  }

  console.log('Available metrics:\n');

  const metricNames = new Set<string>();
  for (const metric of data.data.metrics) {
    metricNames.add(metric.name);
  }

  const sorted = Array.from(metricNames).sort();
  for (const name of sorted) {
    console.log(`  - ${name}`);
  }

  console.log(`\nWorkouts: ${data.data.workouts.length} total`);
}

function cmdSteps(days: number): void {
  const data = loadLocalData();
  if (!data) {
    console.error('No local data. Run: ihealth sync');
    process.exit(1);
  }

  const metric = getMetricByName(data, 'step') as HealthMetric | null;
  if (!metric) {
    console.error('No step data found');
    process.exit(1);
  }

  const filtered = filterByDays(metric.data, days);

  // Aggregate by day
  const byDay = new Map<string, number>();
  for (const d of filtered) {
    const day = formatDate(parseDate(d.date));
    byDay.set(day, (byDay.get(day) || 0) + d.qty);
  }

  const result = {
    metric: 'steps',
    units: metric.units,
    days: days,
    data: Array.from(byDay.entries()).map(([date, qty]) => ({ date, qty: Math.round(qty) })).sort((a, b) => a.date.localeCompare(b.date))
  };

  console.log(JSON.stringify(result, null, 2));
}

function cmdHeart(days: number): void {
  const data = loadLocalData();
  if (!data) {
    console.error('No local data. Run: ihealth sync');
    process.exit(1);
  }

  const metric = getMetricByName(data, 'heart_rate', true) as HeartRateMetric | null;
  if (!metric) {
    console.error('No heart rate data found');
    process.exit(1);
  }

  const filtered = filterByDays(metric.data, days);

  const result = {
    metric: 'heart_rate',
    units: metric.units || 'bpm',
    days: days,
    data: filtered.map(d => ({
      date: d.date,
      min: d.Min,
      avg: d.Avg,
      max: d.Max
    })).sort((a, b) => a.date.localeCompare(b.date))
  };

  console.log(JSON.stringify(result, null, 2));
}

function cmdSleep(days: number): void {
  const data = loadLocalData();
  if (!data) {
    console.error('No local data. Run: ihealth sync');
    process.exit(1);
  }

  const metric = getMetricByName(data, 'sleep_analysis', true) as SleepMetric | null;
  if (!metric) {
    console.error('No sleep data found');
    process.exit(1);
  }

  const filtered = filterByDays(metric.data, days);

  const result = {
    metric: 'sleep',
    units: 'hours',
    days: days,
    data: filtered.map(d => ({
      date: d.date,
      total: d.totalSleep ? +d.totalSleep.toFixed(2) : null,
      deep: d.deep ? +d.deep.toFixed(2) : null,
      rem: d.rem ? +d.rem.toFixed(2) : null,
      core: d.core ? +d.core.toFixed(2) : null,
      inBed: d.inBed ? +d.inBed.toFixed(2) : null
    })).sort((a, b) => a.date.localeCompare(b.date))
  };

  console.log(JSON.stringify(result, null, 2));
}

function cmdWorkouts(days: number): void {
  const data = loadLocalData();
  if (!data) {
    console.error('No local data. Run: ihealth sync');
    process.exit(1);
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const filtered = data.data.workouts.filter(w => parseDate(w.start) >= cutoff);

  const result = {
    metric: 'workouts',
    days: days,
    count: filtered.length,
    data: filtered.map(w => ({
      name: w.name,
      date: w.start,
      duration_min: Math.round(w.duration / 60),
      calories: w.activeEnergyBurned?.qty || null,
      distance: w.distance ? { qty: w.distance.qty, units: w.distance.units } : null,
      location: w.location || null
    })).sort((a, b) => a.date.localeCompare(b.date))
  };

  console.log(JSON.stringify(result, null, 2));
}

function cmdBloodPressure(days: number): void {
  const data = loadLocalData();
  if (!data) {
    console.error('No local data. Run: ihealth sync');
    process.exit(1);
  }

  const metric = getMetricByName(data, 'blood_pressure') as BloodPressureMetric | null;
  if (!metric) {
    console.error('No blood pressure data found');
    process.exit(1);
  }

  const filtered = filterByDays(metric.data, days);

  const result = {
    metric: 'blood_pressure',
    units: 'mmHg',
    days: days,
    data: filtered.map(d => ({
      date: d.date,
      systolic: d.systolic,
      diastolic: d.diastolic
    })).sort((a, b) => a.date.localeCompare(b.date))
  };

  console.log(JSON.stringify(result, null, 2));
}

function cmdSummary(days: number): void {
  const data = loadLocalData();
  if (!data) {
    console.error('No local data. Run: ihealth sync');
    process.exit(1);
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  // Steps
  const stepsMetric = getMetricByName(data, 'step') as HealthMetric | null;
  let totalSteps = 0;
  let stepDays = 0;
  if (stepsMetric) {
    const filtered = filterByDays(stepsMetric.data, days);
    const byDay = new Map<string, number>();
    for (const d of filtered) {
      const day = formatDate(parseDate(d.date));
      byDay.set(day, (byDay.get(day) || 0) + d.qty);
    }
    totalSteps = Array.from(byDay.values()).reduce((a, b) => a + b, 0);
    stepDays = byDay.size;
  }

  // Heart rate
  const heartMetric = getMetricByName(data, 'heart_rate') as HeartRateMetric | null;
  let avgHeartRate = null;
  if (heartMetric) {
    const filtered = filterByDays(heartMetric.data, days);
    if (filtered.length > 0) {
      avgHeartRate = Math.round(filtered.reduce((sum, d) => sum + d.Avg, 0) / filtered.length);
    }
  }

  // Sleep
  const sleepMetric = getMetricByName(data, 'sleep_analysis', true) as SleepMetric | null;
  let avgSleep = null;
  if (sleepMetric) {
    const filtered = filterByDays(sleepMetric.data, days);
    const sleepHours = filtered.filter(d => d.totalSleep).map(d => d.totalSleep!);
    if (sleepHours.length > 0) {
      avgSleep = +(sleepHours.reduce((a, b) => a + b, 0) / sleepHours.length).toFixed(2);
    }
  }

  // Workouts
  const workouts = data.data.workouts.filter(w => parseDate(w.start) >= cutoff);

  const summary = {
    period: `${days} days`,
    generated: new Date().toISOString(),
    steps: {
      total: Math.round(totalSteps),
      daily_avg: stepDays > 0 ? Math.round(totalSteps / stepDays) : null,
      days_with_data: stepDays
    },
    heart_rate: {
      avg_bpm: avgHeartRate
    },
    sleep: {
      avg_hours: avgSleep
    },
    workouts: {
      count: workouts.length,
      types: [...new Set(workouts.map(w => w.name))]
    }
  };

  console.log(JSON.stringify(summary, null, 2));
}

function showHelp(): void {
  console.log(`
ihealth - CLI for extracting health data from Google Drive

USAGE:
  ihealth <command> [options]

COMMANDS:
  auth                  Authenticate with Google Drive
  auth --code CODE      Complete authentication with auth code
  sync                  Download latest health data from Google Drive
  list                  List available metrics in local data
  steps [--days N]      Get step count data (default: 7 days)
  heart [--days N]      Get heart rate data
  sleep [--days N]      Get sleep analysis
  workouts [--days N]   Get workout data
  bp [--days N]         Get blood pressure data
  summary [--days N]    Get health summary

OPTIONS:
  --days N              Number of days to include (default: 7)
  --help, -h            Show this help

SETUP:
  1. Create Google Cloud project at console.cloud.google.com
  2. Enable Google Drive API
  3. Create OAuth credentials (Desktop app type)
  4. Download credentials.json to ~/.config/ihealth/
  5. Run: ihealth auth

EXAMPLES:
  ihealth sync                    # Download latest data
  ihealth summary                 # Last 7 days summary
  ihealth steps --days 30         # Steps for last 30 days
  ihealth workouts --days 14      # Workouts for last 2 weeks
  ihealth sleep | jq '.data[]'    # Sleep data piped to jq
`);
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    showHelp();
    process.exit(0);
  }

  // Parse --days option
  let days = DEFAULT_DAYS;
  const daysIndex = args.indexOf('--days');
  if (daysIndex !== -1 && args[daysIndex + 1]) {
    days = parseInt(args[daysIndex + 1], 10);
    if (isNaN(days) || days < 1) {
      console.error('Invalid --days value');
      process.exit(1);
    }
  }

  const command = args[0];

  try {
    switch (command) {
      case 'auth':
        if (args.includes('--code')) {
          const codeIndex = args.indexOf('--code');
          const code = args[codeIndex + 1];
          if (!code) {
            console.error('Missing auth code');
            process.exit(1);
          }
          await cmdAuthWithCode(code);
        } else {
          await cmdAuth();
        }
        break;

      case 'sync':
        await cmdSync();
        break;

      case 'list':
        cmdList();
        break;

      case 'steps':
        cmdSteps(days);
        break;

      case 'heart':
        cmdHeart(days);
        break;

      case 'sleep':
        cmdSleep(days);
        break;

      case 'workouts':
        cmdWorkouts(days);
        break;

      case 'bp':
      case 'blood-pressure':
        cmdBloodPressure(days);
        break;

      case 'summary':
        cmdSummary(days);
        break;

      default:
        console.error(`Unknown command: ${command}`);
        console.error('Run: ihealth --help');
        process.exit(1);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error('An unexpected error occurred');
    }
    process.exit(1);
  }
}

main();
