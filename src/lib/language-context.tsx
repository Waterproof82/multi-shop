"use client"

import { createContext, useContext, useState, useMemo, type ReactNode } from "react"

export type Language = "es" | "en" | "fr" | "it" | "de"

interface LanguageContextType {
  language: Language
  setLanguage: (lang: Language) => void
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export function LanguageProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [language, setLanguage] = useState<Language>("es")

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
