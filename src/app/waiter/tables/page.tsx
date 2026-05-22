import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyWaiterToken } from '@/lib/waiter-auth';
import { mesaSesionUseCase } from '@/core/infrastructure/database';
import { WaiterTablesGrid } from '@/components/waiter-tables-grid';
import type { MesaWithSession } from '@/core/domain/repositories/IMesaRepository';

export const dynamic = 'force-dynamic';

export default async function WaiterTablesPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('waiter_token')?.value;

  if (!token) {
    redirect('/waiter');
  }

  const payload = await verifyWaiterToken(token);
  if (!payload) {
    redirect('/waiter');
  }

  const result = await mesaSesionUseCase.getMesasWithSessions(payload.empresaId);
  const mesas: MesaWithSession[] = result.success ? (result.data ?? []) : [];

  return (
    <div className="min-h-screen bg-background p-4">
      <WaiterTablesGrid mesas={mesas} />
    </div>
  );
}
