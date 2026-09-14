'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2 } from 'lucide-react';
import { useLanguage } from '@/lib/language-context';
import { t } from '@/lib/translations';

export interface ModalidadEntregaRow {
  id: string;
  tipo: 'recogida' | 'domicilio';
  icono: string;
  nombre: string;
  precioCents: number;
  tiempoMinMinutos: number | null;
  tiempoMaxMinutos: number | null;
  activo: boolean;
  orden: number;
}

const ICONOS_DISPONIBLES = [
  { value: 'store', emoji: '🏪', labelKey: 'deliveryModalityIconStore' },
  { value: 'bike', emoji: '🚲', labelKey: 'deliveryModalityIconBike' },
  { value: 'car', emoji: '🚗', labelKey: 'deliveryModalityIconCar' },
  { value: 'package', emoji: '📦', labelKey: 'deliveryModalityIconPackage' },
  { value: 'clock', emoji: '⏱️', labelKey: 'deliveryModalityIconClock' },
] as const;

interface ModalidadesEntregaFormProps {
  tipo: 'recogida' | 'domicilio';
  modalidades: ModalidadEntregaRow[];
  onCreate: (data: {
    tipo: 'recogida' | 'domicilio';
    icono: string;
    nombre_es: string;
    precioCents: number;
    tiempoMinMinutos?: number;
    tiempoMaxMinutos?: number;
  }) => void;
  onUpdate: (id: string, data: Partial<ModalidadEntregaRow>) => void;
  onDelete: (id: string) => void;
}

export function ModalidadesEntregaForm({
  tipo,
  modalidades,
  onCreate,
  onUpdate,
  onDelete,
}: Readonly<ModalidadesEntregaFormProps>) {
  const { language } = useLanguage();
  const [icono, setIcono] = useState<string>(ICONOS_DISPONIBLES[0].value);
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState('0');
  const [tiempoMin, setTiempoMin] = useState('');
  const [tiempoMax, setTiempoMax] = useState('');

  const handleSubmit = () => {
    const precioCents = Math.round(Number(precio) * 100);
    onCreate({
      tipo,
      icono,
      nombre_es: nombre,
      precioCents,
      ...(tipo === 'domicilio'
        ? {
            tiempoMinMinutos: Number(tiempoMin) || 0,
            tiempoMaxMinutos: Number(tiempoMax) || 0,
          }
        : {}),
    });
    setNombre('');
    setPrecio('0');
    setTiempoMin('');
    setTiempoMax('');
  };

  const filteredModalidades = modalidades.filter((m) => m.tipo === tipo);

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {filteredModalidades.map((m) => (
          <li key={m.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
            <span className="text-lg">
              {ICONOS_DISPONIBLES.find((i) => i.value === m.icono)?.emoji}
            </span>
            <span className="flex-1 font-medium">{m.nombre}</span>
            <span className="text-sm text-muted-foreground">{(m.precioCents / 100).toFixed(2)}€</span>
            {tipo === 'domicilio' && m.tiempoMinMinutos !== null && (
              <span className="text-sm text-muted-foreground">
                {m.tiempoMinMinutos}-{m.tiempoMaxMinutos} {t('deliveryModalityMinutesUnit', language)}
              </span>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onUpdate(m.id, { activo: !m.activo })}
              aria-label={m.activo ? t('deliveryModalityDeactivate', language) : t('deliveryModalityActivate', language)}
            >
              {m.activo ? '✓' : '○'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onDelete(m.id)}
              aria-label={t('deliveryModalityDelete', language)}
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-2 gap-3 rounded-lg border border-dashed border-border p-3">
        <div>
          <label htmlFor={`icono-${tipo}`} className="text-xs font-medium text-muted-foreground block mb-1">
            {t('deliveryModalityIcon', language)}
          </label>
          <Select value={icono} onValueChange={setIcono}>
            <SelectTrigger id={`icono-${tipo}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ICONOS_DISPONIBLES.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.emoji} {t(i.labelKey, language)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label htmlFor={`nombre-${tipo}`} className="text-xs font-medium text-muted-foreground block mb-1">
            {t('deliveryModalityName', language)}
          </label>
          <Input
            id={`nombre-${tipo}`}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={100}
          />
        </div>
        <div>
          <label htmlFor={`precio-${tipo}`} className="text-xs font-medium text-muted-foreground block mb-1">
            {t('deliveryModalityPrice', language)}
          </label>
          <Input
            id={`precio-${tipo}`}
            type="number"
            min="0"
            step="0.10"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
          />
        </div>
        {tipo === 'domicilio' && (
          <>
            <div>
              <label
                htmlFor={`tiempo-min-${tipo}`}
                className="text-xs font-medium text-muted-foreground block mb-1"
              >
                {t('deliveryModalityMinTime', language)}
              </label>
              <Input
                id={`tiempo-min-${tipo}`}
                type="number"
                min="0"
                value={tiempoMin}
                onChange={(e) => setTiempoMin(e.target.value)}
              />
            </div>
            <div>
              <label
                htmlFor={`tiempo-max-${tipo}`}
                className="text-xs font-medium text-muted-foreground block mb-1"
              >
                {t('deliveryModalityMaxTime', language)}
              </label>
              <Input
                id={`tiempo-max-${tipo}`}
                type="number"
                min="0"
                value={tiempoMax}
                onChange={(e) => setTiempoMax(e.target.value)}
              />
            </div>
          </>
        )}
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!nombre.trim()}
          className="col-span-2"
        >
          {t('deliveryModalityAddButton', language)}
        </Button>
      </div>
    </div>
  );
}
