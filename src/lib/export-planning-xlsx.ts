import ExcelJS from "exceljs";
import type { AbsenceCode } from "@prisma/client";
import { STATUS_LABELS, type EmployeeDTO, type ScheduleEntryDTO } from "@/types";
import { dailyTaskHours, indexEntriesByEmployee } from "@/lib/planning-utils";

const WEEKDAY_LETTERS = ["L", "M", "M", "J", "V", "S", "D"] as const;

/** Code court d'absence pour l'export (une cellule = un jour). */
function shortAbsence(code: AbsenceCode): string {
  switch (code) {
    case "CONGE":
      return "CP";
    case "MALADIE":
      return "MAL";
    case "FORMATION_ABS":
      return "FORM";
    default:
      return "ABS";
  }
}

/**
 * Génère le classeur Excel de la vue mois : une ligne par collaborateur, une
 * colonne par jour (heures travaillées, ou code d'absence : CP / MAL / FORM /
 * ABS), colonne total du mois, et une ligne de total d'équipe par jour.
 * Le week-end (dimanche) est laissé vide et grisé.
 *
 * `employees` est déjà filtré/ordonné par l'appelant (respecte le filtre métier).
 */
export async function buildMonthPlanningWorkbook(opts: {
  pharmacyName: string;
  month: string; // YYYY-MM
  employees: EmployeeDTO[];
  entries: ScheduleEntryDTO[];
}): Promise<Buffer> {
  const { pharmacyName, month, employees, entries } = opts;
  const [year, m] = month.split("-").map(Number);
  const lastDay = new Date(year, m, 0).getDate();
  const index = indexEntriesByEmployee(entries);

  const days = Array.from({ length: lastDay }, (_, i) => {
    const d = i + 1;
    const date = new Date(year, m - 1, d);
    const weekday = (date.getDay() + 6) % 7; // 0 = lundi … 6 = dimanche
    const iso = `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return { d, weekday, iso };
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "PharmaPlanning";
  const monthLabel = new Date(year, m - 1, 1).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  const ws = wb.addWorksheet(`Planning ${month}`, {
    views: [{ state: "frozen", xSplit: 2, ySplit: 2 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const lastCol = 2 + lastDay + 1; // Collaborateur + Rôle + jours + Total

  // Ligne 1 : titre
  ws.mergeCells(1, 1, 1, lastCol);
  const title = ws.getCell(1, 1);
  title.value = `${pharmacyName} — Planning ${monthLabel}`;
  title.font = { bold: true, size: 14 };
  title.alignment = { vertical: "middle" };
  ws.getRow(1).height = 22;

  // Ligne 2 : en-têtes
  const header: (string | number)[] = ["Collaborateur", "Rôle"];
  days.forEach(({ d, weekday }) => header.push(`${WEEKDAY_LETTERS[weekday]} ${d}`));
  header.push("Total");
  const headerRow = ws.getRow(2);
  headerRow.values = header;
  headerRow.font = { bold: true, size: 10 };
  headerRow.alignment = { horizontal: "center", vertical: "middle" };
  headerRow.height = 18;
  // Grise les colonnes de week-end dans l'en-tête.
  days.forEach(({ weekday }, i) => {
    if (weekday >= 5) {
      headerRow.getCell(3 + i).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFEDEDED" },
      };
    }
  });

  // Lignes collaborateurs
  employees.forEach((emp, rowIdx) => {
    const row = ws.getRow(3 + rowIdx);
    const name = `${emp.firstName}${emp.lastName !== "—" ? " " + emp.lastName : ""}`;
    row.getCell(1).value = name;
    row.getCell(2).value = STATUS_LABELS[emp.status];

    let total = 0;
    days.forEach(({ iso, weekday }, i) => {
      const cell = row.getCell(3 + i);
      cell.alignment = { horizontal: "center" };
      if (weekday === 6) {
        // Dimanche : vide + grisé
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
        return;
      }
      const day = index.get(emp.id)?.get(iso);
      if (!day || day.size === 0) return;
      const abs = Array.from(day.values()).find((e) => e.type === "ABSENCE");
      if (abs?.absenceCode) {
        cell.value = shortAbsence(abs.absenceCode);
        cell.font = { italic: true, color: { argb: "FF92400E" } };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF5EFE0" },
        };
        return;
      }
      const hours = dailyTaskHours(emp.id, iso, index);
      if (hours > 0) {
        cell.value = hours;
        cell.numFmt = "0.#";
        total += hours;
      }
    });

    const totalCell = row.getCell(3 + lastDay);
    totalCell.value = total;
    totalCell.numFmt = "0.#";
    totalCell.font = { bold: true };
    totalCell.alignment = { horizontal: "center" };
  });

  // Ligne total équipe par jour
  const totalRowIdx = 3 + employees.length;
  const totalRow = ws.getRow(totalRowIdx);
  totalRow.getCell(1).value = "Total équipe";
  totalRow.getCell(1).font = { bold: true };
  let grandTotal = 0;
  days.forEach(({ iso, weekday }, i) => {
    const cell = totalRow.getCell(3 + i);
    cell.alignment = { horizontal: "center" };
    cell.font = { bold: true };
    if (weekday === 6) return;
    let teamHours = 0;
    employees.forEach((emp) => {
      teamHours += dailyTaskHours(emp.id, iso, index);
    });
    if (teamHours > 0) {
      cell.value = teamHours;
      cell.numFmt = "0.#";
      grandTotal += teamHours;
    }
  });
  const grandCell = totalRow.getCell(3 + lastDay);
  grandCell.value = grandTotal;
  grandCell.numFmt = "0.#";
  grandCell.font = { bold: true };
  grandCell.alignment = { horizontal: "center" };

  // Largeurs de colonnes
  ws.getColumn(1).width = 22;
  ws.getColumn(2).width = 16;
  for (let c = 3; c <= 2 + lastDay; c++) ws.getColumn(c).width = 5;
  ws.getColumn(3 + lastDay).width = 8;

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
