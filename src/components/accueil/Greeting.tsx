"use client";

import { useEffect, useState } from "react";

/**
 * Salutation sensible à l'heure LOCALE du navigateur (évite un décalage de
 * fuseau si on la calculait côté serveur). Rendu initial neutre « Bonjour »
 * puis ajusté au montage.
 */
export function Greeting({ firstName }: { firstName: string | null }) {
  const [g, setG] = useState<{ word: string; emoji: string }>({
    word: "Bonjour",
    emoji: "👋",
  });

  useEffect(() => {
    const h = new Date().getHours();
    if (h < 6) setG({ word: "Bonne nuit", emoji: "🌙" });
    else if (h < 12) setG({ word: "Bonjour", emoji: "☀️" });
    else if (h < 18) setG({ word: "Bon après-midi", emoji: "👋" });
    else setG({ word: "Bonsoir", emoji: "🌆" });
  }, []);

  return (
    <>
      {g.word}
      {firstName ? ` ${firstName}` : ""} {g.emoji}
    </>
  );
}
