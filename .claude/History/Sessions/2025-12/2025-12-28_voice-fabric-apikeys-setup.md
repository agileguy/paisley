# Session: Voice, Fabric & API Keys Setup

**Date:** December 28, 2025
**Duration:** ~2 hours

---

## Summary

Comprehensive PAI setup session covering voice server configuration, API key management, Fabric CLI installation, and Jamaica travel research.

---

## Completed Tasks

### 1. Voice Server Setup
- Fixed `.env` path bug (`~/.env` → `~/.claude/.env`)
- Changed default voice to **Alice** (female, ElevenLabs)
- Voice ID: `Xb7hH8MSUJpSbSDYk0k2`
- Tested and confirmed working on port 8888

### 2. API Keys Configured in `~/.claude/.env`

| Service | Variable | Purpose |
|---------|----------|---------|
| ElevenLabs | `ELEVENLABS_API_KEY` | Voice synthesis (Alice) |
| Perplexity | `PERPLEXITY_API_KEY` | Fast web research |
| Google Gemini | `GOOGLE_API_KEY` | Multi-perspective research |
| BrightData | `BRIGHTDATA_API_KEY` | CAPTCHA bypass scraping |

### 3. Fabric CLI Installation
- Installed Go runtime v1.25.5 via Homebrew
- Installed Fabric CLI at `~/go/bin/fabric`
- Symlinked 247 patterns from `~/.claude/Skills/Fabric/tools/patterns/`
- Configured with Gemini 2.5 Flash in `~/.config/fabric/.env`
- Added Go bin to PATH in `~/.zshrc`

**Fabric Config:**
```
GEMINI_API_KEY=AIza...
DEFAULT_MODEL=gemini-2.5-flash
DEFAULT_VENDOR=Gemini
```

### 4. Research: Jamaica Travel (MBJ → Ocean Coral Spring)
- Ran parallel research with 9 agents (3 per researcher type)
- Key finding: **FREE airport transfer when booking direct** via oceanhotels.com
- Alternative: $55 private transfer from Desk 4 at MBJ
- Distance: 23 miles, 35-45 min drive
- Rental cars NOT recommended (left-side driving, poor roads)

### 5. Git Commits

```
4575856 Configure PAI instance with Paisley identity and local paths
2332af5 Fix: Voice server now reads .env from ~/.claude/.env
```

- Committer: `agileguy <agile.guy@hotmail.com>`
- Pushed to: `github.com/agileguy/paisley`

### 6. Cleanup
- Killed stuck `fabric --version` background process
- Cleaned up stale task output files in `/tmp/claude/`

---

## System Status at End of Session

| Component | Status | Details |
|-----------|--------|---------|
| Voice Server | Running | Port 8888, Alice voice, ElevenLabs |
| Fabric CLI | Installed | 247 patterns, Gemini 2.5 Flash |
| Research Agents | Ready | Claude, Perplexity, Gemini all configured |
| Git | Clean | 2 commits pushed to origin/main |

---

## Key Learnings

1. **Voice server .env path**: Must be `~/.claude/.env`, not `~/.env`
2. **Gemini quota**: Models have separate quotas; 2.0-flash can exhaust while 2.5-flash still works
3. **Fabric patterns**: Can symlink from PAI's local patterns instead of downloading
4. **Jamaica transfers**: Book direct with Ocean Hotels for free transfers

---

## Files Modified

- `.claude/voice-server/server.ts` - Fixed .env path
- `.claude/Agents/*.md` - Set assistant name to Paisley
- `.claude/settings.json` - Set PAI_DIR to local path
- `~/.claude/.env` - Added API keys
- `~/.config/fabric/.env` - Fabric configuration
- `~/.zshrc` - Added Go bin to PATH
