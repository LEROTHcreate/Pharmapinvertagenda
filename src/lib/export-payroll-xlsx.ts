import ExcelJS from "exceljs";
import { STATUS_LABELS } from "@/types";
import type { PayrollLine } from "@/lib/payroll-calc";
import { computeBenchmark } from "@/lib/payroll-benchmark";
import { REGION_LABELS, REFERENCE_META, type Region } from "@/lib/payroll-reference";

/**
 * Génère le classeur Excel de la rémunération d'un mois : une ligne par
 * salarié (heures ventilées + brut/net/coût employeur + benchmark), une ligne
 * de total (masse salariale), et un onglet de synthèse. Destiné à être
 * transmis au comptable.
 */
export async function buildPayrollWorkbook(opts: {
  pharmacyName: string;
  month: string; // YYYY-MM
  region: Region;
  lines: PayrollLine[];
}): Promise<Buffer> {
  const { pharmacyName, month, region, lines } = opts;

  const wb = new ExcelJS.Workbook();
  wb.creator = "PharmaPlanning";
  wb.created = new Date();

  const EUR = '#,##0.00 "€"';
  const H = '0.0 "h"';
  const VIOLET = "FF6D28D9";
  const HEAD_BG = "FFF5F3FF";
  const RED = "FFDC2626";
  const TOTAL_BG = "FFEDE9FE";

  const ws = wb.addWorksheet(`Rémunération ${month}`, {
    views: [{ state: "frozen", ySplit: 4, xSplit: 1 }],
  });

  const columns = [
    { header: "Salarié", width: 24 },
    { header: "Statut", width: 16 },
    { header: "Coeff. est.", width: 11 },
    { header: "Taux €/h", width: 10 },
    { header: "Min conv. €/h", width: 13 },
    { header: "H trav.", width: 9 },
    { header: "H sup", width: 9 },
    { header: "Congés", width: 9 },
    { header: "Formation", width: 10 },
    { header: "Maladie empl.", width: 13 },
    { header: "Brut", width: 13 },
    { header: "Cotis. sal.", width: 13 },
    { header: "Net est.", width: 13 },
    { header: "Cotis. patr.", width: 13 },
    { header: "Coût total", width: 14 },
    { header: "Position marché", width: 16 },
  ];
  ws.columns = columns.map((c) => ({ width: c.width }));

  // Bandeau titre
  ws.mergeCells(1, 1, 1, columns.length);
  const title = ws.getCell(1, 1);
  title.value = `${pharmacyName} — Rémunération ${monthLabel(month)}`;
  title.font = { bold: true, size: 14, color: { argb: VIOLET } };
  ws.getRow(1).height = 22;

  // Sous-titre (région + avertissement)
  ws.mergeCells(2, 1, 2, columns.length);
  const sub = ws.getCell(2, 1);
  sub.value = `Benchmark région : ${REGION_LABELS[region]} · Estimation indicative — pas un bulletin de paie légal · Données réf. au ${REFERENCE_META.lastReviewed}`;
  sub.font = { size: 9, italic: true, color: { argb: "FF71717A" } };

  // En-tête colonnes (ligne 4)
  const headerRow = ws.getRow(4);
  columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, size: 10, color: { argb: "FF3F3F46" } };
    cell.alignment = { horizontal: i === 0 ? "left" : "center", vertical: "middle", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_BG } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFD4D4D8" } } };
  });
  headerRow.height = 26;

  // Lignes salariés
  let r = 5;
  for (const l of lines) {
    const b = computeBenchmark({
      status: l.status,
      hourlyGrossRate: l.effectiveHourlyRate,
      seniorityMonths: l.seniorityMonths,
      coefficient: l.coefficient,
      region,
      month,
    });
    const row = ws.getRow(r);
    const overtime = l.overtimeHours25 + l.overtimeHours50;

    row.getCell(1).value = l.employeeName;
    row.getCell(2).value = STATUS_LABELS[l.status];
    row.getCell(3).value = b.coefficient;
    const rateCell = row.getCell(4);
    // Taux effectif €/h (implicite en mode mensuel : salaire / h contractuelles)
    rateCell.value = l.effectiveHourlyRate ?? null;
    rateCell.numFmt = EUR;
    if (b.legal === "below_min") {
      rateCell.font = { color: { argb: RED }, bold: true };
    }
    const minCell = row.getCell(5);
    minCell.value = b.minHourly;
    minCell.numFmt = EUR;
    row.getCell(6).value = l.taskHoursRegular;
    row.getCell(6).numFmt = H;
    row.getCell(7).value = overtime;
    row.getCell(7).numFmt = H;
    row.getCell(8).value = l.paidLeaveHours;
    row.getCell(8).numFmt = H;
    row.getCell(9).value = l.trainingHours;
    row.getCell(9).numFmt = H;
    row.getCell(10).value = l.sickHoursEmployerPaid;
    row.getCell(10).numFmt = H;
    row.getCell(11).value = l.grossEmployer;
    row.getCell(11).numFmt = EUR;
    row.getCell(12).value = l.socialContributionsEmployee;
    row.getCell(12).numFmt = EUR;
    row.getCell(13).value = l.netEstimated;
    row.getCell(13).numFmt = EUR;
    row.getCell(14).value = l.socialContributionsEmployer;
    row.getCell(14).numFmt = EUR;
    const costCell = row.getCell(15);
    costCell.value = l.totalEmployerCost;
    costCell.numFmt = EUR;
    costCell.font = { bold: true, color: { argb: VIOLET } };
    row.getCell(16).value = marketLabel(b.legal, b.market, b.marketGapPct);
    r++;
  }

  // Ligne TOTAL (masse salariale)
  const totalRow = ws.getRow(r);
  totalRow.getCell(1).value = "TOTAL OFFICINE";
  totalRow.getCell(1).font = { bold: true };
  const sumCols: Array<{ col: number; key: keyof PayrollLine }> = [
    { col: 11, key: "grossEmployer" },
    { col: 12, key: "socialContributionsEmployee" },
    { col: 13, key: "netEstimated" },
    { col: 14, key: "socialContributionsEmployer" },
    { col: 15, key: "totalEmployerCost" },
  ];
  for (const { col, key } of sumCols) {
    const cell = totalRow.getCell(col);
    cell.value = round2(lines.reduce((acc, l) => acc + (l[key] as number), 0));
    cell.numFmt = EUR;
    cell.font = { bold: true };
  }
  for (let c = 1; c <= columns.length; c++) {
    totalRow.getCell(c).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: TOTAL_BG },
    };
    totalRow.getCell(c).border = { top: { style: "medium", color: { argb: VIOLET } } };
  }
  totalRow.height = 20;

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];
function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS_FR[m - 1]} ${y}`;
}
function marketLabel(
  legal: string,
  market: string,
  gapPct: number | null
): string {
  if (legal === "below_min") return "⚠ Sous minimum conv.";
  if (market === "na") return "n/a";
  const gap = gapPct != null ? ` (${gapPct > 0 ? "+" : ""}${gapPct}%)` : "";
  if (market === "under") return `Sous marché${gap}`;
  if (market === "above") return `Au-dessus${gap}`;
  return `Aligné${gap}`;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
