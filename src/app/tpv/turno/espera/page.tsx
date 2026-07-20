export const dynamic = 'force-dynamic';

export default function TurnoEsperaPage() {
  return (
    <div className="flex items-center justify-center w-full h-full">
      <div className="bg-white border border-[#e2e8f0] rounded-2xl p-12 flex flex-col gap-6 w-[440px] shadow-sm text-center">
        <span className="text-5xl">⏳</span>
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-bold">Turno no iniciado</h1>
          <p className="text-sm text-[#6b7280] leading-relaxed">
            El encargado todavía no ha abierto el turno de caja.
            Avísale para que pueda comenzar la sesión.
          </p>
        </div>
        <a
          href="/tpv/mostrador"
          className="text-sm text-[#2563eb] font-semibold hover:underline"
        >
          Recargar
        </a>
      </div>
    </div>
  );
}
