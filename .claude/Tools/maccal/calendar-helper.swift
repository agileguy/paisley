#!/usr/bin/env swift
import EventKit
import Foundation

// Parse ISO8601 date with flexible format
func parseISO8601(_ string: String) -> Date? {
    let formatters: [ISO8601DateFormatter] = {
        let full = ISO8601DateFormatter()
        full.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        let basic = ISO8601DateFormatter()
        basic.formatOptions = [.withInternetDateTime]

        return [full, basic]
    }()

    for formatter in formatters {
        if let date = formatter.date(from: string) {
            return date
        }
    }
    return nil
}

// Parse command line arguments
let args = CommandLine.arguments
var startDate = Date()
var endDate = Date().addingTimeInterval(86400) // Default 1 day
var calendarFilter: String? = nil

var i = 1
while i < args.count {
    switch args[i] {
    case "--start":
        if i + 1 < args.count {
            if let date = parseISO8601(args[i + 1]) {
                startDate = date
            }
            i += 1
        }
    case "--end":
        if i + 1 < args.count {
            if let date = parseISO8601(args[i + 1]) {
                endDate = date
            }
            i += 1
        }
    case "--calendar":
        if i + 1 < args.count {
            calendarFilter = args[i + 1].lowercased()
            i += 1
        }
    default:
        break
    }
    i += 1
}

let eventStore = EKEventStore()
let semaphore = DispatchSemaphore(value: 0)
var accessGranted = false

// Request access to calendar
if #available(macOS 14.0, *) {
    eventStore.requestFullAccessToEvents { granted, error in
        accessGranted = granted
        semaphore.signal()
    }
} else {
    eventStore.requestAccess(to: .event) { granted, error in
        accessGranted = granted
        semaphore.signal()
    }
}

semaphore.wait()

guard accessGranted else {
    let error = ["error": "Calendar access denied. Grant access in System Settings > Privacy & Security > Calendars"]
    if let jsonData = try? JSONSerialization.data(withJSONObject: error, options: .prettyPrinted),
       let jsonString = String(data: jsonData, encoding: .utf8) {
        print(jsonString)
    }
    exit(1)
}

// Create predicate for events
let predicate = eventStore.predicateForEvents(withStart: startDate, end: endDate, calendars: nil)

// Fetch events
let events = eventStore.events(matching: predicate)

// Build JSON output
var eventList: [[String: Any]] = []

let dateFormatter = DateFormatter()
dateFormatter.dateStyle = .full
dateFormatter.timeStyle = .medium

for event in events {
    // Apply calendar filter if specified
    if let filter = calendarFilter {
        if !event.calendar.title.lowercased().contains(filter) {
            continue
        }
    }

    var eventDict: [String: Any] = [
        "id": event.eventIdentifier ?? "",
        "title": event.title ?? "",
        "calendar": event.calendar.title,
        "startDate": dateFormatter.string(from: event.startDate),
        "endDate": dateFormatter.string(from: event.endDate),
        "allDay": event.isAllDay
    ]

    if let location = event.location, !location.isEmpty {
        eventDict["location"] = location
    }

    if let notes = event.notes, !notes.isEmpty {
        eventDict["notes"] = notes
    }

    if let url = event.url {
        eventDict["url"] = url.absoluteString
    }

    eventList.append(eventDict)
}

// Sort by start date
eventList.sort { (a, b) -> Bool in
    let dateA = a["startDate"] as? String ?? ""
    let dateB = b["startDate"] as? String ?? ""
    return dateA < dateB
}

// Output JSON
if let jsonData = try? JSONSerialization.data(withJSONObject: eventList, options: .prettyPrinted),
   let jsonString = String(data: jsonData, encoding: .utf8) {
    print(jsonString)
} else {
    print("[]")
}
