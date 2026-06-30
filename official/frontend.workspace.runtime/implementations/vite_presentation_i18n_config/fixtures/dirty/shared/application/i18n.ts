// DIRTY fixture — an i18n config that initializes localization but ships neither a
// provider (no locale published to the tree) nor resources (no dictionaries for the
// translator). Half-wired runtime. Expected: 1 violation at the init call.
import i18next from "i18next";

// Initialized with only a language flag — no string tables wired in, and no
// context component is exported to publish the locale. Just a bare locale setting.
i18next.init({ lng: "en", fallbackLng: "en" });

export default i18next;
