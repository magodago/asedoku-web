# ASE DOKU

Juego web mobile-first de deduccion logica inspirado en Cluedo + Sudoku.

## Stack

- React + TypeScript
- TailwindCSS
- Zustand

## Arquitectura

- `src/core`: motor procedural (generacion, pistas, validacion)
- `src/store`: estado global de partida, progreso y premium
- `src/content`: tematicas y pools narrativos
- `src/App.tsx`: loop jugable mobile-first

## Reglas Free vs Premium

- Free: niveles 1-3, tematicas limitadas
- Premium: casos infinitos, todas las tematicas, escalado continuo

## Ejecucion

```bash
npm install
npm run dev
```

## Supabase (login + progreso cloud)

1. Copia `.env.example` a `.env` y completa:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_SUPABASE_FUNCTIONS_BASE_URL=https://<project-ref>.supabase.co/functions/v1
VITE_SHOW_STORE_DEBUG=false
```

Optional: `VITE_SHOW_STORE_DEBUG=true` forces the purchase section visible for QA.

Entitlements `source` values used by the client:

- `stripe_one_time` / `one_time`: compra unica (tienda oculta salvo modo prueba).
- `stripe_subscription` / `subscription`: suscripcion (se muestra upgrade a compra unica).

- El frontend llama a la function `create-checkout`.
- Tras pagar, pulsa **"Ya he pagado · Comprobar compra"** para refrescar estado.

### Pago real (Stripe/Bizum)

1. Ejecuta SQL adicional:

```sql
-- Ejecuta archivo supabase/sql/payments.sql
```

2. Despliega functions:

```bash
supabase functions deploy create-checkout
supabase functions deploy stripe-webhook
```

3. Configura secrets en Supabase Functions:

```bash
supabase secrets set SUPABASE_URL=...
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
supabase secrets set STRIPE_SECRET_KEY=...
supabase secrets set STRIPE_PRICE_ONE_TIME=price_xxx
supabase secrets set STRIPE_PRICE_SUBSCRIPTION=price_xxx
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
supabase secrets set APP_SUCCESS_URL=https://tu-dominio.com
supabase secrets set APP_CANCEL_URL=https://tu-dominio.com
```

4. En Stripe:
- Habilita metodos de pago (incluido Bizum si esta disponible en tu cuenta/pais).
- Crea productos/precios.
- Configura webhook a:
  - `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
- Evento minimo: `checkout.session.completed`.
- Importante: en produccion, implementa verificacion criptografica de `stripe-signature` en el webhook.

2. Crea la tabla en Supabase SQL Editor:

```sql
create table if not exists public.player_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state_json jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.player_states enable row level security;

create policy "select own state"
on public.player_states
for select
using (auth.uid() = user_id);

create policy "insert own state"
on public.player_states
for insert
with check (auth.uid() = user_id);

create policy "update own state"
on public.player_states
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

Tabla premium por usuario:

```sql
create table if not exists public.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'free',
  source text,
  updated_at timestamptz not null default now()
);

alter table public.entitlements enable row level security;

create policy "select own entitlement"
on public.entitlements
for select
using (auth.uid() = user_id);

create policy "insert own entitlement"
on public.entitlements
for insert
with check (auth.uid() = user_id);

create policy "update own entitlement"
on public.entitlements
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
```

**Panel admin (otorgar premium por email):** ejecuta una vez el SQL de `supabase/migrations/20260503140000_admin_grant_premium.sql` en el SQL Editor de Supabase. Solo la sesión con email `dortizs76@gmail.com` puede llamar a la función desde la app.

## Loop viral implementado

- casos cortos y reinicio inmediato
- streak + XP + progresion
- boton premium integrado
- tematicas rotativas para rejugabilidad alta
