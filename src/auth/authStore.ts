import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from '../data/supabaseClient';

interface AuthResult {
  error?: string;
  /** Sign-up succeeded but the user must confirm their email first. */
  needsConfirmation?: boolean;
}

/** Identity fields carried on the Supabase auth user's metadata. */
export interface ProfileMeta {
  full_name?: string;
  avatar_url?: string;
}

interface AuthState {
  session: Session | null;
  /** True until the initial session has been resolved. */
  loading: boolean;
  /** Subscribe to auth changes. Call once on mount; returns an unsubscribe. */
  init(): () => void;
  signIn(email: string, password: string): Promise<AuthResult>;
  /** Create an account; optional `meta` seeds the user's identity at sign-up
   *  (carried into `user_metadata`) so a local name/avatar transfers with no re-entry. */
  signUp(email: string, password: string, meta?: ProfileMeta): Promise<AuthResult>;
  signOut(): Promise<void>;
  /** Update the signed-in user's identity metadata (name / avatar). The auth
   *  listener receives the refreshed session, so `session` updates itself. */
  updateProfile(meta: ProfileMeta): Promise<AuthResult>;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  loading: true,

  init() {
    // Accounts are optional: with no hosted backend configured there is nothing
    // to initialise. Resolve loading so the app never waits on auth.
    if (!isSupabaseConfigured()) {
      set({ loading: false });
      return () => {};
    }
    const supabase = getSupabase();
    void supabase.auth.getSession().then(({ data }) => {
      set({ session: data.session, loading: false });
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, loading: false });
    });
    return () => subscription.unsubscribe();
  },

  async signIn(email, password) {
    const { error } = await getSupabase().auth.signInWithPassword({ email, password });
    return error ? { error: error.message } : {};
  },

  async signUp(email, password, meta) {
    const options = meta ? { data: meta as Record<string, unknown> } : undefined;
    const { data, error } = await getSupabase().auth.signUp({ email, password, options });
    if (error) return { error: error.message };
    // When email confirmation is on, a user is returned but no session yet.
    return { needsConfirmation: !data.session };
  },

  async signOut() {
    await getSupabase().auth.signOut();
  },

  async updateProfile(meta) {
    const { error } = await getSupabase().auth.updateUser({ data: meta as Record<string, unknown> });
    return error ? { error: error.message } : {};
  },
}));
