/**
 * product-detail-pages PR1 (tarea 1.7) — campos `slug` y `canonical_externo`
 * en el formulario admin de productos.
 *
 * Solo deben aparecer para tiendas (mismo gating que `foto_url_2`, ver
 * 1.8 en apply-progress): un restaurante nunca tiene página de producto
 * propia, así que esos campos no significan nada para él.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { ProductFormDialog, type ProductoFormData } from '@/components/admin/product-form-dialog';
import { emptyTablaForm } from '@/components/admin/ProductTablaEditor';

// ProductTablaEditor pide plantillas con `fetch` plano al montar — sin este
// doble, cada test dispara una petición de red real a una URL relativa que
// jsdom no puede resolver (rechazo no manejado, ajeno a lo que se prueba
// aquí: los campos slug/canonical_externo).
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { status: 200 })));
});

const baseFormData: ProductoFormData = {
  titulo_es: 'Kit básico',
  titulo_en: '',
  titulo_fr: '',
  titulo_it: '',
  titulo_de: '',
  descripcion_es: '',
  descripcion_en: '',
  descripcion_fr: '',
  descripcion_it: '',
  descripcion_de: '',
  precio: '19.99',
  foto_url: '',
  foto_url_2: '',
  foto_object_fit: 'contain',
  categoria_id: '',
  es_especial: false,
  activo: true,
  tipo_producto: 'comida',
  porcentajeImpuestoOverride: null,
  alergenos: [],
  tabla_info: emptyTablaForm(),
  slug: '',
  canonical_externo: '',
};

function renderDialog(overrides: Partial<React.ComponentProps<typeof ProductFormDialog>> = {}) {
  const onFormChange = vi.fn();
  render(
    <LanguageProvider>
      <ProductFormDialog
        open
        onOpenChange={vi.fn()}
        editingId={null}
        formData={baseFormData}
        onFormChange={onFormChange}
        categorias={[]}
        showTranslations={false}
        onToggleTranslations={vi.fn()}
        saving={false}
        onSubmit={vi.fn()}
        empresaTipo="tienda"
        empresaId="empresa-1"
        {...overrides}
      />
    </LanguageProvider>
  );
  return { onFormChange };
}

describe('ProductFormDialog — campos slug y canonical_externo', () => {
  it('se muestran cuando la empresa es tienda', () => {
    renderDialog({ empresaTipo: 'tienda' });
    expect(screen.getByLabelText(/slug/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/url canónica externa/i)).toBeInTheDocument();
  });

  it('NO se muestran para restaurante', () => {
    renderDialog({ empresaTipo: 'restaurante' });
    expect(screen.queryByLabelText(/slug/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/url canónica externa/i)).not.toBeInTheDocument();
  });

  it('editar el slug llama a onFormChange con el nuevo valor', () => {
    const { onFormChange } = renderDialog({ empresaTipo: 'tienda' });
    fireEvent.change(screen.getByLabelText(/slug/i), { target: { value: 'kit-basico' } });
    expect(onFormChange).toHaveBeenCalledWith(expect.objectContaining({ slug: 'kit-basico' }));
  });

  it('editar canonical_externo llama a onFormChange con el nuevo valor', () => {
    const { onFormChange } = renderDialog({ empresaTipo: 'tienda' });
    fireEvent.change(screen.getByLabelText(/url canónica externa/i), {
      target: { value: 'https://kitemergenciacanarias.es/producto/kit-basico' },
    });
    expect(onFormChange).toHaveBeenCalledWith(
      expect.objectContaining({ canonical_externo: 'https://kitemergenciacanarias.es/producto/kit-basico' })
    );
  });

  it('muestra una pista de formato cuando el slug no cumple SLUG_REGEX', () => {
    renderDialog({
      empresaTipo: 'tienda',
      formData: { ...baseFormData, slug: 'Kit Básico!' },
    });
    expect(screen.getByLabelText(/slug/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('no marca aria-invalid cuando el slug está vacío (se autogenera)', () => {
    renderDialog({ empresaTipo: 'tienda', formData: { ...baseFormData, slug: '' } });
    expect(screen.getByLabelText(/slug/i)).toHaveAttribute('aria-invalid', 'false');
  });
});
