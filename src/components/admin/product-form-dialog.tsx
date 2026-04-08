'use client';

import { Loader2, ChevronDown, ChevronRight, Languages } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ImageUploader } from '@/components/ui/image-uploader';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

interface Categoria {
  id: string;
  nombre_es: string;
  categoria_padre_id: string | null;
}

interface ProductoFormData {
  titulo_es: string;
  titulo_en: string;
  titulo_fr: string;
  titulo_it: string;
  titulo_de: string;
  descripcion_es: string;
  descripcion_en: string;
  descripcion_fr: string;
  descripcion_it: string;
  descripcion_de: string;
  precio: string;
  foto_url: string;
  categoria_id: string;
  es_especial: boolean;
  activo: boolean;
}

interface TranslationFieldsProps {
  formData: ProductoFormData;
  onChange: (data: ProductoFormData) => void;
  show: boolean;
}

function TranslationFields({ formData, onChange, show }: Readonly<TranslationFieldsProps>) {
  const { language } = useLanguage();
  if (!show) return null;

  const langs = ['en', 'fr', 'it', 'de'] as const;

  return (
    <>
      {langs.map((key) => (
        <div key={key} className="col-span-2 grid grid-cols-2 gap-4">
          <div>
            <label htmlFor={`titulo_${key}`} className="block text-sm text-muted-foreground mb-1">
              {t("nameLabel", language)} ({key.toUpperCase()})
            </label>
            <Input
              id={`titulo_${key}`}
              type="text"
              value={formData[`titulo_${key}` as keyof ProductoFormData] as string}
              onChange={(e) => onChange({ ...formData, [`titulo_${key}`]: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor={`descripcion_${key}`} className="block text-sm text-muted-foreground mb-1">
              {t("descriptionLabel", language)} ({key.toUpperCase()})
            </label>
            <Textarea
              id={`descripcion_${key}`}
              value={formData[`descripcion_${key}` as keyof ProductoFormData] as string}
              onChange={(e) => onChange({ ...formData, [`descripcion_${key}`]: e.target.value })}
              rows={2}
              maxLength={2000}
            />
          </div>
        </div>
      ))}
    </>
  );
}

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: string | null;
  formData: ProductoFormData;
  onFormChange: (data: ProductoFormData) => void;
  categorias: Categoria[];
  showTranslations: boolean;
  onToggleTranslations: () => void;
  saving: boolean;
  onSubmit: (e: React.SyntheticEvent) => void;
  empresaSlug: string;
}

export function ProductFormDialog({
  open,
  onOpenChange,
  editingId,
  formData,
  onFormChange,
  categorias,
  showTranslations,
  onToggleTranslations,
  saving,
  onSubmit,
  empresaSlug,
}: Readonly<ProductFormDialogProps>) {
  const { language } = useLanguage();
  const handleClose = () => onOpenChange(false);

  const handleSelectChange = (value: string) => {
    onFormChange({ ...formData, categoria_id: value });
  };

  const parents = categorias.filter(c => !c.categoria_padre_id);
  const children = categorias.filter(c => c.categoria_padre_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl lg:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingId ? t("editProduct", language) : t("newProductDialog", language)}</DialogTitle>
          <DialogDescription>
            {editingId ? t("editProductDesc", language) : t("newProductDesc", language)}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label htmlFor="titulo_es" className="block text-sm font-medium text-foreground mb-1">
                {t("nameSpanish", language)}
              </label>
              <Input
                id="titulo_es"
                type="text"
                required
                aria-required="true"
                value={formData.titulo_es}
                onChange={(e) => onFormChange({ ...formData, titulo_es: e.target.value })}
              />
            </div>

            <div className="col-span-2">
              <label htmlFor="descripcion_es" className="block text-sm font-medium text-foreground mb-1">
                {t("descSpanish", language)}
              </label>
              <Textarea
                id="descripcion_es"
                value={formData.descripcion_es}
                onChange={(e) => onFormChange({ ...formData, descripcion_es: e.target.value })}
                rows={2}
                maxLength={2000}
              />
            </div>

            <div>
              <label htmlFor="precio" className="block text-sm font-medium text-foreground mb-1">
                {t("priceLabel", language)}
              </label>
              <Input
                id="precio"
                type="number"
                step="0.01"
                required
                aria-required="true"
                value={formData.precio}
                onChange={(e) => onFormChange({ ...formData, precio: e.target.value })}
              />
            </div>

            <div>
              <label htmlFor="categoria_id" className="block text-sm font-medium text-foreground mb-1">
                {t("category", language)}
              </label>
              <Select
                value={formData.categoria_id}
                onValueChange={handleSelectChange}
              >
                <SelectTrigger
                  id="categoria_id"
                  aria-label={t("category", language)}
                >
                  <SelectValue placeholder={t("noCategory", language)} />
                </SelectTrigger>
                <SelectContent>
                  {parents.map(parent => {
                    const childCats = children.filter(c => c.categoria_padre_id === parent.id);
                    if (childCats.length > 0) {
                      return (
                        <SelectGroup key={parent.id}>
                          <SelectLabel>{parent.nombre_es}</SelectLabel>
                          <SelectItem value={parent.id}>
                            {parent.nombre_es} ({t("mainCategory", language)})
                          </SelectItem>
                          {childCats.map(sub => (
                            <SelectItem key={sub.id} value={sub.id} isSubcategory>
                              └─ {sub.nombre_es}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      );
                    }
                    return (
                      <SelectItem key={parent.id} value={parent.id}>
                        {parent.nombre_es}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2">
              <ImageUploader
                value={formData.foto_url}
                onChange={(url) => onFormChange({ ...formData, foto_url: url })}
                label={t("productImage", language)}
                empresaSlug={empresaSlug}
                helpText={t("productImageHelp", language)}
              />
            </div>

            <div className="col-span-2">
              <button
                type="button"
                onClick={onToggleTranslations}
                className="flex items-center gap-2 text-sm font-medium text-foreground mt-4 hover:text-primary dark:hover:text-primary"
              >
                {showTranslations ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <Languages className="h-4 w-4" />
                {t("translationsToggle", language)} ({showTranslations ? t("hideLabel", language) : t("showLabel", language)})
              </button>
            </div>

            <TranslationFields
              formData={formData}
              onChange={onFormChange}
              show={showTranslations}
            />

            <div className="col-span-2 flex gap-6 mt-4">
              <label htmlFor="es_especial" className="flex items-center gap-2 cursor-pointer">
                <input
                  id="es_especial"
                  type="checkbox"
                  checked={formData.es_especial}
                  onChange={(e) => onFormChange({ ...formData, es_especial: e.target.checked })}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background cursor-pointer accent-primary"
                />
                <span className="text-sm text-foreground">{t("specialProduct", language)}</span>
              </label>
              <label htmlFor="activo" className="flex items-center gap-2 cursor-pointer">
                <input
                  id="activo"
                  type="checkbox"
                  checked={formData.activo}
                  onChange={(e) => onFormChange({ ...formData, activo: e.target.checked })}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background cursor-pointer accent-primary"
                />
                <span className="text-sm text-foreground">{t("active", language)}</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 border rounded-md hover:bg-muted/50 border-border text-foreground min-h-[44px]"
            >
              {t("cancel", language)}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 min-h-[44px]"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                  {t("savingProgress", language)}
                </>
              ) : (
                t("save", language)
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string | null;
  onConfirm: () => void;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  productName,
  onConfirm,
}: Readonly<DeleteConfirmDialogProps>) {
  const { language } = useLanguage();
  const handleClose = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="p-2 bg-destructive/10 rounded-full">
              <Loader2 className="w-5 h-5 text-destructive" />
            </div>
            {t("deleteProduct", language)}
          </DialogTitle>
          <DialogDescription>
            {t("deleteProductConfirm", language)} <strong>{productName}</strong>? {t("cannotUndo", language)}
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-muted-foreground hover:bg-muted rounded-lg min-h-[44px] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("cancel", language)}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-lg min-h-[44px] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t("delete", language)}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export type { ProductoFormData };
