import { describe, expect, it } from "vitest";
import { buildICalendar, entriesToShifts, type IcalShift } from "./ical";

const e = (
  date: string,
  timeSlot: string,
  type = "TASK",
  absenceCode: string | null = null
) => ({ date, timeSlot, type, absenceCode });

describe("entriesToShifts", () => {
  it("fusionne les créneaux 30 min adjacents en un bloc", () => {
    const shifts = entriesToShifts([
      e("2026-07-01", "08:00"),
      e("2026-07-01", "08:30"),
      e("2026-07-01", "09:00"),
    ]);
    expect(shifts).toEqual([
      { date: "2026-07-01", start: "08:00", end: "09:30", type: "TASK", absenceCode: null },
    ]);
  });

  it("coupe en deux blocs s'il y a un trou (matin / après-midi)", () => {
    const shifts = entriesToShifts([
      e("2026-07-01", "08:00"),
      e("2026-07-01", "08:30"),
      e("2026-07-01", "14:00"),
      e("2026-07-01", "14:30"),
    ]);
    expect(shifts).toHaveLength(2);
    expect(shifts[0]).toMatchObject({ start: "08:00", end: "09:00", type: "TASK" });
    expect(shifts[1]).toMatchObject({ start: "14:00", end: "15:00", type: "TASK" });
  });

  it("ignore les absences par défaut", () => {
    const shifts = entriesToShifts([
      e("2026-07-01", "08:00"),
      e("2026-07-01", "08:30", "ABSENCE", "CONGE"),
    ]);
    expect(shifts).toEqual([
      { date: "2026-07-01", start: "08:00", end: "08:30", type: "TASK", absenceCode: null },
    ]);
  });

  it("émet les absences quand includeAbsences = true (bloc séparé)", () => {
    const shifts = entriesToShifts(
      [
        e("2026-07-01", "08:00"),
        e("2026-07-01", "14:00", "ABSENCE", "CONGE"),
        e("2026-07-01", "14:30", "ABSENCE", "CONGE"),
      ],
      true
    );
    expect(shifts).toHaveLength(2);
    expect(shifts[0]).toMatchObject({ start: "08:00", type: "TASK" });
    expect(shifts[1]).toMatchObject({
      start: "14:00",
      end: "15:00",
      type: "ABSENCE",
      absenceCode: "CONGE",
    });
  });
});

describe("buildICalendar", () => {
  const shift: IcalShift = {
    date: "2026-07-01",
    start: "08:00",
    end: "12:00",
    type: "TASK",
    absenceCode: null,
  };

  it("produit un VCALENDAR valide avec un VEVENT par bloc", () => {
    const ics = buildICalendar({
      calName: "Planning — Pharmacie Test",
      location: "Pharmacie Test",
      shifts: [shift],
      stamp: "20260630T000000Z",
    });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("DTSTART:20260701T080000");
    expect(ics).toContain("DTEND:20260701T120000");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("\r\n");
  });

  it("ajoute un rappel (VALARM) si alarmMinutes est fourni", () => {
    const ics = buildICalendar({
      calName: "Planning",
      location: "Pharmacie",
      shifts: [shift],
      stamp: "20260630T000000Z",
      alarmMinutes: 30,
    });
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER:-PT30M");
  });
});
