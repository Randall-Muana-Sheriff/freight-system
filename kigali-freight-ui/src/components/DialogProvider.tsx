import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

// Replaces window.confirm/alert across the dashboard.
//
// The native boxes are stamped "localhost:5173 says", cannot be styled,
// and interrupt with something that plainly is not this product — which
// is a poor look on the one interaction that matters most, the moment
// before someone does something destructive. They also block the whole
// renderer thread while open.
//
// The API stays promise-shaped so call sites read almost the same as
// before: `if (!(await confirm({...}))) return;`

type DialogTone = 'default' | 'danger';

interface ConfirmOptions {
    title: string;
    /** Optional detail. Kept as a separate field so the title stays short
     *  and scannable rather than becoming a paragraph. */
    body?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: DialogTone;
}

interface AlertOptions {
    title: string;
    body?: string;
    tone?: DialogTone;
}

interface DialogContextValue {
    confirm: (options: ConfirmOptions) => Promise<boolean>;
    alert: (options: AlertOptions) => Promise<void>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function useDialog(): DialogContextValue {
    const value = useContext(DialogContext);
    if (!value) throw new Error('useDialog must be used inside <DialogProvider>');
    return value;
}

interface OpenDialog extends ConfirmOptions {
    kind: 'confirm' | 'alert';
    resolve: (result: boolean) => void;
}

export function DialogProvider({ children }: { children: ReactNode }) {
    const [dialog, setDialog] = useState<OpenDialog | null>(null);
    const confirmRef = useRef<HTMLButtonElement | null>(null);

    const confirm = useCallback(
        (options: ConfirmOptions) =>
            new Promise<boolean>((resolve) => setDialog({ ...options, kind: 'confirm', resolve })),
        []
    );

    const alert = useCallback(
        (options: AlertOptions) =>
            new Promise<void>((resolve) => {
                setDialog({ ...options, kind: 'alert', resolve: () => resolve() });
            }),
        []
    );

    const close = useCallback((result: boolean) => {
        setDialog((current) => {
            current?.resolve(result);
            return null;
        });
    }, []);

    // Focus the primary action so the keyboard works the way the native
    // box did — Enter to proceed, Escape to back out.
    useEffect(() => {
        if (!dialog) return;
        confirmRef.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [dialog, close]);

    const danger = dialog?.tone === 'danger';

    return (
        <DialogContext.Provider value={{ confirm, alert }}>
            {children}
            {dialog ? (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
                    {/* Clicking away cancels a confirm, and dismisses an
                        alert — the same thing the native box allowed. */}
                    <button
                        aria-label="Dismiss"
                        onClick={() => close(false)}
                        className="absolute inset-0 h-full w-full cursor-default bg-ink/80"
                    />
                    <div
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="dialog-title"
                        aria-describedby={dialog.body ? 'dialog-body' : undefined}
                        className="relative w-full max-w-md rounded-md border border-line/15 bg-panel p-5 shadow-2xl"
                    >
                        <h2 id="dialog-title" className="font-sans text-sm font-bold tracking-tight text-paper">
                            {dialog.title}
                        </h2>
                        {dialog.body ? (
                            <p id="dialog-body" className="mt-2 whitespace-pre-line font-mono text-[11px] leading-relaxed text-steel">
                                {dialog.body}
                            </p>
                        ) : null}

                        <div className="mt-5 flex justify-end gap-2">
                            {dialog.kind === 'confirm' ? (
                                <button
                                    type="button"
                                    onClick={() => close(false)}
                                    className="rounded border border-line/15 px-3 py-1.5 font-mono text-[10px] font-bold uppercase text-steel hover:text-paper"
                                >
                                    {dialog.cancelLabel || 'Cancel'}
                                </button>
                            ) : null}
                            <button
                                ref={confirmRef}
                                type="button"
                                onClick={() => close(true)}
                                className={`rounded px-3 py-1.5 font-mono text-[10px] font-bold uppercase ${
                                    danger ? 'bg-rust text-paper hover:bg-rust/85' : 'bg-route text-ink hover:bg-route-deep'
                                }`}
                            >
                                {dialog.confirmLabel || (dialog.kind === 'confirm' ? 'Confirm' : 'OK')}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </DialogContext.Provider>
    );
}
