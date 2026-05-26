import type { Metadata } from "next";
import { TrackingPageClient } from "@/components/tracking-page-client";
import { pedidoRepository } from "@/core/infrastructure/database";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

interface Props {
  params: Promise<{ token: string }>;
}

export default async function TrackingPage({ params }: Props) {
  const { token } = await params;

  let initialStatus = null;

  // UUID format check before DB query
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
  if (isUUID) {
    const result = await pedidoRepository.findByTrackingToken(token);
    if (result.success && result.data) {
      initialStatus = result.data;
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto max-w-lg px-4 pt-6 pb-12">
        <TrackingPageClient token={token} initialStatus={initialStatus} />
      </div>
    </main>
  );
}
