import { WaiterLoginForm } from '@/components/waiter-login-form';

export const dynamic = 'force-dynamic';

export default function WaiterLoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <WaiterLoginForm />
    </div>
  );
}
