export interface MenuItemVM {
  id: string;
  name: string;
  description?: string;
  price: number;
  category: string;
  image?: string;
  highlight?: boolean;
}

export interface MenuCategoryVM {
  id: string;
  label: string;
  items: MenuItemVM[];
}
