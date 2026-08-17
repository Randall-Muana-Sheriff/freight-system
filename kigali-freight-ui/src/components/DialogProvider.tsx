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

interface PromptOptions extends ConfirmOptions {
    placeholder?: string;
    /** Reject with an empty box and the confirm button stays disabled —
     *  the native prompt happily returned "" and left callers to notice. */
    required?: boolean;
}

interface DialogContextValue {
    confirm: (options: ConfirmOptions) => Promise<boolean>;
    alert: (options: AlertOptions) => Promise<void>;
    /** Resolves to the typed text, or null if cancelled — same shape as
     *  window.prompt, so call sites keep their null check. */
    prompt: (options: PromptOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function useDialog(): DialogContextValue {
    const value = useContext(DialogContext);
    if (!value) throw new Error('useDialog must be used inside <DialogProvider>');
    return value;
}

interface OpenDialog extends PromptOptions {
    kind: 'confirm' | 'alert' | 'prompt';
    resolve: (result: boolean | string | null) => void;
}

export function DialogProvider({ children }: { children: ReactNode }) {
    const [dialog, setDialog] = useState<OpenDialog | null>(null);
    const [value, setValue] = useState('');
    const confirmRef = useRef<HTMLButtonElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    const confirm = useCallback(
        (options: ConfirmOptions) =>
            new Promise<boolean>((resolve) => {
                setDialog({ ...options, kind: 'confirm', resolve: (r) => resolve(r === true) });
            }),
        []
    );

    const alert = useCallback(
        (options: AlertOptions) =>
            new Promise<void>((resolve) => {
                setDialog({ ...options, kind: 'alert', resolve: () => resolve() });
            }),
        []
    );

    const prompt = useCallback(
        (options: PromptOptions) =>
            new Promise<string | null>((resolve) => {
                setValue('');
                setDialog({ ...options, kind: 'prompt', resolve: (r) => resolve(typeof r === 'string' ? r : null) });
            }),
        []
    );

    const close = useCallback((result: boolean | string | null) => {
        setDialog((current) => {
            current?.resolve(result);
            return null;
        });
    }, []);

    // Focus the primary action so the keyboard works the way the native
    // box did — Enter to proceed, Escape to back out.
    useEffect(() => {
        if (!dialog) return;
        // A prompt wants the cursor in the box; everything else wants the
        // primary action, so Enter still means "yes".
        if (dialog.kind === 'prompt') inputRef.current?.focus();
        else confirmRef.current?.focus();
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close(dialog.kind === 'prompt' ? null : false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [dialog, close]);

    const danger = dialog?.tone === 'danger';

    return (
        <DialogContext.Provider value={{ confirm, alert, prompt }}>
            {children}
            {dialog ? (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
                    {/* Clicking away cancels a confirm, and dismisses an
                        alert — the same thing the native box allowed. */}
                    <button
                        aria-label="Dismiss"
                        onClick={() => close(dialog.kind === 'prompt' ? null : false)}
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

                        {dialog.kind === 'prompt' ? (
                            <input
                                ref={inputRef}
                                value={value}
                                onChange={(e) => setValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !(dialog.required && !value.trim())) close(value);
                                }}
                                placeholder={dialog.placeholder}
                                className="mt-4 w-full rounded border border-line/20 bg-ink px-2.5 py-2 font-mono text-[11px] text-paper placeholder:text-steel/60 focus:border-route focus:outline-none"
                            />
                        ) : null}

                        <div className="mt-5 flex justify-end gap-2">
                            {dialog.kind !== 'alert' ? (
                                <button
                                    type="button"
                                    onClick={() => close(dialog.kind === 'prompt' ? null : false)}
                                    className="rounded border border-line/15 px-3 py-1.5 font-mono text-[10px] font-bold uppercase text-steel hover:text-paper"
                                >
                                    {dialog.cancelLabel || 'Cancel'}
                                </button>
                            ) : null}
                            <button
                                ref={confirmRef}
                                type="button"
                                onClick={() => close(dialog.kind === 'prompt' ? value : true)}
                                disabled={dialog.kind === 'prompt' && Boolean(dialog.required) && !value.trim()}
                                className={`rounded px-3 py-1.5 font-mono text-[10px] font-bold uppercase disabled:cursor-not-allowed disabled:opacity-40 ${
                                    danger ? 'bg-rust text-paper hover:bg-rust/85' : 'bg-route text-ink hover:bg-route-deep'
                                }`}
                            >
                                {dialog.confirmLabel || (dialog.kind === 'alert' ? 'OK' : 'Confirm')}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </DialogContext.Provider>
    );
}
