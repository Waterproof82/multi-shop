// src/components/kit-publico/formulario-avisos-kit.tsx
// kit-expiry-m2b (sdd en kitemergenciacanarias, docs/sdd/kit-expiry-reminders/m2b/)
// R-M2b.1: formulario de alta en /kit/{serie}, detrás de la bandera
// KIT_AVISOS_ALTA_LIVE (la comprueba la página, DD10). Componente de
// CLIENTE: valida en el navegador, envía JSON a POST /api/kit-avisos/alta
// y SIEMPRE pinta el mismo mensaje neutro (R-M2b.1.5) — nunca distingue la
// respuesta real, para no revelar si la serie ya estaba registrada.
'use client';

import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { TEXTOS_CONSENTIMIENTO } from '@/lib/kit-caducidad/consentimiento';

interface Props {
  serie: string;
}

interface Datos {
  email: string;
  telefono: string;
  aceptaPrivacidad: boolean;
  avisosEmail: boolean;
  avisosWhatsapp: boolean;
}

interface Errores {
  email?: string;
  telefono?: string;
  aceptaPrivacidad?: string;
  avisosEmail?: string;
}

// R-M2b.1.5: la pantalla dice lo mismo sea cual sea el resultado, y nunca
// muestra el email ni el teléfono enviados.
const MENSAJE_NEUTRO =
  'Si los datos son correctos, te hemos enviado un email para confirmar los avisos. ' +
  'Revisa también la carpeta de spam. El enlace caduca en 48 horas.';

const CAMPO = 'flex flex-col gap-1';
const ENTRADA = 'min-h-11 w-full rounded-md border border-border bg-transparent px-3 text-base';
const ERROR = 'text-sm text-destructive';
const CASILLA = 'flex items-start gap-2 min-h-11 py-1';
const BOTON_PRIMARIO = 'min-h-11 rounded-md bg-primary px-4 font-medium text-primary-foreground';
const BOTON_SECUNDARIO = 'min-h-11 rounded-md border border-border px-4 font-medium text-foreground';

/** La casilla de privacidad lleva EL MISMO texto que `TEXTOS_CONSENTIMIENTO[0]`,
 * con "política de privacidad" convertida en enlace — sin añadir ni quitar
 * ningún carácter del texto consentido (R-M2b.1.3/R-M2b.1.4). */
function textoPrivacidadConEnlace(texto: string): ReactNode {
  const marcador = 'política de privacidad';
  const indice = texto.indexOf(marcador);
  if (indice === -1) return texto;
  return (
    <>
      {texto.slice(0, indice)}
      <a href="/privacidad" className="underline">{marcador}</a>
      {texto.slice(indice + marcador.length)}
    </>
  );
}

function validar(d: Datos): Errores {
  const errores: Errores = {};
  if (!d.email.trim()) errores.email = 'Indica tu email.';
  if (!d.aceptaPrivacidad) errores.aceptaPrivacidad = 'Debes aceptar la política de privacidad.';
  if (!d.avisosEmail) errores.avisosEmail = 'Debes aceptar recibir los avisos por email.';
  if (d.avisosWhatsapp && !d.telefono.trim()) {
    errores.telefono = 'El teléfono es obligatorio para recibir avisos por WhatsApp.';
  }
  return errores;
}

export function FormularioAvisosKit({ serie }: Readonly<Props>) {
  const [abierto, setAbierto] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [datos, setDatos] = useState<Datos>({
    email: '', telefono: '', aceptaPrivacidad: false, avisosEmail: false, avisosWhatsapp: false,
  });
  const [errores, setErrores] = useState<Errores>({});

  const idEmail = useId();
  const idTelefono = useId();
  const idErrorEmail = useId();
  const idErrorTelefono = useId();
  const idErrorPrivacidad = useId();
  const idErrorAvisosEmail = useId();

  function campo<K extends keyof Datos>(clave: K, valor: Datos[K]) {
    setDatos((d) => ({ ...d, [clave]: valor }));
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const nuevosErrores = validar(datos);
    setErrores(nuevosErrores);
    if (Object.keys(nuevosErrores).length > 0) return;

    try {
      await fetch('/api/kit-avisos/alta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serie,
          email: datos.email,
          telefono: datos.telefono || undefined,
          aceptaPrivacidad: datos.aceptaPrivacidad,
          avisosEmail: datos.avisosEmail,
          avisosWhatsapp: datos.avisosWhatsapp,
        }),
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
      <button type="button" onClick={() => setAbierto(true)} className={`mt-8 ${BOTON_SECUNDARIO}`}>
        Quiero un aviso antes de que caduque
      </button>
    );
  }

  return (
    <form onSubmit={enviar} className="mt-8 flex flex-col gap-4">
      <div className={CAMPO}>
        <label htmlFor={idEmail} className="text-sm font-medium">Email</label>
        <input
          id={idEmail}
          type="email"
          maxLength={254}
          value={datos.email}
          onChange={(e) => campo('email', e.target.value)}
          aria-invalid={Boolean(errores.email)}
          aria-describedby={errores.email ? idErrorEmail : undefined}
          className={ENTRADA}
        />
        {errores.email && <p id={idErrorEmail} className={ERROR}>{errores.email}</p>}
      </div>

      <div className={CAMPO}>
        <label htmlFor={idTelefono} className="text-sm font-medium">Teléfono (opcional)</label>
        <input
          id={idTelefono}
          type="tel"
          maxLength={20}
          value={datos.telefono}
          onChange={(e) => campo('telefono', e.target.value)}
          aria-invalid={Boolean(errores.telefono)}
          aria-describedby={errores.telefono ? idErrorTelefono : undefined}
          className={ENTRADA}
        />
        {errores.telefono && <p id={idErrorTelefono} className={ERROR}>{errores.telefono}</p>}
      </div>

      <div className={CAMPO}>
        <div className={CASILLA}>
          <input
            id="kit-avisos-privacidad"
            type="checkbox"
            checked={datos.aceptaPrivacidad}
            onChange={(e) => campo('aceptaPrivacidad', e.target.checked)}
            aria-invalid={Boolean(errores.aceptaPrivacidad)}
            aria-describedby={errores.aceptaPrivacidad ? idErrorPrivacidad : undefined}
          />
          <label htmlFor="kit-avisos-privacidad">{textoPrivacidadConEnlace(TEXTOS_CONSENTIMIENTO[0])}</label>
        </div>
        {errores.aceptaPrivacidad && <p id={idErrorPrivacidad} className={ERROR}>{errores.aceptaPrivacidad}</p>}
      </div>

      <div className={CAMPO}>
        <div className={CASILLA}>
          <input
            id="kit-avisos-email"
            type="checkbox"
            checked={datos.avisosEmail}
            onChange={(e) => campo('avisosEmail', e.target.checked)}
            aria-invalid={Boolean(errores.avisosEmail)}
            aria-describedby={errores.avisosEmail ? idErrorAvisosEmail : undefined}
          />
          <label htmlFor="kit-avisos-email">{TEXTOS_CONSENTIMIENTO[1]}</label>
        </div>
        {errores.avisosEmail && <p id={idErrorAvisosEmail} className={ERROR}>{errores.avisosEmail}</p>}
      </div>

      <div className={CASILLA}>
        <input
          id="kit-avisos-whatsapp"
          type="checkbox"
          checked={datos.avisosWhatsapp}
          onChange={(e) => campo('avisosWhatsapp', e.target.checked)}
          aria-invalid={Boolean(errores.telefono)}
          aria-describedby={errores.telefono ? idErrorTelefono : undefined}
        />
        <label htmlFor="kit-avisos-whatsapp">{TEXTOS_CONSENTIMIENTO[2]}</label>
      </div>

      <button type="submit" className={BOTON_PRIMARIO}>Quiero recibir avisos</button>
    </form>
  );
}
