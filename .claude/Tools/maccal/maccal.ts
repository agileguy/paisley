#!/usr/bin/env bun
/**
 * maccal - Mac Calendar CLI Tool
 *
 * Fetches calendar events from macOS Calendar.app via AppleScript.
 * Returns events in JSON format with calendar name included.
 *
 * Usage:
 *   maccal --until=1d      # Events for next 1 day
 *   maccal --until=1w      # Events for next 1 week
 *   maccal -u 2w           # Events for next 2 weeks
 */

import { $ } from "bun";
import { parseArgs } from "util";

interface CalendarEvent {
  id: string;
  title: string;
  calendar: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  location?: string;
  notes?: string;
  url?: string;
}

interface CLIArgs {
  until: string;
  calendar?: string;
  format: "json" | "pretty";
  help: boolean;
}

function printHelp(): void {
  console.log(`
maccal - Fetch calendar events from macOS Calendar.app

USAGE:
  maccal --until=<duration> [options]
  maccal -u <duration> [options]

REQUIRED:
  -u, --until       Time range: 1d, 3d, 1w, 2w, 1m, 3m, etc.
                    d=days, w=weeks, m=months

OPTIONS:
  -c, --calendar    Filter by calendar name (case-insensitive partial match)
  -f, --format      Output format: json, pretty (default: json)
  -h, --help        Show this help message

EXAMPLES:
  # Get events for next 24 hours
  maccal -u 1d

  # Get events for next week
  maccal --until=1w

  # Get events for next 2 weeks from Work calendar
  maccal -u 2w -c work

  # Pretty print events for next month
  maccal -u 1m -f pretty

OUTPUT:
  JSON array of events with: id, title, calendar, startDate, endDate,
  allDay, location, notes, url
`);
}

function parseUntilDuration(duration: string): Date {
  const match = duration.match(/^(\d+)([dwm])$/i);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}. Use format like 1d, 1w, 2w, 1m`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  const now = new Date();
  const endDate = new Date(now);

  switch (unit) {
    case "d":
      endDate.setDate(endDate.getDate() + value);
      break;
    case "w":
      endDate.setDate(endDate.getDate() + value * 7);
      break;
    case "m":
      endDate.setMonth(endDate.getMonth() + value);
      break;
    default:
      throw new Error(`Unknown time unit: ${unit}`);
  }

  return endDate;
}

function formatDateForAppleScript(date: Date): string {
  // Format: "January 1, 2025 at 12:00:00 AM"
  return date.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

async function getCalendarEvents(endDate: Date, calendarFilter?: string): Promise<CalendarEvent[]> {
  const startDateStr = formatDateForAppleScript(new Date());
  const endDateStr = formatDateForAppleScript(endDate);

  // AppleScript to fetch calendar events
  const appleScript = `
    use AppleScript version "2.4"
    use scripting additions
    use framework "Foundation"

    set startDate to date "${startDateStr}"
    set endDate to date "${endDateStr}"
    set calFilter to "${calendarFilter || ""}"
    set outputList to {}

    tell application "Calendar"
      set allCalendars to calendars
      repeat with cal in allCalendars
        set calName to name of cal

        -- Apply calendar filter if specified
        if calFilter is "" or calName contains calFilter then
          try
            set calEvents to (every event of cal whose start date ≥ startDate and start date ≤ endDate)
            repeat with evt in calEvents
              try
                set evtId to uid of evt
                set evtTitle to summary of evt
                set evtStart to start date of evt
                set evtEnd to end date of evt
                set evtAllDay to allday event of evt

                set evtLocation to ""
                try
                  set evtLocation to location of evt
                  if evtLocation is missing value then set evtLocation to ""
                end try

                set evtNotes to ""
                try
                  set evtNotes to description of evt
                  if evtNotes is missing value then set evtNotes to ""
                end try

                set evtUrl to ""
                try
                  set evtUrl to url of evt
                  if evtUrl is missing value then set evtUrl to ""
                end try

                -- Format as pipe-delimited string for easy parsing
                set evtRecord to evtId & "|" & evtTitle & "|" & calName & "|" & (evtStart as string) & "|" & (evtEnd as string) & "|" & evtAllDay & "|" & evtLocation & "|" & evtNotes & "|" & evtUrl
                set end of outputList to evtRecord
              end try
            end repeat
          end try
        end if
      end repeat
    end tell

    -- Join with newline
    set AppleScript's text item delimiters to "
"
    return outputList as string
  `;

  try {
    const result = await $`osascript -e ${appleScript}`.quiet();
    const output = result.stdout.toString().trim();

    if (!output) {
      return [];
    }

    const events: CalendarEvent[] = [];
    const lines = output.split("\n");

    for (const line of lines) {
      if (!line.trim()) continue;

      const parts = line.split("|");
      if (parts.length >= 6) {
        const [id, title, calendar, startDate, endDate, allDayStr, location, notes, url] = parts;

        events.push({
          id: id || "",
          title: title || "",
          calendar: calendar || "",
          startDate: startDate || "",
          endDate: endDate || "",
          allDay: allDayStr === "true",
          location: location || undefined,
          notes: notes || undefined,
          url: url || undefined,
        });
      }
    }

    // Sort by start date
    events.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    return events;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("Calendar")) {
        throw new Error("Unable to access Calendar.app. Make sure it's installed and you've granted terminal access to Calendar.");
      }
    }
    throw error;
  }
}

function formatPretty(events: CalendarEvent[]): void {
  if (events.length === 0) {
    console.log("No events found in the specified time range.");
    return;
  }

  let currentDate = "";

  for (const event of events) {
    const startDate = new Date(event.startDate);
    const dateStr = startDate.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    if (dateStr !== currentDate) {
      currentDate = dateStr;
      console.log(`\n\x1b[1m\x1b[36m${dateStr}\x1b[0m`);
      console.log("─".repeat(50));
    }

    const timeStr = event.allDay
      ? "All Day"
      : startDate.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });

    const calColor = "\x1b[33m";
    const reset = "\x1b[0m";

    console.log(`  ${timeStr.padEnd(10)} \x1b[1m${event.title}\x1b[0m`);
    console.log(`             ${calColor}[${event.calendar}]${reset}`);

    if (event.location) {
      console.log(`             📍 ${event.location}`);
    }
  }
  console.log();
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      until: { type: "string", short: "u" },
      calendar: { type: "string", short: "c" },
      format: { type: "string", short: "f", default: "json" },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  if (!values.until) {
    console.error("Error: --until is required");
    console.error("Run 'maccal --help' for usage information");
    process.exit(1);
  }

  const args: CLIArgs = {
    until: values.until,
    calendar: values.calendar,
    format: (values.format as "json" | "pretty") || "json",
    help: values.help || false,
  };

  try {
    const endDate = parseUntilDuration(args.until);
    const events = await getCalendarEvents(endDate, args.calendar);

    if (args.format === "pretty") {
      formatPretty(events);
    } else {
      console.log(JSON.stringify(events, null, 2));
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    }
    process.exit(1);
  }
}

main();
