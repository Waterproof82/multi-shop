'use client';

export function TpvBackButton() {
  return (
    <button
      type="button"
      onClick={() => window.history.back()}
      className="text-sm text-[#64748b] hover:text-[#0f172a] text-center transition-colors"
    >
      ← Volver
    </button>
  );
}
