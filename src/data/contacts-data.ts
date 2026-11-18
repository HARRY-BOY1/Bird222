import type { CallLogEntry, CallType, StatusUpdate, User } from "@/types";
import { CONTACTS } from "@/data/mock-data";

export const EXTRA_CONTACTS: User[] = [
  { id: "c9", name: "Jai", status: "online" },
  { id: "c10", name: "Yash", status: "offline", lastSeen: "last seen yesterday at 6:00 PM" },
  { id: "c11", name: "Rocky", status: "online" },
  { id: "c12", name: "Maxy", status: "offline", lastSeen: "last seen 3 days ago" },
  { id: "c13", name: "Leo", status: "online" },
];

export const ALL_CONTACTS: User[] = [...CONTACTS, ...EXTRA_CONTACTS];

const CALL_ROTATION_NAMES = [
  "Bhargav",
  "Guna",
  "Sam",
  "Fayiz",
  "Rayhan",
  "Viswesh",
  "Sai",
  "Saketh",
  "Jai",
];

const CALL_TYPES: CallType[] = ["incoming", "outgoing", "incoming", "outgoing", "missed"];

function findContact(name: string): User {
  const contact = ALL_CONTACTS.find(
    (c) => c.name.toLowerCase() === name.toLowerCase()
  );
  if (!contact) throw new Error(`Contact not found: ${name}`);
  return contact;
}

function buildCallLogs(): CallLogEntry[] {
  const logs: CallLogEntry[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  for (let day = 0; day < 18; day++) {
    const name = CALL_ROTATION_NAMES[day % CALL_ROTATION_NAMES.length];
    const contact = findContact(name);
    const type = CALL_TYPES[day % CALL_TYPES.length];
    const date = new Date(now);
    date.setDate(date.getDate() - day);
    date.setHours(10 + (day % 8), 15 + (day % 40), 0, 0);

    logs.push({
      id: `call-${day}`,
      contact,
      type,
      timestamp: date.getTime(),
      duration: type === "missed" ? undefined : 60 + (day % 5) * 45,
    });

    if (day % 3 === 0 && day > 0) {
      const secondName =
        CALL_ROTATION_NAMES[(day + 4) % CALL_ROTATION_NAMES.length];
      const secondDate = new Date(date);
      secondDate.setHours(secondDate.getHours() + 3);
      const secondType = CALL_TYPES[(day + 1) % CALL_TYPES.length];

      logs.push({
        id: `call-${day}-b`,
        contact: findContact(secondName),
        type: secondType,
        timestamp: secondDate.getTime(),
        duration: secondType === "missed" ? undefined : 30 + (day % 4) * 20,
      });
    }
  }

  return logs.sort((a, b) => b.timestamp - a.timestamp);
}

export const CALL_LOGS: CallLogEntry[] = buildCallLogs();

export const STATUS_UPDATES: StatusUpdate[] = [
  { id: "s1", contact: CONTACTS[0], timestamp: Date.now() - 2 * 60 * 60 * 1000, viewed: false },
  { id: "s2", contact: CONTACTS[2], timestamp: Date.now() - 5 * 60 * 60 * 1000, viewed: false },
  { id: "s3", contact: CONTACTS[4], timestamp: Date.now() - 8 * 60 * 60 * 1000, viewed: true },
  { id: "s4", contact: CONTACTS[6], timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000, viewed: true },
  { id: "s5", contact: EXTRA_CONTACTS[0], timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000 - 2 * 60 * 60 * 1000, viewed: false },
  { id: "s6", contact: CONTACTS[1], timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000, viewed: true },
  { id: "s7", contact: CONTACTS[3], timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000, viewed: true },
  { id: "s8", contact: EXTRA_CONTACTS[2], timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000, viewed: true },
];
