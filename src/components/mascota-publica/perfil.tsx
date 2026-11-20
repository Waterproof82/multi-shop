// src/components/mascota-publica/perfil.tsx
// sdd pet-id-qr-profile (docs/sdd/pet-id-qr-profile/, kitemergenciacanarias)
// Fase 9, R-QR.2/R-QR.3/R-QR.6: componente de SERVIDOR (sin 'use client',
// no envía JS al cliente). Solo pinta `perfil`, ya resuelto por el
// cargador — ni toca red ni BD. El teléfono/botón "Llamar al dueño"
// (R-QR.7) y el formulario de contacto (R-QR.10) llegan con sus propios PR
// (13 y 15); `perfil.telefono` existe en el contrato pero este componente
// todavía no lo pinta.
import { PawPrint } from 'lucide-react';
import type { PerfilPublico } from '@/core/domain/entities/pet-chapa-types';
import type { Language } from '@/lib/language-context';
import { t } from '@/lib/translations';
import { ImagenSubida } from '@/components/ui/imagen-subida';

interface Props {
  perfil: PerfilPublico;
  idioma: Language;
}

function textoEspecie(especie: PerfilPublico['especie'], idioma: Language): string {
  return especie === 'perro' ? t('mascotaPerfilEspeciePerro', idioma) : t('mascotaPerfilEspecieGato', idioma);
}

export function PerfilMascota({ perfil, idioma }: Readonly<Props>) {
  return (
    <section className="mx-auto max-w-2xl px-4 py-10 text-center">
      {perfil.fotoUrl ? (
        <ImagenSubida
          src={perfil.fotoUrl}
          alt={perfil.nombre}
          width={160}
          height={160}
          className="mx-auto h-40 w-40 rounded-full object-cover"
        />
      ) : (
        <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-full bg-muted" aria-hidden="true">
          <PawPrint className="h-16 w-16 text-foreground/40" />
        </div>
      )}

      <h1 className="mt-4 text-2xl font-semibold text-foreground">{perfil.nombre}</h1>
      <p className="mt-1 text-sm text-foreground/70">{textoEspecie(perfil.especie, idioma)}</p>

      {perfil.notas && <p className="mt-6 text-foreground/80">{perfil.notas}</p>}

      {/* R-QR.6.2/R-QR.6.3: avisos fijos, con independencia del contenido de la chapa. */}
      <p className="mt-8 text-sm text-foreground/60">{t('mascotaPerfilMicrochipAviso', idioma)}</p>
      <p className="mt-2 text-xs text-foreground/50">{t('mascotaPerfilCoberturaAviso', idioma)}</p>
    </section>
  );
}
