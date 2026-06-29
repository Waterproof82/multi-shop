import type { Metadata } from "next";
import { WaiterLoginForm } from '@/components/waiter-login-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function WaiterLoginPage() {
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
