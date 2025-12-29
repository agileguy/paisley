# gchat - Google Chat Webhook CLI

**Version:** 1.0.0
**Author:** Daniel Elliott
**Last Updated:** 2025-12-28

---

## Overview

gchat is a clean, deterministic command-line interface for sending messages to Google Chat spaces via webhooks. It provides simple access to Google Chat's incoming webhook API with a focus on reliability, composability, and documentation.

### Philosophy

gchat follows PAI's **CLI-First Architecture**:

1. **Deterministic** - Same input always produces same output
2. **Clean** - Single responsibility (Google Chat messaging only)
3. **Composable** - JSON output pipes to jq, grep, other tools
4. **Documented** - Comprehensive help and examples
5. **Testable** - Predictable, verifiable behavior

---

## Installation

```bash
# CLI is located at ~/.claude/bin/gchat/
chmod +x ~/.claude/bin/gchat/gchat.ts

# Add to PATH (add to ~/.zshrc or ~/.bashrc)
export PATH="$HOME/.claude/bin/gchat:$PATH"

# Or create alias
alias gchat="bun run ~/.claude/bin/gchat/gchat.ts"
```

---

## Configuration

### Getting a Webhook URL

1. Open Google Chat in browser
2. Open the space you want to message
3. Click space name → **Manage webhooks**
4. Click **Create** or **Add webhook**
5. Name it (e.g., "PAI Notifications")
6. Copy the webhook URL

### Setting Up

Add to `~/.claude/.env`:

```bash
GCHAT_WEBHOOK_URL=https://chat.googleapis.com/v1/spaces/XXXXX/messages?key=YYYYY&token=ZZZZZ
```

Or pass `--webhook` flag with each command.

---

## Usage

### Send Text Message

```bash
# Simple message
gchat send "Hello from PAI!"

# With explicit webhook
gchat send "Alert!" --webhook "https://chat.googleapis.com/v1/spaces/..."
```

### Send Card Message

```bash
# Card with title and text
gchat card --title "Build Status" --subtitle "CI/CD" --text "Build #42 passed successfully"

# Card with button
gchat card --title "New PR" \
  --subtitle "Review Required" \
  --text "PR #123: Add new feature" \
  --button-text "View PR" \
  --button-url "https://github.com/org/repo/pull/123"

# Card with image
gchat card --title "Deployment" \
  --image "https://example.com/success.png" \
  --text "Production deployment complete"
```

### Thread Replies

```bash
# Reply to a thread (creates or appends to thread with key)
gchat thread "Build fixed!" --thread "build-notifications"

# All messages with same --thread key go to same thread
gchat thread "Running tests..." --thread "build-123"
gchat thread "Tests passed!" --thread "build-123"
```

---

## Examples

### CI/CD Notifications

```bash
# Build started
gchat card --title "Build Started" \
  --subtitle "main branch" \
  --text "Commit: abc123 by @developer"

# Build completed
gchat card --title "Build Passed" \
  --subtitle "main branch" \
  --text "All 42 tests passed" \
  --button-text "View Logs" \
  --button-url "https://ci.example.com/build/123"
```

### Alert Integration

```bash
# System alert
gchat send "ALERT: CPU usage above 90% on prod-server-1"

# With structured card
gchat card --title "System Alert" \
  --subtitle "Production" \
  --text "CPU: 92% | Memory: 78% | Disk: 45%"
```

### Scripting

```bash
# In a shell script
#!/bin/bash
RESULT=$(./deploy.sh 2>&1)
if [ $? -eq 0 ]; then
  gchat send "Deployment successful"
else
  gchat send "Deployment failed: $RESULT"
fi
```

### Piping with jq

```bash
# Get message ID from response
gchat send "Test" | jq -r '.name'

# Check sender info
gchat send "Hello" | jq '.sender'
```

---

## Command Reference

| Command | Description |
|---------|-------------|
| `send <message>` | Send text message |
| `card` | Send rich card message |
| `thread <message>` | Send threaded reply |
| `help` | Show help |
| `version` | Show version |

### Global Options

| Option | Description |
|--------|-------------|
| `--webhook <url>` | Override webhook URL |

### Card Options

| Option | Description |
|--------|-------------|
| `--title <text>` | Card title (required) |
| `--subtitle <text>` | Card subtitle |
| `--text <text>` | Card body text |
| `--image <url>` | Header image URL |
| `--button-text <text>` | Button label |
| `--button-url <url>` | Button link |

### Thread Options

| Option | Description |
|--------|-------------|
| `--thread <key>` | Thread key for grouping |

---

## API Response Format

All commands return Google Chat API response:

```json
{
  "name": "spaces/XXXXX/messages/YYYYY",
  "sender": {
    "name": "users/ZZZZZ",
    "displayName": "PAI Webhook",
    "type": "BOT"
  },
  "createTime": "2025-12-28T12:00:00.000Z",
  "text": "Hello from PAI!"
}
```

---

## Error Handling

- All errors go to stderr
- Exit code 0 on success, 1 on error
- Error messages include context and suggestions

```bash
# Missing webhook
$ gchat send "Test"
Error: GCHAT_WEBHOOK_URL not found
Set it in ~/.claude/.env or pass --webhook <url>

# Invalid webhook
$ gchat send "Test" --webhook "invalid"
Error: GChat API error (400): Invalid webhook URL
```

---

## Troubleshooting

### "GCHAT_WEBHOOK_URL not found"

Ensure webhook URL is set in `~/.claude/.env`:
```bash
echo 'GCHAT_WEBHOOK_URL=https://...' >> ~/.claude/.env
```

### "GChat API error (403)"

Webhook may be expired or deleted. Create a new webhook in the space.

### "GChat API error (404)"

Space may have been deleted or webhook URL is malformed.

---

## Related Resources

- [Google Chat Webhooks Guide](https://developers.google.com/workspace/chat/quickstart/webhooks)
- [Card Message Format](https://developers.google.com/chat/api/guides/message-formats/cards)
- [PAI CLI-First Architecture](~/.claude/Skills/CORE/CONSTITUTION.md)
