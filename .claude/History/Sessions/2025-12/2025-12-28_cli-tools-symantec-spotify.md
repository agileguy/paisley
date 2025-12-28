# Session: CLI Tools - Symantec WSS & Spotify Favorites

**Date:** 2025-12-28
**Duration:** ~30 minutes

## Summary

Created two CLI tools for macOS automation and Spotify integration, plus stored personal music preferences.

## Tools Created

### 1. symantec-wss
**Location:** `~/.claude/Tools/symantec-wss/symantec-wss.ts`

CLI tool to control Symantec WSS Agent tray menu via AppleScript/System Events.

**Features:**
- `--check` - Check if disable option exists
- `--disable` - Click disable option if available
- `--json` - JSON output for scripting

**Technical:** Uses AppleScript to interact with `wssa-ui_netext` process menu bar 2 (status menu).

### 2. spotify-favorites
**Location:** `~/.claude/Tools/spotify-favorites/spotify-favorites.ts`

CLI tool to fetch top artists from Spotify using OAuth 2.0 PKCE flow.

**Features:**
- `--setup <client_id>` - Save Spotify client ID
- `--time-range short_term|medium_term|long_term` - Time period
- `--limit <n>` - Number of artists (1-50)
- `--compact` - Simplified JSON output

**Technical Notes:**
- Uses port 9876 for OAuth callback (8888 used by voice server)
- Must use `http://127.0.0.1:9876/callback` (not localhost - Spotify requirement)
- Tokens stored in `~/.config/spotify-favorites/`

## Learnings Captured

Created `~/.claude/History/Learnings/dan-musical-preferences.md` with Dan's top Spotify artists:
- Top genres: classic rock, folk, britpop, soft rock, ska, classical
- Notable artists: Queen, Dire Straits, Cat Stevens, Billy Joel, Jack Johnson, Ben Howard
- Strong preference for British artists

## Commits Made

1. `f700fdb` - Add symantec-wss CLI tool
2. `2344fd3` - Add spotify-favorites CLI tool
3. `2174394` - Add Dan's musical preferences
4. `0cdb294` - Add PAI profile configuration
5. `e34d126` - Add macOS tools (permissions, PIM, calendar helper)

## Key Decisions

- Changed Spotify OAuth port from 8888 to 9876 to avoid conflict with voice server
- Used `127.0.0.1` instead of `localhost` per Spotify's redirect URI requirements
- Stored music preferences in Learnings (markdown) rather than profile.json (structured data)

## Files Modified

- Created: `~/.claude/Tools/symantec-wss/symantec-wss.ts`
- Created: `~/.claude/Tools/spotify-favorites/spotify-favorites.ts`
- Created: `~/.claude/History/Learnings/dan-musical-preferences.md`
- Updated: `~/.claude/config/profile.json` (added then removed spotify data)
