# yubicheck

Check for YubiKey USB presence. Returns true/false with appropriate exit codes for scripting.

## Installation

The CLI is already installed at `~/.claude/bin/yubicheck/`. Run via:

```bash
bun run ~/.claude/bin/yubicheck/yubicheck.ts
```

Or add an alias to your shell:

```bash
echo "alias yubicheck='bun run ~/.claude/bin/yubicheck/yubicheck.ts'" >> ~/.zshrc
source ~/.zshrc
```

## Usage

```bash
# Basic check (returns "true" or "false")
yubicheck

# JSON output
yubicheck --json

# Quiet mode (exit code only)
yubicheck --quiet

# USB-only check (faster)
yubicheck --usb
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | YubiKey is present |
| 1 | YubiKey is not present |
| 2 | Error occurred |

## Scripting Examples

```bash
# Conditional execution
yubicheck && echo "YubiKey found!"

# If/else
if yubicheck --quiet; then
  echo "Proceeding with secure operation..."
else
  echo "Please insert YubiKey"
  exit 1
fi

# JSON processing with jq
yubicheck --json | jq -r '.details'
```

## SSH Key

This CLI uses a resident SSH key stored on the YubiKey:
- Key file: `~/.ssh/yubi`
- Key type: ED25519-SK (FIDO2)
- Detection method: USB device enumeration

## Requirements

- Bun runtime
- macOS (uses `ioreg` for USB detection)
