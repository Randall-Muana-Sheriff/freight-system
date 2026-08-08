// src/components/DispatchSettingsPanel.tsx — the one operational value an
// admin needs to be able to change without a mobile app rebuild: the
// dispatch phone number the driver app dials from its pre-login "Forgot
// your PIN? Contact dispatch" link (see AuthFlow.tsx on the driver side).
import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { fetchDispatchContact, updateDispatchContact } from '../utils/api';
import { useSocket } from '../context/SocketContext';

export default function DispatchSettingsPanel() {
    const { jwtToken } = useSocket();
    const [phoneNumber, setPhoneNumber] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        fetchDispatchContact(jwtToken)
            .then((result) => setPhoneNumber(result.phoneNumber || ''))
            .catch((err) => setError((err as Error).message))
            .finally(() => setLoading(false));
    }, [jwtToken]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSaved(false);
        setSaving(true);
        try {
            const result = await updateDispatchContact(phoneNumber, jwtToken);
            setPhoneNumber(result.phoneNumber || '');
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="bg-panel border border-line/10 p-4 rounded-md text-paper space-y-3 font-mono text-[11px]">
                <h3 className="flex items-center gap-1.5 text-sm font-bold tracking-tight text-paper font-sans">
                    <Settings size={14} strokeWidth={2.5} className="text-steel" />
                    Dispatch settings
                </h3>
                <p className="text-steel text-[10.5px] leading-relaxed font-sans">
                    Shown to drivers who are locked out of their PIN, on the sign-in screen, before they have a session —
                    changing it here takes effect immediately, no app update needed. Leave it blank to hide the link
                    entirely instead of showing a number that doesn&apos;t work.
                </p>

                {error && <div className="p-2 bg-rust/10 border border-rust/30 text-rust rounded">{error}</div>}

                <form onSubmit={(e) => void handleSubmit(e)} className="bg-ink/60 p-3.5 rounded border border-line/10 space-y-2.5 max-w-md">
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2.5 items-end">
                        <label className="block">
                            <span className="block text-[8px] text-steel/70 uppercase tracking-wider mb-1">Dispatch phone number</span>
                            <input
                                type="tel"
                                placeholder="078 123 4567"
                                disabled={loading}
                                value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                className="w-full min-w-0 bg-panel border border-line/15 rounded px-2 py-1.5 text-[11px] text-paper focus:outline-none focus:border-route transition-colors disabled:opacity-50"
                            />
                        </label>
                        <button
                            type="submit"
                            disabled={saving || loading}
                            className="bg-route hover:bg-route-deep disabled:opacity-50 rounded px-4 py-1.5 text-[11px] font-bold text-ink hover:text-paper uppercase whitespace-nowrap"
                        >
                            {saving ? '...' : saved ? 'Saved ✓' : 'Save'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
