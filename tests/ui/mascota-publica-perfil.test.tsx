/**
 * PerfilMascota — contenido del perfil público (sdd pet-id-qr-profile,
 * Fase 9, R-QR.6.1/R-QR.6.2/R-QR.6.3): nombre, especie, foto si existe,
 * notas de salud y el aviso de microchip/ZOOCAN. NUNCA email ni token de
 * gestión del dueño — el tipo `PerfilPublico` ya los excluye por diseño
 * (DD1), así que basta con no pasarlos nunca como prop.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PerfilMascota } from '@/components/mascota-publica/perfil';
import type { PerfilPublico } from '@/core/domain/entities/pet-chapa-types';

function perfil(overrides: Partial<PerfilPublico> = {}): PerfilPublico {
  return { nombre: 'Luna', especie: 'perro', notas: null, fotoUrl: null, telefono: null, ...overrides };
}

describe('PerfilMascota', () => {
  it('pinta el nombre, la especie y el aviso de microchip/ZOOCAN', () => {
    render(<PerfilMascota perfil={perfil()} idioma="es" />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Luna');
    expect(screen.getByText('Perro')).toBeInTheDocument();
    expect(screen.getByText(/microchip/i)).toBeInTheDocument();
    expect(screen.getByText(/ZOOCAN/)).toBeInTheDocument();
  });

  it('con notas de salud, las muestra; sin ellas, no pinta nada en su lugar', () => {
    const { rerender } = render(<PerfilMascota perfil={perfil({ notas: 'Alérgica a la penicilina' })} idioma="es" />);
    expect(screen.getByText('Alérgica a la penicilina')).toBeInTheDocument();

    rerender(<PerfilMascota perfil={perfil({ notas: null })} idioma="es" />);
    expect(screen.queryByText('Alérgica a la penicilina')).not.toBeInTheDocument();
  });

  it('con fotoUrl, pinta una imagen con el nombre como alt', () => {
    render(<PerfilMascota perfil={perfil({ fotoUrl: 'https://cdn.example.com/mascotas/abc.webp' })} idioma="es" />);

    expect(screen.getByRole('img', { name: 'Luna' })).toBeInTheDocument();
  });

  it('declara que el QR no funciona sin cobertura de datos (R-QR.6.3)', () => {
    render(<PerfilMascota perfil={perfil()} idioma="es" />);

    expect(screen.getByText(/cobertura de datos/i)).toBeInTheDocument();
  });

  it('nunca pinta un email ni un token: el HTML no contiene ninguna de esas palabras', () => {
    const { container } = render(<PerfilMascota perfil={perfil()} idioma="es" />);
    const texto = (container.textContent ?? '').toLowerCase();

    expect(texto).not.toContain('@');
    expect(texto).not.toContain('token');
  });

  it('idioma inglés → especie y avisos en inglés', () => {
    render(<PerfilMascota perfil={perfil({ especie: 'gato' })} idioma="en" />);

    expect(screen.getByText('Cat')).toBeInTheDocument();
    expect(screen.getByText(/microchip/i)).toBeInTheDocument();
  });
});
