"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import type { MenuCategory } from "@/lib/menu-data"
import { useLanguage } from "@/lib/language-context"
import { t } from "@/lib/translations"

interface CategoryNavProps {
  categories: MenuCategory[]
}

export function CategoryNav({ categories }: CategoryNavProps) {
  const [activeId, setActiveId] = useState(categories[0]?.id ?? "")
  const { language } = useLanguage()
  const navRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length > 0) {
          const sorted = visible.sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top
          )
          setActiveId(sorted[0].target.id)
        }
      },
      { rootMargin: "-120px 0px -60% 0px", threshold: 0.1 }
    )

    for (const cat of categories) {
      const el = document.getElementById(cat.id)
      if (el) observer.observe(el)
    }

    return () => observer.disconnect()
  }, [categories])

  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  return (
    <nav
      ref={navRef}
      className="sticky top-16 z-40 -mx-4 overflow-x-auto border-b border-border bg-background/95 px-4 backdrop-blur-sm md:top-20"
      aria-label="Categorias del menu"
    >
      <div className="flex gap-1 py-2">
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => scrollTo(cat.id)}
            className={cn(
              "whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors",
              activeId === cat.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground"
            )}
          >
            {t(cat.id as keyof typeof import("@/lib/translations").translations.es, language)}
          </button>
        ))}
      </div>
    </nav>
  )
}
