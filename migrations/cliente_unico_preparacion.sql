-- MIGRACION PROPUESTA: ejecutar primero en una copia de Supabase, NO en producción.
-- No elimina ni fusiona clientes/visitas.
alter table public.clients
  add column if not exists rnc text,
  add column if not exists address text,
  add column if not exists phone text,
  add column if not exists whatsapp text,
  add column if not exists customer_email text,
  add column if not exists buyer text,
  add column if not exists zone text;
alter table public.visits
  add column if not exists client_id uuid references public.clients(id);
create index if not exists visits_client_id_idx on public.visits(client_id);
-- Los datos existentes deben reconciliarse por nombre/RNC y asignarse manualmente
-- cuando haya ambigüedad, antes de exigir NOT NULL en visits.client_id.
-- El indice UNIQUE de clients.normalized_name ya existe.
-- Antes de crear un indice unico de RNC, auditar RNCs y normalizar formatos.
