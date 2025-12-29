# gchat Quick Start

**Send messages to Google Chat in 30 seconds**

## 1. Get Webhook URL

1. Open Google Chat space
2. Click space name → **Manage webhooks**
3. Create webhook, copy URL

## 2. Configure

```bash
echo 'GCHAT_WEBHOOK_URL=<your-url>' >> ~/.claude/.env
```

## 3. Send Messages

```bash
# Text message
gchat send "Hello World!"

# Card message
gchat card --title "Alert" --text "Something happened"

# Thread reply
gchat thread "Update" --thread "my-thread"
```

## Common Patterns

```bash
# CI notification
gchat card --title "Build Passed" --button-text "View" --button-url "https://..."

# Quick alert
gchat send "Server restarted successfully"

# Override webhook
gchat send "Test" --webhook "https://..."
```

## Full Documentation

See: `~/.claude/bin/gchat/README.md`
