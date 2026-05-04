"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Users as UsersIcon, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ContactDTO } from "@/types/messaging";

type Props = {
  open: boolean;
  onClose: () => void;
  contacts: ContactDTO[];
  onCreate: (payload: {
    memberIds: string[];
    name: string | null;
  }) => Promise<void>;
};

export function NewConversationDialog({
  open,
  onClose,
  contacts,
  onCreate,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupName, setGroupName] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setGroupName("");
      setSearch("");
      setError(null);
    }
  }, [open]);

  const isGroup = selected.size >= 2;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q)
    );
  }, [contacts, search]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  async function handleCreate() {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate({
        memberIds: Array.from(selected),
        name: isGroup ? groupName.trim() || null : null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nouvelle conversation</DialogTitle>
          <DialogDescription>
            Sélectionnez 1 collaborateur (conversation directe) ou plusieurs
            (groupe).
          </DialogDescription>
        </DialogHeader>

        {/* Pastilles sélectionnées */}
        {selected.size > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {Array.from(selected).map((id) => {
              const c = contacts.find((x) => x.id === id);
              if (!c) return null;
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[12px] font-medium text-violet-700"
                >
                  {c.name}
                  <button
                    onClick={() => toggle(id)}
                    className="rounded-full p-0.5 hover:bg-violet-200"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}

        {/* Nom du groupe (si ≥ 2) */}
        {isGroup && (
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-foreground/70 flex items-center gap-1">
              <UsersIcon className="h-3.5 w-3.5" />
              Nom du groupe (optionnel)
            </label>
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Ex: Équipe comptoir"
              maxLength={80}
            />
          </div>
        )}

        {/* Recherche */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un collaborateur…"
            className="pl-9"
          />
        </div>

        {/* Liste */}
        <div className="max-h-72 overflow-y-auto -mx-6 px-6">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground/70">
              Aucun résultat
            </p>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((c) => {
                const isSelected = selected.has(c.id);
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => toggle(c.id)}
                      className={cn(
                        "w-full flex items-center gap-2 rounded-lg px-2 py-2 text-left transition",
                        isSelected
                          ? "bg-violet-50 ring-1 ring-violet-200"
                          : "hover:bg-muted/40"
                      )}
                    >
                      <span
                        className={cn(
                          "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                          isSelected
                            ? "bg-violet-600 border-violet-600"
                            : "border-zinc-300"
                        )}
                      >
                        {isSelected && (
                          <svg
                            className="h-3 w-3 text-white"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.7 5.7a1 1 0 010 1.4L8.4 15.4 3.3 10.3a1 1 0 011.4-1.4l3.7 3.7 7-7a1 1 0 011.4 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13.5px] font-medium text-foreground truncate">
                          {c.name}
                        </p>
                        <p className="text-[11.5px] text-muted-foreground truncate">
                          {c.email}
                        </p>
                      </div>
                      {c.role === "ADMIN" && (
                        <span className="text-[10px] uppercase tracking-wide font-medium text-violet-600 bg-violet-50 rounded-full px-1.5 py-0.5">
                          Admin
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {error && (
          <p className="text-[12.5px] text-red-700">{error}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button
            onClick={handleCreate}
            disabled={selected.size === 0 || busy}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {isGroup ? "Créer le groupe" : "Démarrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
