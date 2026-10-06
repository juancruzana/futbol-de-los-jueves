"use client";

import { useEffect, useState } from "react";

// Lo que ya se resaltó en este dispositivo. Sin localStorage, al menos no se repite en la sesión.
const KEY = "fdj-seen";
const mem = new Set<string>();

function firstTime(id: string) {
  if (mem.has(id)) return false;
  mem.add(id);
  try {
    const seen: string[] = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (seen.includes(id)) return false;
    localStorage.setItem(KEY, JSON.stringify([...seen, id].slice(-50)));
  } catch {}
  return true;
}

/** true la primera vez que este dispositivo ve `id` (una encuesta o votación recién abierta), para resaltarla. */
export function useFresh(id: string) {
  const [fresh, setFresh] = useState<string | null>(null);
  useEffect(() => {
    if (firstTime(id)) setFresh(id);
  }, [id]);
  return fresh === id;
}
