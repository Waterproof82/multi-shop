'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, ChevronDown, ChevronRight, Languages, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { fetchWithCsrf } from '@/lib/csrf-client';
import type { ComplementoGrupo } from '@/core/domain/entities/complemento-types';
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
import { AllergenIcon, ALLERGEN_KEYS, ALLERGEN_TRANSLATION_KEY } from '@/components/allergen-icons';
import type { AllergenKey } from '@/components/allergen-icons';

interface Categoria {
  id: string;
  nombre_es: string;
  categoria_padre_id: string | null;
}

type ImageFit = 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';

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
  foto_object_fit: ImageFit;
  categoria_id: string;
  es_especial: boolean;
  activo: boolean;
  tipo_producto: 'comida' | 'bebida';
  porcentajeImpuestoOverride: number | null;
  alergenos: string[];
}

interface ProductComplementosSectionProps {
  productoId: string;
}

function ProductComplementosSection({ productoId }: Readonly<ProductComplementosSectionProps>) {
  const [allGrupos, setAllGrupos] = useState<ComplementoGrupo[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function load() {
      const [allRes, assignedRes] = await Promise.all([
        fetch('/api/admin/complementos/grupos'),
        fetch(`/api/admin/productos/${productoId}/complementos`),
      ]);
      if (allRes.ok) setAllGrupos(await allRes.json() as ComplementoGrupo[]);
      if (assignedRes.ok) {
        const assigned = await assignedRes.json() as ComplementoGrupo[];
        setSelectedIds(new Set(assigned.map(g => g.id)));
      }
      setLoading(false);
    }
    void load();
  }, [productoId]);

  async function toggleGrupo(grupoId: string) {
    const next = new Set(selectedIds);
    if (next.has(grupoId)) { next.delete(grupoId); } else { next.add(grupoId); }
    setSelectedIds(next);
    setSaving(true);
    setSaved(false);
    try {
      await fetchWithCsrf(`/api/admin/productos/${productoId}/complementos`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grupoIds: Array.from(next) }),
      });
      setSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  const assignedCount = selectedIds.size;

  if (loading) return <p className="text-sm text-muted-foreground py-2">Cargando grupos...</p>;
  if (allGrupos.length === 0) return (
    <p className="text-sm text-muted-foreground">
      No hay grupos de complementos.{' '}
      <a href="/admin/complementos" className="text-primary hover:underline">Crear grupos →</a>
    </p>
  );

  return (
    <div>
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="w-full flex items-center justify-between gap-3 py-2 text-left group"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          Grupos de complementos
          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            {assignedCount} asignado{assignedCount !== 1 ? 's' : ''}
          </span>
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {saving && <Loader2 className="w-3 h-3 animate-spin" />}
          {saved && !saving && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
          {saved && !saving && <span className="text-emerald-600 dark:text-emerald-400">Guardado</span>}
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-1.5">
          {allGrupos.map(grupo => (
            <label key={grupo.id} className="flex items-start gap-3 cursor-pointer p-3 border border-border rounded-lg hover:bg-muted/50 transition-colors">
              <input
                type="checkbox"
                checked={selectedIds.has(grupo.id)}
                onChange={() => void toggleGrupo(grupo.id)}
                className="mt-0.5 accent-primary w-4 h-4"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{grupo.nombre_es}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {grupo.tipo === 'radio' ? 'Elige 1' : 'Múltiple'} · {grupo.obligatorio ? 'Obligatorio' : 'Opcional'} · {grupo.opciones.length} opciones
                </p>
              </div>
              {selectedIds.has(grupo.id) && (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

interface AllergenSelectorProps {
  selected: string[];
  onChange: (alergenos: string[]) => void;
  language: string;
}

function AllergenSelector({ selected, onChange, language }: Readonly<AllergenSelectorProps>) {
  const [open, setOpen] = useState(false);

  function toggleAllergen(key: AllergenKey) {
    if (selected.includes(key)) {
      onChange(selected.filter(k => k !== key));
    } else {
      onChange([...selected, key]);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="w-full flex items-center justify-between gap-3 py-2 text-left group"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          Alérgenos
          {selected.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {selected.length} seleccionado{selected.length !== 1 ? 's' : ''}
            </span>
          )}
        </span>
      </button>

      {open && (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {ALLERGEN_KEYS.map((key) => {
            const tKey = ALLERGEN_TRANSLATION_KEY[key];
            const label = t(tKey, language as Parameters<typeof t>[1]);
            const isChecked = selected.includes(key);
            return (
              <label
                key={key}
                className="flex items-center gap-2 cursor-pointer p-2 border border-border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleAllergen(key)}
                  className="w-4 h-4 accent-primary shrink-0"
                />
                <AllergenIcon allergen={key} className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-xs text-foreground truncate">{label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
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
                objectFit={formData.foto_object_fit}
                onObjectFitChange={(fit) => onFormChange({ ...formData, foto_object_fit: fit })}
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

            <div className="col-span-2 flex flex-wrap gap-6 mt-4">
              <label htmlFor="es_especial" className="flex items-center gap-2 cursor-pointer">
                <input
                  id="es_especial"
                  type="checkbox"
                  checked={formData.es_especial}
                  onChange={(e) => onFormChange({ ...formData, es_especial: e.target.checked })}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background cursor-pointer accent-primary"
                />
                <span className="text-sm bg-red-500/20 text-red-400 border border-red-400/30 px-2 py-0.5 rounded-full">
                  {t("specialProduct", language)}
                </span>
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

          <div className="col-span-2">
            <label htmlFor="porcentaje_impuesto_override" className="block text-sm font-medium text-foreground mb-1">
              % Impuesto específico (override)
            </label>
            <input
              id="porcentaje_impuesto_override"
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={formData.porcentajeImpuestoOverride ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                onFormChange({
                  ...formData,
                  porcentajeImpuestoOverride: raw === '' ? null : Number.parseFloat(raw),
                });
              }}
              placeholder="Ej: 4"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              aria-describedby="porcentaje_override_help"
            />
            <span id="porcentaje_override_help" className="text-xs text-muted-foreground mt-1 block">
              Si vacío, usa el tipo general de la empresa
            </span>
          </div>

          <div className="col-span-2 pt-2 border-t border-border">
            <AllergenSelector
              selected={formData.alergenos}
              onChange={(alergenos) => onFormChange({ ...formData, alergenos })}
              language={language}
            />
          </div>

          {editingId !== null && (
            <div className="col-span-2 pt-2 border-t border-border">
              <ProductComplementosSection productoId={editingId} />
            </div>
          )}

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
