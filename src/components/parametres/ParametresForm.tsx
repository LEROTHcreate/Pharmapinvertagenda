"use client";

import { useState, useTransition } from "react";
import { Loader2, Save, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { updatePharmacy } from "@/app/(dashboard)/parametres/actions";

type Initial = {
  name: string;
  address: string;
  phone: string;
  minStaff: number;
};

export function ParametresForm({
  initial,
  siret,
}: {
  initial: Initial;
  siret: string | null;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<Initial>(initial);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Initial>(key: K, value: Initial[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await updatePharmacy({
        name: form.name.trim(),
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        minStaff: Number(form.minStaff) || 0,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast({
        tone: "success",
        title: "Paramètres enregistrés",
        description: "Les modifications sont effectives immédiatement.",
      });
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-zinc-200/70 bg-white p-5 md:p-6 space-y-5"
    >
      <Section title="Identité de l'officine">
        <Field label="Nom" htmlFor="name">
          <Input
            id="name"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            disabled={isPending}
            required
            maxLength={120}
          />
        </Field>
        <Field label="Adresse" htmlFor="address">
          <Input
            id="address"
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
            disabled={isPending}
            placeholder="12 avenue du Prado, 13006 Marseille"
            maxLength={200}
          />
        </Field>
        <Field label="Téléphone" htmlFor="phone">
          <Input
            id="phone"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            disabled={isPending}
            placeholder="04 91 00 00 00"
            inputMode="tel"
            maxLength={40}
          />
        </Field>
        {/* SIRET en lecture seule (identifiant administratif, pas modifiable depuis l'UI) */}
        <Field label="SIRET" htmlFor="siret">
          <div className="relative">
            <Input
              id="siret"
              value={siret ?? "—"}
              readOnly
              disabled
              className="pr-9 bg-zinc-50 text-zinc-500"
            />
            <Lock className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          </div>
          <p className="text-[11.5px] text-zinc-400 mt-1">
            Identifiant administratif — non modifiable depuis l'interface.
          </p>
        </Field>
      </Section>

      <Section title="Règles d'affichage">
        <Field
          label="Effectif minimum par créneau"
          htmlFor="minStaff"
          hint="Sert au code couleur de la colonne « Eff » sur la grille planning : vert si ≥ seuil, orange si en dessous, rouge si critique."
        >
          <Input
            id="minStaff"
            type="number"
            min={0}
            max={50}
            value={form.minStaff}
            onChange={(e) => set("minStaff", Number(e.target.value) || 0)}
            disabled={isPending}
            className="max-w-[120px]"
          />
        </Field>
      </Section>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700 ring-1 ring-inset ring-red-100">
          {error}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Enregistrer
        </Button>
      </div>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-[11.5px] font-semibold uppercase tracking-wide text-zinc-500 mb-3">
        {title}
      </h2>
      <div className="space-y-3.5">{children}</div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-[11.5px] text-zinc-500 leading-relaxed">{hint}</p>}
    </div>
  );
}
