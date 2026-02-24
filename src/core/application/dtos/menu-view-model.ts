export interface MenuItemVM {
  id: string;
  name: string;
  description?: string;
  price: number;
  category: string;
  image?: string;
  highlight?: boolean;
  translations?: {
    en?: { name: string; description?: string };
    fr?: { name: string; description?: string };
    it?: { name: string; description?: string };
    de?: { name: string; description?: string };
  };
  complements?: {
    id: string;
    name: string;
    price: number;
    description?: string;
  }[];
  requiresComplement?: boolean;
}

export interface MenuSubcategoryVM {
  id: string;
  nombre: string;
  descripcion?: string;
  translations?: {
    en?: string;
    fr?: string;
    it?: string;
    de?: string;
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
    en?: string;
    fr?: string;
    it?: string;
    de?: string;
  };
  descripcionTranslations?: {
    en?: string;
    fr?: string;
    it?: string;
    de?: string;
  };
  complementoDeId?: string;
  subcategories?: MenuSubcategoryVM[];
}
