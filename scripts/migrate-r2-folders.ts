import { S3Client, ListObjectsV2Command, CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
  console.error("Missing R2 environment variables");
  process.exit(1);
}

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

const MAPPINGS = [
  { from: "alma_arena", to: "alma-de-arena" },
  { from: "mermelada_tomate", to: "mermelada-de-tomate" },
];

async function migrateFolder(from: string, to: string) {
  console.log(`\n📦 Migrating: ${from} -> ${to}`);

  const listCmd = new ListObjectsV2Command({
    Bucket: R2_BUCKET_NAME,
    Prefix: `${from}/`,
  });

  const objects = await s3Client.send(listCmd);

  if (!objects.Contents || objects.Contents.length === 0) {
    console.log(`  No objects found in ${from}`);
    return;
  }

  console.log(`  Found ${objects.Contents.length} objects`);

  for (const obj of objects.Contents) {
    if (!obj.Key) continue;

    const newKey = obj.Key.replace(`${from}/`, `${to}/`);
    
    console.log(`  Copying: ${obj.Key} -> ${newKey}`);

    await s3Client.send(new CopyObjectCommand({
      Bucket: R2_BUCKET_NAME,
      CopySource: `${R2_BUCKET_NAME}/${obj.Key}`,
      Key: newKey,
    }));

    await s3Client.send(new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: obj.Key,
    }));

    console.log(`  ✓ Migrated: ${newKey}`);
  }
}

async function main() {
  console.log("🔄 Starting R2 folder migration...\n");

  for (const { from, to } of MAPPINGS) {
    await migrateFolder(from, to);
  }

  console.log("\n✅ R2 migration complete!");
}

main().catch(console.error);
