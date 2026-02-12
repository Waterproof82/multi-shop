"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import type { MenuCategoryVM } from "@/core/application/dtos/menu-view-model"
import { useLanguage } from "@/lib/language-context"

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
      { rootMargin: "-120px 0px -60% 0px", threshold: 0.1 }
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
          behavior: "smooth",
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

      const offset = window.innerWidth >= 768 ? 140 : 120
      const elementPosition = el.getBoundingClientRect().top + window.scrollY
      const offsetPosition = elementPosition - offset

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      })

      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => {
        isManualScrolling.current = false
      }, 1000)
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
            data-id={cat.id}
            type="button"
            onClick={() => {
              setActiveId(cat.id)
              scrollTo(cat.id)
            }}
            className={cn(
              "whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors",
              activeId === cat.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground"
            )}
          >
            {(language !== "es" && cat.translations?.[language]) || cat.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
