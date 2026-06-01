"use client"

import { useEffect, useRef, useState } from "react"
import { useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"
import type { MenuCategoryVM } from "@/core/application/dtos/menu-view-model"
import { useLanguage } from "@/lib/language-context"
import { t } from "@/lib/translations"

interface CategoryNavProps {
  categories: MenuCategoryVM[]
  showTabs?: boolean
  tab?: 'comida' | 'bebidas'
  onTabChange?: (tab: 'comida' | 'bebidas') => void
}

export function CategoryNav(props: Readonly<CategoryNavProps>) {
  const { categories, showTabs, tab, onTabChange } = props;
  const [activeId, setActiveId] = useState(categories[0]?.id ?? "")

  // Reset active category when the visible categories list changes (e.g. tab switch)
  useEffect(() => {
    setActiveId(categories[0]?.id ?? "")
  }, [categories])
  const { language } = useLanguage()
  const navRef = useRef<HTMLDivElement>(null)
  const isManualScrolling = useRef(false)
  const timeoutRef = useRef<NodeJS.Timeout>(null)
  const shouldReduceMotion = useReducedMotion() ?? false

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (isManualScrolling.current) return

        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length > 0) {
          const sorted = [...visible].sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top
          )
          setActiveId(sorted[0].target.id)
        }
      },
      { rootMargin: "-100px 0px -70% 0px", threshold: 0 }
    )

    for (const cat of categories) {
      const el = document.getElementById(cat.id)
      if (el) observer.observe(el)
    }

    return () => {
      observer.disconnect()
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [categories])

  useEffect(() => {
    if (activeId && navRef.current) {
      const activeBtn = navRef.current.querySelector(`button[data-id="${activeId}"]`)
      if (activeBtn) {
        activeBtn.scrollIntoView({
          behavior: shouldReduceMotion ? "instant" : "smooth",
          block: "nearest",
          inline: "center",
        })
      }
    }
  }, [activeId, shouldReduceMotion])

  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    if (el) {
      isManualScrolling.current = true
      setActiveId(id)

      requestAnimationFrame(() => {
        const offset = 140
        const elementPosition = el.getBoundingClientRect().top + window.scrollY
        const offsetPosition = elementPosition - offset

        window.scrollTo({
          top: offsetPosition,
          behavior: shouldReduceMotion ? "instant" : "smooth",
        })

        // Re-enable auto-scroll after scroll settles
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(() => {
          isManualScrolling.current = false
        }, 1000)
      })
    }
  }

  return (
    <nav
      ref={navRef}
      className="sticky top-16 z-40 w-full overflow-x-auto border-b border-border bg-background/95 backdrop-blur-sm md:top-20 lg:top-20 [-webkit-overflow-scrolling:touch]"
      style={{ scrollMarginTop: 'var(--scroll-offset, 4rem)' }}
      aria-label={t("menuCategories", language)}
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="flex flex-nowrap gap-1 py-2 items-center min-w-max">
          {showTabs && onTabChange && (
            <>
              {tab === 'bebidas' && (
                <button
                  type="button"
                  onClick={() => onTabChange('comida')}
                  className="whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] text-muted-foreground hover:bg-secondary hover:text-secondary-foreground"
                >
                  🍳 {t("filterFood", language)}
                </button>
              )}
              {tab === 'comida' && (
                <button
                  type="button"
                  onClick={() => onTabChange('bebidas')}
                  className="whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] text-muted-foreground hover:bg-secondary hover:text-secondary-foreground"
                >
                  🥤 {t("filterDrinks", language)}
                </button>
              )}
              <span className="h-5 w-px bg-border mx-1 shrink-0" aria-hidden />
            </>
          )}
          {categories.map((cat) => (
            <button
              key={cat.id}
              data-id={cat.id}
              type="button"
              onClick={() => {
                setActiveId(cat.id)
                scrollTo(cat.id)
              }}
              className={cn(
                "whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[44px] min-w-[44px]",
                activeId === cat.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground"
              )}
            >
              {(language !== "es" && cat.translations?.[language]?.name) || cat.label}
            </button>
          ))}
        </div>
      </div>
    </nav>
  )
}
