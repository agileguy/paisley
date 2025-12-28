#!/usr/bin/env swift
import Contacts
import Foundation

// Parse command line arguments
let args = CommandLine.arguments
var searchQuery: String? = nil
var limit: Int = 100

var i = 1
while i < args.count {
    switch args[i] {
    case "--search", "-s":
        if i + 1 < args.count {
            searchQuery = args[i + 1]
            i += 1
        }
    case "--limit", "-l":
        if i + 1 < args.count {
            limit = Int(args[i + 1]) ?? 100
            i += 1
        }
    default:
        break
    }
    i += 1
}

let store = CNContactStore()

// Request access
let semaphore = DispatchSemaphore(value: 0)
var accessGranted = false

store.requestAccess(for: .contacts) { granted, error in
    accessGranted = granted
    semaphore.signal()
}

semaphore.wait()

guard accessGranted else {
    let error = ["error": "Contacts access denied. Grant access in System Settings > Privacy & Security > Contacts"]
    if let jsonData = try? JSONSerialization.data(withJSONObject: error, options: .prettyPrinted),
       let jsonString = String(data: jsonData, encoding: .utf8) {
        print(jsonString)
    }
    exit(1)
}

// Define keys to fetch
let keysToFetch: [CNKeyDescriptor] = [
    CNContactIdentifierKey as CNKeyDescriptor,
    CNContactGivenNameKey as CNKeyDescriptor,
    CNContactFamilyNameKey as CNKeyDescriptor,
    CNContactOrganizationNameKey as CNKeyDescriptor,
    CNContactJobTitleKey as CNKeyDescriptor,
    CNContactEmailAddressesKey as CNKeyDescriptor,
    CNContactPhoneNumbersKey as CNKeyDescriptor,
    CNContactPostalAddressesKey as CNKeyDescriptor,
    CNContactBirthdayKey as CNKeyDescriptor,
    CNContactImageDataAvailableKey as CNKeyDescriptor
]

var contacts: [CNContact] = []

do {
    if let query = searchQuery, !query.isEmpty {
        // Search by name
        let predicate = CNContact.predicateForContacts(matchingName: query)
        contacts = try store.unifiedContacts(matching: predicate, keysToFetch: keysToFetch)
    } else {
        // Fetch all contacts
        let request = CNContactFetchRequest(keysToFetch: keysToFetch)
        request.sortOrder = .givenName

        var fetchedContacts: [CNContact] = []
        try store.enumerateContacts(with: request) { contact, stop in
            fetchedContacts.append(contact)
            if fetchedContacts.count >= limit {
                stop.pointee = true
            }
        }
        contacts = fetchedContacts
    }
} catch {
    let errorDict = ["error": "Failed to fetch contacts: \(error.localizedDescription)"]
    if let jsonData = try? JSONSerialization.data(withJSONObject: errorDict, options: .prettyPrinted),
       let jsonString = String(data: jsonData, encoding: .utf8) {
        print(jsonString)
    }
    exit(1)
}

// Build JSON output
var contactList: [[String: Any]] = []

let dateFormatter = DateFormatter()
dateFormatter.dateFormat = "yyyy-MM-dd"

for contact in contacts {
    var contactDict: [String: Any] = [
        "id": contact.identifier,
        "givenName": contact.givenName,
        "familyName": contact.familyName
    ]

    // Full name
    let fullName = [contact.givenName, contact.familyName]
        .filter { !$0.isEmpty }
        .joined(separator: " ")
    if !fullName.isEmpty {
        contactDict["fullName"] = fullName
    }

    // Organization
    if !contact.organizationName.isEmpty {
        contactDict["organization"] = contact.organizationName
    }

    // Job title
    if !contact.jobTitle.isEmpty {
        contactDict["jobTitle"] = contact.jobTitle
    }

    // Email addresses
    if !contact.emailAddresses.isEmpty {
        var emails: [[String: String]] = []
        for email in contact.emailAddresses {
            emails.append([
                "label": CNLabeledValue<NSString>.localizedString(forLabel: email.label ?? ""),
                "value": email.value as String
            ])
        }
        contactDict["emails"] = emails
    }

    // Phone numbers
    if !contact.phoneNumbers.isEmpty {
        var phones: [[String: String]] = []
        for phone in contact.phoneNumbers {
            phones.append([
                "label": CNLabeledValue<CNPhoneNumber>.localizedString(forLabel: phone.label ?? ""),
                "value": phone.value.stringValue
            ])
        }
        contactDict["phones"] = phones
    }

    // Postal addresses
    if !contact.postalAddresses.isEmpty {
        var addresses: [[String: Any]] = []
        for address in contact.postalAddresses {
            let addr = address.value
            var addrDict: [String: String] = [
                "label": CNLabeledValue<CNPostalAddress>.localizedString(forLabel: address.label ?? "")
            ]
            if !addr.street.isEmpty { addrDict["street"] = addr.street }
            if !addr.city.isEmpty { addrDict["city"] = addr.city }
            if !addr.state.isEmpty { addrDict["state"] = addr.state }
            if !addr.postalCode.isEmpty { addrDict["postalCode"] = addr.postalCode }
            if !addr.country.isEmpty { addrDict["country"] = addr.country }
            addresses.append(addrDict)
        }
        contactDict["addresses"] = addresses
    }

    // Birthday
    if let birthday = contact.birthday {
        if let date = Calendar.current.date(from: birthday) {
            contactDict["birthday"] = dateFormatter.string(from: date)
        }
    }

    // Has image
    contactDict["hasImage"] = contact.imageDataAvailable

    contactList.append(contactDict)
}

// Output JSON
if let jsonData = try? JSONSerialization.data(withJSONObject: contactList, options: .prettyPrinted),
   let jsonString = String(data: jsonData, encoding: .utf8) {
    print(jsonString)
} else {
    print("[]")
}
