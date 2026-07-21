import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Set these in your deploy platform\'s ' +
      'environment variables (and in a local .env for dev), then redeploy/restart.',
  );
}

// Fall back to a syntactically-valid placeholder URL so createClient() never throws
// and crashes the whole app before we get a chance to show a friendly error screen.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);

export type Profile = {
  id: string;
  discord_id: string | null;
  discord_username: string | null;
  discord_avatar_url: string | null;
  callsign: string | null;
  access_level: string;
  current_assignment: string | null;
  loa_status: string;
  loa_reason: string | null;
  warnings: number;
  strikes: number;
  is_active: boolean;
};

export type ShiftType = {
  id: string;
  key: string;
  label: string;
  multiplier: number;
  required_role_id: string | null;
  active_role_id: string | null;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

export type Shift = {
  id: string;
  user_id: string;
  shift_type_id: string;
  status: 'active' | 'completed' | 'cancelled';
  week_key: string;
  started_at: string;
  ended_at: string | null;
  minutes_worked: number;
  minutes_credited: number;
};

export type LoaRequest = {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: 'pending' | 'approved' | 'denied';
  created_at: string;
};

export type DisciplineRecord = {
  id: string;
  user_id: string;
  type: 'warning' | 'strike' | 'termination' | 'note';
  reason: string;
  created_at: string;
};

export type NotificationRow = {
  id: string;
  user_id: string | null;
  title: string;
  body: string;
  type: string;
  created_at: string;
};
