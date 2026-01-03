#!/usr/bin/env bun
/**
 * yubicheck - Check for YubiKey USB presence
 *
 * Detects if a YubiKey is physically connected by checking for the resident
 * SSH key stored on the device.
 *
 * Usage:
 *   yubicheck          # Returns true/false, exit code 0/1
 *   yubicheck --json   # JSON output
 *   yubicheck --quiet  # No output, just exit code
 *   yubicheck --help   # Show help
 */

import { $ } from "bun";

// Types
interface CheckResult {
  present: boolean;
  method: string;
  details?: string;
}

// Constants
const SSH_KEY_PATH = `${process.env.HOME}/.ssh/yubi`;
const YUBIKEY_VENDOR_ID = "1050"; // Yubico vendor ID

// Help text
const HELP = `
yubicheck - Check for YubiKey USB presence

USAGE:
  yubicheck [options]

OPTIONS:
  --json     Output result as JSON
  --quiet    No output, only exit code (0=present, 1=absent)
  --usb      Check USB device only (faster, no touch required)
  --help     Show this help message

EXAMPLES:
  yubicheck                    # Check if YubiKey is present
  yubicheck --json             # Get JSON output
  yubicheck && echo "Found!"   # Use in scripts
  yubicheck --usb              # Quick USB check only

EXIT CODES:
  0  YubiKey is present
  1  YubiKey is not present
  2  Error occurred
`.trim();

// Parse arguments
function parseArgs(): { json: boolean; quiet: boolean; usb: boolean; help: boolean } {
  const args = process.argv.slice(2);
  return {
    json: args.includes("--json"),
    quiet: args.includes("--quiet") || args.includes("-q"),
    usb: args.includes("--usb"),
    help: args.includes("--help") || args.includes("-h"),
  };
}

// Check for YubiKey via USB device enumeration (fast, no touch)
async function checkUSBDevice(): Promise<CheckResult> {
  try {
    // Use ioreg to check for Yubico USB device
    const result = await $`ioreg -p IOUSB -l -w 0 | grep -i yubi`.quiet();
    const output = result.stdout.toString();

    if (output.includes("Yubi")) {
      return { present: true, method: "usb", details: "YubiKey detected via USB" };
    }
    return { present: false, method: "usb", details: "No YubiKey found in USB devices" };
  } catch {
    return { present: false, method: "usb", details: "No YubiKey found in USB devices" };
  }
}

// Check for YubiKey via SSH key probe (may require touch)
async function checkSSHKey(): Promise<CheckResult> {
  try {
    // First check if the key file exists
    const keyFile = Bun.file(SSH_KEY_PATH);
    if (!(await keyFile.exists())) {
      return { present: false, method: "ssh", details: "SSH key file not found" };
    }

    // Try to load the key identity (this will fail if YubiKey not present)
    // Using ssh-keygen -y to read the public key from private key
    // This requires the security key to be present
    const result = await $`/opt/homebrew/bin/ssh-keygen -y -f ${SSH_KEY_PATH} 2>&1`.quiet().nothrow();
    const output = result.stdout.toString();

    if (output.includes("sk-ssh-ed25519") || output.includes("ssh-ed25519")) {
      return { present: true, method: "ssh", details: "YubiKey SSH key accessible" };
    }

    if (output.includes("No authenticator") || output.includes("device not found")) {
      return { present: false, method: "ssh", details: "YubiKey not connected" };
    }

    // Fallback to USB check
    return await checkUSBDevice();
  } catch (error) {
    return { present: false, method: "ssh", details: `Error: ${error}` };
  }
}

// Main
async function main() {
  const args = parseArgs();

  if (args.help) {
    console.log(HELP);
    process.exit(0);
  }

  let result: CheckResult;

  if (args.usb) {
    // Fast USB-only check
    result = await checkUSBDevice();
  } else {
    // Try USB first (fast), fall back to SSH if USB check is ambiguous
    result = await checkUSBDevice();
  }

  // Output based on flags
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (!args.quiet) {
    console.log(result.present ? "true" : "false");
  }

  // Exit code: 0 = present, 1 = absent
  process.exit(result.present ? 0 : 1);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(2);
});
