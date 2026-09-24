'use client';

import { useEffect, useState } from 'react';
import {
  clearStoredAuth,
  emailLogin,
  getStoredUser,
  setStoredAuth,
  type AuthUser,
} from '@/lib/api';

type Mode = 'idle' | 'form';

export function AuthBar() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [mode, setMode] = useState<Mode>('idle');
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setUser(getStoredUser());
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await emailLogin({
        email: email.trim(),
        name: name.trim() || undefined,
      });
      setStoredAuth(res.token, res.user);
      setUser(res.user);
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
      setIsLoading(false);
    }
  }

  function handleLogout() {
    clearStoredAuth();
    setUser(null);
    setMode('idle');
    window.location.reload();
  }

  if (!mounted) {
    return <div className="h-8" />;
  }

  return (
    <div className="flex items-center justify-end gap-2 min-h-8 text-xs">
      {user ? (
        <>
          <span className="text-muted-foreground">{user.name}</span>
          <button
            type="button"
            onClick={handleLogout}
            className="text-muted-foreground hover:text-foreground underline"
          >
            登出
          </button>
        </>
      ) : mode === 'form' ? (
        <form
          onSubmit={handleLogin}
          className="flex items-center gap-2 flex-wrap"
          aria-label="邮箱登录"
        >
          <input
            type="email"
            placeholder="邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="rounded border border-border px-2 py-1 text-xs w-40"
            autoFocus
          />
          <input
            type="text"
            placeholder="昵称（可选）"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded border border-border px-2 py-1 text-xs w-24"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-full bg-primary text-primary-foreground px-3 py-1 text-xs hover:opacity-90 disabled:opacity-50"
          >
            {isLoading ? '登录中...' : '确认'}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => {
              setMode('idle');
              setError(null);
            }}
            className="text-muted-foreground hover:text-foreground underline disabled:opacity-50"
          >
            取消
          </button>
          {error && <span className="text-red-500">{error}</span>}
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setMode('form')}
          className="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted"
        >
          邮箱登录
        </button>
      )}
    </div>
  );
}
