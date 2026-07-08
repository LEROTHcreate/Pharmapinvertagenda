"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CalendarPlus,
  Check,
  Clock,
  Copy,
  FileSpreadsheet,
  LayoutTemplate,
  Loader2,
  Pencil,
  Plus,
  Printer,
  Search,
  Star,
  Tag,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type { WeekType } from "@prisma/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApplyTemplateButton } from "@/components/planning/ApplyTemplateButton";
import {
  ImportExcelDialog,
  type ImportDialogEmployee,
} from "@/components/templates/ImportExcelDialog";
import { cn } from "@/lib/utils";

export type GabaritRow = {
  id: string;
  name: string;
  weekType: WeekType;
  category: string | null;
  description: string | null;
  isDefault: boolean;
  entryCount: number;
  updatedAt: string;
  /** Heatmap [jour 0-5][créneau] = nb de collaborateurs en TÂCHE. */
  preview: number[][];
  /** Heures de travail hebdo du gabarit (TÂCHES × 0,5). */
  weeklyHours: number;
  /** Nombre de personnes distinctes affectées à une tâche dans le gabarit. */
  peopleCount: number;
  /** Amplitude horaire (1er → dernier créneau travaillé), déjà formatée « 7h30 ». */
  amplitude: { start: string; end: string } | null;
  /** Nombre de jours de la semaine réellement travaillés (0-6). */
  daysCovered: number;
};

const TYPES: WeekType[] = ["S1", "S2"];
const UNCATEGORIZED = "__none__";
const UNCATEGORIZED_LABEL = "Sans catégorie";

type SortKey = "recent" | "name" | "size";
type TypeFilter = "ALL" | WeekType;

export function GabaritsList({
  rows,
  currentWeekStart,
  employees = [],
}: {
  rows: GabaritRow[];
  currentWeekStart: string;
  /** Équipe active — pour l'import Excel (matching des prénoms + rôle/poste). */
  employees?: ImportDialogEmployee[];
}) {
  const router = useRouter();
  const [busyDelete, setBusyDelete] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<GabaritRow | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<GabaritRow | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [settingDefault, setSettingDefault] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [excelOpen, setExcelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Contrôles de la barre d'outils
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");

  // Catégories existantes (pour les suggestions d'auto-complétion)
  const existingCategories = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => r.category && set.add(r.category));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
  }, [rows]);

  // Filtrage (recherche + type) puis tri
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;
    if (typeFilter !== "ALL") list = list.filter((r) => r.weekType === typeFilter);
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.category ?? "").toLowerCase().includes(q) ||
          (r.description ?? "").toLowerCase().includes(q)
      );
    }
    const sorted = [...list];
    sorted.sort((a, b) => {
      // Les gabarits « par défaut » remontent toujours en tête de leur groupe.
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      if (sort === "name") return a.name.localeCompare(b.name, "fr");
      if (sort === "size") return b.entryCount - a.entryCount;
      // recent
      return b.updatedAt.localeCompare(a.updatedAt);
    });
    return sorted;
  }, [rows, query, typeFilter, sort]);

  // Regroupement par catégorie (catégories nommées triées, "Sans catégorie" en dernier)
  const groups = useMemo(() => {
    const map = new Map<string, GabaritRow[]>();
    filtered.forEach((r) => {
      const key = r.category ?? UNCATEGORIZED;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    const keys = Array.from(map.keys()).sort((a, b) => {
      if (a === UNCATEGORIZED) return 1;
      if (b === UNCATEGORIZED) return -1;
      return a.localeCompare(b, "fr");
    });
    return keys.map((key) => ({
      key,
      label: key === UNCATEGORIZED ? UNCATEGORIZED_LABEL : key,
      list: map.get(key)!,
    }));
  }, [filtered]);

  async function deleteTemplate(target: GabaritRow) {
    setError(null);
    setBusyDelete(target.id);
    try {
      const res = await fetch(`/api/templates/${target.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Erreur lors de la suppression");
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyDelete(null);
      setConfirmTarget(null);
    }
  }

  // Épingle / désépingle un gabarit comme « par défaut » pour son type.
  async function toggleDefault(target: GabaritRow) {
    setError(null);
    setSettingDefault(target.id);
    try {
      const res = await fetch(`/api/templates/${target.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isDefault: !target.isDefault }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Erreur lors de la mise à jour");
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSettingDefault(null);
    }
  }

  const totalCount = rows.length;
  const shownCount = filtered.length;

  // Rendu d'une grille de cartes pour une liste donnée (réutilisé pour le
  // rendu direct et pour les sous-groupes S1/S2 en vue « Tous »).
  const renderCards = (list: GabaritRow[]) => (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {list.map((g) => (
        <GabaritCard
          key={g.id}
          row={g}
          editing={editingId === g.id}
          busyDelete={busyDelete === g.id}
          settingDefault={settingDefault === g.id}
          onStartEdit={() => setEditingId(g.id)}
          onCancelEdit={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null);
            startTransition(() => router.refresh());
          }}
          onDelete={() => setConfirmTarget(g)}
          onDuplicate={() => setDuplicateTarget(g)}
          onToggleDefault={() => toggleDefault(g)}
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 ring-1 ring-inset ring-red-100">
          {error}
        </div>
      )}

      {/* ─── Barre d'outils ─── */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/60 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* Recherche */}
          <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un gabarit…"
              className="h-9 w-full rounded-lg border border-border bg-card pl-8 pr-3 text-[13px] outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
          </div>

          {/* Filtre type S1/S2 */}
          <div className="inline-flex items-stretch rounded-lg bg-muted/50 p-0.5 ring-1 ring-inset ring-border">
            {(["ALL", "S1", "S2"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                  typeFilter === t
                    ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t === "ALL" ? "Tous" : t}
              </button>
            ))}
          </div>

          {/* Tri */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-9 rounded-lg border border-border bg-card px-2.5 text-[12.5px] outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            aria-label="Trier les gabarits"
          >
            <option value="recent">Trier : récents</option>
            <option value="name">Trier : nom (A→Z)</option>
            <option value="size">Trier : nb de créneaux</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          {/* Imprimer — on choisit ensuite le gabarit à imprimer (semaine A4). */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                title="Imprimer un gabarit (semaine)"
              >
                <Printer className="h-4 w-4" />
                Imprimer
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="max-h-[60vh] w-64 overflow-y-auto"
            >
              <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
                Choisir le gabarit à imprimer (semaine)
              </DropdownMenuLabel>
              {rows.filter((r) => r.entryCount > 0).length === 0 ? (
                <DropdownMenuItem disabled>
                  Aucun gabarit à imprimer
                </DropdownMenuItem>
              ) : (
                rows
                  .filter((r) => r.entryCount > 0)
                  .map((r) => (
                    <DropdownMenuItem
                      key={r.id}
                      onSelect={() =>
                        window.open(
                          `/gabarits/${r.id}/imprimer`,
                          "_blank",
                          "noopener"
                        )
                      }
                    >
                      <Printer className="h-4 w-4 shrink-0" />
                      <span className="truncate">{r.name}</span>
                      <span className="ml-auto shrink-0 rounded bg-violet-100 px-1.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                        {r.weekType}
                      </span>
                    </DropdownMenuItem>
                  ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <ApplyTemplateButton
            weekStart={currentWeekStart}
            onApplied={() => startTransition(() => router.refresh())}
            alwaysConfirm
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => setImportOpen(true)}
            title="Créer un gabarit à partir d'une semaine déjà planifiée"
          >
            <CalendarPlus className="h-4 w-4" />
            Importer une semaine
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setExcelOpen(true)}
            title="Créer un gabarit en collant ton planning Excel"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Importer Excel
          </Button>
          {TYPES.map((type) => (
            <Button key={type} asChild size="sm" variant="outline">
              <Link href={`/gabarits/new/${type}`}>
                <Plus className="h-4 w-4" />
                {type}
              </Link>
            </Button>
          ))}
        </div>
      </div>

      {/* Compteur résultats */}
      <p className="text-[12px] text-muted-foreground">
        {shownCount === totalCount
          ? `${totalCount} gabarit${totalCount > 1 ? "s" : ""}`
          : `${shownCount} sur ${totalCount} gabarit${totalCount > 1 ? "s" : ""}`}
      </p>

      {/* ─── Sections par catégorie ─── */}
      {totalCount === 0 ? (
        <GlobalEmptyState />
      ) : shownCount === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 px-6 py-10 text-center text-sm text-muted-foreground">
          Aucun gabarit ne correspond à ta recherche.
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.key}>
              <header className="mb-3 flex items-center gap-2">
                <Tag className="h-4 w-4 text-violet-600" />
                <h2 className="text-base font-semibold tracking-tight">
                  {group.label}
                </h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground/70">
                  {group.list.length}
                </span>
              </header>

              {/* En « Tous » : on sépare S1 et S2 en sous-sections dans chaque
                  catégorie. Filtre S1/S2 déjà actif → rendu direct (inutile). */}
              {typeFilter === "ALL" ? (
                <div className="space-y-4">
                  {TYPES.map((type) => {
                    const sub = group.list.filter((g) => g.weekType === type);
                    if (sub.length === 0) return null;
                    return (
                      <div key={type}>
                        <h3 className="mb-2 flex items-center gap-1.5 pl-0.5 text-[12px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                          Semaine {type}
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground/60">
                            {sub.length}
                          </span>
                        </h3>
                        {renderCards(sub)}
                      </div>
                    );
                  })}
                </div>
              ) : (
                renderCards(group.list)
              )}
            </section>
          ))}
        </div>
      )}

      {/* Datalist partagée pour l'auto-complétion des catégories */}
      <datalist id="gabarit-categories">
        {existingCategories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {/* Dialog duplication */}
      <DuplicateDialog
        target={duplicateTarget}
        onClose={() => setDuplicateTarget(null)}
        onSuccess={(newId) => {
          setDuplicateTarget(null);
          router.push(`/gabarits/${newId}/edit`);
        }}
      />

      {/* Dialog import depuis Excel (collage) */}
      <ImportExcelDialog
        open={excelOpen}
        employees={employees}
        onClose={() => setExcelOpen(false)}
        onCreated={() => startTransition(() => router.refresh())}
      />

      {/* Dialog import depuis une semaine réelle */}
      <ImportWeekDialog
        open={importOpen}
        defaultWeekStart={currentWeekStart}
        onClose={() => setImportOpen(false)}
        onSuccess={(newId) => {
          setImportOpen(false);
          router.push(`/gabarits/${newId}/edit`);
        }}
      />

      {/* Confirmation suppression */}
      <Dialog
        open={!!confirmTarget}
        onOpenChange={(o) => !o && setConfirmTarget(null)}
      >
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Supprimer « {confirmTarget?.name} » ?</DialogTitle>
            <DialogDescription>
              Cette action est irréversible. Les semaines déjà appliquées avec ce
              gabarit ne sont pas modifiées.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTarget(null)}>
              Annuler
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              onClick={() => confirmTarget && deleteTemplate(confirmTarget)}
              disabled={busyDelete !== null}
            >
              {busyDelete === confirmTarget?.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Carte gabarit ─────────────────────────────────────────────── */

function GabaritCard({
  row,
  editing,
  busyDelete,
  settingDefault,
  onStartEdit,
  onCancelEdit,
  onSaved,
  onDelete,
  onDuplicate,
  onToggleDefault,
}: {
  row: GabaritRow;
  editing: boolean;
  busyDelete: boolean;
  settingDefault: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onToggleDefault: () => void;
}) {
  return (
    <div
      className={cn(
        "hover-lift flex flex-col rounded-2xl border bg-card p-4 shadow-sm",
        row.isDefault
          ? "border-amber-300/80 dark:border-amber-700/60"
          : "border-border/70"
      )}
    >
      {/* Aperçu heatmap */}
      <MiniGrid preview={row.preview} />

      {editing ? (
        <MetaEditForm row={row} onCancel={onCancelEdit} onSaved={onSaved} />
      ) : (
        <>
          <div className="mt-3 flex items-start gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-100 to-indigo-100 text-violet-700">
              <LayoutTemplate className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                  {row.weekType}
                </span>
                {row.isDefault && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                    <Star className="h-2.5 w-2.5 fill-current" />
                    Défaut
                  </span>
                )}
                <p className="truncate text-[14px] font-medium tracking-tight text-foreground">
                  {row.name}
                </p>
              </div>
              {row.description && (
                <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">
                  {row.description}
                </p>
              )}
              {/* Stats : heures/semaine · personnes · amplitude horaire · jours travaillés */}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatHours(row.weeklyHours)}/sem
                </span>
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {row.peopleCount} pers.
                </span>
                {row.amplitude && (
                  <span
                    className="inline-flex items-center gap-1"
                    title="Amplitude horaire : du 1er au dernier créneau travaillé"
                  >
                    <Clock className="h-3 w-3" />
                    {row.amplitude.start}–{row.amplitude.end}
                  </span>
                )}
                {row.daysCovered > 0 && (
                  <span
                    className="inline-flex items-center gap-1"
                    title="Jours de la semaine travaillés dans ce gabarit"
                  >
                    <CalendarDays className="h-3 w-3" />
                    {row.daysCovered} j
                  </span>
                )}
              </div>
              <p className="mt-1 text-[10.5px] text-muted-foreground/70">
                modifié le {formatDate(row.updatedAt)}
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-end gap-1 border-t border-border/60 pt-2.5">
            <IconButton
              title={
                row.isDefault
                  ? `Retirer « par défaut » (${row.weekType})`
                  : `Définir comme gabarit ${row.weekType} par défaut`
              }
              onClick={onToggleDefault}
              disabled={busyDelete || settingDefault}
              amber={row.isDefault}
            >
              {settingDefault ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Star className={cn("h-4 w-4", row.isDefault && "fill-current")} />
              )}
            </IconButton>
            <IconButton
              title="Renommer / classer / décrire"
              onClick={onStartEdit}
              disabled={busyDelete}
            >
              <Pencil className="h-4 w-4" />
            </IconButton>
            <IconButton
              title="Dupliquer ce gabarit"
              onClick={onDuplicate}
              disabled={busyDelete}
            >
              <Copy className="h-4 w-4" />
            </IconButton>
            <IconButton
              title="Supprimer"
              onClick={onDelete}
              disabled={busyDelete}
              danger
            >
              {busyDelete ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </IconButton>
            <Button asChild size="sm" className="ml-1">
              <Link href={`/gabarits/${row.id}/edit`}>
                <Pencil className="h-4 w-4" />
                Éditer
              </Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function IconButton({
  children,
  title,
  onClick,
  disabled,
  danger,
  amber,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  amber?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50",
        danger && "text-red-600 hover:bg-red-50 hover:text-red-700",
        amber && "text-amber-500 hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-950/40"
      )}
    >
      {children}
    </button>
  );
}

function formatHours(h: number): string {
  // 37,5 h → "37,5 h" ; 40 → "40 h". Virgule française, sans décimale inutile.
  const s = Number.isInteger(h) ? String(h) : h.toFixed(1).replace(".", ",");
  return `${s} h`;
}

/* ─── Édition inline des métadonnées ────────────────────────────── */

function MetaEditForm({
  row,
  onCancel,
  onSaved,
}: {
  row: GabaritRow;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(row.name);
  const [category, setCategory] = useState(row.category ?? "");
  const [description, setDescription] = useState(row.description ?? "");
  const [weekType, setWeekType] = useState<WeekType>(row.weekType);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Le nom est obligatoire");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/templates/${row.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          category: category.trim(),
          description: description.trim(),
          weekType,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Erreur lors de l'enregistrement");
        return;
      }
      onSaved();
    } catch {
      setError("Réseau indisponible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-2.5">
      <div>
        <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
          Nom
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
          maxLength={80}
          autoFocus
          className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-[13px] outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        />
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            Catégorie
          </label>
          <input
            type="text"
            list="gabarit-categories"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={busy}
            maxLength={40}
            placeholder="Ex : Vacances scolaires"
            className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-[13px] outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
        </div>
        <div className="w-[92px]">
          <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            Type
          </label>
          <div className="inline-flex w-full items-stretch rounded-lg bg-muted/50 p-0.5 ring-1 ring-inset ring-border">
            {TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setWeekType(t)}
                disabled={busy}
                className={cn(
                  "flex-1 rounded-md py-1 text-[12px] font-medium transition-colors",
                  weekType === t
                    ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
          Note
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={busy}
          maxLength={280}
          rows={2}
          placeholder="À quoi sert ce gabarit ?"
          className="w-full resize-none rounded-lg border border-border bg-card px-2.5 py-1.5 text-[13px] outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        />
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-2.5 py-1.5 text-[12px] text-red-700 ring-1 ring-inset ring-red-100">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          <X className="h-4 w-4" />
          Annuler
        </Button>
        <Button size="sm" onClick={save} disabled={busy || !name.trim()}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Enregistrer
        </Button>
      </div>
    </div>
  );
}

/* ─── Aperçu heatmap ────────────────────────────────────────────── */

function MiniGrid({ preview }: { preview: number[][] }) {
  const max = useMemo(() => {
    let m = 0;
    for (const row of preview) for (const v of row) if (v > m) m = v;
    return m;
  }, [preview]);

  const isEmpty = max === 0;

  return (
    <div
      className="space-y-px rounded-lg bg-muted/20 p-1.5"
      title="Aperçu de la couverture (lignes = lun→sam, colonnes = créneaux horaires)"
    >
      {preview.map((dayRow, d) => (
        <div key={d} className="flex gap-px">
          {dayRow.map((count, s) => (
            <div
              key={s}
              className={cn(
                "h-1.5 flex-1 rounded-[1px]",
                count === 0 && "bg-muted/50"
              )}
              style={
                count > 0
                  ? {
                      backgroundColor: `rgba(124, 58, 237, ${
                        0.3 + 0.7 * Math.min(1, count / max)
                      })`,
                    }
                  : undefined
              }
            />
          ))}
        </div>
      ))}
      {isEmpty && (
        <p className="pt-0.5 text-center text-[10px] italic text-muted-foreground/70">
          Gabarit vide
        </p>
      )}
    </div>
  );
}

/* ─── Duplication ───────────────────────────────────────────────── */

function DuplicateDialog({
  target,
  onClose,
  onSuccess,
}: {
  target: GabaritRow | null;
  onClose: () => void;
  onSuccess: (newId: string) => void;
}) {
  const [name, setName] = useState("");
  const [weekType, setWeekType] = useState<WeekType>("S1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setName(`Copie de ${target.name}`);
      setWeekType(target.weekType);
      setError(null);
    }
  }, [target]);

  async function handleDuplicate() {
    if (!target) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Le nom est obligatoire");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/templates/${target.id}/duplicate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newName: trimmed, targetWeekType: weekType }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Erreur lors de la duplication");
        return;
      }
      onSuccess(data.id);
    } catch {
      setError("Réseau indisponible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Dupliquer « {target?.name} »</DialogTitle>
          <DialogDescription>
            Crée une copie modifiable (même catégorie et note). L&apos;original
            reste intact.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-foreground/85">
              Nom de la copie
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              placeholder="Nom du gabarit"
            />
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Type de semaine
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setWeekType(t)}
                  disabled={busy}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors",
                    weekType === t
                      ? "border-violet-300 bg-violet-50 text-violet-700"
                      : "border-border bg-card text-foreground/85 hover:bg-muted/40"
                  )}
                >
                  Semaine {t}
                  {target?.weekType === t && (
                    <span className="ml-1 text-[10px] text-muted-foreground/70">
                      (source)
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-[12.5px] text-red-700 ring-1 ring-inset ring-red-100">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button onClick={handleDuplicate} disabled={busy || !name.trim()}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            Dupliquer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Import depuis une semaine réelle ──────────────────────────── */

function ImportWeekDialog({
  open,
  defaultWeekStart,
  onClose,
  onSuccess,
}: {
  open: boolean;
  defaultWeekStart: string;
  onClose: () => void;
  onSuccess: (newId: string) => void;
}) {
  const [weekStart, setWeekStart] = useState(defaultWeekStart);
  const [weekType, setWeekType] = useState<WeekType>("S1");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // À l'ouverture : repart de la semaine courante + nom suggéré.
  useEffect(() => {
    if (open) {
      setWeekStart(defaultWeekStart);
      setName(`Semaine du ${formatDate(defaultWeekStart)}`);
      setCategory("");
      setError(null);
    }
  }, [open, defaultWeekStart]);

  async function handleImport() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Le nom est obligatoire");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/templates/from-week", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          weekStart,
          weekType,
          name: trimmed,
          category: category.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Erreur lors de l'import");
        return;
      }
      onSuccess(data.id);
    } catch {
      setError("Réseau indisponible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Importer une semaine</DialogTitle>
          <DialogDescription>
            Crée un gabarit à partir d&apos;une semaine déjà planifiée. Choisis
            n&apos;importe quelle date de la semaine à figer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Date dans la semaine à importer */}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-foreground/85">
              Semaine source (une date de la semaine)
            </label>
            <input
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              disabled={busy}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
          </div>

          {/* Nom */}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-foreground/85">
              Nom du gabarit
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              maxLength={80}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              placeholder="Nom du gabarit"
            />
          </div>

          {/* Catégorie (optionnelle) */}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-foreground/85">
              Catégorie <span className="text-muted-foreground/70">(optionnel)</span>
            </label>
            <input
              type="text"
              list="gabarit-categories"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={busy}
              maxLength={40}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-[13px] outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              placeholder="Ex : Vacances scolaires"
            />
          </div>

          {/* Type S1 / S2 */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Type de semaine
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setWeekType(t)}
                  disabled={busy}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors",
                    weekType === t
                      ? "border-violet-300 bg-violet-50 text-violet-700"
                      : "border-border bg-card text-foreground/85 hover:bg-muted/40"
                  )}
                >
                  Semaine {t}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-[12.5px] text-red-700 ring-1 ring-inset ring-red-100">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button onClick={handleImport} disabled={busy || !name.trim()}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CalendarPlus className="h-4 w-4" />
            )}
            Importer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GlobalEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 text-violet-700">
        <LayoutTemplate className="h-6 w-6" />
      </div>
      <p className="text-sm font-medium">Aucun gabarit pour le moment</p>
      <p className="mt-1 max-w-sm text-[12.5px] text-muted-foreground">
        Crée ton premier gabarit de semaine (S1 ou S2), classe-le selon tes
        besoins, puis applique-le en un clic à n&apos;importe quelle semaine.
      </p>
      <div className="mt-4 flex gap-2">
        {TYPES.map((t) => (
          <Button key={t} asChild size="sm" variant="outline">
            <Link href={`/gabarits/new/${t}`}>
              <Plus className="h-4 w-4" />
              Nouveau {t}
            </Link>
          </Button>
        ))}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
