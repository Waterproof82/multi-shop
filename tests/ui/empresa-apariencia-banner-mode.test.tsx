import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LanguageProvider } from '@/lib/language-context';
import { EmpresaAparienciaForm } from '@/components/admin/empresa-apariencia-form';

const fetchWithCsrf = vi.fn();
vi.mock('@/lib/csrf-client', () => ({
  fetchWithCsrf: (...args: unknown[]) => fetchWithCsrf(...args),
}));

vi.mock('@/lib/admin-context', () => ({
  useAdmin: () => ({ overrideEmpresaId: '', empresaId: 'empresa-1' }),
}));

vi.mock('@/components/admin/banner-slider-manager', () => ({
  BannerSliderManager: ({ slides }: { slides: string[] }) => (
    <div data-testid="slider-manager">{slides.length} imágenes</div>
  ),
}));

const initialData: {
  logo_url: string | null;
  mostrar_logo: boolean;
  url_image: string | null;
  banner_fit: 'contain' | 'cover' | 'fill';
  tipo_banner: 'imagen' | 'slider';
  banner_slides: string[];
  descripcion_es: string;
  descripcion_en: string;
  descripcion_fr: string;
  descripcion_it: string;
  descripcion_de: string;
} = {
  logo_url: null,
  mostrar_logo: true,
  url_image: null,
  banner_fit: 'contain',
  tipo_banner: 'imagen',
  banner_slides: [],
  descripcion_es: '',
  descripcion_en: '',
  descripcion_fr: '',
  descripcion_it: '',
  descripcion_de: '',
};

function renderForm(data = initialData) {
  return render(
    <LanguageProvider>
      <EmpresaAparienciaForm initialData={data} />
    </LanguageProvider>
  );
}

beforeEach(() => {
  fetchWithCsrf.mockReset();
  fetchWithCsrf.mockResolvedValue({ ok: true } as Response);
});

describe('EmpresaAparienciaForm — modo de banner', () => {
  it('en modo imagen fija (default), muestra los campos actuales y no el gestor de slider', () => {
    renderForm();

    expect(screen.getByText('Imagen de fondo del banner')).toBeInTheDocument();
    expect(screen.queryByTestId('slider-manager')).not.toBeInTheDocument();
  });

  it('al elegir Slider, oculta los campos de imagen fija y muestra el gestor', async () => {
    renderForm();

    fireEvent.click(screen.getByRole('button', { name: 'Slider' }));

    expect(screen.queryByText('Imagen de fondo del banner')).not.toBeInTheDocument();
    expect(screen.getByTestId('slider-manager')).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchWithCsrf).toHaveBeenCalledWith('/api/admin/empresa?empresaId=empresa-1', {
        method: 'PUT',
        body: JSON.stringify({ tipo_banner: 'slider' }),
      });
    });
  });

  it('con tipo_banner inicial en slider, arranca mostrando el gestor', () => {
    renderForm({ ...initialData, tipo_banner: 'slider', banner_slides: ['https://cdn.example.com/a.webp'] });

    expect(screen.getByTestId('slider-manager')).toHaveTextContent('1 imágenes');
    expect(screen.queryByText('Imagen de fondo del banner')).not.toBeInTheDocument();
  });
});
