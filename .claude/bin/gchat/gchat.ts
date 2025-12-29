#!/usr/bin/env bun
/**
 * gchat - Google Chat Webhook CLI
 *
 * A clean, deterministic CLI for sending messages to Google Chat spaces via webhooks.
 *
 * Usage:
 *   gchat send "Hello World"
 *   gchat send "Message" --webhook <url>
 *   gchat card --title "Alert" --subtitle "System" --text "Details here"
 *   gchat --help
 *
 * Configuration:
 *   Set GCHAT_WEBHOOK_URL in ~/.claude/.env or pass --webhook flag
 *
 * Author: Daniel Elliott
 * Version: 1.0.0
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ============================================================================
// Type Definitions
// ============================================================================

interface Config {
  webhookUrl: string;
}

interface GChatTextMessage {
  text: string;
  thread?: {
    name: string;
  };
}

interface GChatCardSection {
  header?: string;
  widgets: Array<{
    textParagraph?: { text: string };
    decoratedText?: {
      topLabel?: string;
      text: string;
      bottomLabel?: string;
    };
    buttons?: Array<{
      textButton: {
        text: string;
        onClick: { openLink: { url: string } };
      };
    }>;
  }>;
}

interface GChatCard {
  header?: {
    title: string;
    subtitle?: string;
    imageUrl?: string;
    imageStyle?: 'IMAGE' | 'AVATAR';
  };
  sections: GChatCardSection[];
}

interface GChatCardMessage {
  cards: GChatCard[];
}

interface GChatResponse {
  name: string;
  sender: {
    name: string;
    displayName: string;
    type: string;
  };
  createTime: string;
  text?: string;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Load webhook URL from environment or .env file
 */
function loadConfig(webhookOverride?: string): Config {
  // Use override if provided
  if (webhookOverride) {
    return { webhookUrl: webhookOverride };
  }

  // Check environment variable first
  if (process.env.GCHAT_WEBHOOK_URL) {
    return { webhookUrl: process.env.GCHAT_WEBHOOK_URL };
  }

  // Try loading from ~/.claude/.env
  const envPath = join(homedir(), '.claude', '.env');

  try {
    const envContent = readFileSync(envPath, 'utf-8');
    const webhookUrl = envContent
      .split('\n')
      .find(line => line.startsWith('GCHAT_WEBHOOK_URL='))
      ?.split('=')
      .slice(1)
      .join('=')
      ?.trim();

    if (!webhookUrl) {
      console.error('Error: GCHAT_WEBHOOK_URL not found');
      console.error('Set it in ~/.claude/.env or pass --webhook <url>');
      process.exit(1);
    }

    return { webhookUrl };
  } catch {
    console.error('Error: Cannot read ~/.claude/.env and no --webhook provided');
    console.error('Either set GCHAT_WEBHOOK_URL in ~/.claude/.env or use --webhook flag');
    process.exit(1);
  }
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Send a message to Google Chat via webhook
 */
async function sendToGChat(
  config: Config,
  payload: GChatTextMessage | GChatCardMessage
): Promise<GChatResponse> {
  const response = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GChat API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

// ============================================================================
// CLI Commands
// ============================================================================

/**
 * Send a simple text message
 */
async function cmdSend(message: string, webhookUrl?: string): Promise<void> {
  if (!message || message.trim() === '') {
    console.error('Error: Message is required');
    console.error('Usage: gchat send "Your message here"');
    process.exit(1);
  }

  const config = loadConfig(webhookUrl);
  const payload: GChatTextMessage = { text: message };

  try {
    const result = await sendToGChat(config, payload);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}

/**
 * Send a card message with structured content
 */
async function cmdCard(options: {
  title: string;
  subtitle?: string;
  text?: string;
  imageUrl?: string;
  buttonText?: string;
  buttonUrl?: string;
  webhookUrl?: string;
}): Promise<void> {
  if (!options.title) {
    console.error('Error: --title is required for card messages');
    process.exit(1);
  }

  const config = loadConfig(options.webhookUrl);

  const card: GChatCard = {
    header: {
      title: options.title,
      subtitle: options.subtitle,
      imageUrl: options.imageUrl,
      imageStyle: options.imageUrl ? 'IMAGE' : undefined,
    },
    sections: [],
  };

  // Add text section if provided
  if (options.text) {
    card.sections.push({
      widgets: [{ textParagraph: { text: options.text } }],
    });
  }

  // Add button section if provided
  if (options.buttonText && options.buttonUrl) {
    card.sections.push({
      widgets: [
        {
          buttons: [
            {
              textButton: {
                text: options.buttonText,
                onClick: { openLink: { url: options.buttonUrl } },
              },
            },
          ],
        },
      ],
    });
  }

  // Ensure at least one section
  if (card.sections.length === 0) {
    card.sections.push({
      widgets: [{ textParagraph: { text: ' ' } }],
    });
  }

  const payload: GChatCardMessage = { cards: [card] };

  try {
    const result = await sendToGChat(config, payload);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}

/**
 * Send a thread reply using custom thread key (groups related messages)
 */
async function cmdThread(
  message: string,
  threadKey: string,
  webhookUrl?: string
): Promise<void> {
  if (!message || message.trim() === '') {
    console.error('Error: Message is required');
    process.exit(1);
  }

  if (!threadKey) {
    console.error('Error: --thread is required');
    console.error('Usage: gchat thread "Message" --thread <thread-key>');
    process.exit(1);
  }

  const config = loadConfig(webhookUrl);

  // Append threadKey to webhook URL
  const separator = config.webhookUrl.includes('?') ? '&' : '?';
  const threadedUrl = `${config.webhookUrl}${separator}threadKey=${encodeURIComponent(threadKey)}&messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD`;

  const payload: GChatTextMessage = { text: message };

  try {
    const response = await fetch(threadedUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GChat API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}

/**
 * Reply to an existing thread using thread name from previous response
 */
async function cmdReply(
  message: string,
  threadName: string,
  webhookUrl?: string
): Promise<void> {
  if (!message || message.trim() === '') {
    console.error('Error: Message is required');
    process.exit(1);
  }

  if (!threadName) {
    console.error('Error: --to is required');
    console.error('Usage: gchat reply "Message" --to <thread-name>');
    console.error('Thread name comes from previous message response: .thread.name');
    process.exit(1);
  }

  const config = loadConfig(webhookUrl);

  // Include thread name in request body to reply to existing thread
  const payload: GChatTextMessage = {
    text: message,
    thread: {
      name: threadName,
    },
  };

  // Add messageReplyOption to URL
  const separator = config.webhookUrl.includes('?') ? '&' : '?';
  const replyUrl = `${config.webhookUrl}${separator}messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD`;

  try {
    const response = await fetch(replyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GChat API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}

// ============================================================================
// Help Documentation
// ============================================================================

function showHelp(): void {
  console.log(`
gchat - Google Chat Webhook CLI
================================

A clean, deterministic CLI for sending messages to Google Chat spaces via webhooks.

USAGE:
  gchat <command> [options]

COMMANDS:
  send <message>              Send a text message to the chat space
  card                        Send a rich card message
  reply <message>             Reply to an existing thread (use --to)
  thread <message>            Start/continue a named thread (use --thread)
  help, --help, -h            Show this help message
  version, --version, -v      Show version information

OPTIONS:
  --webhook <url>             Override webhook URL (instead of env var)
  --title <text>              Card title (required for card command)
  --subtitle <text>           Card subtitle
  --text <text>               Card body text
  --image <url>               Card header image URL
  --button-text <text>        Button label
  --button-url <url>          Button link URL
  --to <thread-name>          Thread name for reply (from previous .thread.name)
  --thread <key>              Custom thread key for grouping messages

EXAMPLES:
  # Send a simple message
  gchat send "Hello from PAI!"

  # Send with explicit webhook
  gchat send "Alert!" --webhook "https://chat.googleapis.com/v1/spaces/..."

  # Send a card with title and text
  gchat card --title "Build Status" --subtitle "CI/CD" --text "Build #42 passed"

  # Send a card with a button
  gchat card --title "New PR" --text "Review needed" --button-text "View PR" --button-url "https://github.com/..."

  # Reply to existing thread (use thread.name from previous response)
  gchat reply "Thanks!" --to "spaces/XXX/threads/YYY"

  # Start/continue a named thread (messages with same key go to same thread)
  gchat thread "Build started" --thread "build-123"
  gchat thread "Build passed!" --thread "build-123"

OUTPUT:
  All commands return JSON to stdout
  Errors go to stderr
  Exit code 0 on success, 1 on error

CONFIGURATION:
  Set GCHAT_WEBHOOK_URL in ~/.claude/.env:
    GCHAT_WEBHOOK_URL=https://chat.googleapis.com/v1/spaces/SPACE_ID/messages?key=KEY&token=TOKEN

  To get a webhook URL:
  1. Open Google Chat space
  2. Click space name → Manage webhooks
  3. Create webhook and copy URL

PHILOSOPHY:
  gchat follows PAI's CLI-First Architecture:
  - Deterministic: Same input → Same output
  - Clean: Single responsibility (GChat messaging only)
  - Composable: JSON output pipes to jq, grep, etc.
  - Documented: Full help and examples
  - Testable: Predictable behavior

For more information, see ~/.claude/bin/gchat/README.md

Version: 1.0.0
Author: Daniel Elliott
`);
}

function showVersion(): void {
  console.log('gchat version 1.0.0');
}

// ============================================================================
// Argument Parsing Helpers
// ============================================================================

function getArgValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index !== -1 && args[index + 1] && !args[index + 1].startsWith('-')) {
    return args[index + 1];
  }
  return undefined;
}

// ============================================================================
// Main CLI Entry Point
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Handle help/version
  if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    showHelp();
    return;
  }

  if (args[0] === 'version' || args[0] === '--version' || args[0] === '-v') {
    showVersion();
    return;
  }

  const command = args[0];
  const webhookUrl = getArgValue(args, '--webhook');

  switch (command) {
    case 'send': {
      // Get message (first non-flag argument after command)
      const message = args[1] && !args[1].startsWith('-') ? args[1] : undefined;
      if (!message) {
        console.error('Error: Message is required');
        console.error('Usage: gchat send "Your message"');
        process.exit(1);
      }
      await cmdSend(message, webhookUrl);
      break;
    }

    case 'card': {
      const title = getArgValue(args, '--title');
      const subtitle = getArgValue(args, '--subtitle');
      const text = getArgValue(args, '--text');
      const imageUrl = getArgValue(args, '--image');
      const buttonText = getArgValue(args, '--button-text');
      const buttonUrl = getArgValue(args, '--button-url');

      if (!title) {
        console.error('Error: --title is required for card messages');
        console.error('Usage: gchat card --title "Title" --text "Body text"');
        process.exit(1);
      }

      await cmdCard({
        title,
        subtitle,
        text,
        imageUrl,
        buttonText,
        buttonUrl,
        webhookUrl,
      });
      break;
    }

    case 'thread': {
      const message = args[1] && !args[1].startsWith('-') ? args[1] : undefined;
      const threadKey = getArgValue(args, '--thread');

      if (!message) {
        console.error('Error: Message is required');
        console.error('Usage: gchat thread "Message" --thread <key>');
        process.exit(1);
      }

      if (!threadKey) {
        console.error('Error: --thread is required');
        console.error('Usage: gchat thread "Message" --thread <key>');
        process.exit(1);
      }

      await cmdThread(message, threadKey, webhookUrl);
      break;
    }

    case 'reply': {
      const message = args[1] && !args[1].startsWith('-') ? args[1] : undefined;
      const threadName = getArgValue(args, '--to');

      if (!message) {
        console.error('Error: Message is required');
        console.error('Usage: gchat reply "Message" --to <thread-name>');
        process.exit(1);
      }

      if (!threadName) {
        console.error('Error: --to is required');
        console.error('Usage: gchat reply "Message" --to <thread-name>');
        console.error('Get thread name from previous response: .thread.name');
        process.exit(1);
      }

      await cmdReply(message, threadName, webhookUrl);
      break;
    }

    default:
      console.error(`Error: Unknown command '${command}'`);
      console.error('Run "gchat --help" for usage information');
      process.exit(1);
  }
}

// Run CLI
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
