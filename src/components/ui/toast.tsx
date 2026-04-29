"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertTriangle, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastTone = "success" | "error" | "info" | "warning";

export type Toast = {
  id: string;
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Durée d'affichage en ms (défaut 4000) */
  duration?: number;
};

type ToastContextValue = {
  toast: (t: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Toast system façon Apple : carte glass avec backdrop-blur, animation
 * d'entrée/sortie subtile, accumulation en bas-droite.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (input: Omit<Toast, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const next: Toast = { id, tone: "info", duration: 4000, ...input };
      setToasts((prev) => [...prev, next]);
      const timer = setTimeout(() => dismiss(id), next.duration);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  useEffect(() => {
    const t = timers.current;
    return () => {
      t.forEach((id) => clearTimeout(id));
      t.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within <ToastProvider>");
  }
  return ctx;
}

/* ─── Viewport (carte glass + pile) ──────────────────────────────────── */

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex max-w-[calc(100vw-2rem)] flex-col gap-2 sm:bottom-6 sm:right-6"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: () => void;
}) {
  const tone = toast.tone ?? "info";
  const styles = TONE_STYLES[tone];
  const Icon = styles.icon;

  return (
    <div
      role="status"
      className={cn(
        "animate-toast-in pointer-events-auto flex items-start gap-3 overflow-hidden rounded-2xl px-4 py-3 shadow-[0_8px_28px_-12px_rgba(0,0,0,0.18),0_2px_4px_-2px_rgba(0,0,0,0.08)] backdrop-blur-xl ring-1 ring-inset",
        "min-w-[280px] max-w-[420px]",
        styles.bg,
        styles.ring
      )}
    >
      <div className={cn("mt-0.5 shrink-0", styles.iconColor)}>
        <Icon className="h-4.5 w-4.5" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("text-[13.5px] font-semibold tracking-tight", styles.title)}>
          {toast.title}
        </p>
        {toast.description && (
          <p className={cn("mt-0.5 text-[12.5px] leading-relaxed", styles.desc)}>
            {toast.description}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fermer"
        className={cn(
          "-mr-1 -mt-1 rounded-full p-1 transition-colors hover:bg-black/5",
          styles.close
        )}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

const TONE_STYLES = {
  success: {
    icon: CheckCircle2,
    bg: "bg-emerald-50/85",
    ring: "ring-emerald-200/60",
    iconColor: "text-emerald-600",
    title: "text-emerald-900",
    desc: "text-emerald-800/80",
    close: "text-emerald-700/60",
  },
  error: {
    icon: XCircle,
    bg: "bg-red-50/85",
    ring: "ring-red-200/60",
    iconColor: "text-red-600",
    title: "text-red-900",
    desc: "text-red-800/80",
    close: "text-red-700/60",
  },
  warning: {
    icon: AlertTriangle,
    bg: "bg-amber-50/85",
    ring: "ring-amber-200/60",
    iconColor: "text-amber-600",
    title: "text-amber-900",
    desc: "text-amber-800/80",
    close: "text-amber-700/60",
  },
  info: {
    icon: Info,
    bg: "bg-white/80",
    ring: "ring-zinc-200/60",
    iconColor: "text-violet-600",
    title: "text-zinc-900",
    desc: "text-zinc-600",
    close: "text-zinc-500",
  },
} as const;
