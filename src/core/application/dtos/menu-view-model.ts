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
  translations?: {
    en?: TranslationEntry;
    fr?: TranslationEntry;
    it?: TranslationEntry;
    de?: TranslationEntry;
  };
  complements?: ComplementVM[];
  requiresComplement?: boolean;
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
