#!/usr/bin/env bun
/**
 * symantec-wss - Control Symantec WSS Agent from the command line
 *
 * Interacts with the Symantec WSS Tray menu to check status and disable the agent.
 */

import { $ } from "bun";

const PROCESS_NAME = "wssa-ui_netext";

interface MenuState {
  available: boolean;
  menuItems: string[];
  disableOptionExists: boolean;
  error?: string;
}

async function getMenuState(): Promise<MenuState> {
  const script = `
tell application "System Events"
    tell process "${PROCESS_NAME}"
        try
            click menu bar item 1 of menu bar 2
            delay 0.3
            set menuItemNames to name of every menu item of menu 1 of menu bar item 1 of menu bar 2
            -- Close the menu by pressing Escape
            key code 53
            return menuItemNames
        on error errMsg
            return "ERROR:" & errMsg
        end try
    end tell
end tell`;

  try {
    const result = await $`osascript -e ${script}`.text();
    const trimmed = result.trim();

    if (trimmed.startsWith("ERROR:")) {
      return {
        available: false,
        menuItems: [],
        disableOptionExists: false,
        error: trimmed.replace("ERROR:", "")
      };
    }

    const items = trimmed.split(", ").filter(item => item !== "missing value");
    const disableOptionExists = items.some(item =>
      item.toLowerCase().includes("disable symantec wss")
    );

    return {
      available: true,
      menuItems: items,
      disableOptionExists
    };
  } catch (err) {
    return {
      available: false,
      menuItems: [],
      disableOptionExists: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

async function clickDisable(): Promise<{ success: boolean; message: string }> {
  const script = `
tell application "System Events"
    tell process "${PROCESS_NAME}"
        try
            click menu bar item 1 of menu bar 2
            delay 0.3
            set menuItemNames to name of every menu item of menu 1 of menu bar item 1 of menu bar 2

            set disableItem to missing value
            repeat with menuItem in every menu item of menu 1 of menu bar item 1 of menu bar 2
                if name of menuItem contains "Disable" then
                    set disableItem to menuItem
                    exit repeat
                end if
            end repeat

            if disableItem is not missing value then
                click disableItem
                return "SUCCESS:Clicked Disable option"
            else
                key code 53
                return "NOT_FOUND:Disable option not found in menu"
            end if
        on error errMsg
            key code 53
            return "ERROR:" & errMsg
        end try
    end tell
end tell`;

  try {
    const result = await $`osascript -e ${script}`.text();
    const trimmed = result.trim();

    if (trimmed.startsWith("SUCCESS:")) {
      return { success: true, message: trimmed.replace("SUCCESS:", "") };
    } else if (trimmed.startsWith("NOT_FOUND:")) {
      return { success: false, message: trimmed.replace("NOT_FOUND:", "") };
    } else if (trimmed.startsWith("ERROR:")) {
      return { success: false, message: trimmed.replace("ERROR:", "") };
    }

    return { success: false, message: `Unexpected response: ${trimmed}` };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : String(err)
    };
  }
}

async function checkProcessRunning(): Promise<boolean> {
  try {
    const result = await $`pgrep -x ${PROCESS_NAME}`.quiet();
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

function printUsage() {
  console.log(`
symantec-wss - Control Symantec WSS Agent

USAGE:
  symantec-wss [OPTIONS]

OPTIONS:
  --check     Check if disable option exists (don't click)
  --disable   Click the disable option if it exists
  --json      Output in JSON format
  --help, -h  Show this help message

EXAMPLES:
  symantec-wss --check          # Just check if disable option is available
  symantec-wss --disable        # Check and click disable if available
  symantec-wss --check --json   # Check and output JSON

EXIT CODES:
  0  Success (option exists/clicked successfully)
  1  Option not found or error
  2  Symantec WSS Agent not running
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const checkOnly = args.includes("--check");
  const doDisable = args.includes("--disable");
  const jsonOutput = args.includes("--json");

  // Default behavior: check and disable if no flags
  const shouldCheck = checkOnly || (!checkOnly && !doDisable);
  const shouldDisable = doDisable || (!checkOnly && !doDisable);

  // Check if process is running
  const isRunning = await checkProcessRunning();

  if (!isRunning) {
    if (jsonOutput) {
      console.log(JSON.stringify({
        error: "Symantec WSS Agent not running",
        running: false
      }));
    } else {
      console.error("Symantec WSS Agent is not running");
    }
    process.exit(2);
  }

  // Get menu state
  const state = await getMenuState();

  if (!state.available) {
    if (jsonOutput) {
      console.log(JSON.stringify({
        error: state.error,
        available: false
      }));
    } else {
      console.error(`Failed to access menu: ${state.error}`);
    }
    process.exit(1);
  }

  if (checkOnly) {
    if (jsonOutput) {
      console.log(JSON.stringify({
        running: true,
        menuItems: state.menuItems,
        disableOptionExists: state.disableOptionExists
      }));
    } else {
      if (state.disableOptionExists) {
        console.log("Disable Symantec WSS Agent option is available");
      } else {
        console.log("Disable option NOT found. Available items:");
        state.menuItems.forEach(item => console.log(`  - ${item}`));
      }
    }
    process.exit(state.disableOptionExists ? 0 : 1);
  }

  // Disable mode
  if (shouldDisable) {
    if (!state.disableOptionExists) {
      if (jsonOutput) {
        console.log(JSON.stringify({
          success: false,
          message: "Disable option not found",
          menuItems: state.menuItems
        }));
      } else {
        console.log("Disable option not found in menu");
        console.log("Available items:");
        state.menuItems.forEach(item => console.log(`  - ${item}`));
      }
      process.exit(1);
    }

    const result = await clickDisable();

    if (jsonOutput) {
      console.log(JSON.stringify({
        success: result.success,
        message: result.message
      }));
    } else {
      if (result.success) {
        console.log("Successfully clicked Disable Symantec WSS Agent");
      } else {
        console.error(`Failed: ${result.message}`);
      }
    }

    process.exit(result.success ? 0 : 1);
  }
}

main().catch(err => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
