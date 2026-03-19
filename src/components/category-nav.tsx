"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import type { MenuCategoryVM } from "@/core/application/dtos/menu-view-model"
import { useLanguage } from "@/lib/language-context"
import { t } from "@/lib/translations"

const SCROLL_OFFSET_PX = 180;
const INTERSECTION_ROOT_MARGIN_TOP = "-100px";
const INTERSECTION_ROOT_MARGIN_BOTTOM = "-70%";

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
      { rootMargin: `${INTERSECTION_ROOT_MARGIN_TOP} 0px ${INTERSECTION_ROOT_MARGIN_BOTTOM} 0px`, threshold: 0 }
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

      const performScroll = () => {
        el.scrollIntoView({
          behavior: "smooth",
          block: "start",
        })
      }

      if (el.getBoundingClientRect().height === 0) {
        const observer = new MutationObserver(() => {
          if (el.getBoundingClientRect().height > 0) {
            observer.disconnect()
            requestAnimationFrame(performScroll)
          }
        })
        observer.observe(el, { attributes: true, childList: true, subtree: true })
        setTimeout(() => observer.disconnect(), 2000)
      } else {
        requestAnimationFrame(performScroll)
      }

      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => {
        isManualScrolling.current = false
      }, 2000)
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
