import { describe, expect, it } from "vitest";
import { buildICalendar, entriesToShifts } from "./ical";

const e = (date: string, timeSlot: string, type = "TASK") => ({
  date,
  timeSlot,
  type,
});

describe("entriesToShifts", () => {
  it("fusionne les créneaux 30 min adjacents en un bloc", () => {
    const shifts = entriesToShifts([
      e("2026-07-01", "08:00"),
      e("2026-07-01", "08:30"),
      e("2026-07-01", "09:00"),
    ]);
    expect(shifts).toEqual([{ date: "2026-07-01", start: "08:00", end: "09:30" }]);
  });

  it("coupe en deux blocs s'il y a un trou (matin / après-midi)", () => {
    const shifts = entriesToShifts([
      e("2026-07-01", "08:00"),
      e("2026-07-01", "08:30"),
      e("2026-07-01", "14:00"),
      e("2026-07-01", "14:30"),
    ]);
    expect(shifts).toHaveLength(2);
    expect(shifts[0]).toEqual({ date: "2026-07-01", start: "08:00", end: "09:00" });
    expect(shifts[1]).toEqual({ date: "2026-07-01", start: "14:00", end: "15:00" });
  });

  it("ignore les créneaux non-TASK (absences)", () => {
    const shifts = entriesToShifts([
      e("2026-07-01", "08:00"),
      e("2026-07-01", "08:30", "ABSENCE"),
    ]);
    expect(shifts).toEqual([{ date: "2026-07-01", start: "08:00", end: "08:30" }]);
  });
});

describe("buildICalendar", () => {
  it("produit un VCALENDAR valide avec un VEVENT par bloc", () => {
    const ics = buildICalendar({
      calName: "Planning — Pharmacie Test",
      location: "Pharmacie Test",
      shifts: [{ date: "2026-07-01", start: "08:00", end: "12:00" }],
      stamp: "20260630T000000Z",
    });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("DTSTART:20260701T080000");
    expect(ics).toContain("DTEND:20260701T120000");
    expect(ics).toContain("END:VCALENDAR");
    // Lignes en CRLF (RFC 5545)
    expect(ics).toContain("\r\n");
  });
});
