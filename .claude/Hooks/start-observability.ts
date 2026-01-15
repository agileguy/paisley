#!/usr/bin/env bun
/**
 * Start Observability Dashboard on Session Start
 * Runs in background, non-blocking
 */

import { spawn } from "child_process";
import { resolve } from "path";

const OBSERVABILITY_DIR = resolve(process.env.PAI_DIR || `${process.env.HOME}/.claude`, "Skills/Observability");

// Check if already running
async function isRunning(): Promise<boolean> {
  try {
    const response = await fetch("http://localhost:4000/events/filter-options", {
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function main() {
  // Skip if already running
  if (await isRunning()) {
    return;
  }

  // Start server in background (detached)
  const serverDir = resolve(OBSERVABILITY_DIR, "apps/server");
  spawn("bun", ["run", "dev"], {
    cwd: serverDir,
    detached: true,
    stdio: "ignore",
  }).unref();

  // Wait briefly for server
  await new Promise((r) => setTimeout(r, 2000));

  // Start client in background (detached)
  const clientDir = resolve(OBSERVABILITY_DIR, "apps/client");
  spawn("bun", ["run", "dev"], {
    cwd: clientDir,
    detached: true,
    stdio: "ignore",
  }).unref();
}

main().catch(() => {});
