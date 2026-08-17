import { useState } from 'react';
import { ShieldCheck, ArrowLeft } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { InziraWordmark } from './InziraWordmark';

// Login only — dispatcher/admin accounts are created by an existing admin
// (see AdminUserGovernance.jsx), not self-signup. Drivers self-signup from
// the mobile app instead.
export default function AuthForm() {
  const { login, authError, mfaPending, verifyMfa, cancelMfa } = useSocket();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void login({ username, password });
  };

  const handleVerifyMfa = (e: React.FormEvent) => {
    e.preventDefault();
    void verifyMfa(useRecoveryCode ? { recoveryCode } : { code });
  };

  const handleBack = () => {
    cancelMfa();
    setCode('');
    setRecoveryCode('');
    setUseRecoveryCode(false);
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-ink text-paper font-sans">
      <div className="w-[380px] bg-panel border border-line/10 rounded-md shadow-2xl overflow-hidden">
        <div className="h-[3px] bg-route" />
        <div className="p-6 space-y-4">
          <div className="flex flex-col items-center text-center pt-1 pb-1">
            <InziraWordmark />
            <p className="text-micro text-steel uppercase font-mono tracking-wider mt-2">
              {mfaPending ? 'Two-Factor Verification' : 'Dispatch Control Access'}
            </p>
          </div>

          {authError && (
            <div className="p-2 bg-rust/10 border border-rust/30 rounded text-data text-rust font-mono">
              {authError}
            </div>
          )}

          {mfaPending ? (
            <form onSubmit={handleVerifyMfa} className="space-y-3 text-data">
              {useRecoveryCode ? (
                <div>
                  <label htmlFor="auth-recovery-code" className="text-micro text-steel uppercase font-mono tracking-wide block mb-1">Recovery code</label>
                  <input
                    id="auth-recovery-code"
                    type="text" value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value)} required autoFocus
                    className="w-full p-2.5 bg-ink border border-line/15 rounded text-paper outline-none focus:border-route transition-colors font-mono tracking-wider"
                  />
                </div>
              ) : (
                <div>
                  <label htmlFor="auth-mfa-code" className="text-micro text-steel uppercase font-mono tracking-wide block mb-1">6-digit code</label>
                  <input
                    id="auth-mfa-code"
                    type="text" inputMode="numeric" maxLength={6} value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus
                    className="w-full p-2.5 bg-ink border border-line/15 rounded text-paper outline-none focus:border-route transition-colors text-center tracking-[0.4em] font-mono"
                  />
                </div>
              )}
              <button type="submit" className="w-full py-2.5 bg-route hover:bg-route-deep font-bold uppercase rounded text-ink hover:text-paper tracking-wide transition-all mt-2">
                Verify
              </button>
              <div className="flex items-center justify-between text-micro font-mono">
                <button type="button" onClick={handleBack} className="flex items-center gap-1 text-steel hover:text-paper transition-colors">
                  <ArrowLeft size={11} strokeWidth={2.5} />
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => { setUseRecoveryCode((v) => !v); setCode(''); setRecoveryCode(''); }}
                  className="text-carbon hover:text-paper transition-colors"
                >
                  {useRecoveryCode ? 'Use authenticator code instead' : 'Use a recovery code instead'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3 text-data">
              <div>
                <label htmlFor="auth-username" className="text-micro text-steel uppercase font-mono tracking-wide block mb-1">Username</label>
                <input
                  id="auth-username"
                  type="text" value={username} onChange={(e) => setUsername(e.target.value)} required
                  className="w-full p-2.5 bg-ink border border-line/15 rounded text-paper outline-none focus:border-route transition-colors"
                />
              </div>
              <div>
                <label htmlFor="auth-password" className="text-micro text-steel uppercase font-mono tracking-wide block mb-1">Password</label>
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
          )}

          <p className="flex items-center gap-1.5 justify-center pt-3 border-t border-line/10 text-micro text-steel font-mono">
            <ShieldCheck size={12} strokeWidth={2.5} />
            Accounts are provisioned by an administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
