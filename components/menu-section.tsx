"use client"

import { Plus } from "lucide-react"
import { motion } from "framer-motion"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useCart } from "@/lib/cart-context"
import { useLanguage } from "@/lib/language-context"
import { t } from "@/lib/translations"
import type { MenuCategory } from "@/lib/menu-data"

interface MenuSectionProps {
  category: MenuCategory
}

export function MenuSection({ category }: MenuSectionProps) {
  const { addItem } = useCart()
  const { language } = useLanguage()

  const isSalsas = category.id === "salsas"
  const hasImages = category.items.some((item) => item.image)

  return (
    <section id={category.id} className="scroll-mt-32">
      <div className="mb-6 flex items-center gap-4">
        <h2 className="font-serif text-2xl font-bold text-foreground md:text-3xl">
          {t(category.id as keyof typeof import("@/lib/translations").translations.es, language)}
        </h2>
        <div className="h-px flex-1 bg-border" />
      </div>

      {isSalsas && (
        <p className="mb-4 text-sm text-muted-foreground">
          Elige tu salsa favorita para acompañar tu pasta. Pasta con salsa Frutti di Mare +2.50€
        </p>
      )}

      {hasImages ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {category.items.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
            >
              <div
                className={`group relative flex h-full flex-col overflow-hidden rounded-xl bg-card shadow-md transition-all hover:shadow-lg ${
                  item.highlight ? "ring-2 ring-accent/30" : ""
                }`}
              >
                {item.image && (
                  <div className="relative aspect-[4/3] w-full overflow-hidden">
                    <Image
                      src={item.image || "/placeholder.svg"}
                      alt={item.name}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                  </div>
                )}

                <div className="flex flex-1 flex-col p-5">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h3 className="font-serif text-xl font-bold text-foreground">
                      {item.name}
                    </h3>
                    {item.highlight && (
                      <Badge variant="secondary" className="bg-accent/10 text-accent text-[10px]">
                        Especial
                      </Badge>
                    )}
                  </div>

                  {item.description && (
                    <p className="mb-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-3 pt-2">
                    <span className="font-serif text-2xl font-bold text-foreground">
                      {item.price.toFixed(2).replace(".", ",")}€
                    </span>
                    <Button
                      size="default"
                      className="bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={() => addItem(item)}
                    >
                      <Plus className="mr-2 size-4" />
                      {t("addToCart", language)}
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="grid gap-3">
          {category.items.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.3, delay: index * 0.03 }}
            >
              <div
                className={`group flex items-start justify-between gap-4 rounded-lg px-4 py-3 transition-colors hover:bg-card ${
                  item.highlight ? "border border-accent/30 bg-accent/5" : ""
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-foreground">{item.name}</h3>
                    {item.highlight && (
                      <Badge variant="secondary" className="bg-accent/10 text-accent text-[10px]">
                        Especial
                      </Badge>
                    )}
                    {item.glutenFree && (
                      <Badge variant="outline" className="text-[10px]">
                        Sin gluten
                      </Badge>
                    )}
                    {item.minPersons && (
                      <span className="text-xs text-muted-foreground">
                        (min. {item.minPersons} px)
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {!isSalsas && (
                    <span className="whitespace-nowrap font-serif text-lg font-bold text-foreground">
                      {item.price.toFixed(2).replace(".", ",")}€
                    </span>
                  )}
                  {!isSalsas && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-primary opacity-0 transition-opacity hover:bg-primary/10 hover:text-primary group-hover:opacity-100"
                      onClick={() => addItem(item)}
                      aria-label={`${t("addToCart", language)} ${item.name}`}
                    >
                      <Plus className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {category.id === "pastas" && (
        <p className="mt-3 text-sm font-medium text-primary">* También tenemos SIN GLUTEN</p>
      )}
    </section>
  )
}
