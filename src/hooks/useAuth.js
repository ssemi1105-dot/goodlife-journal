import { useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

export function useAuth() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  async function loadProfile(userId) {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      setProfile(data);
      return data;
    } catch (error) {
      console.error('[auth] profile load failed:', error);
      setProfile(null);
      return null;
    }
  }

  useEffect(() => {
    if (!supabase) return undefined;

    let mounted = true;

    supabase.auth.getSession()
      .then(async ({ data }) => {
        if (!mounted) return;
        setSession(data.session);
        setLoading(false);
        if (data.session) loadProfile(data.session.user.id);
      })
      .catch((error) => {
        console.error('[auth] session check failed:', error);
        if (mounted) {
          setProfile(null);
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      try {
        setSession(nextSession);
        setLoading(false);
        if (nextSession) loadProfile(nextSession.user.id);
        else setProfile(null);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signUp(email, password, displayName) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name: displayName || email.split('@')[0] } },
    });
    if (error) throw error;
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function updateProfile(updates) {
    if (!session?.user?.id) throw new Error('로그인이 필요합니다.');
    // The database enforces this allowlist too; never send a profile's role or id.
    const editable = {};
    for (const key of ['display_name', 'avatar_color']) {
      if (Object.hasOwn(updates, key)) editable[key] = updates[key];
    }
    const { data, error } = await supabase
      .from('profiles')
      .update({ ...editable, updated_at: new Date().toISOString() })
      .eq('id', session.user.id)
      .select()
      .single();
    if (error) throw error;
    setProfile(data);
  }

  return {
    configured: isSupabaseConfigured,
    loading,
    session,
    userId: session?.user?.id || null,
    profile,
    isOwner: ['owner', 'admin'].includes(profile?.role),
    signIn,
    signUp,
    signOut,
    updateProfile,
    refreshProfile: () => session && loadProfile(session.user.id),
  };
}
