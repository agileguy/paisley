#!/usr/bin/env bun
/**
 * PAI Dashboard Server
 * Serves usage metrics dashboard with live data from .claude files
 */

import { readdir, readFile, stat } from "fs/promises";
import { join, resolve } from "path";

const PORT = 3456;
const CLAUDE_DIR = resolve(process.env.HOME || "~", ".claude");

interface StatsCache {
  dailyActivity: Array<{
    date: string;
    messageCount: number;
    sessionCount: number;
    toolCallCount: number;
  }>;
  modelUsage: Record<string, {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
  }>;
  totalSessions: number;
  totalMessages: number;
  hourCounts: Record<string, number>;
}

interface ToolEvent {
  hook_event_type: string;
  payload: {
    tool_name: string;
    tool_input?: Record<string, unknown>;
  };
  timestamp: number;
}

// Read stats-cache.json
async function getStats(): Promise<StatsCache | null> {
  try {
    const content = await readFile(join(CLAUDE_DIR, "stats-cache.json"), "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// Read agent-sessions.json
async function getAgentSessions(): Promise<Record<string, string>> {
  try {
    const content = await readFile(join(CLAUDE_DIR, "agent-sessions.json"), "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

// Read all events from Raw-Outputs
async function getToolEvents(): Promise<{ toolCounts: Record<string, number>; totalEvents: number }> {
  const toolCounts: Record<string, number> = {};
  let totalEvents = 0;

  try {
    const rawOutputsDir = join(CLAUDE_DIR, "History", "Raw-Outputs");
    const months = await readdir(rawOutputsDir).catch(() => []);

    for (const month of months) {
      const monthDir = join(rawOutputsDir, month);
      const files = await readdir(monthDir).catch(() => []);

      for (const file of files) {
        if (file.endsWith("_all-events.jsonl")) {
          const content = await readFile(join(monthDir, file), "utf-8");
          const lines = content.trim().split("\n");

          for (const line of lines) {
            try {
              const event: ToolEvent = JSON.parse(line);
              totalEvents++;

              if (event.hook_event_type === "PreToolUse" && event.payload?.tool_name) {
                const tool = event.payload.tool_name;
                toolCounts[tool] = (toolCounts[tool] || 0) + 1;
              }
            } catch {
              // Skip malformed lines
            }
          }
        }
      }
    }
  } catch {
    // Return empty if directory doesn't exist
  }

  return { toolCounts, totalEvents };
}

// Serve static HTML
async function serveHTML(): Promise<Response> {
  try {
    const html = await readFile(join(import.meta.dir, "index.html"), "utf-8");
    return new Response(html, {
      headers: { "Content-Type": "text/html" },
    });
  } catch {
    return new Response("Dashboard not found", { status: 404 });
  }
}

// Main server
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // CORS headers for local development
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    };

    switch (url.pathname) {
      case "/":
        return serveHTML();

      case "/api/stats":
        const stats = await getStats();
        return new Response(JSON.stringify(stats), { headers });

      case "/api/events":
        const events = await getToolEvents();
        return new Response(JSON.stringify(events), { headers });

      case "/api/agents":
        const agents = await getAgentSessions();
        return new Response(JSON.stringify(agents), { headers });

      case "/api/all":
        const [allStats, allEvents, allAgents] = await Promise.all([
          getStats(),
          getToolEvents(),
          getAgentSessions(),
        ]);
        return new Response(
          JSON.stringify({
            stats: allStats,
            events: allEvents,
            agents: allAgents,
          }),
          { headers }
        );

      default:
        return new Response("Not found", { status: 404 });
    }
  },
});

console.log(`
╔══════════════════════════════════════════════════════════╗
║                   PAI Usage Dashboard                    ║
╠══════════════════════════════════════════════════════════╣
║  Server running at: http://localhost:${PORT}               ║
║  Press Ctrl+C to stop                                    ║
╚══════════════════════════════════════════════════════════╝
`);
