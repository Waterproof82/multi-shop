"use client"

import { Plus } from "lucide-react"
import { useState } from "react"
import { motion } from "framer-motion"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useCart } from "@/lib/cart-context"
import { useLanguage } from "@/lib/language-context"
import { t } from "@/lib/translations"
import { MenuCategoryVM, MenuItemVM } from "@/core/application/dtos/menu-view-model"
import { QuantitySelectorDialog } from "@/components/quantity-selector-dialog"

interface MenuSectionProps {
  category: MenuCategoryVM
}

export function MenuSection({ category }: MenuSectionProps) {
  const { addItem } = useCart()
  const { language } = useLanguage()
  const [selectedItem, setSelectedItem] = useState<MenuItemVM | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const handleItemClick = (item: MenuItemVM) => {
    setSelectedItem(item)
    setIsDialogOpen(true)
  }

  const handleAddToCartWithQuantity = (item: MenuItemVM, quantity: number) => {
    addItem(item, quantity)
  }

  const isSalsas = category.id === "salsas"

  return (
    <section id={category.id} className="scroll-mt-32">
      <div className="mb-6 flex items-center gap-4">
        <h2 className="font-serif text-2xl font-bold text-foreground md:text-3xl">
          {category.label}
        </h2>
        <div className="h-px flex-1 bg-border" />
      </div>

      {isSalsas && (
        <p className="mb-4 text-sm text-muted-foreground">
          Elige tu salsa favorita para acompañar tu pasta. Pasta con salsa Frutti di Mare +2.50€
        </p>
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {category.items.map((item, index) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.4, delay: index * 0.08 }}
            className="h-full"
          >
            <MenuItemCard 
              item={item} 
              isSalsas={isSalsas} 
              language={language} 
              onItemClick={handleItemClick} 
            />
          </motion.div>
        ))}
      </div>



      <QuantitySelectorDialog
        item={selectedItem}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onAddToCart={handleAddToCartWithQuantity}
      />
    </section>
  )
}

function MenuItemCard({
  item,
  isSalsas,
  language,
  onItemClick,
}: {
  item: MenuItemVM
  isSalsas: boolean
  language: any
  onItemClick: (item: MenuItemVM) => void
}) {
  const [imageError, setImageError] = useState(false)

  return (
    <div
      className={`group flex h-full flex-col overflow-hidden rounded-xl bg-card shadow-sm transition-all hover:shadow-md border cursor-pointer ${
        item.highlight ? "border-accent/30 bg-accent/5" : "border-border"
      }`}
      onClick={() => onItemClick(item)}
    >
      {item.image && !imageError && (
        <div className="relative aspect-[4/3] w-full overflow-hidden">
          <Image
            src={item.image}
            alt={item.name}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            onError={() => setImageError(true)}
          />
        </div>
      )}

      <div className="flex flex-1 flex-col p-5">
        <div className="mb-2 flex items-start justify-between gap-2">
          <h3 className="font-serif text-xl font-bold text-foreground">
            {item.name}
          </h3>
          <div className="flex flex-col gap-1 items-end shrink-0">
            {item.highlight && (
              <Badge variant="secondary" className="bg-accent/10 text-accent text-[10px]">
                Especial
              </Badge>
            )}

          </div>
        </div>



        {item.description && (
          <p className="mb-3 flex-1 text-sm leading-relaxed text-muted-foreground">
            {item.description}
          </p>
        )}

        {/* Always ensure content pushes footer down */}
        <div className="flex-1" />

        {!isSalsas && (
          <div className="flex items-center justify-between gap-3 pt-4 mt-auto">
            <span className="font-serif text-2xl font-bold text-foreground">
              {item.price.toFixed(2).replace(".", ",")}€
            </span>
            <Button
              size="default"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={(e) => {
                e.stopPropagation()
                onItemClick(item)
              }}
            >
              <Plus className="mr-2 size-4" />
              {t("addToCart", language)}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
