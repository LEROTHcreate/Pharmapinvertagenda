"use client";

import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/ui/toast";
import { ServiceWorkerRegister } from "@/components/layout/ServiceWorkerRegister";
import type { ReactNode } from "react";

/**
 * Providers globaux (client). Enveloppe TOUTES les pages.
 *
 * NB : plus de QueryClientProvider (@tanstack/react-query) — aucun composant
 * n'utilisait react-query, le provider ne faisait qu'alourdir le bundle client
 * de chaque page pour rien. Le data fetching passe par les Server Components +
 * `fetch` direct + Server Actions.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange={false}
      storageKey="ph_theme"
    >
      <TooltipProvider delayDuration={300}>
        <ToastProvider>
          <ServiceWorkerRegister />
          {children}
        </ToastProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
