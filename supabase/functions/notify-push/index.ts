// @ts-nocheck — Deno Edge Function: JSR/npm specifiers and Deno globals are valid at runtime
// supabase/functions/notify-push/index.ts
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { GoogleAuth } from 'npm:google-auth-library@9';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const fcmServiceAccountJson = Deno.env.get('FCM_SERVICE_ACCOUNT')!;

interface PushPayload {
  empresa_id: string;
  event_type: 'new_order' | 'item_ready' | 'order_validated' | 'item_released';
}

function getNotificationContent(eventType: string): { title: string; body: string } {
  const content: Record<string, { title: string; body: string }> = {
    new_order: { title: 'Nuevo pedido', body: 'Hay un pedido pendiente de validación' },
    item_ready: { title: 'Ítem listo', body: 'Un ítem está listo para servir' },
    order_validated: { title: 'Pedido en cocina', body: 'Un pedido ha entrado a cocina' },
    item_released: { title: 'Ítem disponible', body: 'Un ítem retenido está listo para preparar' },
  };
  return content[eventType] ?? { title: 'Actualización', body: 'Hay novedades en el sistema' };
}

function getNotificationRoute(eventType: string): string {
  if (eventType === 'new_order') return '/waiter/pendientes';
  if (eventType === 'item_ready') return '/waiter/kitchen?groupBy=listos';
  if (eventType === 'order_validated' || eventType === 'item_released') return '/kitchen';
  return '/waiter';
}

function getTargetRole(eventType: string): 'waiter' | 'kitchen' {
  return eventType === 'new_order' || eventType === 'item_ready' ? 'waiter' : 'kitchen';
}

async function getFcmAccessToken(): Promise<string> {
  const serviceAccount = JSON.parse(fcmServiceAccountJson);
  const auth = new GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  if (!tokenResponse.token) throw new Error('Failed to get FCM access token');
  return tokenResponse.token;
}

async function sendFcmMessage(
  accessToken: string,
  projectId: string,
  token: string,
  title: string,
  body: string,
  route: string
): Promise<{ success: boolean; invalidToken: boolean }> {
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          android: {
            priority: 'HIGH',
            notification: {
              channel_id: 'kitchen_alerts',
              notification_priority: 'PRIORITY_MAX',
              default_sound: true,
              default_vibrate_timings: true,
              visibility: 'PUBLIC',
            },
          },
          data: { route },
        },
      }),
    }
  );

  if (res.ok) return { success: true, invalidToken: false };

  const errBody = await res.json().catch(() => ({}));
  const isInvalid =
    errBody?.error?.details?.some(
      (d: { errorCode: string }) =>
        d.errorCode === 'INVALID_ARGUMENT' || d.errorCode === 'NOT_FOUND'
    ) ?? false;

  return { success: false, invalidToken: isInvalid };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let payload: PushPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  if (!payload.empresa_id || !payload.event_type) {
    return new Response('Missing empresa_id or event_type', { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const targetRole = getTargetRole(payload.event_type);

  const { data: tokens, error } = await supabase
    .from('device_tokens')
    .select('id, fcm_token')
    .eq('empresa_id', payload.empresa_id)
    .eq('role', targetRole);

  if (error || !tokens?.length) {
    return new Response(JSON.stringify({ sent: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const serviceAccount = JSON.parse(fcmServiceAccountJson);
  const projectId: string = serviceAccount.project_id;
  const accessToken = await getFcmAccessToken();
  const { title, body } = getNotificationContent(payload.event_type);
  const route = getNotificationRoute(payload.event_type);

  const invalidIds: string[] = [];
  let sent = 0;

  for (const { id, fcm_token } of tokens) {
    const result = await sendFcmMessage(accessToken, projectId, fcm_token, title, body, route);
    if (result.success) {
      sent++;
    } else if (result.invalidToken) {
      invalidIds.push(id);
    }
  }

  if (invalidIds.length > 0) {
    await supabase.from('device_tokens').delete().in('id', invalidIds);
  }

  return new Response(JSON.stringify({ sent }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
