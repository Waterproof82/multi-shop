'use client';

import { useState } from 'react';
import Link from 'next/link';

interface Props {
  readonly canAccess: boolean;
}

export function RltAccessLink({ canAccess }: Readonly<Props>) {
  const [open, setOpen] = useState(false);

  const inner = (
    <>
      <div>
        <p className="text-sm font-medium text-[#0f172a] group-hover:text-[#d97706]">
          Vista RLT — Representante Legal de los Trabajadores
        </p>
        <p className="text-xs text-[#64748b] mt-0.5">
          Art. 64 ET — acceso de solo lectura al registro de jornada
        </p>
      </div>
      <span className="text-[#94a3b8] group-hover:text-[#d97706] text-lg">→</span>
    </>
  );

  if (canAccess) {
    return (
      <Link
        href="/laborcontrol/rlt"
        className="flex items-center justify-between px-4 py-3 rounded-lg border border-[#e2e8f0] hover:border-[#d97706] hover:bg-[#fffbeb] transition-colors group"
      >
        {inner}
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center justify-between w-full px-4 py-3 rounded-lg border border-[#e2e8f0] hover:border-[#d97706] hover:bg-[#fffbeb] transition-colors group text-left"
      >
        {inner}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <button
            type="button"
            aria-label="Cerrar"
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="rlt-dialog-title"
            className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-[#d97706] uppercase tracking-wider">
                Acceso restringido
              </span>
              <h2 id="rlt-dialog-title" className="text-lg font-bold text-[#0f172a]">
                Vista RLT — Art. 64 ET
              </h2>
            </div>
            <p className="text-sm text-[#475569] leading-relaxed">
              Esta sección requiere sesión de <strong className="text-[#0f172a]">administrador</strong>.
              El acceso de solo lectura al registro de jornada está reservado al administrador
              de la empresa o al representante legal de los trabajadores con credenciales de administrador.
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full py-2.5 rounded-xl bg-[#f1f5f9] text-[#475569] font-medium text-sm hover:bg-[#e2e8f0] transition-colors"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
}
