# Session: CLI Tools - Symantec WSS, Spotify & News Digest

**Date:** 2025-12-28
**Duration:** ~1 hour

## Summary

Created four CLI tools for macOS automation, Spotify integration, and news aggregation. Set up automated Symantec WSS disabling via cron.

## Tools Created

### 1. symantec-wss
**Location:** `~/.claude/Tools/symantec-wss/symantec-wss.ts`

CLI tool to control Symantec WSS Agent tray menu via AppleScript/System Events.

**Features:**
- `--check` - Check if disable option exists
- `--disable` - Click disable option if available
- `--json` - JSON output for scripting

**Technical:** Uses AppleScript to interact with `wssa-ui_netext` process menu bar 2 (status menu).

**Cron Job:** Added `disable-wss-cron.sh` to auto-disable WSS every 15 minutes.
```
*/15 * * * * ~/.claude/Tools/symantec-wss/disable-wss-cron.sh
```

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

### 3. news-digest
**Location:** `~/.claude/Tools/news-digest/news-digest.ts`

CLI tool to aggregate world news from major outlets with topic filtering.

**Sources:** BBC, The Guardian, NPR, Al Jazeera, Deutsche Welle

**Features:**
- `--since <time>` - Time range (1h, 6h, 24h, 1d, 7d, 1w)
- `--topic <topic>` - Filter by topic (conflict, politics, economy, climate, health, tech, sports)
- `--articles <n>` - Number of articles to return
- `--sources <list>` - Select specific sources
- `--json` - JSON output

**Technical Notes:**
- Fetches and parses RSS feeds
- Auto-categorizes articles by topic keywords
- Filters out sponsored/ad content
- Refined tech keywords to avoid false positives

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
6. `f9db6ba` - Add session summary
7. `4ee5a9e` - Add cron script to auto-disable Symantec WSS
8. `19bdb79` - Add news-digest CLI tool
9. `9888bb6` - Refine tech topic keywords

## Key Decisions

- Changed Spotify OAuth port from 8888 to 9876 to avoid conflict with voice server
- Used `127.0.0.1` instead of `localhost` per Spotify's redirect URI requirements
- Stored music preferences in Learnings (markdown) rather than profile.json
- Replaced CNN/Reuters/AP feeds with Guardian/NPR/DW due to access issues
- Refined tech keywords to focus on specific terms (AI companies, crypto, space) vs generic words

## Files Created

- `~/.claude/Tools/symantec-wss/symantec-wss.ts`
- `~/.claude/Tools/symantec-wss/disable-wss-cron.sh`
- `~/.claude/Tools/spotify-favorites/spotify-favorites.ts`
- `~/.claude/Tools/news-digest/news-digest.ts`
- `~/.claude/History/Learnings/dan-musical-preferences.md`
- `~/.claude/config/profile.json`
