// CLEAN fixture — an i18n config that wires BOTH a provider (publishes the active
// locale to the tree) and resources (the dictionaries the translator reads).
// Expected: 0 violations. Mirrors frg-app apps/game/src/shared/application/i18n.tsx.
import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { en } from "../domain/en";
import { sw } from "../domain/sw";

export type Lang = "en" | "sw";

const DICTIONARIES: Record<Lang, Record<string, string>> = { en, sw };

const LanguageContext = createContext<{ lang: Lang; setLang: (l: Lang) => void } | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");
  const value = useMemo(() => ({ lang, setLang }), [lang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useT() {
  const ctx = useContext(LanguageContext)!;
  return (key: string) => DICTIONARIES[ctx.lang][key] ?? DICTIONARIES.en[key] ?? key;
}
