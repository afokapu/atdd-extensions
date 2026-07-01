// DIRTY fixture — the switcher hardcodes the target locale string into the
// change-language call instead of passing the locale the user picked. It can never
// reflect the app's real locale set. Expected: 1 violation at the setLang call.
import { useLanguage } from "../application/i18n";

export function LocaleSwitcher() {
  const { setLang } = useLanguage();
  return (
    <button type="button" onClick={() => setLang("sw")}>
      KISW
    </button>
  );
}
