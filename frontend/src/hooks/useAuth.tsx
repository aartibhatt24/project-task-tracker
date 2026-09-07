import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { loginRequest, logoutRequest, meRequest } from '../services/authApi';
import { User } from '../types/auth';

interface AuthContextValue {
  user: User | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');

  useEffect(() => {
    meRequest()
      .then((u) => {
        setUser(u);
        setStatus('authenticated');
      })
      .catch(() => {
        setUser(null);
        setStatus('unauthenticated');
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const u = await loginRequest(email, password);
    setUser(u);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
