export interface MenuItem {
  id: string
  name: string
  description?: string
  price: number
  category: string
  highlight?: boolean
  image?: string
}

export interface MenuCategory {
  id: string
  label: string
  items: MenuItem[]
}

export const menuCategories: MenuCategory[] = [
  {
    id: "entrantes",
    label: "Entrantes",
    items: [
      { id: "e1", name: "Papas Fritas", price: 4.50, category: "entrantes" },
      { id: "e2", name: "Croqueta de Papa", description: "Papa, jamon y mozzarella", price: 8, category: "entrantes" },
      { id: "e3", name: "Camembert Frito", description: "Con mermelada de arandanos", price: 8, category: "entrantes" },
      { id: "e4", name: "Masa Frita con Serrano y Queso", price: 12, category: "entrantes", highlight: true },
      { id: "e5", name: "Flan de Verdura", description: "Cebolla roja, puerros, espinaca, calabacin, ajo, aceite de oliva", price: 12, category: "entrantes" },
      { id: "e6", name: "Burrata con Serrano y Tomate Azul", price: 12, category: "entrantes" },
      { id: "e7", name: "De la Casa", description: "Embutidos, queso, masa frita, aceitunas, alcachofa, perlas de mozzarella", price: 15, category: "entrantes" },
    ],
  },
  {
    id: "ensaladas",
    label: "Ensaladas",
    items: [
      { id: "s1", name: "Pollo Empanado", description: "Corazon de lechuga, rucula, pollo empanado, pimiento asado, cebolla roja, perlas mozzarella, alino de la casa", price: 10, category: "ensaladas" },
      { id: "s2", name: "Rulo de Cabra", description: "Corazon de lechuga, zucchini asado, rulo de cabra, nueces, pasas de uva, mermelada de tomate y perlas mozzarella", price: 10.50, category: "ensaladas" },
      { id: "s3", name: "Caprese", description: "Tomate, mozzarella y albahaca", price: 11, category: "ensaladas", image: "/images/caprese.jpg" },
      { id: "s4", name: "La Ventresca", description: "Corazon de lechuga, tomate Cherry, maiz frito, berenjena, ventresca de atun, aceituna, alino de la casa", price: 12.50, category: "ensaladas", highlight: true },
    ],
  },
  {
    id: "bruschette",
    label: "Bruschette",
    items: [
      { id: "b1", name: "Italia", description: "Salsa de tomate, mozzarella y albahaca (al horno)", price: 7, category: "bruschette", image: "/images/bruschetta.jpg" },
      { id: "b2", name: "Chorizo Fresco y Provola", price: 8, category: "bruschette" },
      { id: "b3", name: "Serrano", description: "Ajo, tomate y serrano", price: 8, category: "bruschette" },
      { id: "b4", name: "Marinera", description: "Mejillones, almejas, gambas, anchoas, tomate Cherry, perejil, oregano y ajo", price: 9, category: "bruschette" },
    ],
  },
  {
    id: "pastas",
    label: "Pastas",
    items: [
      { id: "p1", name: "Maccheroni", price: 10, category: "pastas" },
      { id: "p2", name: "Spaghetti", price: 10, category: "pastas", image: "/images/spaghetti.jpg" },
      { id: "p3", name: "Saccotini Pera y Queso", price: 12, category: "pastas" },
      { id: "p4", name: "Ravioli di Carne", price: 12.50, category: "pastas", image: "/images/ravioli.jpg" },
      { id: "p5", name: "Panzerotti Ricotta / Espinaca", price: 12.50, category: "pastas" },
      { id: "p6", name: "Raviolone Setas Silvestres", price: 12.50, category: "pastas" },
    ],
  },
  {
    id: "salsas",
    label: "Salsas",
    items: [
      { id: "sa1", name: "Pesto", description: "Albahaca, ajo, pinones, parmesano", price: 0, category: "salsas" },
      { id: "sa2", name: "Bolognesa", description: "Carne de vacuno y salsa de tomate", price: 0, category: "salsas" },
      { id: "sa3", name: "Carbonara", description: "Panceta, pecorino, parmesano y huevo", price: 0, category: "salsas" },
      { id: "sa4", name: "Quattro Formaggi", description: "Gorgonzola, parmesano, mozzarella y nata", price: 0, category: "salsas" },
      { id: "sa5", name: "Champiñones", description: "Champiñones y nata", price: 0, category: "salsas" },
      { id: "sa6", name: "Campesina", description: "Salsa de tomate y verduras de temporada", price: 0, category: "salsas" },
      { id: "sa7", name: "Frutti di Mare", description: "Salsa de tomate, mariscos, crustaceos, atun", price: 0, category: "salsas" },
      { id: "sa8", name: "Boscaiola", description: "Salsa de tomate, chorizo fresco, setas silvestres, aceituna, tomate Cherry y albahaca", price: 0, category: "salsas" },
      { id: "sa9", name: "Amatricana", description: "Salsa de tomate, guanciale, pimienta negra", price: 0, category: "salsas" },
      { id: "sa10", name: "Emiliana", description: "Nata, jamon cocido, guisantes", price: 0, category: "salsas" },
      { id: "sa11", name: "Puttanesca", description: "Salsa de tomate, anchoa, alcaparra, aceitunas, picante", price: 0, category: "salsas" },
      { id: "sa12", name: "Arrabbiata", description: "Salsa de tomate, tomate Cherry, ajo, picante y albahaca", price: 0, category: "salsas" },
      { id: "sa13", name: "Norma", description: "Salsa de tomate, berenjena, requeson curado", price: 0, category: "salsas" },
    ],
  },
  {
    id: "gratinados",
    label: "Gratinados",
    items: [
      { id: "g1", name: "Berenjenas a la Parmesana", description: "Berenjenas, salsa de tomate, albahaca, mozzarella, parmesano y oregano", price: 10, category: "gratinados" },
      { id: "g2", name: "Lasaña de Carne", description: "Carne de vacuno, salsa de tomate, mozzarella, parmesano y oregano", price: 12, category: "gratinados", image: "/images/lasagna.jpg" },
      { id: "g3", name: "Lasaña de Verduras", description: "Bechamel de espinacas, verduras de temporada, parmesano, mozzarella y oregano", price: 12, category: "gratinados" },
      { id: "g4", name: "Canelones de Carne", description: "Carne de vacuno, espinacas, parmesano y mozzarella", price: 12, category: "gratinados" },
    ],
  },
  {
    id: "risotto",
    label: "Risotto",
    items: [
      { id: "r1", name: "Risotto del Dia", description: "Preguntale al camarero", price: 16, category: "risotto", image: "/images/risotto.jpg" },
    ],
  },
  {
    id: "pizzas",
    label: "Pizzas",
    items: [
      { id: "pi1", name: "Focaccia", description: "Ajo y oregano", price: 5, category: "pizzas" },
      { id: "pi2", name: "Marinara", description: "Salsa de tomate, ajo, oregano y aceite", price: 9, category: "pizzas" },
      { id: "pi3", name: "Margarita", description: "Salsa de tomate, mozzarella y albahaca", price: 9.50, category: "pizzas", image: "/images/pizza-margherita.jpg" },
      { id: "pi4", name: "Fugazzeta", description: "Mozzarella, cebolla y oregano", price: 10.50, category: "pizzas" },
      { id: "pi5", name: "Picchio Pacchio", description: "Salsa de tomate, mozzarella, cebolla, tomate Cherry y albahaca", price: 10.50, category: "pizzas" },
      { id: "pi6", name: "Napolitana", description: "Salsa de tomate, mozzarella, alcaparras, anchoas y oregano", price: 11, category: "pizzas" },
      { id: "pi7", name: "Prosciutto e Funghi", description: "Salsa de tomate, mozzarella, jamon cocido y champiñones", price: 12.50, category: "pizzas", image: "/images/pizza-prosciutto-funghi.jpg" },
      { id: "pi8", name: "Salamino Piccante", description: "Salsa de tomate, mozzarella, salami picante y oregano", price: 13, category: "pizzas" },
      { id: "pi9", name: "Tonno e Cipolla", description: "Salsa de tomate, mozzarella, atun y cebolla roja", price: 13, category: "pizzas" },
      { id: "pi10", name: "Calzone", description: "Salsa de tomate, mozzarella, jamon cocido y champiñones", price: 13, category: "pizzas" },
      { id: "pi11", name: "Quattro Formaggi", description: "Mozzarella, gorgonzola, parmesano y rulo de cabra", price: 13, category: "pizzas", image: "/images/pizza-quattro-formaggi.jpg" },
      { id: "pi12", name: "Picasso", description: "Salsa de tomate, queso, cebolla roja, pimiento asado, zucchini, berenjenas, champiñones, tomate Cherry y albahaca", price: 15, category: "pizzas" },
      { id: "pi13", name: "Frutti di Mare", description: "Mozzarella, salsa de tomate, mariscos, crustaceos, ajo frito y oregano", price: 15, category: "pizzas" },
      { id: "pi14", name: "Abanico", description: "Jamon serrano, mozzarella fresca, tomate Cherry y albahaca", price: 15, category: "pizzas" },
      { id: "pi15", name: "De la Casa", description: "Queso crema, pimiento asado, mortadela, tomate Cherry, perlas de mozzarella y albahaca", price: 16, category: "pizzas" },
      { id: "pi16", name: "Boscaiola", description: "Salsa de tomate, mozzarella, chorizo fresco, champiñones, aceituna taggiasca, Cherry", price: 16, category: "pizzas" },
      { id: "pi17", name: "Parmigiana", description: "Salsa de tomate, mozzarella, berenjena, salami, Cherry", price: 16, category: "pizzas" },
      { id: "pi18", name: "Arlecchino", description: "Mozzarella, gambas, zucchini, pimiento asado, pesto y Cherry", price: 16, category: "pizzas" },
      { id: "pi19", name: "Contadina", description: "Salsa de calabaza, scamorza affumicata (queso de vaca), espinaca, berenjena y tomate Cherry, papas y albahaca", price: 16, category: "pizzas" },
      { id: "pi20", name: "Trufata", description: "Mozzarella, jamon, champiñones, trufa y huevo", price: 16, category: "pizzas" },
      { id: "pi21", name: "Burratina", description: "Salsa de tomate, mozzarella, serrano, burrata, rucula y tomate Cherry", price: 16, category: "pizzas" },
      { id: "pi22", name: "Romeo & Giulietta", description: "Mitad salsa de tomate, aceituna taggiasca y alcachofa / mitad mozzarella, chorizo fresco, trufa, rucula, serrano y parmesano", price: 18, category: "pizzas" },
    ],
  },
  {
    id: "especiales",
    label: "Especiales",
    items: [
      { id: "es1", name: "Escalope Napolitana con Batata Frita", description: "Con salsa de tomate, mozzarella, jamon cocido y oregano", price: 16, category: "especiales", highlight: true },
    ],
  },
  {
    id: "infantil",
    label: "Menu Infantil",
    items: [
      { id: "in1", name: "Spaghetti / Maccheroni", description: "Tomate o Bolognesa", price: 8, category: "infantil" },
      { id: "in2", name: "Pizza Margarita / Jamon", price: 8, category: "infantil" },
      { id: "in3", name: "Nuggets de Pollo + Papas Fritas", description: "Incluye bebida (agua o zumo)", price: 8, category: "infantil" },
    ],
  },
  {
    id: "postres",
    label: "Postres",
    items: [
      { id: "d1", name: "Tarta de Queso", description: "Mascarpone, queso crema, nata, huevo, azucar, mantequilla, galleta", price: 6, category: "postres" },
      { id: "d2", name: "Tiramisu", description: "Mascarpone, azucar, huevo pasteurizado, bizcocho y cafe", price: 5, category: "postres", image: "/images/tiramisu.jpg" },
      { id: "d3", name: "Pannacotta", description: "Leche, nata y azucar", price: 5, category: "postres" },
      { id: "d4", name: "Pizza Nutella", price: 8, category: "postres" },
    ],
  },
]

export const allItems = menuCategories.flatMap((c) => c.items)
