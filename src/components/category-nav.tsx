"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import type { MenuCategoryVM } from "@/core/application/dtos/menu-view-model"
import { useLanguage } from "@/lib/language-context"
import { t } from "@/lib/translations"
import { subcategoriasConProductos, tieneSubcategoriasConProductos } from "@/lib/menu/subcategorias"
import { transformOriginFromClick } from "@/lib/menu/transform-origin"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { LayoutGrid } from "lucide-react"

interface CategoryNavProps {
  categories: MenuCategoryVM[]
  showTabs?: boolean
  tab?: 'comida' | 'bebidas'
  onTabChange?: (tab: 'comida' | 'bebidas') => void
  isWaiterMode?: boolean
}

// Pestana activa: subrayado en el color del tenant, no pastilla rellena.
function claseCategoria(activa: boolean): string {
  if (activa) return "border-primary text-foreground"
  return "border-transparent text-muted-foreground hover:text-foreground"
}

export function CategoryNav(props: Readonly<CategoryNavProps>) {
  const { categories, showTabs, tab, onTabChange, isWaiterMode } = props;
  const [activeId, setActiveId] = useState(categories[0]?.id ?? "")
  const [subcatDialogFor, setSubcatDialogFor] = useState<string | null>(null)
  const [dialogOrigin, setDialogOrigin] = useState<string>("50% 50%")

  // Reset active category when the visible categories list changes (e.g. tab switch)
  useEffect(() => {
    setActiveId(categories[0]?.id ?? "")
  }, [categories])

  // Same reason as above: if categories changes while the dialog is open,
  // activeDialogCategory would become null and the dialog would stay open
  // showing an empty panel.
  useEffect(() => {
    setSubcatDialogFor(null)
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

  // `activeCategoryId` es la pastilla que debe quedar resaltada — por
  // defecto la misma que el ancla de scroll, pero al saltar a una
  // SUBCATEGORÍA debe seguir siendo la de la categoría PADRE (ninguna
  // pastilla tiene el id de una subcategoría, así que sin este segundo
  // parámetro el resaltado desaparecería tras elegir una).
  const scrollTo = (id: string, activeCategoryId: string = id) => {
    const el = document.getElementById(id)
    if (el) {
      isManualScrolling.current = true
      setActiveId(activeCategoryId)

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

  const openSubcategoryDialog = (catId: string, e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = rect.left + rect.width / 2
    const clickY = rect.top + rect.height / 2
    setDialogOrigin(transformOriginFromClick(clickX, clickY, window.innerWidth, window.innerHeight))
    setSubcatDialogFor(catId)
  }

  const pickAndClose = (targetId: string, activeCategoryId: string) => {
    setSubcatDialogFor(null)
    scrollTo(targetId, activeCategoryId)
  }

  const catLabel = (cat: MenuCategoryVM) =>
    (language !== "es" && cat.translations?.[language]?.name) || cat.label

  if (isWaiterMode) {
    return (
      <nav
        className="sticky top-[calc(3rem+56px)] z-40 w-full border-b border-border bg-background/95 backdrop-blur-sm"
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

  const activeDialogCategory = categories.find((c) => c.id === subcatDialogFor) ?? null

  return (
    <>
      <nav
        ref={navRef}
        className="sticky top-16 z-40 w-full overflow-x-auto border-b border-foreground/10 bg-background md:top-20 lg:top-20 [-webkit-overflow-scrolling:touch]"
        style={{ scrollMarginTop: 'var(--scroll-offset, 4rem)' }}
        aria-label={t("menuCategories", language)}
      >
        <div className="mx-auto max-w-7xl px-[clamp(16px,4vw,64px)]">
          <div className="flex min-w-max flex-nowrap items-stretch gap-1">
            {showTabs && onTabChange && (
              <>
                {tab === 'bebidas' && (
                  <button
                    type="button"
                    onClick={() => onTabChange('comida')}
                    className="whitespace-nowrap px-3 text-sm font-semibold text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[44px] min-w-[44px]"
                  >
                    {t("filterFood", language)}
                  </button>
                )}
                {tab === 'comida' && (
                  <button
                    type="button"
                    onClick={() => onTabChange('bebidas')}
                    className="whitespace-nowrap px-3 text-sm font-semibold text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[44px] min-w-[44px]"
                  >
                    {t("filterDrinks", language)}
                  </button>
                )}
                <span className="mx-1 h-5 w-px shrink-0 self-center bg-foreground/15" aria-hidden />
              </>
            )}
            {categories.map((cat) => {
              const conSubcategorias = tieneSubcategoriasConProductos(cat)
              return (
                <button
                  key={cat.id}
                  data-id={cat.id}
                  type="button"
                  aria-haspopup={conSubcategorias ? "dialog" : undefined}
                  onClick={(e) => conSubcategorias ? openSubcategoryDialog(cat.id, e) : scrollTo(cat.id)}
                  aria-current={activeId === cat.id ? "true" : undefined}
                  className={cn(
                    "min-h-[48px] min-w-[44px] whitespace-nowrap border-b-2 px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    claseCategoria(activeId === cat.id)
                  )}
                >
                  {catLabel(cat)}
                  {conSubcategorias && <span aria-hidden="true" className="ml-1">▾</span>}
                </button>
              )
            })}
          </div>
        </div>
      </nav>

      <Dialog
        open={subcatDialogFor !== null}
        onOpenChange={(open) => { if (!open) setSubcatDialogFor(null) }}
      >
        <DialogContent style={{ transformOrigin: dialogOrigin }} className="gap-0 rounded-[3px] p-0 shadow-none sm:max-w-sm">
          {activeDialogCategory && (
            <>
              <DialogHeader className="border-b border-foreground/10 px-6 pb-4 pt-6 text-left">
                <DialogTitle className="font-serif text-2xl font-normal leading-tight tracking-[-0.02em] [font-variant-numeric:lining-nums] pr-8">{catLabel(activeDialogCategory)}</DialogTitle>
                <DialogDescription className="sr-only">{t("chooseSubcategory", language)}</DialogDescription>
              </DialogHeader>
              <ul className="max-h-80 overflow-y-auto px-2 py-2">
                <li className="border-b border-foreground/10">
                  <button
                    type="button"
                    onClick={() => pickAndClose(activeDialogCategory.id, activeDialogCategory.id)}
                    className="flex min-h-[48px] w-full items-center gap-2 px-4 text-left text-sm font-semibold text-foreground underline decoration-primary decoration-1 underline-offset-[6px] outline-none hover:decoration-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <LayoutGrid className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {t("viewAllCollection", language)}
                  </button>
                </li>
                {subcategoriasConProductos(activeDialogCategory).map((subcat) => (
                  <li key={subcat.id} className="border-b border-foreground/10 last:border-0">
                    <button
                      type="button"
                      onClick={() => pickAndClose(subcat.id, activeDialogCategory.id)}
                      className="flex min-h-[48px] w-full items-center px-4 text-left font-serif text-lg font-normal text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      {(language !== "es" && subcat.translations?.[language]?.name) || subcat.nombre}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
