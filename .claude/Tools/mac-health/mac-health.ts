#!/usr/bin/env bun

/**
 * mac-health - Push macOS system health metrics to Prometheus
 *
 * Usage:
 *   mac-health              # Push current metrics to Prometheus
 *   mac-health --dry-run    # Show metrics without pushing
 *   mac-health --help       # Show help
 *
 * Metrics collected:
 *   - CPU: usage percentages (user, system, idle)
 *   - Memory: used, free, wired, compressed, cached
 *   - Disk: usage per volume
 *   - Load: 1m, 5m, 15m averages
 *   - Network: bytes in/out per interface
 *   - Battery: percentage, charging status, cycle count
 *   - System: uptime, processes
 */

import { execSync } from 'child_process';
import * as protobuf from 'protobufjs';
import * as snappy from 'snappyjs';
import * as os from 'os';

const PROMETHEUS_URL = 'https://prometheus.agileguy.ca/api/v1/write';
const HOSTNAME = os.hostname().split('.')[0];

// Absolute paths for cron environment compatibility
const CMD = {
  top: '/usr/bin/top',
  vmstat: '/usr/bin/vm_stat',
  df: '/bin/df',
  netstat: '/usr/sbin/netstat',
  pmset: '/usr/bin/pmset',
  sysctl: '/usr/sbin/sysctl',
  ps: '/bin/ps',
  systemProfiler: '/usr/sbin/system_profiler',
  grep: '/usr/bin/grep',
};

// Protobuf schema for Prometheus remote write
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

interface Metric {
  name: string;
  value: number;
  labels?: Record<string, string>;
  help?: string;
}

function exec(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim();
  } catch {
    return '';
  }
}

function getCpuMetrics(): Metric[] {
  const metrics: Metric[] = [];

  // Get CPU usage from top
  const topOutput = exec(`${CMD.top} -l 1 -n 0 | ${CMD.grep} 'CPU usage'`);
  const cpuMatch = topOutput.match(/(\d+\.?\d*)% user.*?(\d+\.?\d*)% sys.*?(\d+\.?\d*)% idle/);

  if (cpuMatch) {
    metrics.push({
      name: 'mac_cpu_usage_percent',
      value: parseFloat(cpuMatch[1]),
      labels: { mode: 'user' },
      help: 'CPU usage percentage'
    });
    metrics.push({
      name: 'mac_cpu_usage_percent',
      value: parseFloat(cpuMatch[2]),
      labels: { mode: 'system' },
      help: 'CPU usage percentage'
    });
    metrics.push({
      name: 'mac_cpu_usage_percent',
      value: parseFloat(cpuMatch[3]),
      labels: { mode: 'idle' },
      help: 'CPU usage percentage'
    });
  }

  // CPU core count
  const cpuCores = os.cpus().length;
  metrics.push({
    name: 'mac_cpu_cores',
    value: cpuCores,
    help: 'Number of CPU cores'
  });

  return metrics;
}

function getMemoryMetrics(): Metric[] {
  const metrics: Metric[] = [];

  // Get memory info from vm_stat
  const vmstat = exec(CMD.vmstat);
  const pageSize = 16384; // macOS page size (usually 16KB on Apple Silicon)

  const parsePages = (pattern: RegExp): number => {
    const match = vmstat.match(pattern);
    return match ? parseInt(match[1]) * pageSize : 0;
  };

  const free = parsePages(/Pages free:\s+(\d+)/);
  const active = parsePages(/Pages active:\s+(\d+)/);
  const inactive = parsePages(/Pages inactive:\s+(\d+)/);
  const wired = parsePages(/Pages wired down:\s+(\d+)/);
  const compressed = parsePages(/Pages occupied by compressor:\s+(\d+)/);
  const cached = parsePages(/File-backed pages:\s+(\d+)/);

  const totalMem = os.totalmem();
  const used = totalMem - free;

  metrics.push({
    name: 'mac_memory_bytes',
    value: totalMem,
    labels: { type: 'total' },
    help: 'Memory in bytes'
  });

  metrics.push({
    name: 'mac_memory_bytes',
    value: used,
    labels: { type: 'used' },
    help: 'Memory in bytes'
  });

  metrics.push({
    name: 'mac_memory_bytes',
    value: free,
    labels: { type: 'free' },
    help: 'Memory in bytes'
  });

  metrics.push({
    name: 'mac_memory_bytes',
    value: active,
    labels: { type: 'active' },
    help: 'Memory in bytes'
  });

  metrics.push({
    name: 'mac_memory_bytes',
    value: wired,
    labels: { type: 'wired' },
    help: 'Memory in bytes'
  });

  metrics.push({
    name: 'mac_memory_bytes',
    value: compressed,
    labels: { type: 'compressed' },
    help: 'Memory in bytes'
  });

  // Memory usage percentage
  metrics.push({
    name: 'mac_memory_usage_percent',
    value: (used / totalMem) * 100,
    help: 'Memory usage percentage'
  });

  return metrics;
}

function getDiskMetrics(): Metric[] {
  const metrics: Metric[] = [];

  // Get disk usage from df
  const dfOutput = exec(`${CMD.df} -k`);
  const lines = dfOutput.split('\n').slice(1);

  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length >= 9) {
      const filesystem = parts[0];
      const mountpoint = parts[8];

      // Only track real filesystems
      if (!filesystem.startsWith('/dev/')) continue;
      if (mountpoint.includes('/System/Volumes/') && !mountpoint.endsWith('/Data')) continue;

      const total = parseInt(parts[1]) * 1024;
      const used = parseInt(parts[2]) * 1024;
      const available = parseInt(parts[3]) * 1024;
      const usagePercent = parseInt(parts[4].replace('%', ''));

      const volumeName = mountpoint === '/' ? 'root' : mountpoint.split('/').pop() || mountpoint;

      metrics.push({
        name: 'mac_disk_bytes',
        value: total,
        labels: { volume: volumeName, type: 'total' },
        help: 'Disk space in bytes'
      });

      metrics.push({
        name: 'mac_disk_bytes',
        value: used,
        labels: { volume: volumeName, type: 'used' },
        help: 'Disk space in bytes'
      });

      metrics.push({
        name: 'mac_disk_bytes',
        value: available,
        labels: { volume: volumeName, type: 'available' },
        help: 'Disk space in bytes'
      });

      metrics.push({
        name: 'mac_disk_usage_percent',
        value: usagePercent,
        labels: { volume: volumeName },
        help: 'Disk usage percentage'
      });
    }
  }

  return metrics;
}

function getLoadMetrics(): Metric[] {
  const metrics: Metric[] = [];
  const loadavg = os.loadavg();

  metrics.push({
    name: 'mac_load_average',
    value: loadavg[0],
    labels: { period: '1m' },
    help: 'System load average'
  });

  metrics.push({
    name: 'mac_load_average',
    value: loadavg[1],
    labels: { period: '5m' },
    help: 'System load average'
  });

  metrics.push({
    name: 'mac_load_average',
    value: loadavg[2],
    labels: { period: '15m' },
    help: 'System load average'
  });

  return metrics;
}

function getNetworkMetrics(): Metric[] {
  const metrics: Metric[] = [];

  // Get network stats from netstat
  const netstatOutput = exec(`${CMD.netstat} -ib`);
  const lines = netstatOutput.split('\n').slice(1);

  const seenInterfaces = new Set<string>();

  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length >= 10) {
      const iface = parts[0];

      // Skip duplicates and loopback
      if (seenInterfaces.has(iface)) continue;
      if (iface === 'lo0') continue;
      if (!iface.match(/^(en|utun|bridge)/)) continue;

      seenInterfaces.add(iface);

      const ibytes = parseInt(parts[6]) || 0;
      const obytes = parseInt(parts[9]) || 0;

      if (ibytes > 0 || obytes > 0) {
        metrics.push({
          name: 'mac_network_bytes',
          value: ibytes,
          labels: { interface: iface, direction: 'in' },
          help: 'Network bytes transferred'
        });

        metrics.push({
          name: 'mac_network_bytes',
          value: obytes,
          labels: { interface: iface, direction: 'out' },
          help: 'Network bytes transferred'
        });
      }
    }
  }

  return metrics;
}

function getBatteryMetrics(): Metric[] {
  const metrics: Metric[] = [];

  // Get battery info from pmset
  const pmsetOutput = exec(`${CMD.pmset} -g batt`);

  // Parse percentage
  const percentMatch = pmsetOutput.match(/(\d+)%/);
  if (percentMatch) {
    metrics.push({
      name: 'mac_battery_percent',
      value: parseInt(percentMatch[1]),
      help: 'Battery charge percentage'
    });
  }

  // Parse charging status
  const isCharging = pmsetOutput.includes('AC Power') || pmsetOutput.includes('charging');
  const isCharged = pmsetOutput.includes('charged');

  metrics.push({
    name: 'mac_battery_charging',
    value: isCharging && !isCharged ? 1 : 0,
    help: 'Battery charging status (1=charging, 0=not charging)'
  });

  metrics.push({
    name: 'mac_battery_on_ac',
    value: pmsetOutput.includes('AC Power') ? 1 : 0,
    help: 'On AC power (1=yes, 0=no)'
  });

  // Get cycle count from system_profiler
  const batteryInfo = exec(`${CMD.systemProfiler} SPPowerDataType 2>/dev/null | ${CMD.grep} "Cycle Count"`);
  const cycleMatch = batteryInfo.match(/Cycle Count:\s*(\d+)/);
  if (cycleMatch) {
    metrics.push({
      name: 'mac_battery_cycle_count',
      value: parseInt(cycleMatch[1]),
      help: 'Battery cycle count'
    });
  }

  // Get battery health
  const healthInfo = exec(`${CMD.systemProfiler} SPPowerDataType 2>/dev/null | ${CMD.grep} "Condition"`);
  const isHealthy = healthInfo.includes('Normal');
  metrics.push({
    name: 'mac_battery_healthy',
    value: isHealthy ? 1 : 0,
    help: 'Battery health (1=normal, 0=degraded)'
  });

  return metrics;
}

function getSystemMetrics(): Metric[] {
  const metrics: Metric[] = [];

  // Uptime in seconds
  const uptimeOutput = exec(`${CMD.sysctl} -n kern.boottime`);
  const bootMatch = uptimeOutput.match(/sec = (\d+)/);
  if (bootMatch) {
    const bootTime = parseInt(bootMatch[1]);
    const uptimeSeconds = Math.floor(Date.now() / 1000) - bootTime;
    metrics.push({
      name: 'mac_uptime_seconds',
      value: uptimeSeconds,
      help: 'System uptime in seconds'
    });
  }

  // Process count
  const processCount = exec(`${CMD.ps} aux | /usr/bin/wc -l`);
  metrics.push({
    name: 'mac_processes_total',
    value: parseInt(processCount) - 1, // Subtract header line
    help: 'Total number of processes'
  });

  // Swap usage
  const swapOutput = exec(`${CMD.sysctl} -n vm.swapusage`);
  const swapMatch = swapOutput.match(/used = ([\d.]+)([MG])/);
  if (swapMatch) {
    let swapUsed = parseFloat(swapMatch[1]);
    if (swapMatch[2] === 'G') swapUsed *= 1024 * 1024 * 1024;
    else if (swapMatch[2] === 'M') swapUsed *= 1024 * 1024;
    metrics.push({
      name: 'mac_swap_used_bytes',
      value: swapUsed,
      help: 'Swap space used in bytes'
    });
  }

  return metrics;
}

function getTemperatureMetrics(): Metric[] {
  const metrics: Metric[] = [];

  // Try to get CPU temperature using powermetrics (requires sudo) or osx-cpu-temp
  // This is optional and may not work without elevated privileges
  try {
    const tempOutput = exec('which osx-cpu-temp >/dev/null 2>&1 && osx-cpu-temp 2>/dev/null');
    const tempMatch = tempOutput.match(/([\d.]+)°C/);
    if (tempMatch) {
      metrics.push({
        name: 'mac_cpu_temperature_celsius',
        value: parseFloat(tempMatch[1]),
        help: 'CPU temperature in Celsius'
      });
    }
  } catch {
    // Temperature monitoring not available
  }

  return metrics;
}

function collectMetrics(): Metric[] {
  const metrics: Metric[] = [];

  metrics.push(...getCpuMetrics());
  metrics.push(...getMemoryMetrics());
  metrics.push(...getDiskMetrics());
  metrics.push(...getLoadMetrics());
  metrics.push(...getNetworkMetrics());
  metrics.push(...getBatteryMetrics());
  metrics.push(...getSystemMetrics());
  metrics.push(...getTemperatureMetrics());

  return metrics;
}

async function pushToPrometheus(metrics: Metric[]): Promise<void> {
  const root = protobuf.parse(protoSchema).root;
  const WriteRequest = root.lookupType('WriteRequest');

  const timestamp = Date.now();

  const timeseries = metrics.map(metric => {
    const labels = [
      { name: '__name__', value: metric.name },
      { name: 'job', value: 'mac-health' },
      { name: 'instance', value: HOSTNAME },
      ...(metric.labels ? Object.entries(metric.labels).map(([k, v]) => ({ name: k, value: v })) : [])
    ];

    return {
      labels,
      samples: [{ value: metric.value, timestamp }]
    };
  });

  const writeRequest = WriteRequest.create({ timeseries });
  const buffer = WriteRequest.encode(writeRequest).finish();
  const compressed = snappy.compress(buffer);

  const response = await fetch(PROMETHEUS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-protobuf',
      'Content-Encoding': 'snappy',
      'X-Prometheus-Remote-Write-Version': '0.1.0'
    },
    body: compressed
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Prometheus push failed: ${response.status} ${text}`);
  }
}

function formatMetrics(metrics: Metric[]): string {
  const lines: string[] = [];
  let currentHelp = '';

  for (const metric of metrics) {
    if (metric.help && metric.help !== currentHelp) {
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      currentHelp = metric.help;
    }

    const labelStr = metric.labels
      ? `{${Object.entries(metric.labels).map(([k, v]) => `${k}="${v}"`).join(',')}}`
      : '';

    // Format large numbers nicely
    const value = metric.value > 1000000
      ? metric.value.toExponential(2)
      : metric.value.toFixed(2);

    lines.push(`${metric.name}${labelStr} ${value}`);
  }

  return lines.join('\n');
}

// Main
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
mac-health - Push macOS system health metrics to Prometheus

Usage:
  mac-health              Push current metrics to Prometheus
  mac-health --dry-run    Show metrics without pushing
  mac-health --help       Show this help

Metrics collected:
  mac_cpu_usage_percent      CPU usage by mode (user/system/idle)
  mac_cpu_cores              Number of CPU cores
  mac_memory_bytes           Memory by type (total/used/free/active/wired)
  mac_memory_usage_percent   Overall memory usage percentage
  mac_disk_bytes             Disk space by volume (total/used/available)
  mac_disk_usage_percent     Disk usage percentage by volume
  mac_load_average           System load (1m/5m/15m)
  mac_network_bytes          Network I/O by interface (in/out)
  mac_battery_percent        Battery charge percentage
  mac_battery_charging       Battery charging status
  mac_battery_cycle_count    Battery cycle count
  mac_uptime_seconds         System uptime
  mac_processes_total        Total process count
  mac_swap_used_bytes        Swap space used
`);
  process.exit(0);
}

const dryRun = args.includes('--dry-run');

console.log(`Collecting system metrics for ${HOSTNAME}...`);
const metrics = collectMetrics();

if (metrics.length === 0) {
  console.error('No metrics collected');
  process.exit(1);
}

console.log(`Collected ${metrics.length} metrics\n`);

if (dryRun) {
  console.log(formatMetrics(metrics));
} else {
  try {
    await pushToPrometheus(metrics);
    console.log(`Successfully pushed ${metrics.length} metrics to Prometheus`);
  } catch (e) {
    console.error(`Failed to push metrics: ${e}`);
    process.exit(1);
  }
}
