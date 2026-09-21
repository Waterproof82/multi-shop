export interface NodoOrdenable {
  id: string;
  orden: number;
}

export function reordenarPorArrastre<T extends NodoOrdenable>(
  nodos: T[],
  activeId: string,
  overId: string
): T[] {
  if (activeId === overId) return nodos;

  const ordenados = [...nodos].sort((a, b) => a.orden - b.orden);
  const fromIndex = ordenados.findIndex(n => n.id === activeId);
  const toIndex = ordenados.findIndex(n => n.id === overId);
  if (fromIndex === -1 || toIndex === -1) return nodos;

  const [moved] = ordenados.splice(fromIndex, 1);
  ordenados.splice(toIndex, 0, moved);

  return ordenados.map((n, idx) => ({ ...n, orden: idx }));
}
