import { createClient } from "@supabase/supabase-js";

// Fallback de emergencia para cliente web (anon key publica).
// Si Vite no carga .env/.env.local por encoding o entorno, la app sigue pudiendo autenticar.
const FALLBACK_SUPABASE_URL = "https://djyihshrecwexgszlpyo.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRqeWloc2hyZWN3ZXhnc3pscHlvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NDM2MjMsImV4cCI6MjA5MzIxOTYyM30.yWNBpsSmx6GGbQ5OL1S-RfuDS1UtMY5MFOeIJstkHrI";

const supabaseUrl = (
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  (import.meta.env["\uFEFFVITE_SUPABASE_URL"] as string | undefined) ??
  FALLBACK_SUPABASE_URL
)?.trim();
const supabaseAnonKey = (
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env["\uFEFFVITE_SUPABASE_ANON_KEY"] as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  FALLBACK_SUPABASE_ANON_KEY
)?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;

