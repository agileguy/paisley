#!/usr/bin/env bun
/**
 * spotify-favorites - Get your top artists from Spotify
 *
 * Uses Spotify Web API with OAuth 2.0 PKCE flow for authentication.
 */

import { createHash, randomBytes } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const CONFIG_DIR = join(process.env.HOME || "~", ".config", "spotify-favorites");
const TOKEN_FILE = join(CONFIG_DIR, "tokens.json");
const CLIENT_ID_FILE = join(CONFIG_DIR, "client_id");

const REDIRECT_URI = "http://127.0.0.1:9876/callback";
const SCOPES = ["user-top-read", "user-read-private"];

interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

interface Artist {
  id: string;
  name: string;
  genres: string[];
  popularity: number;
  followers: { total: number };
  external_urls: { spotify: string };
  images: { url: string; width: number; height: number }[];
}

interface TopArtistsResponse {
  items: Artist[];
  total: number;
  limit: number;
  offset: number;
  next: string | null;
  previous: string | null;
}

function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function getClientId(): string | null {
  if (existsSync(CLIENT_ID_FILE)) {
    return readFileSync(CLIENT_ID_FILE, "utf-8").trim();
  }
  return process.env.SPOTIFY_CLIENT_ID || null;
}

function saveTokens(tokens: Tokens): void {
  if (!existsSync(CONFIG_DIR)) {
    const { mkdirSync } = require("fs");
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
}

function loadTokens(): Tokens | null {
  if (existsSync(TOKEN_FILE)) {
    try {
      return JSON.parse(readFileSync(TOKEN_FILE, "utf-8"));
    } catch {
      return null;
    }
  }
  return null;
}

async function refreshAccessToken(clientId: string, refreshToken: string): Promise<Tokens> {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  const data = await response.json();
  const tokens: Tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  saveTokens(tokens);
  return tokens;
}

async function getValidToken(clientId: string): Promise<string | null> {
  const tokens = loadTokens();
  if (!tokens) return null;

  // Check if token is expired (with 60s buffer)
  if (Date.now() > tokens.expires_at - 60000) {
    try {
      const newTokens = await refreshAccessToken(clientId, tokens.refresh_token);
      return newTokens.access_token;
    } catch {
      return null;
    }
  }

  return tokens.access_token;
}

async function startAuthFlow(clientId: string): Promise<Tokens> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = randomBytes(16).toString("hex");

  const authUrl = new URL("https://accounts.spotify.com/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("scope", SCOPES.join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("code_challenge", codeChallenge);

  console.log("\nOpen this URL in your browser to authorize:\n");
  console.log(authUrl.toString());
  console.log("\nWaiting for authorization...\n");

  // Start local server to receive callback
  const code = await new Promise<string>((resolve, reject) => {
    const server = Bun.serve({
      port: 9876,
      hostname: "127.0.0.1",
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/callback") {
          const code = url.searchParams.get("code");
          const returnedState = url.searchParams.get("state");
          const error = url.searchParams.get("error");

          if (error) {
            reject(new Error(`Authorization error: ${error}`));
            server.stop();
            return new Response(
              "<html><body><h1>Authorization Failed</h1><p>You can close this window.</p></body></html>",
              { headers: { "Content-Type": "text/html" } }
            );
          }

          if (returnedState !== state) {
            reject(new Error("State mismatch"));
            server.stop();
            return new Response(
              "<html><body><h1>Error: State Mismatch</h1></body></html>",
              { headers: { "Content-Type": "text/html" } }
            );
          }

          if (code) {
            resolve(code);
            setTimeout(() => server.stop(), 100);
            return new Response(
              "<html><body><h1>Authorization Successful!</h1><p>You can close this window and return to the terminal.</p></body></html>",
              { headers: { "Content-Type": "text/html" } }
            );
          }

          reject(new Error("No code received"));
          server.stop();
          return new Response(
            "<html><body><h1>Error: No Code Received</h1></body></html>",
            { headers: { "Content-Type": "text/html" } }
          );
        }
        return new Response("Not found", { status: 404 });
      },
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      reject(new Error("Authorization timed out"));
      server.stop();
    }, 120000);
  });

  // Exchange code for tokens
  const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: clientId,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const data = await tokenResponse.json();
  const tokens: Tokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };

  saveTokens(tokens);
  console.log("Authorization successful! Tokens saved.\n");
  return tokens;
}

async function fetchTopArtists(
  accessToken: string,
  timeRange: string,
  limit: number
): Promise<TopArtistsResponse> {
  const url = new URL("https://api.spotify.com/v1/me/top/artists");
  url.searchParams.set("time_range", timeRange);
  url.searchParams.set("limit", limit.toString());

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API request failed: ${response.status} - ${error}`);
  }

  return response.json();
}

function printUsage(): void {
  console.log(`
spotify-favorites - Get your top artists from Spotify

USAGE:
  spotify-favorites [OPTIONS]

OPTIONS:
  --setup <client_id>  Save your Spotify Client ID for future use
  --time-range <range> Time range for top artists:
                         short_term  (last 4 weeks)
                         medium_term (last 6 months, default)
                         long_term   (all time)
  --limit <n>          Number of artists to return (1-50, default: 20)
  --compact            Compact JSON output (name, genres, popularity only)
  --help, -h           Show this help message

SETUP:
  1. Go to https://developer.spotify.com/dashboard
  2. Create an app (set redirect URI to http://127.0.0.1:9876/callback)
  3. Copy your Client ID
  4. Run: spotify-favorites --setup YOUR_CLIENT_ID
  5. Or set SPOTIFY_CLIENT_ID environment variable

EXAMPLES:
  spotify-favorites --setup abc123def456  # Save client ID
  spotify-favorites                       # Top 20 artists (medium term)
  spotify-favorites --time-range short_term --limit 10
  spotify-favorites --compact             # Simplified output
`);
}

async function setup(clientId?: string): Promise<void> {
  if (!clientId || !clientId.trim()) {
    console.error("Client ID required. Usage: spotify-favorites --setup <client_id>");
    console.error("\nTo get a Client ID:");
    console.error("1. Go to https://developer.spotify.com/dashboard");
    console.error("2. Create a new app");
    console.error("3. Add http://127.0.0.1:9876/callback as a Redirect URI");
    console.error("4. Copy your Client ID");
    process.exit(1);
  }

  const { mkdirSync } = await import("fs");
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CLIENT_ID_FILE, clientId.trim());
  console.log(`Client ID saved to ${CLIENT_ID_FILE}`);
  console.log("Run spotify-favorites again to authorize and fetch your top artists.");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const setupIdx = args.indexOf("--setup");
  if (setupIdx !== -1) {
    const clientIdArg = args[setupIdx + 1];
    await setup(clientIdArg);
    process.exit(0);
  }

  const clientId = getClientId();
  if (!clientId) {
    console.error("Spotify Client ID not found.");
    console.error("Run 'spotify-favorites --setup' or set SPOTIFY_CLIENT_ID environment variable.");
    process.exit(1);
  }

  // Parse options
  let timeRange = "medium_term";
  let limit = 20;
  const compact = args.includes("--compact");

  const timeRangeIdx = args.indexOf("--time-range");
  if (timeRangeIdx !== -1 && args[timeRangeIdx + 1]) {
    const range = args[timeRangeIdx + 1];
    if (["short_term", "medium_term", "long_term"].includes(range)) {
      timeRange = range;
    } else {
      console.error(`Invalid time range: ${range}`);
      console.error("Valid options: short_term, medium_term, long_term");
      process.exit(1);
    }
  }

  const limitIdx = args.indexOf("--limit");
  if (limitIdx !== -1 && args[limitIdx + 1]) {
    const n = parseInt(args[limitIdx + 1], 10);
    if (isNaN(n) || n < 1 || n > 50) {
      console.error("Limit must be between 1 and 50");
      process.exit(1);
    }
    limit = n;
  }

  // Get valid access token
  let accessToken = await getValidToken(clientId);

  if (!accessToken) {
    const tokens = await startAuthFlow(clientId);
    accessToken = tokens.access_token;
  }

  // Fetch top artists
  const data = await fetchTopArtists(accessToken, timeRange, limit);

  if (compact) {
    const simplified = data.items.map((artist) => ({
      name: artist.name,
      genres: artist.genres,
      popularity: artist.popularity,
      url: artist.external_urls.spotify,
    }));
    console.log(JSON.stringify(simplified, null, 2));
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
