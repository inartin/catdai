"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import ro from "@/locales/ro.json";
import ru from "@/locales/ru.json";

const translations = { ro, ru };
const LanguageContext = createContext(null);
const LANG_COOKIE = "catdai-lang";

function persistLanguage(l) {
  localStorage.setItem(LANG_COOKIE, l);
  document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; SameSite=Lax`;
}

function normalizeLanguage(value) {
  return translations[value] ? value : "ro";
}

function getInitialLanguage(initialLang) {
  const hasInitialLang = !!translations[initialLang];
  const normalizedInitialLang = hasInitialLang ? initialLang : "ro";
  if (typeof window === "undefined") return normalizedInitialLang;

  const pathLangMatch = window.location.pathname.match(/^\/(ro|ru)(\/|$)/);
  if (pathLangMatch && translations[pathLangMatch[1]]) return pathLangMatch[1];

  if (hasInitialLang) return normalizedInitialLang;

  const saved = localStorage.getItem(LANG_COOKIE);
  return saved && translations[saved] ? saved : "ro";
}

export function LanguageProvider({ children, initialLang }) {
  const [lang, setLangState] = useState(() => getInitialLanguage(initialLang));

  useEffect(() => {
    const pathLangMatch = !initialLang ? window.location.pathname.match(/^\/(ro|ru)(\/|$)/) : null;
    const pathLang = pathLangMatch?.[1];
    const documentLang = pathLang && translations[pathLang] ? pathLang : lang;

    persistLanguage(documentLang);
    document.documentElement.lang = documentLang;
  }, [initialLang, lang]);

  const setLang = useCallback((l) => {
    setLangState(l);
    persistLanguage(l);
  }, []);

  const t = useCallback(
    (key, vars) => {
      let str = translations[lang]?.[key] ?? translations.ro[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replaceAll(`{${k}}`, String(v));
        }
      }
      return str;
    },
    [lang]
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useTranslation must be used within LanguageProvider");
  return ctx;
}
