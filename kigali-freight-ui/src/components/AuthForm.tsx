import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

// Login only — dispatcher/admin accounts are created by an existing admin
// (see AdminUserGovernance.jsx), not self-signup. Drivers self-signup from
// the mobile app instead.
export default function AuthForm() {
  const { login, authError } = useSocket();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void login({ username, password });
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-ink text-paper font-sans">
      <div className="w-[380px] bg-panel border border-line/10 rounded-md shadow-2xl overflow-hidden">
        <div className="h-[3px] bg-route" />
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-route/15 border border-route/35 flex items-center justify-center shrink-0">
              <span className="text-route font-mono font-black text-sm">KF</span>
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight text-paper leading-tight">Kigali Freight</h2>
              <p className="text-[10px] text-steel uppercase font-mono tracking-wider">Dispatch Control Access</p>
            </div>
          </div>

          {authError && (
            <div className="p-2 bg-rust/10 border border-rust/30 rounded text-[11px] text-rust font-mono">
              {authError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3 text-xs">
            <div>
              <label htmlFor="auth-username" className="text-[10px] text-steel uppercase font-mono tracking-wide block mb-1">Username</label>
              <input
                id="auth-username"
                type="text" value={username} onChange={(e) => setUsername(e.target.value)} required
                className="w-full p-2.5 bg-ink border border-line/15 rounded text-paper outline-none focus:border-route transition-colors"
              />
            </div>
            <div>
              <label htmlFor="auth-password" className="text-[10px] text-steel uppercase font-mono tracking-wide block mb-1">Password</label>
              <input
                id="auth-password"
                type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                className="w-full p-2.5 bg-ink border border-line/15 rounded text-paper outline-none focus:border-route transition-colors"
              />
            </div>
            <button type="submit" className="w-full py-2.5 bg-route hover:bg-route-deep font-bold uppercase rounded text-ink hover:text-paper tracking-wide transition-all mt-2">
              Sign in
            </button>
          </form>

          <p className="flex items-center gap-1.5 justify-center pt-3 border-t border-line/10 text-[10px] text-steel font-mono">
            <ShieldCheck size={12} strokeWidth={2.5} />
            Accounts are provisioned by an administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
