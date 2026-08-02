// src/components/ImageLightbox.tsx — in-app image viewer, rendered once at
// the app root and controlled via SocketContext's viewingImage state.
// Every "view photo/document" link in the dashboard sets that state
// instead of opening a new tab, so staying in-context (no lost tab, no
// popup blocker) works everywhere from one shared piece of state.
import { useEffect } from 'react';
import { X } from 'lucide-react';

interface ImageLightboxProps {
    url: string | null;
    onClose: () => void;
}

export default function ImageLightbox({ url, onClose }: ImageLightboxProps) {
    useEffect(() => {
        if (!url) return undefined;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [url, onClose]);

    if (!url) return null;

    return (
        <div
            className="fixed inset-0 z-[100] bg-ink/92 flex items-center justify-center p-6 sm:p-12"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
        >
            <button
                type="button"
                onClick={onClose}
                className="absolute top-5 right-5 text-paper hover:text-route bg-panel border border-line/15 rounded-md p-2 transition-colors"
                aria-label="Close"
            >
                <X size={18} strokeWidth={2.5} />
            </button>
            <img
                src={url}
                alt="Document preview"
                className="max-w-full max-h-full rounded-md border border-line/15 object-contain"
                onClick={(e) => e.stopPropagation()}
            />
        </div>
    );
}
