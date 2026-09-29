import { describe, it, expect, vi, beforeEach } from 'vitest';

// Con la landing desactivada desde superadmin, "/admin/landing" no debe poder
// abrirse escribiendo la URL: el link ya está oculto en el sidebar
// (admin-sidebar-landing-link.test.tsx), esto cierra el acceso directo.

const redirect = vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`); });
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }));

let cookieValues: Record<string, string> = {};
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name in cookieValues ? { value: cookieValues[name] } : undefined) }),
}));

const verifyToken = vi.fn();
const getById = vi.fn();
vi.mock('@/core/infrastructure/database', () => ({
  getAuthAdminUseCase: () => ({ verifyToken }),
  getEmpresaUseCase: () => ({ getById }),
}));

const { default: LandingAdminLayout } = await import('@/app/admin/(protected)/landing/layout');

const CHILDREN = 'contenido-landing';

async function render() {
  return LandingAdminLayout({ children: CHILDREN });
}

describe('LandingAdminLayout — guard de landing desactivada', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieValues = { admin_token: 'tok' };
  });

  it('admin con landing activa: renderiza la pantalla', async () => {
    verifyToken.mockResolvedValue({ rol: 'admin', empresa: { landingHabilitada: true } });
    await expect(render()).resolves.toBe(CHILDREN);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('admin con landing desactivada: redirige a /admin', async () => {
    verifyToken.mockResolvedValue({ rol: 'admin', empresa: { landingHabilitada: false } });
    await expect(render()).rejects.toThrow('REDIRECT:/admin');
  });

  it('superadmin viendo empresa con landing desactivada: redirige a /admin', async () => {
    cookieValues = { admin_token: 'tok', superadmin_empresa_id: 'emp-1' };
    verifyToken.mockResolvedValue({ rol: 'superadmin', empresa: null });
    getById.mockResolvedValue({ success: true, data: { landingHabilitada: false } });
    await expect(render()).rejects.toThrow('REDIRECT:/admin');
    expect(getById).toHaveBeenCalledWith('emp-1');
  });

  it('superadmin viendo empresa con landing activa: renderiza la pantalla', async () => {
    cookieValues = { admin_token: 'tok', superadmin_empresa_id: 'emp-1' };
    verifyToken.mockResolvedValue({ rol: 'superadmin', empresa: null });
    getById.mockResolvedValue({ success: true, data: { landingHabilitada: true } });
    await expect(render()).resolves.toBe(CHILDREN);
  });

  it('si no puede leer la empresa, no bloquea (mismo default que el sidebar)', async () => {
    cookieValues = { admin_token: 'tok', superadmin_empresa_id: 'emp-1' };
    verifyToken.mockResolvedValue({ rol: 'superadmin', empresa: null });
    getById.mockResolvedValue({ success: false, error: { message: 'x' } });
    await expect(render()).resolves.toBe(CHILDREN);
  });
});
