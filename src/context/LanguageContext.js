"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import ro from "@/locales/ro.json";
import ru from "@/locales/ru.json";

const translations = { ro, ru };
const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState("ro");

  useEffect(() => {
    // Check URL path for language prefix (e.g. /ru/... or /ro/...)
    const path = window.location.pathname;
    const pathLangMatch = path.match(/^\/(ro|ru)(\/|$)/);
    if (pathLangMatch && translations[pathLangMatch[1]]) {
      const urlLang = pathLangMatch[1];
      setLangState(urlLang);
      localStorage.setItem("catdai-lang", urlLang);
      return;
    }
    // Fall back to saved preference
    const saved = localStorage.getItem("catdai-lang");
    if (saved && translations[saved]) setLangState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l) => {
    setLangState(l);
    localStorage.setItem("catdai-lang", l);
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
