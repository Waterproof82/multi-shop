import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyWaiterToken } from '@/lib/waiter-auth';
import { WaiterTableDetail } from '@/components/waiter-table-detail';

export const dynamic = 'force-dynamic';

export default async function WaiterTableDetailPage({
  params,
}: {
  params: Promise<{ mesaId: string }>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get('waiter_token')?.value;

  if (!token) {
    redirect('/waiter');
  }

  const payload = await verifyWaiterToken(token);
  if (!payload) {
    redirect('/waiter');
  }

  const { mesaId } = await params;

  return (
    <div className="min-h-screen bg-background p-4">
      <WaiterTableDetail mesaId={mesaId} />
    </div>
  );
}
