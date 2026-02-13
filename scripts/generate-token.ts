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
    .setExpirationTime('1m') // Token expires in 15 minutes
    .sign(secret);

  const decoded = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString());
  const expDate = new Date(decoded.exp * 1000).toLocaleString();

  console.log('\n✅ Token generated successfully!');
  console.log(`Generated at: ${new Date().toLocaleString()}`);
  console.log(`Expires at:   ${expDate}`);
  console.log('--------------------------------------------------');
  console.log(`http://localhost:3000/?access=${jwt}`);
  console.log('--------------------------------------------------');
  console.log('This link will authorize cart access for 15 minutes (via cookie).');
}

generateToken().catch(console.error);
