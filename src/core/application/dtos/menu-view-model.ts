type TranslationEntry = { name: string; description?: string };

export interface ComplementVM {
  id: string;
  name: string;
  price: number;
  description?: string;
  translations?: {
    en?: TranslationEntry;
    fr?: TranslationEntry;
    it?: TranslationEntry;
    de?: TranslationEntry;
  };
}

export interface ComplementGroupVM {
  id: string;
  name: string;
  tipo: 'radio' | 'checkbox';
  obligatorio: boolean;
  translations?: {
    en?: string;
    fr?: string;
    it?: string;
    de?: string;
  };
  opciones: ComplementVM[];
}

export type ImageFit = 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';

export interface MenuItemVM {
  id: string;
  name: string;
  description?: string;
  price: number;
  category: string;
  image?: string;
  imageFit?: ImageFit;
  highlight?: boolean;
  tipoProducto?: 'comida' | 'bebida';
  translations?: {
    en?: TranslationEntry;
    fr?: TranslationEntry;
    it?: TranslationEntry;
    de?: TranslationEntry;
  };
  complements?: ComplementVM[];
  requiresComplement?: boolean;
  complementGroups?: ComplementGroupVM[];
  alergenos?: string[];
}

export interface MenuSubcategoryVM {
  id: string;
  nombre: string | null;
  descripcion?: string;
  translations?: {
    en?: TranslationEntry;
    fr?: TranslationEntry;
    it?: TranslationEntry;
    de?: TranslationEntry;
  };
  descripcionTranslations?: {
    en?: string;
    fr?: string;
    it?: string;
    de?: string;
  };
  products: MenuItemVM[];
}

export interface MenuCategoryVM {
  id: string;
  label: string;
  descripcion?: string;
  tipoProducto?: 'comida' | 'bebida';
  items: MenuItemVM[];
  translations?: {
    en?: TranslationEntry;
    fr?: TranslationEntry;
    it?: TranslationEntry;
    de?: TranslationEntry;
  };
  descripcionTranslations?: {
    en?: string;
    fr?: string;
    it?: string;
    de?: string;
  };
  complementoDeId?: string;
  complementCategoryName?: string;
  complementCategoryTranslations?: {
    en?: string;
    fr?: string;
    it?: string;
    de?: string;
  };
  subcategories?: MenuSubcategoryVM[];
}
