"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** base64 URL-safe → Uint8Array (format attendu par applicationServerKey). */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "loading" | "unsupported" | "unconfigured" | "denied" | "off" | "on";

/**
 * Carte « Notifications » du profil — active/désactive les notifications push
 * (absence validée, consigne, événement demain). Autonome : gère la permission
 * navigateur, l'abonnement PushManager et l'enregistrement côté serveur.
 */
export function NotificationsCard() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        setState("unsupported");
        return;
      }
      // Le serveur a-t-il les clés VAPID ?
      const cfg = await fetch("/api/push").then((r) => r.json()).catch(() => null);
      if (!PUBLIC_KEY || !cfg?.configured) {
        setState("unconfigured");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      setState(sub ? "on" : "off");
    })();
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // cast : le générique Uint8Array<ArrayBufferLike> de TS ≥5.7 ne matche
        // pas directement BufferSource, mais le runtime l'accepte.
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY!) as BufferSource,
      });
      const json = sub.toJSON();
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint, keys: json.keys }),
      });
      setState(res.ok ? "on" : "off");
    } catch {
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
          {state === "on" ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-foreground">Notifications</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Reçois une alerte sur cet appareil : absence validée, nouvelle consigne,
            événement du lendemain — même quand l'app est fermée.
          </p>

          <div className="mt-3">
            {state === "loading" && (
              <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Vérification…
              </span>
            )}

            {state === "unsupported" && (
              <p className="text-[12.5px] text-muted-foreground">
                Ton navigateur ne prend pas en charge les notifications push. Sur iPhone,
                installe d'abord l'app sur l'écran d'accueil (Partager → « Sur l'écran d'accueil »).
              </p>
            )}

            {state === "unconfigured" && (
              <p className="text-[12.5px] text-muted-foreground">
                Les notifications push ne sont pas encore activées côté serveur. Préviens
                ton titulaire (clés VAPID à configurer).
              </p>
            )}

            {state === "denied" && (
              <p className="text-[12.5px] text-amber-600 dark:text-amber-400">
                Tu as bloqué les notifications pour ce site. Ré-autorise-les dans les
                réglages du navigateur pour les activer.
              </p>
            )}

            {state === "off" && (
              <button
                onClick={enable}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-violet-700 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                Activer les notifications
              </button>
            )}

            {state === "on" && (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-[13px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <BellRing className="h-4 w-4" /> Activées sur cet appareil
                </span>
                <button
                  onClick={disable}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[13px] font-medium text-muted-foreground hover:bg-muted/50 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellOff className="h-4 w-4" />}
                  Désactiver
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
