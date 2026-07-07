"use client";

import { useEffect, useState } from "react";

/**
 * Salutation sensible à l'heure LOCALE du navigateur (évite un décalage de
 * fuseau si on la calculait côté serveur). Rendu initial neutre « Bonjour »
 * puis ajusté au montage. Salue par le PRÉNOM.
 */
export function Greeting({ firstName }: { firstName: string | null }) {
  const [word, setWord] = useState("Bonjour");

  useEffect(() => {
    const h = new Date().getHours();
    if (h < 6) setWord("Bonne nuit");
    else if (h < 12) setWord("Bonjour");
    else if (h < 18) setWord("Bon après-midi");
    else setWord("Bonsoir");
  }, []);

  return (
    <>
      {word}
      {firstName ? ` ${firstName}` : ""}
    </>
  );
}
