import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const URL_MAPPINGS = [
  { from: "alma_arena", to: "alma-de-arena" },
  { from: "mermelada_tomate", to: "mermelada-de-tomate" },
];

async function updateRowUrl(
  table: string,
  column: string,
  row: Record<string, any>,
  oldUrl: string,
  newUrl: string,
  from: string
) {
  const { error: updateError } = await supabase
    .from(table)
    .update({ [column]: newUrl })
    .eq("id", row.id);

  if (updateError) {
    console.error(`  Error updating row ${row.id}:`, updateError);
  } else {
    console.log(`  ✓ Updated: ${oldUrl.split('/').pop()} -> ${newUrl.split('/').pop()}`);
  }
}

async function updateUrlsInTable(table: string, column: string) {
  console.log(`\n📝 Updating ${table}.${column}...`);

  for (const { from, to } of URL_MAPPINGS) {
    const oldPattern = `%${from}%`;

    const { data, error } = await supabase
      .from(table)
      .select("id, " + column)
      .ilike(column, oldPattern) as any;

    if (error) {
      console.error(`  Error fetching from ${table}:`, error);
      continue;
    }

    if (!data || data.length === 0) {
      console.log(`  No URLs found with ${from} in ${table}`);
      continue;
    }

    console.log(`  Found ${data.length} URLs with ${from}`);

    for (const row of data) {
      const oldUrl = (row as Record<string, any>)[column];
      const newUrl = oldUrl?.replace(from, to);

      if (newUrl && oldUrl !== newUrl) {
        await updateRowUrl(table, column, row, oldUrl, newUrl, from);
      }
    }
  }
}

async function main() {
  console.log("🔄 Starting URL migration in database...\n");

  await updateUrlsInTable("empresas", "logo_url");
  await updateUrlsInTable("empresas", "url_image");
  await updateUrlsInTable("productos", "foto_url");

  console.log("\n✅ Database URL migration complete!");
}

await main();
