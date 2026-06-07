import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { mesaSesionUseCase } from '@/core/infrastructure/database';
import type { DeferredItem } from '@/core/domain/repositories/IMesaSesionRepository';

const mesaIdSchema = z.string().uuid('El mesaId debe ser un UUID válido');

const deferredItemSchema = z.object({
  itemId: z.string().max(100),
  itemName: z.string().max(200),
  price: z.number().min(0),
  quantity: z.number().int().min(1),
  translations: z.record(z.object({ name: z.string().max(200) })).optional(),
  selectedComplements: z.array(z.object({
    id: z.string().max(100),
    name: z.string().max(200),
    price: z.number().min(0),
  })).optional(),
});

const putBodySchema = z.object({
  items: z.array(deferredItemSchema).max(50),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { mesaId } = await params;
  const parsed = mesaIdSchema.safeParse(mesaId);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  }

  const result = await mesaSesionUseCase.getDeferredItems(parsed.data);
  if (!result.success) {
    return NextResponse.json({ error: 'Error al obtener ítems diferidos' }, { status: 500 });
  }

  return NextResponse.json({ items: result.data });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ mesaId: string }> }
) {
  const empresaId = request.headers.get('x-empresa-id');
  if (!empresaId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { mesaId } = await params;
  const parsedId = mesaIdSchema.safeParse(mesaId);
  if (!parsedId.success) {
    return NextResponse.json({ error: parsedId.error.errors[0].message }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const parsedBody = putBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.errors[0].message }, { status: 400 });
  }

  const result = await mesaSesionUseCase.setDeferredItems(parsedId.data, parsedBody.data.items as DeferredItem[]);
  if (!result.success) {
    return NextResponse.json({ error: 'Error al guardar ítems diferidos' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
