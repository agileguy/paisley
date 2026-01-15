#!/usr/bin/env bun

/**
 * ihealth-prometheus - Push health metrics to Prometheus via Remote Write
 *
 * Reads local ihealth data and pushes directly to Prometheus using the
 * Remote Write API (no Pushgateway required).
 *
 * Usage:
 *   ihealth-prometheus                              Push metrics
 *   ihealth-prometheus --endpoint https://prom/api/v1/write
 *   ihealth-prometheus --dry-run                    Show metrics without pushing
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import snappyjs from 'snappyjs';
import protobuf from 'protobufjs';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG_DIR = join(homedir(), '.config', 'ihealth');
const DATA_DIR = join(CONFIG_DIR, 'data');
const PROMETHEUS_CONFIG_FILE = join(CONFIG_DIR, 'prometheus.json');

const DEFAULT_ENDPOINT = 'http://localhost:9090/api/v1/write';
const DEFAULT_JOB = 'ihealth';
const DEFAULT_INSTANCE = homedir().split('/').pop() || 'default';

interface PrometheusConfig {
  endpoint: string;
  job: string;
  instance: string;
  basic_auth?: {
    username: string;
    password: string;
  };
  bearer_token?: string;
}

// ============================================================================
// Types (same as ihealth.ts)
// ============================================================================

interface HealthMetric {
  name: string;
  units: string;
  data: Array<{ qty: number; date: string }>;
}

interface HeartRateMetric {
  name: string;
  units: string;
  data: Array<{ date: string; Min: number; Avg: number; Max: number }>;
}

interface SleepMetric {
  name: string;
  data: Array<{
    date: string;
    totalSleep?: number;
    deep?: number;
    rem?: number;
    core?: number;
    inBed?: number;
  }>;
}

interface BloodPressureMetric {
  name: string;
  units: string;
  data: Array<{ date: string; systolic: number; diastolic: number }>;
}

interface Workout {
  id: string;
  name: string;
  start: string;
  duration: number;
  activeEnergyBurned?: { qty: number };
  distance?: { qty: number; units: string };
}

interface HealthData {
  data: {
    metrics: Array<HealthMetric | HeartRateMetric | SleepMetric | BloodPressureMetric>;
    workouts: Workout[];
  };
}

// ============================================================================
// Data Loading (same as ihealth.ts)
// ============================================================================

function loadLocalData(): HealthData | null {
  const files = existsSync(DATA_DIR) ? readdirSync(DATA_DIR).filter(f => f.endsWith('.json')) : [];
  if (files.length === 0) return null;

  files.sort().reverse();

  const metricsByName = new Map<string, HealthData['data']['metrics'][0]>();
  const allWorkouts: Workout[] = [];
  const seenWorkoutIds = new Set<string>();

  for (const file of files) {
    try {
      const content = readFileSync(join(DATA_DIR, file), 'utf-8');
      const data: HealthData = JSON.parse(content);

      if (data.data?.metrics) {
        for (const metric of data.data.metrics) {
          const existing = metricsByName.get(metric.name);
          if (existing) {
            const existingDates = new Set((existing as any).data.map((d: any) => d.date));
            const newData = (metric as any).data.filter((d: any) => !existingDates.has(d.date));
            (existing as any).data.push(...newData);
          } else {
            metricsByName.set(metric.name, { ...metric, data: [...(metric as any).data] } as any);
          }
        }
      }

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

function getMetricByName(data: HealthData, name: string): any {
  return data.data.metrics.find(m => m.name.toLowerCase() === name.toLowerCase()) || null;
}

function getMostRecent<T extends { date: string }>(data: T[]): T | null {
  if (!data || data.length === 0) return null;
  return data.sort((a, b) => b.date.localeCompare(a.date))[0];
}

function getTodayData<T extends { date: string }>(data: T[]): T | null {
  const today = new Date().toISOString().split('T')[0];
  return data.find(d => d.date.startsWith(today)) || getMostRecent(data);
}

// ============================================================================
// Prometheus Remote Write Protocol
// ============================================================================

interface Label {
  name: string;
  value: string;
}

interface Sample {
  value: number;
  timestamp: number | Long;
}

interface TimeSeries {
  labels: Label[];
  samples: Sample[];
}

// Prometheus remote write protobuf schema
const protoSchema = `
syntax = "proto3";

message WriteRequest {
  repeated TimeSeries timeseries = 1;
}

message TimeSeries {
  repeated Label labels = 1;
  repeated Sample samples = 2;
}

message Label {
  string name = 1;
  string value = 2;
}

message Sample {
  double value = 1;
  int64 timestamp = 2;
}
`;

// Parse proto schema once
let WriteRequest: protobuf.Type | null = null;

function getWriteRequestType(): protobuf.Type {
  if (!WriteRequest) {
    const root = protobuf.parse(protoSchema).root;
    WriteRequest = root.lookupType('WriteRequest');
  }
  return WriteRequest;
}

function encodeWriteRequest(timeseries: TimeSeries[]): Uint8Array {
  const WriteRequestType = getWriteRequestType();
  const message = WriteRequestType.create({ timeseries });
  return WriteRequestType.encode(message).finish();
}

// ============================================================================
// Metric Building
// ============================================================================

interface MetricDef {
  name: string;
  value: number;
  labels?: Record<string, string>;
}

function buildTimeSeries(metrics: MetricDef[], config: PrometheusConfig): TimeSeries[] {
  const timestamp = Date.now();

  return metrics.map(metric => {
    const labels: Label[] = [
      { name: '__name__', value: metric.name },
      { name: 'job', value: config.job },
      { name: 'instance', value: config.instance }
    ];

    if (metric.labels) {
      for (const [name, value] of Object.entries(metric.labels)) {
        labels.push({ name, value });
      }
    }

    // Sort labels by name (required by Prometheus)
    labels.sort((a, b) => a.name.localeCompare(b.name));

    return {
      labels,
      samples: [{ value: metric.value, timestamp }]
    };
  });
}

function buildMetrics(data: HealthData): MetricDef[] {
  const metrics: MetricDef[] = [];

  // Steps
  const stepsMetric = getMetricByName(data, 'step_count') as HealthMetric | null;
  if (stepsMetric) {
    const today = getTodayData(stepsMetric.data);
    if (today) {
      metrics.push({ name: 'ihealth_steps_total', value: Math.round(today.qty) });
    }
    const recent = stepsMetric.data.slice(0, 7);
    if (recent.length > 0) {
      const avg = recent.reduce((sum, d) => sum + d.qty, 0) / recent.length;
      metrics.push({ name: 'ihealth_steps_7day_avg', value: Math.round(avg) });
    }
  }

  // Heart Rate
  const heartMetric = getMetricByName(data, 'heart_rate') as HeartRateMetric | null;
  if (heartMetric) {
    const today = getTodayData(heartMetric.data);
    if (today) {
      metrics.push({ name: 'ihealth_heart_rate_bpm', value: today.Avg, labels: { type: 'avg' } });
      metrics.push({ name: 'ihealth_heart_rate_bpm', value: today.Min, labels: { type: 'min' } });
      metrics.push({ name: 'ihealth_heart_rate_bpm', value: today.Max, labels: { type: 'max' } });
    }
  }

  // Resting Heart Rate
  const restingHrMetric = getMetricByName(data, 'resting_heart_rate') as HealthMetric | null;
  if (restingHrMetric) {
    const today = getTodayData(restingHrMetric.data);
    if (today) {
      metrics.push({ name: 'ihealth_resting_heart_rate_bpm', value: Math.round(today.qty) });
    }
  }

  // Sleep
  const sleepMetric = getMetricByName(data, 'sleep_analysis') as SleepMetric | null;
  if (sleepMetric) {
    const today = getTodayData(sleepMetric.data);
    if (today) {
      if (today.totalSleep !== undefined) {
        metrics.push({ name: 'ihealth_sleep_hours', value: +today.totalSleep.toFixed(2), labels: { stage: 'total' } });
      }
      if (today.deep !== undefined) {
        metrics.push({ name: 'ihealth_sleep_hours', value: +today.deep.toFixed(2), labels: { stage: 'deep' } });
      }
      if (today.rem !== undefined) {
        metrics.push({ name: 'ihealth_sleep_hours', value: +today.rem.toFixed(2), labels: { stage: 'rem' } });
      }
      if (today.core !== undefined) {
        metrics.push({ name: 'ihealth_sleep_hours', value: +today.core.toFixed(2), labels: { stage: 'core' } });
      }
    }
    const recent = sleepMetric.data.filter(d => d.totalSleep).slice(0, 7);
    if (recent.length > 0) {
      const avg = recent.reduce((sum, d) => sum + (d.totalSleep || 0), 0) / recent.length;
      metrics.push({ name: 'ihealth_sleep_7day_avg_hours', value: +avg.toFixed(2) });
    }
  }

  // Blood Pressure
  const bpMetric = getMetricByName(data, 'blood_pressure') as BloodPressureMetric | null;
  if (bpMetric && bpMetric.data.length > 0) {
    const today = getTodayData(bpMetric.data);
    if (today) {
      metrics.push({ name: 'ihealth_blood_pressure_mmhg', value: today.systolic, labels: { type: 'systolic' } });
      metrics.push({ name: 'ihealth_blood_pressure_mmhg', value: today.diastolic, labels: { type: 'diastolic' } });
    }
  }

  // Active Energy
  const activeEnergyMetric = getMetricByName(data, 'active_energy') as HealthMetric | null;
  if (activeEnergyMetric) {
    const today = getTodayData(activeEnergyMetric.data);
    if (today) {
      metrics.push({ name: 'ihealth_active_energy_kcal', value: Math.round(today.qty) });
    }
  }

  // Walking/Running Distance
  const distanceMetric = getMetricByName(data, 'walking_running_distance') as HealthMetric | null;
  if (distanceMetric) {
    const today = getTodayData(distanceMetric.data);
    if (today) {
      metrics.push({ name: 'ihealth_distance_km', value: +today.qty.toFixed(2) });
    }
  }

  // Flights Climbed
  const flightsMetric = getMetricByName(data, 'flights_climbed') as HealthMetric | null;
  if (flightsMetric) {
    const today = getTodayData(flightsMetric.data);
    if (today) {
      metrics.push({ name: 'ihealth_flights_climbed', value: Math.round(today.qty) });
    }
  }

  // VO2 Max
  const vo2Metric = getMetricByName(data, 'vo2_max') as HealthMetric | null;
  if (vo2Metric) {
    const today = getTodayData(vo2Metric.data);
    if (today) {
      metrics.push({ name: 'ihealth_vo2_max', value: +today.qty.toFixed(1) });
    }
  }

  // HRV
  const hrvMetric = getMetricByName(data, 'heart_rate_variability') as HealthMetric | null;
  if (hrvMetric) {
    const today = getTodayData(hrvMetric.data);
    if (today) {
      metrics.push({ name: 'ihealth_hrv_ms', value: Math.round(today.qty) });
    }
  }

  // Blood Oxygen
  const oxygenMetric = getMetricByName(data, 'blood_oxygen_saturation') as HealthMetric | null;
  if (oxygenMetric) {
    const today = getTodayData(oxygenMetric.data);
    if (today) {
      metrics.push({ name: 'ihealth_blood_oxygen_percent', value: +today.qty.toFixed(1) });
    }
  }

  // Respiratory Rate
  const respMetric = getMetricByName(data, 'respiratory_rate') as HealthMetric | null;
  if (respMetric) {
    const today = getTodayData(respMetric.data);
    if (today) {
      metrics.push({ name: 'ihealth_respiratory_rate', value: +today.qty.toFixed(1) });
    }
  }

  // Workouts count
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const recentWorkouts = data.data.workouts.filter(w => new Date(w.start) >= cutoff);
  metrics.push({ name: 'ihealth_workouts_7day_count', value: recentWorkouts.length });

  // Timestamp
  metrics.push({ name: 'ihealth_last_push_timestamp', value: Math.floor(Date.now() / 1000) });

  return metrics;
}

// ============================================================================
// Remote Write Client
// ============================================================================

async function pushToPrometheus(timeseries: TimeSeries[], config: PrometheusConfig): Promise<void> {
  const writeRequest = encodeWriteRequest(timeseries);

  // Compress with snappy (required by Prometheus remote write)
  const compressed = snappyjs.compress(writeRequest);

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-protobuf',
    'Content-Encoding': 'snappy',
    'X-Prometheus-Remote-Write-Version': '0.1.0'
  };

  if (config.basic_auth) {
    const auth = Buffer.from(`${config.basic_auth.username}:${config.basic_auth.password}`).toString('base64');
    headers['Authorization'] = `Basic ${auth}`;
  } else if (config.bearer_token) {
    headers['Authorization'] = `Bearer ${config.bearer_token}`;
  }

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers,
    body: compressed
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Remote write failed (${response.status}): ${error}`);
  }
}

function loadConfig(): PrometheusConfig {
  const config: PrometheusConfig = {
    endpoint: process.env.PROMETHEUS_ENDPOINT || DEFAULT_ENDPOINT,
    job: process.env.PROMETHEUS_JOB || DEFAULT_JOB,
    instance: process.env.PROMETHEUS_INSTANCE || DEFAULT_INSTANCE
  };

  if (existsSync(PROMETHEUS_CONFIG_FILE)) {
    try {
      const fileConfig = JSON.parse(readFileSync(PROMETHEUS_CONFIG_FILE, 'utf-8'));
      // Support both old gateway_url and new endpoint
      if (fileConfig.gateway_url && !fileConfig.endpoint) {
        fileConfig.endpoint = fileConfig.gateway_url.replace(/\/pushgateway\/?$/, '') + '/api/v1/write';
      }
      Object.assign(config, fileConfig);
    } catch (e) {
      // Ignore invalid config
    }
  }

  return config;
}

// ============================================================================
// CLI
// ============================================================================

function formatMetricsText(metrics: MetricDef[]): string {
  const lines: string[] = [];
  for (const m of metrics) {
    let labelStr = '';
    if (m.labels && Object.keys(m.labels).length > 0) {
      const parts = Object.entries(m.labels).map(([k, v]) => `${k}="${v}"`).join(',');
      labelStr = `{${parts}}`;
    }
    lines.push(`${m.name}${labelStr} ${m.value}`);
  }
  return lines.join('\n');
}

function showHelp(): void {
  console.log(`
ihealth-prometheus - Push health metrics via Prometheus Remote Write

USAGE:
  ihealth-prometheus [options]

OPTIONS:
  --endpoint URL    Remote write endpoint (default: http://localhost:9090/api/v1/write)
  --job NAME        Job label (default: ihealth)
  --instance NAME   Instance label (default: username)
  --dry-run         Show metrics without pushing
  --help, -h        Show this help

ENVIRONMENT VARIABLES:
  PROMETHEUS_ENDPOINT   Remote write URL
  PROMETHEUS_JOB        Job name
  PROMETHEUS_INSTANCE   Instance name

CONFIG FILE:
  ~/.config/ihealth/prometheus.json
  {
    "endpoint": "https://prometheus.example.com/api/v1/write",
    "job": "ihealth",
    "instance": "myhost",
    "basic_auth": { "username": "user", "password": "pass" },
    "bearer_token": "optional-token"
  }

PROMETHEUS SETUP:
  Enable remote write receiver on your Prometheus server:
    prometheus --web.enable-remote-write-receiver

METRICS EXPORTED:
  ihealth_steps_total, ihealth_steps_7day_avg
  ihealth_heart_rate_bpm{type="min|avg|max"}
  ihealth_resting_heart_rate_bpm
  ihealth_sleep_hours{stage="total|deep|rem|core"}
  ihealth_sleep_7day_avg_hours
  ihealth_blood_pressure_mmhg{type="systolic|diastolic"}
  ihealth_active_energy_kcal, ihealth_distance_km
  ihealth_flights_climbed, ihealth_vo2_max
  ihealth_hrv_ms, ihealth_blood_oxygen_percent
  ihealth_respiratory_rate, ihealth_workouts_7day_count

EXAMPLES:
  ihealth-prometheus --dry-run
  ihealth-prometheus --endpoint https://prometheus.example.com/api/v1/write
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  const dryRun = args.includes('--dry-run');
  const config = loadConfig();

  // Override with CLI args
  const endpointIdx = args.indexOf('--endpoint');
  if (endpointIdx !== -1 && args[endpointIdx + 1]) {
    config.endpoint = args[endpointIdx + 1];
  }

  const jobIdx = args.indexOf('--job');
  if (jobIdx !== -1 && args[jobIdx + 1]) {
    config.job = args[jobIdx + 1];
  }

  const instanceIdx = args.indexOf('--instance');
  if (instanceIdx !== -1 && args[instanceIdx + 1]) {
    config.instance = args[instanceIdx + 1];
  }

  // Load health data
  const data = loadLocalData();
  if (!data) {
    console.error('No health data found. Run: ihealth sync');
    process.exit(1);
  }

  // Build metrics
  const metrics = buildMetrics(data);

  if (dryRun) {
    console.log('=== Prometheus Metrics (dry run) ===\n');
    console.log(formatMetricsText(metrics));
    console.log(`\nWould push ${metrics.length} metrics to: ${config.endpoint}`);
    console.log(`  Job: ${config.job}`);
    console.log(`  Instance: ${config.instance}`);
    return;
  }

  // Build timeseries and push
  const timeseries = buildTimeSeries(metrics, config);

  try {
    await pushToPrometheus(timeseries, config);
    console.log(`Pushed ${metrics.length} metrics to ${config.endpoint}`);
    console.log(`  Job: ${config.job}`);
    console.log(`  Instance: ${config.instance}`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error('Remote write failed');
    }
    process.exit(1);
  }
}

main();
