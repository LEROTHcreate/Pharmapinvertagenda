/**
 * Calcule le nouvel ordre des collaborateurs après avoir placé `movedId` à la
 * position `targetOrder` par INSERTION : les collaborateurs à cette position et
 * au-delà sont décalés de +1 (l'ancien 6 devient 7, le 7 → 8, etc.).
 *
 * Renvoie la liste d'ids dans le nouvel ordre, à renuméroter 0..N. `targetOrder`
 * est borné à [0, nombre d'autres] et tronqué (entier).
 */
export function computeInsertionOrder(
  orderedIds: string[],
  movedId: string,
  targetOrder: number
): string[] {
  const others = orderedIds.filter((id) => id !== movedId);
  const pos = Math.max(0, Math.min(Math.trunc(targetOrder) || 0, others.length));
  return [...others.slice(0, pos), movedId, ...others.slice(pos)];
}
