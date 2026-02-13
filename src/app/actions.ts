'use server';

import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';

export async function checkCartAuthorization() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('access_token');
  const secretKey = process.env.ACCESS_TOKEN_SECRET;

  if (!accessToken || !secretKey) {
    return false;
  }

  try {
    const secret = new TextEncoder().encode(secretKey);
    await jwtVerify(accessToken.value, secret);
    return true;
  } catch (error) {
    // Token expired or invalid - clear cookie
    const response = { success: false };
    cookieStore.delete('access_token');
    return false;
  }
}
