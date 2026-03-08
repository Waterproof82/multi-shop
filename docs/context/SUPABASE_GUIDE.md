# Conexión a Supabase - Guía Rápida

## 1. Encontrar el project ref

El `project ref` está en la URL de Supabase:
- URL: `https://ugvjrlmoerhvwsqozqfh.supabase.co`
- Project ref: `ugvjrlmoerhvwsqozqfh`

También se puede obtener con:
```bash
npx supabase projects list
```

## 2. Linkar el proyecto local

```bash
npx supabase link --project-ref ugvjrlmoerhvwsqozqfh
```

## 3. Ejecutar migraciones

### Opción A: Con migration file
1. Crear archivo en `supabase/migrations/`
2. Ejecutar:
```bash
npx supabase db push
```

### Opción B: SQL directo (si no hay migrations)
```bash
# Por ahora no hay forma directa desde CLI
# Alternativa: usar el SQL editor de Supabase Dashboard
```

## Notas

- El project ref está en `.env.local` como parte de `NEXT_PUBLIC_SUPABASE_URL`
- Las credenciales service role están en `SUPABASE_SERVICE_ROLE_KEY` del `.env.local`
