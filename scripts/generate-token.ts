import { SignJWT } from 'jose';
import dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const secretKey = process.env.ACCESS_TOKEN_SECRET;

if (!secretKey) {
  console.error('Error: ACCESS_TOKEN_SECRET is not defined in .env.local');
  process.exit(1);
}

const secret = new TextEncoder().encode(secretKey);

async function generateToken() {
  const jwt = await new SignJWT({ authorized: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m') // Token expires in 15 minutes
    .sign(secret);

  console.log('\n✅ Token generated successfully!');
  console.log('--------------------------------------------------');
  console.log(`http://localhost:3000/?access=${jwt}`);
  console.log('--------------------------------------------------');
  console.log('This link will authorize cart access for 7 days (via cookie).');
}

generateToken().catch(console.error);
