import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import { supabase } from '../services/supabase';
import { getCredits } from '../services/api';
import { clearCache } from '../services/storage';
import { useToast } from './ToastContext';

// Clears the local IndexedDB used for offline application tracking.
// Called on logout and user-switch to prevent cross-user data leaks.
function clearIndexedDB() {
  try {
    indexedDB.deleteDatabase('JobSearchTracker');
  } catch {
    // Non-fatal — browser may not support IndexedDB or it may already be absent
  }
}

interface User {
  id: string;
  email?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  credits: number | null;
  nextRefillAt: string | null; // ISO date string for next credit refill
  refreshCredits: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [nextRefillAt, setNextRefillAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { addToast } = useToast();
  const previousUserId = useRef<string | null>(null);

  // Check for existing session on mount
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const newUser = session?.user ?? null;
      setUser(newUser);
      setIsLoading(false);
      if (newUser) {
        previousUserId.current = newUser.id;
      }
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const newUser = session?.user ?? null;

      // Clear cache on user switch to prevent data leaks
      if (newUser && previousUserId.current && newUser.id !== previousUserId.current) {
        console.log('[Auth] User switched from', previousUserId.current, 'to', newUser.id);
        clearCache();
        clearIndexedDB();
      }

      if (event === 'SIGNED_IN' && newUser) {
        console.log('[Auth] User signed in:', newUser.email);
        // Clear any stale cache from previous sessions
        if (!previousUserId.current) {
          clearCache();
        }
      }

      setUser(newUser);
      previousUserId.current = newUser?.id ?? null;
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const refreshCredits = async () => {
    if (user) {
      try {
        const { credits: balance, nextRefillAt: refillDate } = await getCredits();
        setCredits(balance);
        setNextRefillAt(refillDate);
      } catch (e) {
        console.error('Failed to refresh credits:', e);
        const msg = e instanceof Error ? e.message : String(e);
        const isNetworkError = msg.includes('fetch') || msg.includes('network') || msg.includes('ECONNREFUSED');
        const hint = isNetworkError
          ? 'Backend unreachable. Is it running on port 3001?'
          : 'Could not load credits. Check backend logs.';
        addToast('error', hint);
      }
    }
  };

  useEffect(() => {
    if (user) {
      refreshCredits();
    } else {
      setCredits(null);
      setNextRefillAt(null);
    }
  }, [user]);

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const register = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  };

  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    // Clear all local browser storage to prevent data leaks between users
    clearCache();       // localStorage (profile cache)
    clearIndexedDB();   // IndexedDB (application tracker)
    setUser(null);
    setCredits(null);
    setNextRefillAt(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        credits,
        nextRefillAt,
        refreshCredits,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
