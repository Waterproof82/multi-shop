import type { Metadata } from "next";
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyWaiterToken } from '@/lib/waiter-auth';
import { WaiterLoginForm } from '@/components/waiter-login-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function WaiterLoginPage() {
  const token = (await cookies()).get('waiter_token')?.value;
  if (token) {
    const payload = await verifyWaiterToken(token);
    if (payload) redirect('/waiter/mesas');
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: "oklch(13% 0.02 252)" }}
    >
      <div className="w-full max-w-xl">
        <WaiterLoginForm />
      </div>
    </div>
  );
}
