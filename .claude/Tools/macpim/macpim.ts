#!/usr/bin/env bun
/**
 * macpim - Mac Personal Information Manager CLI
 *
 * Fetches emails and contacts from macOS Mail and Contacts apps.
 * Returns data in JSON format.
 *
 * Usage:
 *   macpim contacts                      # List contacts
 *   macpim contacts --search=john        # Search contacts
 *   macpim emails                        # List recent emails
 *   macpim emails --since=7 --unread     # Unread emails from last 7 days
 */

import { $ } from "bun";
import { parseArgs } from "util";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

interface Contact {
  id: string;
  givenName: string;
  familyName: string;
  fullName?: string;
  organization?: string;
  jobTitle?: string;
  emails?: { label: string; value: string }[];
  phones?: { label: string; value: string }[];
  addresses?: { label: string; street?: string; city?: string; state?: string; postalCode?: string; country?: string }[];
  birthday?: string;
  hasImage?: boolean;
  notes?: string;
}

interface Email {
  id: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  read: boolean;
  flagged: boolean;
  preview?: string;
  account?: string;
}

interface Mailbox {
  account: string;
  mailbox: string;
}

function printHelp(): void {
  console.log(`
macpim - Fetch emails and contacts from macOS

USAGE:
  macpim <command> [options]

COMMANDS:
  contacts              List or search contacts
  emails                List emails from mailbox
  mailboxes             List available mailboxes

CONTACTS OPTIONS:
  -s, --search <query>  Search contacts by name
  -l, --limit <n>       Maximum contacts to return (default: 100)
  -f, --format <fmt>    Output format: json, pretty (default: json)

EMAILS OPTIONS:
  -m, --mailbox <name>  Mailbox name (default: INBOX)
  -a, --account <name>  Account name (optional)
  -s, --since <days>    Emails from last N days (default: 7)
  -l, --limit <n>       Maximum emails to return (default: 50)
  -u, --unread          Only show unread emails
  -f, --format <fmt>    Output format: json, pretty (default: json)

EXAMPLES:
  # List all contacts
  macpim contacts

  # Search for contacts named "John"
  macpim contacts -s john

  # List recent emails
  macpim emails

  # List unread emails from last 3 days
  macpim emails --since=3 --unread

  # List emails from specific mailbox
  macpim emails --mailbox="Sent" --account="iCloud"

  # Pretty print contacts
  macpim contacts -f pretty

OUTPUT:
  JSON array of contacts or emails with full metadata
`);
}

async function ensureHelperCompiled(helperName: string): Promise<string> {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const swiftFile = join(scriptDir, `${helperName}.swift`);
  const binaryFile = join(scriptDir, helperName);

  // Check if binary needs recompilation
  if (!existsSync(binaryFile)) {
    console.error(`Compiling ${helperName}...`);
    try {
      await $`swiftc -O ${swiftFile} -o ${binaryFile}`.quiet();
    } catch (error) {
      throw new Error(`Failed to compile ${helperName}: ${error}`);
    }
  }

  return binaryFile;
}

async function getContacts(search?: string, limit: number = 100): Promise<Contact[]> {
  const helper = await ensureHelperCompiled("contacts-helper");

  const args: string[] = [];
  if (search) {
    args.push("--search", search);
  }
  args.push("--limit", limit.toString());

  try {
    const result = await $`${helper} ${args}`.quiet();
    const output = result.stdout.toString().trim();

    if (!output || output === "[]") {
      return [];
    }

    const parsed = JSON.parse(output);
    if (parsed.error) {
      throw new Error(parsed.error);
    }

    return parsed as Contact[];
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("access denied") || error.message.includes("Contacts access")) {
        throw new Error("Contacts access denied. Grant access in System Settings > Privacy & Security > Contacts");
      }
    }
    throw error;
  }
}

async function getEmails(
  mailbox: string = "INBOX",
  account?: string,
  since: number = 7,
  limit: number = 50,
  unreadOnly: boolean = false
): Promise<Email[]> {
  const helper = await ensureHelperCompiled("mail-helper");

  const args: string[] = [
    "--mailbox", mailbox,
    "--since", since.toString(),
    "--limit", limit.toString()
  ];

  if (account) {
    args.push("--account", account);
  }

  if (unreadOnly) {
    args.push("--unread");
  }

  try {
    const result = await $`${helper} ${args}`.quiet();
    const output = result.stdout.toString().trim();

    if (!output || output === "[]") {
      return [];
    }

    const parsed = JSON.parse(output);
    if (parsed.error) {
      throw new Error(parsed.error);
    }

    return parsed as Email[];
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("access denied") || error.message.includes("Automation")) {
        throw new Error("Mail access denied. Grant access in System Settings > Privacy & Security > Automation");
      }
    }
    throw error;
  }
}

async function listMailboxes(): Promise<Mailbox[]> {
  const helper = await ensureHelperCompiled("mail-helper");

  try {
    const result = await $`${helper} --list-mailboxes`.quiet();
    const output = result.stdout.toString().trim();

    if (!output || output === "[]") {
      return [];
    }

    const parsed = JSON.parse(output);
    if (parsed.error) {
      throw new Error(parsed.error);
    }

    return parsed as Mailbox[];
  } catch (error) {
    throw error;
  }
}

function formatContactsPretty(contacts: Contact[]): void {
  if (contacts.length === 0) {
    console.log("No contacts found.");
    return;
  }

  console.log(`\n\x1b[1m\x1b[36mContacts (${contacts.length})\x1b[0m`);
  console.log("─".repeat(60));

  for (const contact of contacts) {
    const name = contact.fullName || `${contact.givenName} ${contact.familyName}`.trim() || "(No name)";
    console.log(`\n  \x1b[1m${name}\x1b[0m`);

    if (contact.organization) {
      console.log(`    \x1b[33m${contact.organization}\x1b[0m${contact.jobTitle ? ` - ${contact.jobTitle}` : ""}`);
    }

    if (contact.emails && contact.emails.length > 0) {
      for (const email of contact.emails) {
        console.log(`    📧 ${email.value} \x1b[90m(${email.label})\x1b[0m`);
      }
    }

    if (contact.phones && contact.phones.length > 0) {
      for (const phone of contact.phones) {
        console.log(`    📱 ${phone.value} \x1b[90m(${phone.label})\x1b[0m`);
      }
    }
  }
  console.log();
}

function formatEmailsPretty(emails: Email[]): void {
  if (emails.length === 0) {
    console.log("No emails found.");
    return;
  }

  console.log(`\n\x1b[1m\x1b[36mEmails (${emails.length})\x1b[0m`);
  console.log("─".repeat(70));

  for (const email of emails) {
    const readIcon = email.read ? "  " : "🔵";
    const flagIcon = email.flagged ? "⭐" : "  ";
    const subject = email.subject || "(No subject)";

    console.log(`\n  ${readIcon}${flagIcon} \x1b[1m${subject}\x1b[0m`);
    console.log(`       From: \x1b[33m${email.from}\x1b[0m`);
    if (email.account) {
      console.log(`       Account: \x1b[36m${email.account}\x1b[0m`);
    }
    console.log(`       Date: \x1b[90m${email.date}\x1b[0m`);

    if (email.preview) {
      const preview = email.preview.substring(0, 80).replace(/\s+/g, " ");
      console.log(`       \x1b[90m${preview}${email.preview.length > 80 ? "..." : ""}\x1b[0m`);
    }
  }
  console.log();
}

async function main(): Promise<void> {
  const args = Bun.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printHelp();
    process.exit(0);
  }

  const command = args[0];
  const subArgs = args.slice(1);

  try {
    switch (command) {
      case "contacts": {
        const { values } = parseArgs({
          args: subArgs,
          options: {
            search: { type: "string", short: "s" },
            limit: { type: "string", short: "l", default: "100" },
            format: { type: "string", short: "f", default: "json" },
          },
          strict: false,
          allowPositionals: true,
        });

        const contacts = await getContacts(values.search, parseInt(values.limit || "100", 10));

        if (values.format === "pretty") {
          formatContactsPretty(contacts);
        } else {
          console.log(JSON.stringify(contacts, null, 2));
        }
        break;
      }

      case "emails": {
        const { values } = parseArgs({
          args: subArgs,
          options: {
            mailbox: { type: "string", short: "m", default: "Inbox" },
            account: { type: "string", short: "a" },
            since: { type: "string", short: "s", default: "7" },
            limit: { type: "string", short: "l", default: "50" },
            unread: { type: "boolean", short: "u", default: false },
            format: { type: "string", short: "f", default: "json" },
          },
          strict: false,
          allowPositionals: true,
        });

        const emails = await getEmails(
          values.mailbox || "INBOX",
          values.account,
          parseInt(values.since || "7", 10),
          parseInt(values.limit || "50", 10),
          values.unread || false
        );

        if (values.format === "pretty") {
          formatEmailsPretty(emails);
        } else {
          console.log(JSON.stringify(emails, null, 2));
        }
        break;
      }

      case "mailboxes": {
        const { values } = parseArgs({
          args: subArgs,
          options: {
            format: { type: "string", short: "f", default: "json" },
          },
          strict: false,
          allowPositionals: true,
        });

        const mailboxes = await listMailboxes();

        if (values.format === "pretty") {
          console.log(`\n\x1b[1m\x1b[36mMailboxes\x1b[0m`);
          console.log("─".repeat(50));
          let currentAccount = "";
          for (const mb of mailboxes) {
            if (mb.account !== currentAccount) {
              currentAccount = mb.account;
              console.log(`\n  \x1b[33m${currentAccount}\x1b[0m`);
            }
            console.log(`    📁 ${mb.mailbox}`);
          }
          console.log();
        } else {
          console.log(JSON.stringify(mailboxes, null, 2));
        }
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        console.error("Run 'macpim --help' for usage information");
        process.exit(1);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    }
    process.exit(1);
  }
}

main();
