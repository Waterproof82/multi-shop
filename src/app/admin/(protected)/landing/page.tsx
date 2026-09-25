"use client";

import { useState, useEffect } from "react";
import { Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageUploader } from "@/components/ui/image-uploader";
import { fetchWithCsrf } from "@/lib/csrf-client";
import { useLanguage } from "@/lib/language-context";
import { t } from "@/lib/translations";
import { TranslatableField, type TranslatableTextValue } from "@/components/admin/landing/translatable-field";
import { SECCION_CAMPOS, type CampoConfig } from "@/components/admin/landing/seccion-campos";
import { LANDING_SECCION_TIPOS, type LandingSeccionTipo } from "@/core/domain/entities/types";

interface LandingSeccionApi {
  id: string;
  empresaId: string;
  tipo: LandingSeccionTipo;
  activo: boolean;
  orden: number;
  contenido: Record<string, unknown>;
}

interface SeccionState {
  activo: boolean;
  orden: number;
  contenido: Record<string, unknown>;
}

const TIPO_LABELS: Record<LandingSeccionTipo, string> = {
  hero: "Hero",
  nosotros: "Nosotros",
  cta_carta: "Carta",
  testimonio: "Testimonio",
  galeria: "Galería",
  visitanos: "Visítanos",
};

function seccionVacia(): SeccionState {
  return { activo: false, orden: 0, contenido: {} };
}

function seccionesIniciales(): Record<LandingSeccionTipo, SeccionState> {
  const init = {} as Record<LandingSeccionTipo, SeccionState>;
  for (const tipo of LANDING_SECCION_TIPOS) init[tipo] = seccionVacia();
  return init;
}

export default function LandingAdminPage() {
  const { language } = useLanguage();
  const [secciones, setSecciones] = useState<Record<LandingSeccionTipo, SeccionState>>(seccionesIniciales);
  const [loading, setLoading] = useState(true);
  const [tipoActivo, setTipoActivo] = useState<LandingSeccionTipo>("hero");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/admin/landing-secciones")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: LandingSeccionApi[]) => {
        setSecciones((prev) => {
          const next = { ...prev };
          for (const seccion of data) {
            next[seccion.tipo] = { activo: seccion.activo, orden: seccion.orden, contenido: seccion.contenido };
          }
          return next;
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const seccionActual = secciones[tipoActivo];
  const campos = SECCION_CAMPOS[tipoActivo];

  function actualizarCampo(key: string, value: unknown) {
    setSecciones((prev) => ({
      ...prev,
      [tipoActivo]: {
        ...prev[tipoActivo],
        contenido: { ...prev[tipoActivo].contenido, [key]: value },
      },
    }));
  }

  function actualizarActivo(activo: boolean) {
    setSecciones((prev) => ({ ...prev, [tipoActivo]: { ...prev[tipoActivo], activo } }));
  }

  function actualizarOrden(orden: number) {
    setSecciones((prev) => ({ ...prev, [tipoActivo]: { ...prev[tipoActivo], orden } }));
  }

  async function handleGuardar() {
    setSaving(true);
    setError("");
    try {
      const res = await fetchWithCsrf(`/api/admin/landing-secciones/${tipoActivo}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(seccionActual),
      });
      if (!res.ok) {
        setError(t("landingSeccionGuardarError", language));
        return;
      }
      const updated = (await res.json()) as LandingSeccionApi;
      setSecciones((prev) => ({
        ...prev,
        [tipoActivo]: { activo: updated.activo, orden: updated.orden, contenido: updated.contenido },
      }));
    } catch {
      setError(t("landingSeccionGuardarError", language));
    } finally {
      setSaving(false);
    }
  }

  function renderCampo(campo: CampoConfig) {
    const valor = seccionActual.contenido[campo.key];

    if (campo.kind === "texto") {
      return (
        <TranslatableField
          key={campo.key}
          label={campo.label}
          value={valor as TranslatableTextValue | undefined}
          onChange={(next) => actualizarCampo(campo.key, next)}
          multiline={campo.multiline}
        />
      );
    }

    if (campo.kind === "imagen") {
      return (
        <div key={campo.key} className="space-y-2">
          <span className="block text-sm font-medium text-foreground">{campo.label}</span>
          <ImageUploader
            value={(valor as string | null | undefined) ?? ""}
            onChange={(url) => actualizarCampo(campo.key, url)}
            label={campo.label}
          />
        </div>
      );
    }

    if (campo.kind === "url") {
      const fieldId = `campo-${campo.key}`;
      return (
        <div key={campo.key} className="space-y-2">
          <label className="block text-sm font-medium text-foreground" htmlFor={fieldId}>
            {campo.label}
          </label>
          <Input
            id={fieldId}
            type="text"
            value={(valor as string | null | undefined) ?? ""}
            onChange={(e) => actualizarCampo(campo.key, e.target.value)}
          />
        </div>
      );
    }

    const imagenes = (valor as string[] | undefined) ?? [];
    return (
      <div key={campo.key} className="space-y-2">
        <span className="block text-sm font-medium text-foreground">{campo.label}</span>
        <div className="space-y-3">
          {imagenes.map((url, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <ImageUploader
                value={url}
                onChange={(nuevaUrl) => {
                  const next = [...imagenes];
                  next[idx] = nuevaUrl;
                  actualizarCampo("imagenes", next);
                }}
                label={`${campo.label} ${idx + 1}`}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => actualizarCampo("imagenes", imagenes.filter((_, i) => i !== idx))}
              >
                {t("remove", language)}
              </Button>
            </div>
          ))}
          {imagenes.length < 20 && (
            <Button variant="outline" size="sm" onClick={() => actualizarCampo("imagenes", [...imagenes, ""])}>
              + {t("landingSeccionAgregarImagen", language)}
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6 p-6">
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {LANDING_SECCION_TIPOS.map((tipo) => (
          <button
            key={tipo}
            type="button"
            onClick={() => {
              setTipoActivo(tipo);
              setError("");
            }}
            className={`flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
              tipoActivo === tipo ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            {TIPO_LABELS[tipo]}
            {secciones[tipo].activo && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center gap-6">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={seccionActual.activo}
            onChange={(e) => actualizarActivo(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary accent-primary"
          />
          <span className="text-sm text-foreground">{t("active", language)}</span>
        </label>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground" htmlFor="landing-seccion-orden">
            {t("orderLabel", language)}
          </label>
          <Input
            id="landing-seccion-orden"
            type="number"
            min={0}
            max={100}
            value={seccionActual.orden}
            onChange={(e) => actualizarOrden(Number.parseInt(e.target.value, 10) || 0)}
            className="w-20"
          />
        </div>
      </div>

      <div className="space-y-6">{campos.map(renderCampo)}</div>

      <Button onClick={handleGuardar} disabled={saving} className="gap-2">
        <Save className="h-4 w-4" /> {t("landingSeccionGuardar", language)}
      </Button>
    </div>
  );
}
