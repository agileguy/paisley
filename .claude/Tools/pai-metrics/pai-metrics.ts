#!/usr/bin/env bun

/**
 * PAI Metrics - Push Claude Code/PAI metrics to Prometheus
 *
 * Usage:
 *   pai-metrics              # Push current metrics to Prometheus
 *   pai-metrics --dry-run    # Show metrics without pushing
 *   pai-metrics --help       # Show help
 *
 * Metrics collected:
 *   - pai_messages_total: Total messages in sessions
 *   - pai_sessions_total: Total number of sessions
 *   - pai_tool_calls_total: Total tool calls made
 *   - pai_tokens_input: Input tokens consumed
 *   - pai_tokens_output: Output tokens generated
 *   - pai_tokens_cache_read: Cache read tokens
 *   - pai_tokens_cache_creation: Cache creation tokens
 *   - pai_daily_messages: Messages today
 *   - pai_daily_sessions: Sessions today
 *   - pai_daily_tool_calls: Tool calls today
 *   - pai_daily_tokens: Tokens today
 *   - pai_todos_count: Active todo items
 *   - pai_subagents_spawned: Subagents in current session
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve } from 'path';
import * as protobuf from 'protobufjs';
import * as snappy from 'snappyjs';

const PROMETHEUS_URL = 'https://prometheus.agileguy.ca/api/v1/write';
const CLAUDE_DIR = `${process.env.HOME}/.claude`;
const STATS_FILE = `${CLAUDE_DIR}/stats-cache.json`;

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

interface StatsCache {
  version: number;
  lastComputedDate: string;
  dailyActivity: Array<{
    date: string;
    messageCount: number;
    sessionCount: number;
    toolCallCount: number;
  }>;
  dailyModelTokens: Array<{
    date: string;
    tokensByModel: Record<string, number>;
  }>;
  modelUsage: Record<string, {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    webSearchRequests: number;
  }>;
  totalSessions: number;
  totalMessages: number;
  longestSession?: {
    sessionId: string;
    duration: number;
    messageCount: number;
    timestamp: string;
  };
  firstSessionDate?: string;
  hourCounts?: Record<string, number>;
}

interface Metric {
  name: string;
  value: number;
  labels?: Record<string, string>;
  help?: string;
  timestamp?: number; // Optional custom timestamp in ms
}

function loadStats(): StatsCache | null {
  if (!existsSync(STATS_FILE)) {
    console.error(`Stats file not found: ${STATS_FILE}`);
    return null;
  }

  try {
    const content = readFileSync(STATS_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    console.error(`Failed to parse stats file: ${e}`);
    return null;
  }
}

function countTodos(): number {
  const todosDir = `${CLAUDE_DIR}/todos`;
  if (!existsSync(todosDir)) return 0;

  try {
    const files = readdirSync(todosDir);
    // Count non-empty todo files
    let count = 0;
    for (const file of files) {
      try {
        const content = readFileSync(resolve(todosDir, file), 'utf-8');
        const todos = JSON.parse(content);
        if (Array.isArray(todos)) {
          count += todos.filter((t: { status: string }) => t.status !== 'completed').length;
        }
      } catch {
        // Skip invalid files
      }
    }
    return count;
  } catch {
    return 0;
  }
}

function countSubagents(): number {
  const projectsDir = `${CLAUDE_DIR}/projects`;
  if (!existsSync(projectsDir)) return 0;

  let count = 0;
  try {
    const projects = readdirSync(projectsDir);
    for (const project of projects) {
      const projectPath = resolve(projectsDir, project);
      const sessions = readdirSync(projectPath).filter(d => d.match(/^[a-f0-9-]{36}$/));
      for (const session of sessions) {
        const subagentsPath = resolve(projectPath, session, 'subagents');
        if (existsSync(subagentsPath)) {
          count += readdirSync(subagentsPath).filter(f => f.endsWith('.jsonl')).length;
        }
      }
    }
  } catch {
    // Ignore errors
  }
  return count;
}

function countSessionFiles(): number {
  const historyDir = `${CLAUDE_DIR}/History/Sessions`;
  if (!existsSync(historyDir)) return 0;

  let count = 0;
  try {
    const months = readdirSync(historyDir);
    for (const month of months) {
      const monthPath = resolve(historyDir, month);
      count += readdirSync(monthPath).filter(f => f.endsWith('.md')).length;
    }
  } catch {
    // Ignore errors
  }
  return count;
}

// Real-time stats from session JSONL files
interface RealTimeStats {
  totalMessages: number;
  totalToolCalls: number;
  activeSessionLines: number;
  sessionFileCount: number;
  agentFileCount: number;
  largestSessionSize: number;
}

function computeRealTimeStats(): RealTimeStats {
  const projectsDir = `${CLAUDE_DIR}/projects`;
  const stats: RealTimeStats = {
    totalMessages: 0,
    totalToolCalls: 0,
    activeSessionLines: 0,
    sessionFileCount: 0,
    agentFileCount: 0,
    largestSessionSize: 0
  };

  if (!existsSync(projectsDir)) return stats;

  try {
    const projects = readdirSync(projectsDir);
    for (const project of projects) {
      const projectPath = resolve(projectsDir, project);
      const files = readdirSync(projectPath);

      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue;
        const filePath = resolve(projectPath, file);

        try {
          const content = readFileSync(filePath, 'utf-8');
          const lines = content.trim().split('\n').filter(l => l.length > 0);

          if (file.startsWith('agent-')) {
            stats.agentFileCount++;
          } else if (file.match(/^[a-f0-9-]{36}\.jsonl$/)) {
            stats.sessionFileCount++;
            stats.activeSessionLines += lines.length;

            // Track largest session
            const fileSize = statSync(filePath).size;
            if (fileSize > stats.largestSessionSize) {
              stats.largestSessionSize = fileSize;
            }

            // Count messages and tool calls from JSONL
            for (const line of lines) {
              try {
                const entry = JSON.parse(line);
                if (entry.type === 'human' || entry.type === 'assistant') {
                  stats.totalMessages++;
                }
                if (entry.type === 'tool_use' || entry.type === 'tool_result') {
                  stats.totalToolCalls++;
                }
              } catch {
                // Skip invalid JSON lines
              }
            }
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return stats;
}

function getStatsTimestamp(): number {
  const now = Date.now();
  const oneHourMs = 60 * 60 * 1000;

  try {
    const stat = statSync(STATS_FILE);
    const mtime = stat.mtimeMs;

    // Prometheus rejects timestamps older than 1 hour
    // Use file mtime if recent, otherwise use current time
    if (now - mtime < oneHourMs) {
      return mtime;
    }
    return now;
  } catch {
    return now;
  }
}

function collectMetrics(): Metric[] {
  const stats = loadStats();
  if (!stats) return [];

  const metrics: Metric[] = [];
  const today = new Date().toISOString().split('T')[0];
  const statsTimestamp = getStatsTimestamp(); // Use file modification time for stats-based metrics
  const now = Date.now(); // Use current time for real-time filesystem metrics

  // Total metrics (use stats file timestamp)
  metrics.push({
    name: 'pai_messages_total',
    value: stats.totalMessages,
    help: 'Total messages across all sessions',
    timestamp: statsTimestamp
  });

  metrics.push({
    name: 'pai_sessions_total',
    value: stats.totalSessions,
    help: 'Total number of sessions',
    timestamp: statsTimestamp
  });

  // Calculate total tool calls
  const totalToolCalls = stats.dailyActivity.reduce((sum, day) => sum + day.toolCallCount, 0);
  metrics.push({
    name: 'pai_tool_calls_total',
    value: totalToolCalls,
    help: 'Total tool calls made',
    timestamp: statsTimestamp
  });

  // Model usage metrics (use stats file timestamp)
  for (const [model, usage] of Object.entries(stats.modelUsage)) {
    const shortModel = model.includes('opus') ? 'opus' : model.includes('sonnet') ? 'sonnet' : model.includes('haiku') ? 'haiku' : model;

    metrics.push({
      name: 'pai_tokens_input',
      value: usage.inputTokens,
      labels: { model: shortModel },
      help: 'Input tokens consumed',
      timestamp: statsTimestamp
    });

    metrics.push({
      name: 'pai_tokens_output',
      value: usage.outputTokens,
      labels: { model: shortModel },
      help: 'Output tokens generated',
      timestamp: statsTimestamp
    });

    metrics.push({
      name: 'pai_tokens_cache_read',
      value: usage.cacheReadInputTokens,
      labels: { model: shortModel },
      help: 'Cache read tokens',
      timestamp: statsTimestamp
    });

    metrics.push({
      name: 'pai_tokens_cache_creation',
      value: usage.cacheCreationInputTokens,
      labels: { model: shortModel },
      help: 'Cache creation tokens',
      timestamp: statsTimestamp
    });

    metrics.push({
      name: 'pai_web_search_requests',
      value: usage.webSearchRequests,
      labels: { model: shortModel },
      help: 'Web search requests made',
      timestamp: statsTimestamp
    });
  }

  // Daily metrics (today) - use stats timestamp
  const todayActivity = stats.dailyActivity.find(d => d.date === today);
  if (todayActivity) {
    metrics.push({
      name: 'pai_daily_messages',
      value: todayActivity.messageCount,
      help: 'Messages today',
      timestamp: statsTimestamp
    });

    metrics.push({
      name: 'pai_daily_sessions',
      value: todayActivity.sessionCount,
      help: 'Sessions today',
      timestamp: statsTimestamp
    });

    metrics.push({
      name: 'pai_daily_tool_calls',
      value: todayActivity.toolCallCount,
      help: 'Tool calls today',
      timestamp: statsTimestamp
    });
  }

  // Daily tokens (today) - use stats timestamp
  const todayTokens = stats.dailyModelTokens.find(d => d.date === today);
  if (todayTokens) {
    const totalTokens = Object.values(todayTokens.tokensByModel).reduce((sum, t) => sum + t, 0);
    metrics.push({
      name: 'pai_daily_tokens',
      value: totalTokens,
      help: 'Tokens used today',
      timestamp: statsTimestamp
    });
  }

  // Longest session duration (in hours) - use stats timestamp
  if (stats.longestSession) {
    metrics.push({
      name: 'pai_longest_session_hours',
      value: stats.longestSession.duration / (1000 * 60 * 60),
      help: 'Longest session duration in hours',
      timestamp: statsTimestamp
    });

    metrics.push({
      name: 'pai_longest_session_messages',
      value: stats.longestSession.messageCount,
      help: 'Messages in longest session',
      timestamp: statsTimestamp
    });
  }

  // Hour distribution (peak hour) - use stats timestamp
  if (stats.hourCounts) {
    let peakHour = 0;
    let peakCount = 0;
    for (const [hour, count] of Object.entries(stats.hourCounts)) {
      if (count > peakCount) {
        peakHour = parseInt(hour);
        peakCount = count;
      }
    }
    metrics.push({
      name: 'pai_peak_hour',
      value: peakHour,
      help: 'Hour with most session starts',
      timestamp: statsTimestamp
    });
  }

  // Real-time filesystem metrics - use current time
  metrics.push({
    name: 'pai_todos_pending',
    value: countTodos(),
    help: 'Pending todo items',
    timestamp: now
  });

  metrics.push({
    name: 'pai_subagents_total',
    value: countSubagents(),
    help: 'Total subagents spawned',
    timestamp: now
  });

  metrics.push({
    name: 'pai_session_files_total',
    value: countSessionFiles(),
    help: 'Session history files',
    timestamp: now
  });

  // Days since first session - use current time (calculated now)
  if (stats.firstSessionDate) {
    const firstDate = new Date(stats.firstSessionDate);
    const currentDate = new Date();
    const daysSinceFirst = Math.floor((currentDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
    metrics.push({
      name: 'pai_days_active',
      value: daysSinceFirst,
      help: 'Days since first session',
      timestamp: now
    });
  }

  // Real-time stats computed from JSONL files (updates every push)
  const realTimeStats = computeRealTimeStats();

  metrics.push({
    name: 'pai_realtime_messages',
    value: realTimeStats.totalMessages,
    help: 'Real-time message count from session files',
    timestamp: now
  });

  metrics.push({
    name: 'pai_realtime_tool_calls',
    value: realTimeStats.totalToolCalls,
    help: 'Real-time tool call count from session files',
    timestamp: now
  });

  metrics.push({
    name: 'pai_session_lines_total',
    value: realTimeStats.activeSessionLines,
    help: 'Total lines across all session JSONL files',
    timestamp: now
  });

  metrics.push({
    name: 'pai_session_jsonl_count',
    value: realTimeStats.sessionFileCount,
    help: 'Number of session JSONL files',
    timestamp: now
  });

  metrics.push({
    name: 'pai_agent_files_total',
    value: realTimeStats.agentFileCount,
    help: 'Total agent JSONL files',
    timestamp: now
  });

  metrics.push({
    name: 'pai_largest_session_bytes',
    value: realTimeStats.largestSessionSize,
    help: 'Size of largest session file in bytes',
    timestamp: now
  });

  return metrics;
}

async function pushToPrometheus(metrics: Metric[]): Promise<void> {
  const root = protobuf.parse(protoSchema).root;
  const WriteRequest = root.lookupType('WriteRequest');

  const defaultTimestamp = Date.now();

  const timeseries = metrics.map(metric => {
    const labels = [
      { name: '__name__', value: metric.name },
      { name: 'job', value: 'pai' },
      { name: 'instance', value: 'claude-code' },
      ...(metric.labels ? Object.entries(metric.labels).map(([k, v]) => ({ name: k, value: v })) : [])
    ];

    // Use metric's timestamp if provided, otherwise use default (now)
    const ts = metric.timestamp || defaultTimestamp;

    return {
      labels,
      samples: [{ value: metric.value, timestamp: ts }]
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

  for (const metric of metrics) {
    if (metric.help) {
      lines.push(`# HELP ${metric.name} ${metric.help}`);
    }

    const labelStr = metric.labels
      ? `{${Object.entries(metric.labels).map(([k, v]) => `${k}="${v}"`).join(',')}}`
      : '';

    lines.push(`${metric.name}${labelStr} ${metric.value}`);
  }

  return lines.join('\n');
}

// Main
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
pai-metrics - Push PAI/Claude Code metrics to Prometheus

Usage:
  pai-metrics              Push current metrics to Prometheus
  pai-metrics --dry-run    Show metrics without pushing
  pai-metrics --help       Show this help

Metrics collected:
  pai_messages_total       Total messages across all sessions
  pai_sessions_total       Total number of sessions
  pai_tool_calls_total     Total tool calls made
  pai_tokens_input         Input tokens consumed (by model)
  pai_tokens_output        Output tokens generated (by model)
  pai_tokens_cache_read    Cache read tokens (by model)
  pai_daily_messages       Messages today
  pai_daily_sessions       Sessions today
  pai_daily_tool_calls     Tool calls today
  pai_daily_tokens         Tokens used today
  pai_todos_pending        Pending todo items
  pai_subagents_total      Total subagents spawned
  pai_days_active          Days since first session
`);
  process.exit(0);
}

const dryRun = args.includes('--dry-run');

console.log('Collecting PAI metrics...');
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
