import { describe, it, expect } from 'vitest';
import { emptyStringToNull } from '@/core/infrastructure/database/SupabaseProductRepository';

describe('emptyStringToNull', () => {
  it('convierte string vacío en null', () => {
    expect(emptyStringToNull('')).toBeNull();
  });

  it('deja pasar una URL tal cual', () => {
    expect(emptyStringToNull('https://cdn.example.com/foto.webp')).toBe('https://cdn.example.com/foto.webp');
  });

  it('deja pasar undefined tal cual (campo no enviado)', () => {
    expect(emptyStringToNull(undefined)).toBeUndefined();
  });

  it('deja pasar null tal cual', () => {
    expect(emptyStringToNull(null)).toBeNull();
  });
});
