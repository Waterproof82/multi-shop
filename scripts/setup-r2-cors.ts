// Script para configurar CORS en el bucket de R2
// Ejecutar con: npx tsx scripts/setup-r2-cors.ts

import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID || "",
    secretAccessKey: R2_SECRET_ACCESS_KEY || "",
  },
  forcePathStyle: true,
});

const corsConfiguration = {
  CORSRules: [
    {
      AllowedOrigins: ["http://localhost:3000", "http://localhost:3001"],
      AllowedMethods: ["PUT", "POST", "GET"],
      AllowedHeaders: ["*"],
      ExposeHeaders: ["*"],
      MaxAgeSeconds: 3000,
    },
  ],
};

async function setupCORS() {
  if (!R2_BUCKET_NAME) {
    console.error("Error: R2_BUCKET_NAME no está definido");
    process.exit(1);
  }

  try {
    console.log(`Configurando CORS para bucket: ${R2_BUCKET_NAME}`);
    
    const command = new PutBucketCorsCommand({
      Bucket: R2_BUCKET_NAME,
      CORSConfiguration: corsConfiguration,
    });

    await s3Client.send(command);
    console.log("✓ CORS configurado correctamente");
    console.log("Origins permitidos:", corsConfiguration.CORSRules[0].AllowedOrigins);
  } catch (error) {
    console.error("Error configurando CORS:", error);
    process.exit(1);
  }
}

await setupCORS();
