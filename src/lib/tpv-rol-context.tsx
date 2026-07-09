'use client';

// Re-export from canonical file so that compiled bundles importing either path
// use the same context singleton and event listener.
export { TpvRolProvider, useTpvRol, useTpvIsEmployeeSession } from './tpv-rol-ctx';
