import ExcelJS from "exceljs";
import { ScheduleType } from "@prisma/client";
import {
  ABSENCE_LABELS,
  STATUS_LABELS,
  TASK_COLORS,
  TASK_LABELS,
  TIME_SLOTS,
  WEEK_DAYS,
} from "@/types";
import type { EmployeeDTO, ScheduleEntryDTO } from "@/types";
import { dailyTaskHours, indexEntriesByEmployee, weekDays, weeklyTaskHours } from "@/lib/planning-utils";

/**
 * Génère un fichier Excel avec un onglet par jour de la semaine + un onglet
 * "Récapitulatif" avec les heures cumulées par collaborateur.
 *
 * Mise en forme :
 *  - collaborateurs en colonnes, créneaux en lignes
 *  - cellules colorisées selon le code poste (TASK_COLORS)
 *  - cellules d'absence hachurées en jaune/rouge
 *  - ligne de total en bas
 */
export async function buildPlanningWorkbook(opts: {
  pharmacyName: string;
  weekStart: Date; // lundi de la semaine
  employees: EmployeeDTO[];
  entries: ScheduleEntryDTO[];
}): Promise<Buffer> {
  const { pharmacyName, weekStart, employees, entries } = opts;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PharmaPlanning";
  workbook.created = new Date();

  const days = weekDays(weekStart);
  const dateIso = (d: Date) => d.toISOString().slice(0, 10);
  const dayDates = days.map(dateIso);
  const index = indexEntriesByEmployee(entries);

  // ─── Un onglet par jour ─────────────────────────────────────────
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const iso = dayDates[i];
    const sheetName = `${WEEK_DAYS[i]} ${day.toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
    })}`;
    const ws = workbook.addWorksheet(sheetName, {
      views: [{ state: "frozen", xSplit: 1, ySplit: 3 }],
    });

    // Largeurs
    ws.getColumn(1).width = 8;
    employees.forEach((_, idx) => {
      ws.getColumn(2 + idx).width = 14;
    });

    // Bandeau pharmacie
    ws.mergeCells(1, 1, 1, 1 + employees.length);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = `${pharmacyName} — ${WEEK_DAYS[i]} ${day.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}`;
    titleCell.font = { bold: true, size: 14, color: { argb: "FF6D28D9" } };
    titleCell.alignment = { vertical: "middle" };
    ws.getRow(1).height = 22;

    // Ligne 2 : nom collaborateur + statut (multi-line)
    const headerRow = ws.getRow(2);
    headerRow.getCell(1).value = "Heure";
    headerRow.getCell(1).font = { bold: true, size: 10, color: { argb: "FF52525B" } };
    headerRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    employees.forEach((emp, idx) => {
      const cell = headerRow.getCell(2 + idx);
      cell.value = `${emp.firstName} ${emp.lastName}\n${STATUS_LABELS[emp.status]}`;
      cell.font = { bold: true, size: 10 };
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
      cell.border = {
        top: { style: "thin", color: { argb: argbFromHex(emp.displayColor) } },
        bottom: { style: "thin", color: { argb: "FFE4E4E7" } },
      };
    });
    headerRow.height = 30;

    // Ligne 3 : heures planifiées du jour par collaborateur
    const hoursRow = ws.getRow(3);
    hoursRow.getCell(1).value = "Jour";
    hoursRow.getCell(1).font = { bold: true, size: 10, color: { argb: "FF7C3AED" } };
    hoursRow.getCell(1).alignment = { horizontal: "center" };
    employees.forEach((emp, idx) => {
      const dailyH = dailyTaskHours(emp.id, iso, index);
      const cell = hoursRow.getCell(2 + idx);
      cell.value = dailyH;
      cell.numFmt = '0.0"h"';
      cell.font = { bold: true, color: { argb: "FF7C3AED" } };
      cell.alignment = { horizontal: "center" };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF5F3FF" },
      };
    });

    // Lignes : 1 par créneau horaire
    TIME_SLOTS.forEach((slot, slotIdx) => {
      const row = ws.getRow(4 + slotIdx);
      const isHourMark = slot.endsWith(":00");
      // Colonne heure
      row.getCell(1).value = slot;
      row.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
      row.getCell(1).font = {
        bold: isHourMark,
        size: 10,
        color: { argb: isHourMark ? "FF18181B" : "FFA1A1AA" },
      };
      if (isHourMark) {
        row.getCell(1).border = {
          top: { style: "medium", color: { argb: "FFE4E4E7" } },
        };
      }

      employees.forEach((emp, idx) => {
        const entry = index.get(emp.id)?.get(iso)?.get(slot) ?? null;
        const cell = row.getCell(2 + idx);
        if (!entry) {
          cell.value = "";
        } else if (entry.type === ScheduleType.TASK && entry.taskCode) {
          cell.value = TASK_LABELS[entry.taskCode];
          const colors = TASK_COLORS[entry.taskCode];
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: argbFromHex(colors.bg) },
          };
          cell.font = { color: { argb: argbFromHex(colors.text) } };
          cell.alignment = { horizontal: "center", vertical: "middle" };
        } else if (entry.type === ScheduleType.ABSENCE && entry.absenceCode) {
          cell.value = ABSENCE_LABELS[entry.absenceCode];
          cell.fill = {
            type: "pattern",
            pattern: "darkUp", // hachures pour les absences
            fgColor: { argb: "FFFEF3C7" },
            bgColor: { argb: "FFFEF9C3" },
          };
          cell.font = {
            italic: true,
            color: { argb: "FF92400E" },
          };
          cell.alignment = { horizontal: "center", vertical: "middle" };
        }
      });
      row.height = 18;
    });
  }

  // ─── Onglet récap équipe ────────────────────────────────────────
  const recap = workbook.addWorksheet("Récapitulatif");
  recap.columns = [
    { header: "Collaborateur", key: "name", width: 24 },
    { header: "Statut", key: "status", width: 16 },
    { header: "Contrat hebdo", key: "contract", width: 14 },
    { header: "Heures planifiées", key: "planned", width: 18 },
    { header: "Δ vs contrat", key: "delta", width: 14 },
  ];
  recap.getRow(1).font = { bold: true };
  recap.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF5F3FF" },
  };
  for (const emp of employees) {
    const planned = weeklyTaskHours(emp.id, dayDates, index);
    const delta = planned - emp.weeklyHours;
    const row = recap.addRow({
      name: `${emp.firstName} ${emp.lastName}`,
      status: STATUS_LABELS[emp.status],
      contract: emp.weeklyHours,
      planned,
      delta,
    });
    row.getCell("contract").numFmt = '0"h"';
    row.getCell("planned").numFmt = '0.0"h"';
    row.getCell("delta").numFmt = '+0.0"h";-0.0"h";"—"';
    if (Math.abs(delta) >= 0.5) {
      row.getCell("delta").font = {
        color: { argb: delta > 0 ? "FFB91C1C" : "FFD97706" },
        bold: true,
      };
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** "#abcdef" → "FFABCDEF" (ARGB attendu par exceljs). */
function argbFromHex(hex: string): string {
  const cleaned = hex.replace(/^#/, "").toUpperCase();
  if (cleaned.length === 6) return "FF" + cleaned;
  if (cleaned.length === 8) return cleaned;
  return "FF000000";
}
