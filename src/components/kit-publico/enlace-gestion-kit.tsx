// src/components/kit-publico/enlace-gestion-kit.tsx
// kit-expiry-m2b (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m2b/)
// R-M2b.4.1: «¿Ya te registraste?» en /kit/{serie}, detrás de la misma
// bandera que el alta (DD10). Pide solo el email y envía a
// POST /api/kit-avisos/enlace; mismo mensaje neutro que el alta (R-M2b.4.2).
'use client';

import { useId, useState, type FormEvent } from 'react';

interface Props {
  serie: string;
}

const MENSAJE_NEUTRO =
  'Si los datos son correctos, te hemos enviado un email para confirmar los avisos. ' +
  'Revisa también la carpeta de spam. El enlace caduca en 48 horas.';

const ENTRADA = 'min-h-11 w-full rounded-md border border-border bg-transparent px-3 text-base';
const BOTON_PRIMARIO = 'min-h-11 rounded-md bg-primary px-4 font-medium text-primary-foreground';
const BOTON_SECUNDARIO = 'min-h-11 rounded-md border border-border px-4 font-medium text-foreground';

export function EnlaceGestionKit({ serie }: Readonly<Props>) {
  const [abierto, setAbierto] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  const idEmail = useId();
  const idError = useId();

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError('Indica tu email.');
      return;
    }
    setError(undefined);

    try {
      await fetch('/api/kit-avisos/enlace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serie, email }),
      });
    } finally {
      setEnviado(true);
    }
  }

  if (enviado) {
    return <p role="status" className="mt-8 text-sm text-foreground">{MENSAJE_NEUTRO}</p>;
  }

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className={`mt-4 ${BOTON_SECUNDARIO}`}>
        ¿Ya te registraste? Escribe tu email y te enviamos el enlace para darte de baja o borrar tus datos
      </button>
    );
  }

  return (
    <form onSubmit={enviar} className="mt-4 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor={idEmail} className="text-sm font-medium">Email</label>
        <input
          id={idEmail}
          type="email"
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? idError : undefined}
          className={ENTRADA}
        />
        {error && <p id={idError} className="text-sm text-destructive">{error}</p>}
      </div>
      <button type="submit" className={BOTON_PRIMARIO}>Enviarme el enlace</button>
    </form>
  );
}
