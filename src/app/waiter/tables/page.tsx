import type { Metadata } from "next";
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyWaiterToken } from '@/lib/waiter-auth';
import { mesaSesionUseCase } from '@/core/infrastructure/database';
import { WaiterTablesGrid } from '@/components/waiter-tables-grid';
import type { MesaWithSession } from '@/core/domain/repositories/IMesaRepository';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

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
    <div className="min-h-screen p-6" style={{ background: "oklch(13% 0.02 252)" }}>
      <p className="text-xs font-semibold tracking-[0.18em] uppercase mb-6" style={{ color: "oklch(42% 0.06 252)" }}>
        Mesas
      </p>
      <WaiterTablesGrid mesas={mesas} />
    </div>
  );
}
