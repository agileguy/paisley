#!/bin/bash
# setup-kitty-permissions.sh
# Triggers permission dialogs and opens System Settings for kitty terminal
# macOS doesn't allow granting permissions programmatically (security feature)

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Kitty Terminal Permission Setup${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}NOTE: macOS requires manual approval for security permissions.${NC}"
echo -e "${YELLOW}This script will trigger dialogs and open System Settings.${NC}"
echo ""

# Function to check if running in kitty
check_kitty() {
    if [[ "$TERM" == "xterm-kitty" ]]; then
        echo -e "${GREEN}✓ Running in kitty terminal${NC}"
        return 0
    else
        echo -e "${RED}✗ Not running in kitty (current: $TERM)${NC}"
        echo -e "${YELLOW}  Run this script from kitty for best results${NC}"
        return 1
    fi
}

# Function to trigger Calendar permission
trigger_calendar() {
    echo -e "\n${BLUE}[1/4] Calendar Access${NC}"
    echo "  Triggering Calendar permission dialog..."

    # Try EventKit-based access first (for calendar-helper)
    if [[ -f "$HOME/.claude/Tools/maccal/calendar-helper" ]]; then
        "$HOME/.claude/Tools/maccal/calendar-helper" --start "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --end "$(date -u +%Y-%m-%dT%H:%M:%SZ)" 2>/dev/null || true
        echo -e "${GREEN}  ✓ Calendar helper triggered${NC}"
    fi

    # Also trigger AppleScript calendar access
    osascript -e 'tell application "Calendar" to get name of first calendar' 2>/dev/null && \
        echo -e "${GREEN}  ✓ AppleScript Calendar access granted${NC}" || \
        echo -e "${YELLOW}  → Dialog should appear - click 'OK' to grant access${NC}"
}

# Function to trigger Automation/AppleScript permissions
trigger_automation() {
    echo -e "\n${BLUE}[2/4] Automation (AppleScript) Access${NC}"
    echo "  Triggering Automation permission dialogs..."

    # System Events - needed for many AppleScript operations
    osascript -e 'tell application "System Events" to get name of first process' 2>/dev/null && \
        echo -e "${GREEN}  ✓ System Events access granted${NC}" || \
        echo -e "${YELLOW}  → System Events dialog should appear${NC}"

    # Finder
    osascript -e 'tell application "Finder" to get name of home' 2>/dev/null && \
        echo -e "${GREEN}  ✓ Finder access granted${NC}" || \
        echo -e "${YELLOW}  → Finder dialog should appear${NC}"
}

# Function to check/prompt Accessibility
check_accessibility() {
    echo -e "\n${BLUE}[3/4] Accessibility Access${NC}"

    # There's no direct way to trigger accessibility prompt from CLI
    # We can only open the pane and instruct user
    echo "  Accessibility must be granted manually in System Settings."
    echo -e "${YELLOW}  → Opening System Settings...${NC}"
    open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
    echo ""
    echo "  Instructions:"
    echo "    1. Click the lock icon to make changes"
    echo "    2. Click '+' button"
    echo "    3. Navigate to /Applications/kitty.app"
    echo "    4. Click 'Open'"
    echo ""
    read -p "  Press Enter when done..."
}

# Function to check/prompt Full Disk Access
check_full_disk() {
    echo -e "\n${BLUE}[4/4] Full Disk Access${NC}"

    echo "  Full Disk Access must be granted manually in System Settings."
    echo -e "${YELLOW}  → Opening System Settings...${NC}"
    open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
    echo ""
    echo "  Instructions:"
    echo "    1. Click the lock icon to make changes"
    echo "    2. Click '+' button"
    echo "    3. Navigate to /Applications/kitty.app"
    echo "    4. Click 'Open'"
    echo ""
    read -p "  Press Enter when done..."
}

# Function to verify permissions
verify_permissions() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  Verification${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    echo -e "\nTesting Calendar access..."
    if osascript -e 'tell application "Calendar" to get name of first calendar' 2>/dev/null; then
        echo -e "${GREEN}  ✓ Calendar: OK${NC}"
    else
        echo -e "${RED}  ✗ Calendar: Not granted${NC}"
    fi

    echo -e "\nTesting System Events access..."
    if osascript -e 'tell application "System Events" to get name of first process' 2>/dev/null; then
        echo -e "${GREEN}  ✓ System Events: OK${NC}"
    else
        echo -e "${RED}  ✗ System Events: Not granted${NC}"
    fi

    echo -e "\nTesting maccal tool..."
    if command -v maccal &>/dev/null; then
        if maccal -u 1d 2>/dev/null | head -1 | grep -q "^\["; then
            echo -e "${GREEN}  ✓ maccal: OK${NC}"
        else
            echo -e "${YELLOW}  ? maccal: May need Calendar permission${NC}"
        fi
    else
        echo -e "${YELLOW}  - maccal: Not installed${NC}"
    fi
}

# Main
main() {
    check_kitty || true

    echo ""
    echo "This script will:"
    echo "  1. Trigger Calendar permission dialog"
    echo "  2. Trigger Automation permission dialogs"
    echo "  3. Open Accessibility settings (manual)"
    echo "  4. Open Full Disk Access settings (manual)"
    echo ""
    read -p "Press Enter to begin..."

    trigger_calendar
    trigger_automation
    check_accessibility
    check_full_disk
    verify_permissions

    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  Setup Complete!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "If you still have permission issues:"
    echo "  • Restart kitty terminal"
    echo "  • Run: tccutil reset All com.apple.Terminal  (resets all permissions)"
    echo ""
}

main "$@"
