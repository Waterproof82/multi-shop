"use client"

import { useEffect, useRef, useState } from "react"
import { useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"
import type { MenuCategoryVM } from "@/core/application/dtos/menu-view-model"
import { useLanguage } from "@/lib/language-context"
import { t } from "@/lib/translations"

interface CategoryNavProps {
  categories: MenuCategoryVM[]
}

export function CategoryNav(props: Readonly<CategoryNavProps>) {
  const { categories } = props;
  const [activeId, setActiveId] = useState(categories[0]?.id ?? "")
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

      // Temporarily disable content-visibility so getBoundingClientRect returns real positions
      const sections = document.querySelectorAll<HTMLElement>('section.cv-auto')
      sections.forEach((s) => { s.style.contentVisibility = 'visible' })

      requestAnimationFrame(() => {
        const offset = 140
        const elementPosition = el.getBoundingClientRect().top + window.scrollY
        const offsetPosition = elementPosition - offset

        window.scrollTo({
          top: offsetPosition,
          behavior: shouldReduceMotion ? "instant" : "smooth",
        })

        // Restore content-visibility after scroll settles
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(() => {
          sections.forEach((s) => { s.style.contentVisibility = '' })
          isManualScrolling.current = false
        }, 1000)
      })
    }
  }

  return (
    <nav
      ref={navRef}
      className="sticky top-16 z-40 w-full overflow-x-auto border-b border-border bg-background/95 backdrop-blur-sm md:top-20 [-webkit-overflow-scrolling:touch]"
      style={{ scrollMarginTop: '4rem' }}
      aria-label={t("menuCategories", language)}
    >
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="flex gap-1 py-2">
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
                "whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[44px]",
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
