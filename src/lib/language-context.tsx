"use client"

import { createContext, useContext, useState, useMemo, useEffect, useCallback, type ReactNode } from "react"

export type Language = "es" | "en" | "fr" | "it" | "de"

interface LanguageContextType {
  language: Language
  setLanguage: (lang: Language) => void
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

const LANGUAGE_TO_HTML: Record<Language, string> = {
  es: "es",
  en: "en",
  fr: "fr",
  it: "it",
  de: "de",
}

const STORAGE_KEY = "preferred-language"

function getStoredLanguage(): Language {
  if (typeof window === "undefined") return "es"
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && stored in LANGUAGE_TO_HTML) return stored as Language
  return "es"
}

export function LanguageProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [language, setLanguageState] = useState<Language>("es")

  useEffect(() => {
    const stored = getStoredLanguage()
    setLanguageState(stored)
    document.documentElement.lang = LANGUAGE_TO_HTML[stored]
  }, [])

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang)
    localStorage.setItem(STORAGE_KEY, lang)
    if (typeof document !== "undefined") {
      document.documentElement.lang = LANGUAGE_TO_HTML[lang]
    }
  }, [])

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = LANGUAGE_TO_HTML[language]
    }
  }, [language])

  const contextValue = useMemo(() => ({ language, setLanguage }), [language, setLanguage])

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider")
  }
  return context
}
