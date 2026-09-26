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

function isLanguage(value: string | null): value is Language {
  // Object.hasOwn, no `in`: "constructor" o "toString" tambien estan "in".
  return value !== null && Object.hasOwn(LANGUAGE_TO_HTML, value)
}

// `?lang=xx` gana a la preferencia guardada: es la URL que Google indexa por
// idioma (hreflang, ver src/lib/seo/tenant-seo.ts) y la que llega en los
// enlaces de email. Se persiste para que la navegacion siguiente la conserve.
function getUrlLanguage(): Language | null {
  if (typeof window === "undefined") return null
  const lang = new URLSearchParams(window.location.search).get("lang")
  return isLanguage(lang) ? lang : null
}

function getStoredLanguage(): Language {
  if (typeof window === "undefined") return "es"
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isLanguage(stored)) return stored
  } catch {
    // localStorage bloqueado (modo privado estricto, WebView sin storage)
  }
  return "es"
}

function persistLanguage(lang: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // sin storage: el idioma dura lo que la pestana
  }
}

export function LanguageProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [language, setLanguageState] = useState<Language>("es")

  useEffect(() => {
    const fromUrl = getUrlLanguage()
    if (fromUrl) persistLanguage(fromUrl)
    const initial = fromUrl ?? getStoredLanguage()
    setLanguageState(initial)
    document.documentElement.lang = LANGUAGE_TO_HTML[initial]
  }, [])

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang)
    persistLanguage(lang)
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
