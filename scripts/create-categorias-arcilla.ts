import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const EMPRESA_ID = "f919fa96-06e8-41d3-b236-c02421775219";

const categorias = [
  // COLECCIÓN RAÍZ
  {
    empresa_id: EMPRESA_ID,
    nombre_es: "Colección Raíz",
    nombre_en: "Root Collection",
    nombre_fr: "Collection Racine",
    nombre_it: "Collezione Radice",
    nombre_de: "Wurzel-Kollektion",
    orden: 1,
    categoria_padre_id: null,
  },
  // COLECCIÓN RENACER
  {
    empresa_id: EMPRESA_ID,
    nombre_es: "Colección Renacer",
    nombre_en: "Rebirth Collection",
    nombre_fr: "Collection Renaissance",
    nombre_it: "Collezione Rinascita",
    nombre_de: "Wiedergeburt-Kollektion",
    orden: 2,
    categoria_padre_id: null,
  },
  // EDICIONES ESPECIALES
  {
    empresa_id: EMPRESA_ID,
    nombre_es: "Ediciones Especiales",
    nombre_en: "Special Editions",
    nombre_fr: "Éditions Spéciales",
    nombre_it: "Edizioni Speciali",
    nombre_de: "Sonderausgaben",
    orden: 3,
    categoria_padre_id: null,
  },
  // REGALOS CON SIGNIFICADO
  {
    empresa_id: EMPRESA_ID,
    nombre_es: "Regalos con Significado",
    nombre_en: "Meaningful Gifts",
    nombre_fr: "Cadeaux Significatifs",
    nombre_it: "Regali con Significato",
    nombre_de: "Bedeutsame Geschenke",
    orden: 4,
    categoria_padre_id: null,
  },
];

async function createCategorias() {
  console.log("Creating main categories...");
  
  const { data: mainCats, error } = await supabase
    .from("categorias")
    .insert(categorias)
    .select();
    
  if (error) {
    console.error("Error creating main categories:", error);
    process.exit(1);
  }
  
  console.log(`Created ${mainCats?.length} main categories`);
  
  // Get IDs of main categories
  const raizId = mainCats?.find(c => c.nombre_es === "Colección Raíz")?.id;
  const renacerId = mainCats?.find(c => c.nombre_es === "Colección Renacer")?.id;
  const especialesId = mainCats?.find(c => c.nombre_es === "Ediciones Especiales")?.id;
  const regalosId = mainCats?.find(c => c.nombre_es === "Regalos con Significado")?.id;
  
  console.log("Main category IDs:", { raizId, renacerId, especialesId, regalosId });
  
  // Create subcategories
  const subcategorias = [
    // Subcategorías Raíz
    { empresa_id: EMPRESA_ID, nombre_es: "Collares Raíz", nombre_en: "Root Necklaces", nombre_fr: "Colliers Racine", nombre_it: "Collane Radice", nombre_de: "Wurzel-Halsketten", orden: 1, categoria_padre_id: raizId },
    { empresa_id: EMPRESA_ID, nombre_es: "Pulseras Raíz", nombre_en: "Root Bracelets", nombre_fr: "Bracelets Racine", nombre_it: "Bracciali Radice", nombre_de: "Wurzel-Armbänder", orden: 2, categoria_padre_id: raizId },
    { empresa_id: EMPRESA_ID, nombre_es: "Anillos Raíz", nombre_en: "Root Rings", nombre_fr: "Bagues Racine", nombre_it: "Anelli Radice", nombre_de: "Wurzel-Ringe", orden: 3, categoria_padre_id: raizId },
    { empresa_id: EMPRESA_ID, nombre_es: "Pendientes Raíz", nombre_en: "Root Earrings", nombre_fr: "Boucles Racine", nombre_it: "Orecchini Radice", nombre_de: "Wurzel-Ohrringe", orden: 4, categoria_padre_id: raizId },
    
    // Subcategorías Renacer
    { empresa_id: EMPRESA_ID, nombre_es: "Collares Renacer", nombre_en: "Rebirth Necklaces", nombre_fr: "Colliers Renaissance", nombre_it: "Collane Rinascita", nombre_de: "Wiedergeburt-Halsketten", orden: 1, categoria_padre_id: renacerId },
    { empresa_id: EMPRESA_ID, nombre_es: "Pulseras Renacer", nombre_en: "Rebirth Bracelets", nombre_fr: "Bracelets Renaissance", nombre_it: "Bracciali Rinascita", nombre_de: "Wiedergeburt-Armbänder", orden: 2, categoria_padre_id: renacerId },
    { empresa_id: EMPRESA_ID, nombre_es: "Anillos Renacer", nombre_en: "Rebirth Rings", nombre_fr: "Bagues Renaissance", nombre_it: "Anelli Rinascita", nombre_de: "Wiedergeburt-Ringe", orden: 3, categoria_padre_id: renacerId },
    { empresa_id: EMPRESA_ID, nombre_es: "Pendientes Renacer", nombre_en: "Rebirth Earrings", nombre_fr: "Boucles Renaissance", nombre_it: "Orecchini Rinascita", nombre_de: "Wiedergeburt-Ohrringe", orden: 4, categoria_padre_id: renacerId },
    
    // Ediciones Especiales - no tiene subcategorías específicas, productos van directo
    // Regalos con Significado - no tiene subcategorías específicas
  ];
  
  console.log("Creating subcategories...");
  
  const { data: subCats, error: subError } = await supabase
    .from("categorias")
    .insert(subcategorias)
    .select();
    
  if (subError) {
    console.error("Error creating subcategories:", subError);
    process.exit(1);
  }
  
  console.log(`Created ${subCats?.length} subcategories`);
  
  // Return all category IDs for use in product insertion
  const allCats = [...(mainCats || []), ...(subCats || [])];
  
  return {
    main: { raizId, renacerId, especialesId, regalosId },
    sub: subCats || []
  };
}

createCategorias().then(result => {
  console.log("\n✅ Categories created successfully!");
  console.log(JSON.stringify(result, null, 2));
});
