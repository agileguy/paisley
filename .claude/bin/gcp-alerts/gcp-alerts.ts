#!/usr/bin/env bun
/**
 * gcp-alerts - Sync GCP alerting policies between projects
 *
 * Uses Application Default Credentials (ADC) for authentication via REST API.
 * Run `gcloud auth application-default login` to authenticate.
 *
 * Note: Uses REST API instead of gRPC client due to bun + gRPC compatibility issues.
 */

// Types
interface AlertPolicy {
  name?: string | null;
  displayName?: string | null;
  documentation?: { content?: string | null; mimeType?: string | null } | null;
  userLabels?: { [key: string]: string } | null;
  conditions?: Array<{
    name?: string | null;
    displayName?: string | null;
    conditionThreshold?: unknown;
    conditionAbsent?: unknown;
    conditionMatchedLog?: unknown;
    conditionMonitoringQueryLanguage?: unknown;
    conditionPrometheusQueryLanguage?: unknown;
  }> | null;
  combiner?: string | number | null;
  enabled?: boolean | null;
  validity?: unknown;
  notificationChannels?: string[] | null;
  creationRecord?: unknown;
  mutationRecord?: unknown;
  alertStrategy?: unknown;
  severity?: string | number | null;
}

interface SyncResult {
  created: string[];
  skipped: string[];
  errors: Array<{ name: string; error: string }>;
}

// Help text
const HELP = `
gcp-alerts - Sync GCP alerting policies between projects

USAGE:
  gcp-alerts list <project-id>                     List all alerting policies
  gcp-alerts sync <source-project> <dest-project>  Sync policies to destination
  gcp-alerts delete <project-id> <policy-name>     Delete a policy by name
  gcp-alerts --help                                Show this help

OPTIONS:
  --name       Sync only a specific policy by display name
  --dry-run    Show what would be done without making changes
  --confirm    Prompt for confirmation before each change
  --json       Output in JSON format
  --force      Overwrite existing policies with same display name

AUTHENTICATION:
  Uses Application Default Credentials (ADC).
  Run: gcloud auth application-default login

EXAMPLES:
  # List policies in a project
  gcp-alerts list my-source-project

  # Preview sync all policies (dry run)
  gcp-alerts sync my-source-project my-dest-project --dry-run

  # Sync all policies
  gcp-alerts sync my-source-project my-dest-project

  # Sync a single policy by name
  gcp-alerts sync my-source-project my-dest-project --name "CPU Usage Alert"

  # Delete a policy
  gcp-alerts delete my-project "Old Alert Policy"

  # Delete with dry run
  gcp-alerts delete my-project "Old Alert Policy" --dry-run

  # Output as JSON
  gcp-alerts list my-project --json

  # Sync with confirmation prompt for each policy
  gcp-alerts sync my-source-project my-dest-project --confirm

  # Delete with confirmation
  gcp-alerts delete my-project "Old Alert Policy" --confirm
`;

const BASE_URL = "https://monitoring.googleapis.com/v3";

// Cache access token for reuse
let cachedToken: string | null = null;

// Get access token from gcloud
async function getAccessToken(): Promise<string> {
  if (cachedToken) return cachedToken;

  const proc = Bun.spawn(["gcloud", "auth", "application-default", "print-access-token"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`Failed to get access token: ${stderr}`);
  }

  cachedToken = output.trim();
  return cachedToken;
}

// Make authenticated REST API request
async function apiRequest<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const token = await getAccessToken();
  const url = `${BASE_URL}${path}`;

  const options: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const text = await response.text();
    let errorMessage = `HTTP ${response.status}`;
    try {
      const errorJson = JSON.parse(text);
      errorMessage = errorJson.error?.message || errorMessage;
    } catch {
      errorMessage = text || errorMessage;
    }
    throw new Error(errorMessage);
  }

  // DELETE returns empty response
  if (method === "DELETE") {
    return {} as T;
  }

  return response.json();
}

// Prompt user for confirmation
async function promptConfirm(message: string): Promise<boolean> {
  process.stdout.write(`${message} [y/N] `);

  for await (const line of console) {
    const answer = line.trim().toLowerCase();
    return answer === "y" || answer === "yes";
  }
  return false;
}

// Parse command line arguments
function parseArgs(): {
  command: string;
  args: string[];
  flags: { dryRun: boolean; json: boolean; force: boolean; help: boolean; confirm: boolean; name: string | null };
} {
  const args = process.argv.slice(2);
  const flags: { dryRun: boolean; json: boolean; force: boolean; help: boolean; confirm: boolean; name: string | null } = {
    dryRun: false,
    json: false,
    force: false,
    help: false,
    confirm: false,
    name: null,
  };

  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--json") flags.json = true;
    else if (arg === "--force") flags.force = true;
    else if (arg === "--confirm" || arg === "-c") flags.confirm = true;
    else if (arg === "--help" || arg === "-h") flags.help = true;
    else if (arg === "--name" && i + 1 < args.length) {
      flags.name = args[++i];
    } else if (!arg.startsWith("-")) positional.push(arg);
  }

  return {
    command: positional[0] || "",
    args: positional.slice(1),
    flags,
  };
}

// List all alerting policies in a project (with pagination)
async function listPolicies(projectId: string): Promise<AlertPolicy[]> {
  const allPolicies: AlertPolicy[] = [];
  let pageToken: string | undefined;

  do {
    const path = `/projects/${projectId}/alertPolicies${pageToken ? `?pageToken=${pageToken}` : ""}`;
    const response = await apiRequest<{ alertPolicies?: AlertPolicy[]; nextPageToken?: string }>("GET", path);

    if (response.alertPolicies) {
      allPolicies.push(...response.alertPolicies);
    }
    pageToken = response.nextPageToken;
  } while (pageToken);

  return allPolicies;
}

// Get policy by display name
async function getPolicyByDisplayName(
  projectId: string,
  displayName: string
): Promise<AlertPolicy | null> {
  const policies = await listPolicies(projectId);
  return policies.find((p) => p.displayName === displayName) || null;
}

// Create a policy in destination project
async function createPolicy(
  projectId: string,
  sourcePolicy: AlertPolicy
): Promise<AlertPolicy> {
  // Prepare the policy for creation (remove source-specific fields)
  const newPolicy: Partial<AlertPolicy> = {
    displayName: sourcePolicy.displayName,
    documentation: sourcePolicy.documentation,
    userLabels: sourcePolicy.userLabels,
    conditions: sourcePolicy.conditions?.map((c) => ({
      displayName: c.displayName,
      conditionThreshold: c.conditionThreshold,
      conditionAbsent: c.conditionAbsent,
      conditionMatchedLog: c.conditionMatchedLog,
      conditionMonitoringQueryLanguage: c.conditionMonitoringQueryLanguage,
      conditionPrometheusQueryLanguage: c.conditionPrometheusQueryLanguage,
      // Don't copy 'name' - it's auto-generated
    })),
    combiner: sourcePolicy.combiner,
    enabled: sourcePolicy.enabled,
    alertStrategy: sourcePolicy.alertStrategy,
    severity: sourcePolicy.severity,
    // Note: notificationChannels need to be mapped to destination project channels
    // For now, we skip them - they would need separate handling
  };

  const path = `/projects/${projectId}/alertPolicies`;
  return apiRequest<AlertPolicy>("POST", path, newPolicy);
}

// Delete a policy by display name
async function deletePolicy(
  projectId: string,
  displayName: string
): Promise<void> {
  // Find the policy by display name
  const policy = await getPolicyByDisplayName(projectId, displayName);
  if (!policy) {
    throw new Error(`Policy "${displayName}" not found in project ${projectId}`);
  }

  if (!policy.name) {
    throw new Error(`Policy "${displayName}" has no resource name`);
  }

  // Extract the policy path from the full name (projects/xxx/alertPolicies/yyy)
  const policyPath = policy.name.replace("projects/", "/projects/");
  await apiRequest<void>("DELETE", policyPath);
}

// Sync policies from source to destination
async function syncPolicies(
  sourceProject: string,
  destProject: string,
  dryRun: boolean,
  force: boolean,
  confirm: boolean,
  policyName: string | null = null
): Promise<SyncResult> {
  const result: SyncResult = {
    created: [],
    skipped: [],
    errors: [],
  };

  // Get source policies
  console.error(`Fetching policies from ${sourceProject}...`);
  let sourcePolicies = await listPolicies(sourceProject);

  // Filter to single policy if name specified
  if (policyName) {
    const filtered = sourcePolicies.filter((p) => p.displayName === policyName);
    if (filtered.length === 0) {
      throw new Error(`Policy "${policyName}" not found in source project ${sourceProject}`);
    }
    sourcePolicies = filtered;
    console.error(`Syncing single policy: "${policyName}"`);
  } else {
    console.error(`Found ${sourcePolicies.length} policies in source project`);
  }

  // Get destination policies
  console.error(`Fetching policies from ${destProject}...`);
  const destPolicies = await listPolicies(destProject);
  const destPolicyNames = new Set(destPolicies.map((p) => p.displayName));
  console.error(`Found ${destPolicies.length} policies in destination project`);

  // Process each source policy
  for (const policy of sourcePolicies) {
    const displayName = policy.displayName || "unnamed";

    if (destPolicyNames.has(displayName) && !force) {
      result.skipped.push(displayName);
      console.error(`  SKIP: "${displayName}" (already exists)`);
      continue;
    }

    if (dryRun) {
      result.created.push(displayName);
      console.error(`  WOULD CREATE: "${displayName}"`);
      continue;
    }

    // Prompt for confirmation if --confirm flag is set
    if (confirm) {
      const confirmed = await promptConfirm(`  Create policy "${displayName}" in ${destProject}?`);
      if (!confirmed) {
        result.skipped.push(displayName);
        console.error(`  SKIPPED: "${displayName}" (user declined)`);
        continue;
      }
    }

    try {
      await createPolicy(destProject, policy);
      result.created.push(displayName);
      console.error(`  CREATED: "${displayName}"`);
    } catch (error) {
      const err = error as Error;
      result.errors.push({ name: displayName, error: err.message });
      console.error(`  ERROR: "${displayName}" - ${err.message}`);
    }
  }

  return result;
}

// Format policy for display
function formatPolicy(policy: AlertPolicy): string {
  const enabled = policy.enabled !== false ? "enabled" : "disabled";
  const conditions = policy.conditions?.length || 0;
  return `${policy.displayName} (${conditions} conditions, ${enabled})`;
}

// Main entry point
async function main() {
  const { command, args, flags } = parseArgs();

  if (flags.help || !command) {
    console.log(HELP);
    process.exit(0);
  }

  try {
    switch (command) {
      case "list": {
        const projectId = args[0];
        if (!projectId) {
          console.error("Error: Project ID required");
          console.error("Usage: gcp-alerts list <project-id>");
          process.exit(1);
        }

        const policies = await listPolicies(projectId);

        if (flags.json) {
          console.log(JSON.stringify(policies, null, 2));
        } else {
          console.log(`\nAlerting Policies in ${projectId}:`);
          console.log("=".repeat(50));
          if (policies.length === 0) {
            console.log("No alerting policies found.");
          } else {
            for (const policy of policies) {
              console.log(`  - ${formatPolicy(policy)}`);
            }
            console.log(`\nTotal: ${policies.length} policies`);
          }
        }
        break;
      }

      case "sync": {
        const sourceProject = args[0];
        const destProject = args[1];

        if (!sourceProject || !destProject) {
          console.error("Error: Source and destination projects required");
          console.error("Usage: gcp-alerts sync <source-project> <dest-project>");
          process.exit(1);
        }

        if (sourceProject === destProject) {
          console.error("Error: Source and destination projects must be different");
          process.exit(1);
        }

        console.log(`\nSyncing alerting policies:`);
        console.log(`  Source: ${sourceProject}`);
        console.log(`  Destination: ${destProject}`);
        if (flags.name) console.log(`  Policy: "${flags.name}"`);
        if (flags.dryRun) console.log(`  Mode: DRY RUN`);
        if (flags.confirm) console.log(`  Mode: INTERACTIVE`);
        if (flags.force) console.log(`  Force: enabled`);
        console.log("");

        const result = await syncPolicies(
          sourceProject,
          destProject,
          flags.dryRun,
          flags.force,
          flags.confirm,
          flags.name
        );

        if (flags.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`\nResults:`);
          console.log(`  Created: ${result.created.length}`);
          console.log(`  Skipped: ${result.skipped.length}`);
          console.log(`  Errors: ${result.errors.length}`);

          if (result.errors.length > 0) {
            console.log(`\nErrors:`);
            for (const err of result.errors) {
              console.log(`  - ${err.name}: ${err.error}`);
            }
          }
        }

        if (result.errors.length > 0) {
          process.exit(1);
        }
        break;
      }

      case "delete": {
        const projectId = args[0];
        const policyName = args[1];

        if (!projectId || !policyName) {
          console.error("Error: Project ID and policy name required");
          console.error("Usage: gcp-alerts delete <project-id> <policy-name>");
          process.exit(1);
        }

        if (flags.dryRun) {
          console.log(`Would delete policy "${policyName}" from ${projectId}`);
          if (flags.json) {
            console.log(JSON.stringify({ dryRun: true, policy: policyName, project: projectId }, null, 2));
          }
          break;
        }

        // Prompt for confirmation if --confirm flag is set
        if (flags.confirm) {
          const confirmed = await promptConfirm(`Delete policy "${policyName}" from ${projectId}?`);
          if (!confirmed) {
            console.log(`Cancelled: "${policyName}" not deleted`);
            break;
          }
        }

        console.log(`Deleting policy "${policyName}" from ${projectId}...`);
        await deletePolicy(projectId, policyName);

        if (flags.json) {
          console.log(JSON.stringify({ deleted: policyName, project: projectId }, null, 2));
        } else {
          console.log(`Deleted: "${policyName}"`);
        }
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        console.error("Run 'gcp-alerts --help' for usage");
        process.exit(1);
    }
  } catch (error) {
    const err = error as Error;
    if (flags.json) {
      console.log(JSON.stringify({ error: err.message }, null, 2));
    } else {
      console.error(`Error: ${err.message}`);
    }
    process.exit(1);
  }
}

main();
