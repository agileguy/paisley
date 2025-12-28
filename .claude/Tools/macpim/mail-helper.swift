#!/usr/bin/env swift
import Foundation

// Parse command line arguments
let args = CommandLine.arguments
var mailbox: String = "INBOX"
var account: String? = nil
var limit: Int = 50
var sinceDays: Int = 7
var unreadOnly: Bool = false
var listMailboxes: Bool = false
var olderThanDays: Int? = nil
var excludeSendersFile: String? = nil
var deleteMode: Bool = false
var deleteIds: [String] = []

var i = 1
while i < args.count {
    switch args[i] {
    case "--mailbox", "-m":
        if i + 1 < args.count {
            mailbox = args[i + 1]
            i += 1
        }
    case "--account", "-a":
        if i + 1 < args.count {
            account = args[i + 1]
            i += 1
        }
    case "--limit", "-l":
        if i + 1 < args.count {
            limit = Int(args[i + 1]) ?? 50
            i += 1
        }
    case "--since", "-s":
        if i + 1 < args.count {
            sinceDays = Int(args[i + 1]) ?? 7
            i += 1
        }
    case "--unread", "-u":
        unreadOnly = true
    case "--list-mailboxes":
        listMailboxes = true
    case "--older-than-days":
        if i + 1 < args.count {
            olderThanDays = Int(args[i + 1])
            i += 1
        }
    case "--exclude-senders-file":
        if i + 1 < args.count {
            excludeSendersFile = args[i + 1]
            i += 1
        }
    case "--delete":
        deleteMode = true
    case "--delete-ids":
        if i + 1 < args.count {
            deleteIds = args[i + 1].components(separatedBy: ",")
            i += 1
        }
    default:
        break
    }
    i += 1
}

// Helper to run AppleScript via temp file (handles multi-line scripts properly)
func runAppleScript(_ script: String) -> (output: String?, error: String?) {
    // Write script to temp file
    let tempFile = FileManager.default.temporaryDirectory.appendingPathComponent("mailscript_\(ProcessInfo.processInfo.processIdentifier).scpt")

    do {
        try script.write(to: tempFile, atomically: true, encoding: .utf8)
    } catch {
        return (nil, "Failed to write temp script: \(error.localizedDescription)")
    }

    defer {
        try? FileManager.default.removeItem(at: tempFile)
    }

    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
    process.arguments = [tempFile.path]

    let outputPipe = Pipe()
    let errorPipe = Pipe()
    process.standardOutput = outputPipe
    process.standardError = errorPipe

    do {
        try process.run()
        process.waitUntilExit()

        let outputData = outputPipe.fileHandleForReading.readDataToEndOfFile()
        let errorData = errorPipe.fileHandleForReading.readDataToEndOfFile()

        let output = String(data: outputData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
        let error = String(data: errorData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)

        return (output, error)
    } catch {
        return (nil, error.localizedDescription)
    }
}

// List mailboxes
if listMailboxes {
    let script = """
    tell application "Mail"
        set mailboxList to {}
        repeat with acc in accounts
            set accName to name of acc
            repeat with mb in mailboxes of acc
                set end of mailboxList to accName & "|" & name of mb
            end repeat
        end repeat
        return mailboxList
    end tell
    """

    let result = runAppleScript(script)
    if let error = result.error, !error.isEmpty {
        let errorDict = ["error": "Failed to list mailboxes: \(error)"]
        if let jsonData = try? JSONSerialization.data(withJSONObject: errorDict, options: .prettyPrinted),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            print(jsonString)
        }
        exit(1)
    }

    if let output = result.output {
        // Parse AppleScript list output
        let items = output.replacingOccurrences(of: ", ", with: "\n")
            .components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }

        var mailboxes: [[String: String]] = []
        for item in items {
            let parts = item.components(separatedBy: "|")
            if parts.count >= 2 {
                mailboxes.append([
                    "account": parts[0],
                    "mailbox": parts[1]
                ])
            }
        }

        if let jsonData = try? JSONSerialization.data(withJSONObject: mailboxes, options: .prettyPrinted),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            print(jsonString)
        }
    }
    exit(0)
}

// Delete emails by ID
if !deleteIds.isEmpty, let acc = account {
    let idsString = deleteIds.map { "\($0)" }.joined(separator: ", ")
    let script = """
    tell application "Mail"
        set deletedCount to 0
        set targetMailbox to mailbox "\(mailbox)" of account "\(acc)"
        set idsToDelete to {\(idsString)}

        repeat with msgId in idsToDelete
            try
                set msgs to (messages of targetMailbox whose id is msgId)
                repeat with msg in msgs
                    delete msg
                    set deletedCount to deletedCount + 1
                end repeat
            end try
        end repeat

        return deletedCount
    end tell
    """

    let result = runAppleScript(script)
    if let error = result.error, !error.isEmpty {
        let errorDict = ["error": "Failed to delete emails: \(error)"]
        if let jsonData = try? JSONSerialization.data(withJSONObject: errorDict, options: .prettyPrinted),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            print(jsonString)
        }
        exit(1)
    }

    let count = Int(result.output ?? "0") ?? 0
    let resultDict = ["deleted": count]
    if let jsonData = try? JSONSerialization.data(withJSONObject: resultDict, options: .prettyPrinted),
       let jsonString = String(data: jsonData, encoding: .utf8) {
        print(jsonString)
    }
    exit(0)
}

// Load excluded senders if file provided
var excludedSenders: Set<String> = []
if let filePath = excludeSendersFile {
    if let content = try? String(contentsOfFile: filePath, encoding: .utf8) {
        excludedSenders = Set(content.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces).lowercased() }
            .filter { !$0.isEmpty })
    }
}

// Build date filter for older-than-days
var dateFilter = ""
if let days = olderThanDays {
    // We'll filter in Swift after fetching since AppleScript date comparison is complex
    limit = 10000 // Fetch more to filter
}

// Build unread filter
let unreadFilter = unreadOnly ? "whose read status is false" : ""

// Fetch emails - if no account specified, fetch from all accounts
var script: String

if let acc = account {
    // Single account specified
    script = """
    tell application "Mail"
        set emailOutput to ""
        set maxMessages to \(limit)

        try
            set targetMailbox to mailbox "\(mailbox)" of account "\(acc)"
            set allMsgs to messages of targetMailbox \(unreadFilter)
            set msgCount to count of allMsgs

            if msgCount is 0 then
                return emailOutput
            end if

            if msgCount > maxMessages then
                set msgCount to maxMessages
            end if

            repeat with idx from 1 to msgCount
                try
                    set msg to item idx of allMsgs
                    set msgId to id of msg
                    set msgSubject to subject of msg
                    set msgFrom to sender of msg
                    set msgTo to ""
                    try
                        set msgTo to address of first to recipient of msg
                    end try
                    set msgDate to date received of msg
                    set msgRead to read status of msg
                    set msgFlagged to flagged status of msg
                    set accName to "\(acc)"

                    -- Format: id|||subject|||from|||to|||date|||read|||flagged|||account
                    set emailInfo to (msgId as string) & "|||" & msgSubject & "|||" & msgFrom & "|||" & msgTo & "|||" & (msgDate as string) & "|||" & (msgRead as string) & "|||" & (msgFlagged as string) & "|||" & accName
                    set emailOutput to emailOutput & emailInfo & "<<<EMAIL>>>"
                on error errMsg
                    -- Skip problematic messages
                end try
            end repeat

        on error errMsg
            return "ERROR:" & errMsg
        end try

        return emailOutput
    end tell
    """
} else {
    // No account specified - fetch from all accounts, will sort by date later
    // Fetch limit emails from each account, then sort and take top N
    script = """
    tell application "Mail"
        set emailOutput to ""
        set maxPerAccount to \(limit)
        set inboxNames to {"Inbox", "INBOX", "inbox"}

        try
            repeat with acc in accounts
                set accName to name of acc
                set foundInbox to false

                repeat with inboxName in inboxNames
                    if not foundInbox then
                        try
                            set targetMailbox to mailbox inboxName of acc
                            set foundInbox to true

                            set allMsgs to messages of targetMailbox \(unreadFilter)
                            set msgCount to count of allMsgs

                            if msgCount > maxPerAccount then
                                set msgCount to maxPerAccount
                            end if

                            repeat with idx from 1 to msgCount
                                try
                                    set msg to item idx of allMsgs
                                    set msgId to id of msg
                                    set msgSubject to subject of msg
                                    set msgFrom to sender of msg
                                    set msgTo to ""
                                    try
                                        set msgTo to address of first to recipient of msg
                                    end try
                                    set msgDate to date received of msg
                                    set msgRead to read status of msg
                                    set msgFlagged to flagged status of msg

                                    -- Include ISO timestamp for sorting
                                    set isoDate to (year of msgDate) & "-" & my padZero(month of msgDate as integer) & "-" & my padZero(day of msgDate) & "T" & my padZero(hours of msgDate) & ":" & my padZero(minutes of msgDate) & ":" & my padZero(seconds of msgDate)

                                    -- Format: id|||subject|||from|||to|||date|||read|||flagged|||account|||isoDate
                                    set emailInfo to (msgId as string) & "|||" & msgSubject & "|||" & msgFrom & "|||" & msgTo & "|||" & (msgDate as string) & "|||" & (msgRead as string) & "|||" & (msgFlagged as string) & "|||" & accName & "|||" & isoDate
                                    set emailOutput to emailOutput & emailInfo & "<<<EMAIL>>>"
                                on error errMsg
                                    -- Skip problematic messages
                                end try
                            end repeat
                        on error
                            -- Try next inbox name
                        end try
                    end if
                end repeat
            end repeat

        on error errMsg
            return "ERROR:" & errMsg
        end try

        return emailOutput
    end tell

    on padZero(n)
        if n < 10 then
            return "0" & (n as string)
        else
            return n as string
        end if
    end padZero
    """
}

let result = runAppleScript(script)

if let error = result.error, !error.isEmpty {
    if result.output?.hasPrefix("ERROR:") != true {
        if error.contains("not allowed") || error.contains("permission") {
            let errorDict = ["error": "Mail access denied. Grant access in System Settings > Privacy & Security > Automation"]
            if let jsonData = try? JSONSerialization.data(withJSONObject: errorDict, options: .prettyPrinted),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                print(jsonString)
            }
            exit(1)
        }
    }
}

if let output = result.output {
    if output.hasPrefix("ERROR:") {
        let errorMsg = String(output.dropFirst(6))
        let errorDict = ["error": errorMsg]
        if let jsonData = try? JSONSerialization.data(withJSONObject: errorDict, options: .prettyPrinted),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            print(jsonString)
        }
        exit(1)
    }

    // Parse the output
    var emails: [(email: [String: Any], isoDate: String)] = []

    // Calculate cutoff date for older-than filter
    let cutoffDate: Date?
    if let days = olderThanDays {
        cutoffDate = Calendar.current.date(byAdding: .day, value: -days, to: Date())
    } else {
        cutoffDate = nil
    }

    let isoFormatter = ISO8601DateFormatter()
    isoFormatter.formatOptions = [.withFullDate, .withTime, .withColonSeparatorInTime]

    // Helper to extract email address from "Name <email>" format
    func extractEmail(from sender: String) -> String {
        if let start = sender.lastIndex(of: "<"), let end = sender.lastIndex(of: ">") {
            return String(sender[sender.index(after: start)..<end]).lowercased()
        }
        return sender.lowercased()
    }

    // Split by our custom delimiter
    let lines = output.components(separatedBy: "<<<EMAIL>>>")

    for line in lines {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { continue }

        let parts = trimmed.components(separatedBy: "|||")
        if parts.count >= 7 {
            let isoDate = parts.count >= 9 ? parts[8] : ""
            let fromField = parts[2]
            let senderEmail = extractEmail(from: fromField)

            // Filter by date if specified
            if let cutoff = cutoffDate, !isoDate.isEmpty {
                if let emailDate = isoFormatter.date(from: isoDate) {
                    if emailDate > cutoff {
                        continue // Skip emails newer than cutoff
                    }
                }
            }

            // Filter by excluded senders if specified
            if !excludedSenders.isEmpty {
                if excludedSenders.contains(senderEmail) {
                    continue // Skip emails from excluded senders
                }
            }

            var email: [String: Any] = [
                "id": parts[0],
                "subject": parts[1],
                "from": parts[2],
                "to": parts[3],
                "date": parts[4],
                "read": parts[5] == "true",
                "flagged": parts[6] == "true"
            ]
            // Add account if present
            if parts.count >= 8 {
                email["account"] = parts[7]
            }
            emails.append((email: email, isoDate: isoDate))
        }
    }

    // Sort by ISO date descending (most recent first)
    emails.sort { $0.isoDate > $1.isoDate }

    // Apply limit (only when fetching from all accounts)
    let limitedEmails: [[String: Any]]
    if account == nil && emails.count > limit {
        limitedEmails = emails.prefix(limit).map { $0.email }
    } else {
        limitedEmails = emails.map { $0.email }
    }

    if let jsonData = try? JSONSerialization.data(withJSONObject: limitedEmails, options: .prettyPrinted),
       let jsonString = String(data: jsonData, encoding: .utf8) {
        print(jsonString)
    } else {
        print("[]")
    }
} else {
    print("[]")
}
