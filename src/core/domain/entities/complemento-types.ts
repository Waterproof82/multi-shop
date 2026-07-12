export interface ComplementoOpcion {
  id: string;
  grupoId: string;
  empresaId: string;
  nombre_es: string;
  nombre_en: string | null;
  nombre_fr: string | null;
  nombre_it: string | null;
  nombre_de: string | null;
  precioAdicional: number;
  orden: number;
  activo: boolean;
  createdAt: Date;
}

export interface ComplementoGrupo {
  id: string;
  empresaId: string;
  nombre_es: string;
  nombre_en: string | null;
  nombre_fr: string | null;
  nombre_it: string | null;
  nombre_de: string | null;
  tipo: 'radio' | 'checkbox';
  obligatorio: boolean;
  orden: number;
  createdAt: Date;
  opciones: ComplementoOpcion[];
}

export interface ProductoComplementoAsignacion {
  productoId: string;
  grupoId: string;
  orden: number;
}
