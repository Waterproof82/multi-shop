"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import type { MenuCategoryVM } from "@/core/application/dtos/menu-view-model"
import { useLanguage } from "@/lib/language-context"
import { t } from "@/lib/translations"

interface CategoryNavProps {
  categories: MenuCategoryVM[]
  showTabs?: boolean
  tab?: 'comida' | 'bebidas'
  onTabChange?: (tab: 'comida' | 'bebidas') => void
  isWaiterMode?: boolean
}

export function CategoryNav(props: Readonly<CategoryNavProps>) {
  const { categories, showTabs, tab, onTabChange, isWaiterMode } = props;
  const [activeId, setActiveId] = useState(categories[0]?.id ?? "")

  // Reset active category when the visible categories list changes (e.g. tab switch)
  useEffect(() => {
    setActiveId(categories[0]?.id ?? "")
  }, [categories])
  const { language } = useLanguage()
  const navRef = useRef<HTMLDivElement>(null)
  const isManualScrolling = useRef(false)
  const timeoutRef = useRef<NodeJS.Timeout>(null)

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
          behavior: "instant",
          block: "nearest",
          inline: "center",
        })
      }
    }
  }, [activeId])

  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    if (el) {
      isManualScrolling.current = true
      setActiveId(id)

      requestAnimationFrame(() => {
        const offset = 140
        const elementPosition = el.getBoundingClientRect().top + window.scrollY
        const offsetPosition = elementPosition - offset

        window.scrollTo({ top: offsetPosition, behavior: "instant" })

        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(() => {
          isManualScrolling.current = false
        }, 300)
      })
    }
  }

  const catLabel = (cat: MenuCategoryVM) =>
    (language !== "es" && cat.translations?.[language]?.name) || cat.label

  if (isWaiterMode) {
    return (
      <nav
        className="sticky top-[calc(4rem+56px)] z-40 w-full border-b border-border bg-background/95 backdrop-blur-sm md:top-[calc(5rem+56px)] lg:top-[calc(5rem+56px)]"
        aria-label={t("menuCategories", language)}
      >
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <div className="flex items-center gap-2 py-2">
            {showTabs && onTabChange && (
              <>
                {tab === 'bebidas' && (
                  <button
                    type="button"
                    onClick={() => onTabChange('comida')}
                    className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[36px] text-muted-foreground bg-secondary"
                  >
                    🍳 {t("filterFood", language)}
                  </button>
                )}
                {tab === 'comida' && (
                  <button
                    type="button"
                    onClick={() => onTabChange('bebidas')}
                    className="whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[36px] text-muted-foreground bg-secondary"
                  >
                    🥤 {t("filterDrinks", language)}
                  </button>
                )}
                <span className="h-5 w-px bg-border shrink-0" aria-hidden />
              </>
            )}
            <select
              value={activeId}
              onChange={(e) => scrollTo(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium outline-none focus:ring-2 focus:ring-ring cursor-pointer min-h-[36px] max-w-[200px]"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {catLabel(cat)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </nav>
    )
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
                  className="whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] text-muted-foreground hover:bg-secondary hover:text-secondary-foreground"
                >
                  🍳 {t("filterFood", language)}
                </button>
              )}
              {tab === 'comida' && (
                <button
                  type="button"
                  onClick={() => onTabChange('bebidas')}
                  className="whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] text-muted-foreground hover:bg-secondary hover:text-secondary-foreground"
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
              onClick={() => scrollTo(cat.id)}
              className={cn(
                "whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[44px] min-w-[44px]",
                activeId === cat.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground"
              )}
            >
              {catLabel(cat)}
            </button>
          ))}
        </div>
      </div>
    </nav>
  )
}
