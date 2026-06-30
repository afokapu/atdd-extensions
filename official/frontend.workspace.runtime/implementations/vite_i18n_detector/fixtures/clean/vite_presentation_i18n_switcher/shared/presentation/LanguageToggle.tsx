// CLEAN fixture — the switcher maps over the supported-locale list and passes the
// PICKED value to the change-language API; no locale string is hardcoded into the
// call. Expected: 0 violations. Mirrors frg-app shared/presentation/LanguageToggle.
import { useLanguage } from "../application/i18n";
import type { Lang } from "../application/i18n";

const OPTIONS: readonly Lang[] = ["en", "sw"];

export function LanguageToggle() {
  const { lang, setLang } = useLanguage();
  return (
    <div className="lang-toggle" role="group">
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={lang === option}
          onClick={() => setLang(option)}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
