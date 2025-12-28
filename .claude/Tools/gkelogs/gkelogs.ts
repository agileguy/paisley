#!/usr/bin/env bun
/**
 * gkelogs - GKE Logs CLI Tool
 *
 * Fetches logs from Google Kubernetes Engine using gcloud CLI with ADC.
 * Returns logs in JSON format for a specific cluster and namespace.
 *
 * Usage:
 *   gkelogs --cluster=my-cluster --namespace=my-namespace
 *   gkelogs -c my-cluster -n my-namespace --limit=100
 *   gkelogs -c my-cluster -n my-namespace --since=1h
 */

import { $ } from "bun";
import { parseArgs } from "util";

interface LogEntry {
  insertId: string;
  timestamp: string;
  severity?: string;
  textPayload?: string;
  jsonPayload?: Record<string, unknown>;
  resource: {
    type: string;
    labels: Record<string, string>;
  };
  labels?: Record<string, string>;
}

interface CLIArgs {
  cluster: string;
  namespace: string;
  project?: string;
  limit: number;
  since?: string;
  severity?: string;
  pod?: string;
  container?: string;
  format: "json" | "pretty";
  help: boolean;
}

function printHelp(): void {
  console.log(`
gkelogs - Fetch GKE container logs via gcloud (uses ADC)

USAGE:
  gkelogs --cluster=<name> --namespace=<name> [options]
  gkelogs -c <name> -n <name> [options]

REQUIRED:
  -c, --cluster     GKE cluster name
  -n, --namespace   Kubernetes namespace

OPTIONS:
  -p, --project     GCP project ID (uses default if not specified)
  -l, --limit       Maximum number of log entries (default: 50)
  -s, --since       Time range, e.g., "1h", "30m", "2d" (default: 1h)
  --severity        Filter by severity: DEBUG, INFO, WARNING, ERROR, CRITICAL
  --pod             Filter by pod name (supports partial match)
  --container       Filter by container name
  -f, --format      Output format: json, pretty (default: json)
  -h, --help        Show this help message

EXAMPLES:
  # Get logs from production namespace
  gkelogs -c prod-cluster -n production

  # Get last 100 error logs from the past 2 hours
  gkelogs -c prod-cluster -n production -l 100 -s 2h --severity=ERROR

  # Get logs for a specific pod
  gkelogs -c prod-cluster -n production --pod=api-server

  # Pretty print logs
  gkelogs -c prod-cluster -n production -f pretty

AUTHENTICATION:
  Uses Application Default Credentials (ADC).
  Run 'gcloud auth application-default login' to authenticate.
`);
}

function parseTimeAgo(duration: string): string {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}. Use format like 1h, 30m, 2d`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const now = new Date();
  let msAgo: number;

  switch (unit) {
    case "s": msAgo = value * 1000; break;
    case "m": msAgo = value * 60 * 1000; break;
    case "h": msAgo = value * 60 * 60 * 1000; break;
    case "d": msAgo = value * 24 * 60 * 60 * 1000; break;
    default: throw new Error(`Unknown time unit: ${unit}`);
  }

  const timestamp = new Date(now.getTime() - msAgo);
  return timestamp.toISOString();
}

function buildFilter(args: CLIArgs): string {
  const filters: string[] = [
    'resource.type="k8s_container"',
    `resource.labels.cluster_name="${args.cluster}"`,
    `resource.labels.namespace_name="${args.namespace}"`,
  ];

  if (args.since) {
    const timestamp = parseTimeAgo(args.since);
    filters.push(`timestamp>="${timestamp}"`);
  }

  if (args.severity) {
    filters.push(`severity="${args.severity.toUpperCase()}"`);
  }

  if (args.pod) {
    filters.push(`resource.labels.pod_name:"${args.pod}"`);
  }

  if (args.container) {
    filters.push(`resource.labels.container_name="${args.container}"`);
  }

  return filters.join(" AND ");
}

function formatPretty(logs: LogEntry[]): void {
  for (const entry of logs) {
    const ts = new Date(entry.timestamp).toLocaleString();
    const severity = entry.severity || "INFO";
    const pod = entry.resource?.labels?.pod_name || "unknown";
    const container = entry.resource?.labels?.container_name || "unknown";
    const message = entry.textPayload || JSON.stringify(entry.jsonPayload) || "";

    const severityColors: Record<string, string> = {
      DEBUG: "\x1b[90m",
      INFO: "\x1b[36m",
      WARNING: "\x1b[33m",
      ERROR: "\x1b[31m",
      CRITICAL: "\x1b[35m",
    };

    const color = severityColors[severity] || "\x1b[0m";
    const reset = "\x1b[0m";

    console.log(`${color}[${ts}] [${severity}] ${pod}/${container}${reset}`);
    console.log(`  ${message}`);
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      cluster: { type: "string", short: "c" },
      namespace: { type: "string", short: "n" },
      project: { type: "string", short: "p" },
      limit: { type: "string", short: "l", default: "50" },
      since: { type: "string", short: "s", default: "1h" },
      severity: { type: "string" },
      pod: { type: "string" },
      container: { type: "string" },
      format: { type: "string", short: "f", default: "json" },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  if (!values.cluster || !values.namespace) {
    console.error("Error: --cluster and --namespace are required");
    console.error("Run 'gkelogs --help' for usage information");
    process.exit(1);
  }

  const args: CLIArgs = {
    cluster: values.cluster,
    namespace: values.namespace,
    project: values.project,
    limit: parseInt(values.limit || "50", 10),
    since: values.since,
    severity: values.severity,
    pod: values.pod,
    container: values.container,
    format: (values.format as "json" | "pretty") || "json",
    help: values.help || false,
  };

  const filter = buildFilter(args);

  const gcloudArgs = [
    "logging", "read",
    filter,
    `--limit=${args.limit}`,
    "--format=json",
    "--order=desc",
  ];

  if (args.project) {
    gcloudArgs.push(`--project=${args.project}`);
  }

  try {
    const result = await $`gcloud ${gcloudArgs}`.quiet();
    const output = result.stdout.toString().trim();

    if (!output || output === "[]") {
      if (args.format === "pretty") {
        console.log("No logs found matching the criteria.");
      } else {
        console.log("[]");
      }
      return;
    }

    const logs: LogEntry[] = JSON.parse(output);

    if (args.format === "pretty") {
      formatPretty(logs);
    } else {
      console.log(JSON.stringify(logs, null, 2));
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error fetching logs: ${error.message}`);

      if (error.message.includes("UNAUTHENTICATED") || error.message.includes("credentials")) {
        console.error("\nAuthentication failed. Try running:");
        console.error("  gcloud auth application-default login");
      }
    }
    process.exit(1);
  }
}

main();
