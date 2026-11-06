'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, ImagePlus, Loader2, Trash2, Save } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ImagenSubida } from '@/components/ui/imagen-subida';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';
import { fetchWithCsrf } from '@/lib/csrf-client';
import { optimizeImage } from '@/lib/image-utils';
import { filaDesdeApi } from '@/core/domain/productos/tabla';
import type { ProductoTabla, TablaCelda } from '@/core/domain/entities/types';

const LANGS = ['es', 'en', 'fr', 'it', 'de'] as const;
type LangKey = typeof LANGS[number];

export interface TablaCeldaForm {
  es: string;
  en: string;
  fr: string;
  it: string;
  de: string;
}

export interface TablaFilaForm {
  celdas: TablaCeldaForm[];
  imagen: string;
}

export interface ProductoTablaForm {
  columnas: TablaCeldaForm[];
  filas: TablaFilaForm[];
}

const MAX_COLUMNAS = 8;
const MAX_FILAS = 30;
const MAX_IMAGEN_MB = 10;
const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function emptyCelda(): TablaCeldaForm {
  return { es: '', en: '', fr: '', it: '', de: '' };
}

export function emptyTablaForm(): ProductoTablaForm {
  return { columnas: [], filas: [] };
}

function filaFromApi(fila: unknown): TablaFilaForm {
  const normalizada = filaDesdeApi(fila);
  return {
    celdas: normalizada.celdas.map(celdaFromApi),
    imagen: normalizada.imagen ?? '',
  };
}

function celdaFromApi(celda: TablaCelda | undefined): TablaCeldaForm {
  return {
    es: celda?.es ?? '',
    en: celda?.en ?? '',
    fr: celda?.fr ?? '',
    it: celda?.it ?? '',
    de: celda?.de ?? '',
  };
}

export function tablaFormFromApi(tabla: TablaFormApi | null | undefined): ProductoTablaForm {
  if (!tabla) return emptyTablaForm();
  return {
    columnas: tabla.columnas.map(celdaFromApi),
    filas: tabla.filas.map((fila) => filaFromApi(fila)),
  };
}

// El formulario puede recibir la tabla normalizada (dominio) o JSON crudo de
// la API con filas del shape histórico (array plano de celdas, sin imagen);
// `filaDesdeApi` tolera ambos.
type TablaFormApi = {
  columnas: TablaCelda[];
  filas: unknown[];
};

function celdaToApi(celda: TablaCeldaForm): TablaCelda {
  return {
    es: celda.es,
    en: celda.en.trim() || null,
    fr: celda.fr.trim() || null,
    it: celda.it.trim() || null,
    de: celda.de.trim() || null,
  };
}

export function tablaFormToApi(form: ProductoTablaForm): ProductoTabla | null {
  if (form.columnas.length === 0) return null;
  return {
    columnas: form.columnas.map(celdaToApi),
    filas: form.filas.map((fila) => ({
      celdas: fila.celdas.map(celdaToApi),
      imagen: fila.imagen.trim() || null,
    })),
  };
}

function resizeColumns(tabla: ProductoTablaForm, count: number): ProductoTablaForm {
  const n = Math.max(0, Math.min(MAX_COLUMNAS, count));
  const columnas = Array.from({ length: n }, (_, i) => tabla.columnas[i] ?? emptyCelda());
  const filas = tabla.filas.map((fila) => (
    { ...fila, celdas: Array.from({ length: n }, (_, i) => fila.celdas[i] ?? emptyCelda()) }
  ));
  return { columnas, filas };
}

interface PlantillaResumen {
  id: string;
  nombre: string;
  columnas: TablaCelda[];
}

interface MiniImagenFilaProps {
  readonly value: string;
  readonly empresaId: string;
  readonly onChange: (url: string) => void;
  readonly ariaUpload: string;
  readonly ariaChange: string;
  readonly ariaRemove: string;
}

/**
 * Uploader compacto de la imagen de una fila de tabla (~44px): mismo camino
 * que `ImageUploader` (optimizeImage → /api/admin/upload-image) pero en
 * tamaño de celda. Pinta con `ImagenSubida`: la imagen YA viene optimizada
 * (480px WebP) y no debe volver a pasar por el optimizador de Vercel.
 */
function MiniImagenFila({ value, empresaId, onChange, ariaUpload, ariaChange, ariaRemove }: Readonly<MiniImagenFilaProps>) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function validar(file: File): string | null {
    if (!TIPOS_IMAGEN.includes(file.type)) {
      return 'Tipo de archivo no permitido. Solo JPEG, PNG, WEBP o GIF.';
    }
    if (file.size > MAX_IMAGEN_MB * 1024 * 1024) {
      return `El archivo excede el tamaño máximo de ${MAX_IMAGEN_MB}MB.`;
    }
    return null;
  }

  async function subir(file: File) {
    const motivo = validar(file);
    if (motivo) {
      setError(motivo);
      return;
    }
    setUploading(true);
    setError('');
    try {
      const optimized = await optimizeImage(file);
      const formData = new FormData();
      formData.append('file', optimized.file);
      const res = await fetchWithCsrf(`/api/admin/upload-image?empresaId=${empresaId}`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        // La API responde `{ code, message }`; `error` se acepta por si algún
        // endpoint devuelve el shape viejo. Sin esto el usuario solo ve el
        // genérico "Error al subir imagen" y se pierde la causa real.
        const data = await res.json().catch(() => ({})) as { error?: string; message?: string };
        throw new Error(data.error ?? data.message ?? 'Error al subir imagen');
      }
      const data = await res.json() as { publicUrl?: string };
      if (!data.publicUrl) throw new Error('No se recibió la URL de la imagen');
      onChange(data.publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir imagen');
    } finally {
      setUploading(false);
    }
  }

  function seleccionar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void subir(file);
  }

  return (
    <div className="flex flex-col items-center gap-1">
      {value ? (
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            aria-label={ariaChange}
            title={ariaChange}
            className="relative block h-11 w-11 rounded-md overflow-hidden border border-border outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ImagenSubida
              src={value}
              alt=""
              fill
              sizes="44px"
              className="object-cover"
              loading="lazy"
            />
          </button>
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label={ariaRemove}
            title={ariaRemove}
            className="p-2 text-destructive hover:text-destructive/80 min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          aria-label={ariaUpload}
          title={uploading ? undefined : ariaUpload}
          className="h-11 w-11 rounded-md border-2 border-dashed border-border hover:border-muted-foreground/40 inline-flex items-center justify-center text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" />
          ) : (
            <ImagePlus className="h-5 w-5" />
          )}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={seleccionar}
        className="hidden"
      />
      {error && (
        <p className="text-[10px] leading-tight text-destructive text-center">{error}</p>
      )}
    </div>
  );
}

interface Props {
  value: ProductoTablaForm;
  onChange: (value: ProductoTablaForm) => void;
  showTranslations: boolean;
  empresaId: string;
}

export function ProductTablaEditor({ value, onChange, showTranslations, empresaId }: Readonly<Props>) {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [activeLang, setActiveLang] = useState<LangKey>('es');
  const [plantillas, setPlantillas] = useState<PlantillaResumen[]>([]);
  const [selectedPlantillaId, setSelectedPlantillaId] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [nombrePlantilla, setNombrePlantilla] = useState('');
  const [savingPlantilla, setSavingPlantilla] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch(`/api/admin/tabla-plantillas?empresaId=${empresaId}`);
      if (res.ok && !cancelled) {
        setPlantillas(await res.json() as PlantillaResumen[]);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [empresaId]);

  const columnCount = value.columnas.length;
  const hasContent = columnCount > 0;

  function applyPlantilla() {
    const plantilla = plantillas.find((p) => p.id === selectedPlantillaId);
    if (!plantilla) return;
    const columnas = plantilla.columnas.map(celdaFromApi);
    // Solo trae las cabeceras — las filas existentes se reacomodan al nuevo
    // número de columnas (rellenando/recortando), nunca se traen datos de la
    // plantilla ni se pisan los que ya haya cargados en el producto. La
    // imagen de cada fila se conserva.
    const filas = value.filas.map((fila) => (
      { ...fila, celdas: Array.from({ length: columnas.length }, (_, i) => fila.celdas[i] ?? emptyCelda()) }
    ));
    onChange({ columnas, filas });
  }

  async function saveAsPlantilla() {
    const nombre = nombrePlantilla.trim();
    if (!nombre || !hasContent) return;
    setSavingPlantilla(true);
    try {
      const res = await fetchWithCsrf('/api/admin/tabla-plantillas', {
        method: 'POST',
        body: JSON.stringify({ nombre, columnas: value.columnas.map(celdaToApi) }),
      });
      if (res.ok) {
        const creada = await res.json() as PlantillaResumen;
        setPlantillas((prev) => [...prev, creada].sort((a, b) => a.nombre.localeCompare(b.nombre)));
        setNombrePlantilla('');
        setShowSaveForm(false);
      }
    } finally {
      setSavingPlantilla(false);
    }
  }

  async function deletePlantilla(id: string) {
    const res = await fetchWithCsrf(`/api/admin/tabla-plantillas?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      setPlantillas((prev) => prev.filter((p) => p.id !== id));
      if (selectedPlantillaId === id) setSelectedPlantillaId('');
    }
  }

  function handleColumnCountChange(raw: string) {
    const n = Number.parseInt(raw, 10);
    if (Number.isNaN(n)) return;
    onChange(resizeColumns(value, n));
  }

  function handleHeaderChange(colIdx: number, text: string) {
    const columnas = value.columnas.map((celda, i) =>
      i === colIdx ? { ...celda, [activeLang]: text } : celda
    );
    onChange({ ...value, columnas });
  }

  function handleCellChange(rowIdx: number, colIdx: number, text: string) {
    const filas = value.filas.map((fila, r) =>
      r === rowIdx
        ? { ...fila, celdas: fila.celdas.map((celda, c) => (c === colIdx ? { ...celda, [activeLang]: text } : celda)) }
        : fila
    );
    onChange({ ...value, filas });
  }

  function handleImagenChange(rowIdx: number, url: string) {
    onChange({
      ...value,
      filas: value.filas.map((fila, r) => (r === rowIdx ? { ...fila, imagen: url } : fila)),
    });
  }

  function addRow() {
    if (value.filas.length >= MAX_FILAS) return;
    const nuevaFila: TablaFilaForm = {
      celdas: Array.from({ length: columnCount }, () => emptyCelda()),
      imagen: '',
    };
    onChange({ ...value, filas: [...value.filas, nuevaFila] });
  }

  function removeRow(rowIdx: number) {
    onChange({ ...value, filas: value.filas.filter((_, r) => r !== rowIdx) });
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-3 py-2 text-left group"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          {t('productTableSectionLabel', language)}
          {hasContent && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {columnCount} × {value.filas.length}
            </span>
          )}
          {!hasContent && plantillas.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
              {plantillas.length} {t('productTableTemplatesBadge', language)}
            </span>
          )}
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          {plantillas.length > 0 && (
            <div>
              <label htmlFor="tabla-plantilla-select" className="block text-xs font-medium text-muted-foreground mb-1">
                {t('productTableTemplateSelectLabel', language)}
              </label>
              <div className="flex items-center gap-2">
                <Select value={selectedPlantillaId} onValueChange={setSelectedPlantillaId}>
                  <SelectTrigger id="tabla-plantilla-select" className="flex-1">
                    <SelectValue placeholder={t('productTableTemplateNone', language)} />
                  </SelectTrigger>
                  <SelectContent>
                    {plantillas.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  onClick={applyPlantilla}
                  disabled={!selectedPlantillaId}
                  className="px-3 py-2 min-h-[44px] rounded-md border border-border text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 whitespace-nowrap"
                >
                  {t('productTableLoadTemplate', language)}
                </button>
                {selectedPlantillaId && (
                  <button
                    type="button"
                    onClick={() => void deletePlantilla(selectedPlantillaId)}
                    aria-label={t('productTableTemplateDeleteAria', language)}
                    className="p-2 text-destructive hover:text-destructive/80 min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          {showTranslations && (
            <div className="flex gap-1">
              {LANGS.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setActiveLang(lang)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                    activeLang === lang
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {lang.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          <div>
            <label htmlFor="tabla-num-columnas" className="block text-xs font-medium text-muted-foreground mb-1">
              {t('productTableColumnsLabel', language)}
            </label>
            <Input
              id="tabla-num-columnas"
              type="number"
              min={0}
              max={MAX_COLUMNAS}
              value={columnCount}
              onChange={(e) => handleColumnCountChange(e.target.value)}
              className="w-24"
            />
          </div>

          {hasContent && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="w-12 p-1">
                      <span className="sr-only">{t('productTableImageLabel', language)}</span>
                    </th>
                    {value.columnas.map((columna, colIdx) => (
                      <th key={colIdx} className="p-1 text-left">
                        <Input
                          value={columna[activeLang]}
                          onChange={(e) => handleHeaderChange(colIdx, e.target.value)}
                          placeholder={t('productTableHeaderPlaceholder', language)}
                          className="text-xs font-semibold"
                        />
                      </th>
                    ))}
                    <th className="w-8" scope="col" aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {value.filas.map((fila, rowIdx) => (
                    <tr key={rowIdx}>
                      <td className="p-1 align-top">
                        <MiniImagenFila
                          value={fila.imagen}
                          empresaId={empresaId}
                          onChange={(url) => handleImagenChange(rowIdx, url)}
                          ariaChange={t('productTableRowImageChangeAria', language)}
                          ariaRemove={t('productTableRowImageRemoveAria', language)}
                          ariaUpload={t('productTableRowImageUploadAria', language)}
                        />
                      </td>
                      {fila.celdas.map((celda, colIdx) => (
                        <td key={colIdx} className="p-1">
                          <Input
                            value={celda[activeLang]}
                            onChange={(e) => handleCellChange(rowIdx, colIdx, e.target.value)}
                          />
                        </td>
                      ))}
                      <td>
                        <button
                          type="button"
                          onClick={() => removeRow(rowIdx)}
                          aria-label={`${t('productTableRemoveRowAria', language)} ${rowIdx + 1}`}
                          className="p-2 text-destructive hover:text-destructive/80 min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                type="button"
                onClick={addRow}
                disabled={value.filas.length >= MAX_FILAS}
                className="mt-2 text-sm text-primary hover:underline disabled:opacity-50 disabled:no-underline min-h-[44px]"
              >
                + {t('productTableAddRow', language)}
              </button>

              <div className="mt-3 pt-3 border-t border-border">
                {showSaveForm ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={nombrePlantilla}
                      onChange={(e) => setNombrePlantilla(e.target.value)}
                      placeholder={t('productTableTemplateNamePlaceholder', language)}
                      maxLength={100}
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => void saveAsPlantilla()}
                      disabled={!nombrePlantilla.trim() || savingPlantilla}
                      className="px-3 py-2 min-h-[44px] rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 whitespace-nowrap"
                    >
                      {t('productTableTemplateSaveConfirm', language)}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowSaveForm(false); setNombrePlantilla(''); }}
                      className="px-3 py-2 min-h-[44px] rounded-md border border-border text-sm text-foreground hover:bg-muted"
                    >
                      {t('cancel', language)}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowSaveForm(true)}
                    className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary min-h-[44px]"
                  >
                    <Save className="h-4 w-4" />
                    {t('productTableSaveAsTemplate', language)}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
