'use client';

import { useEffect, useState } from 'react';
import { clearStoredAuth, getStoredUser, type AuthUser } from '@/lib/api';

export default function MePage() {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  function handleLogout() {
    clearStoredAuth();
    window.location.reload();
  }

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-3xl font-semibold">我的</h1>
      </header>

      {user ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border p-6 space-y-1">
            <p className="text-lg font-medium">{user.name}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full rounded-full border border-border py-3 text-sm hover:bg-muted"
          >
            登出
          </button>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <p>请先登录</p>
        </div>
      )}
    </div>
  );
}
