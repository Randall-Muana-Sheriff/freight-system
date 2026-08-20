import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { reportToSentry } from '../utils/sentry';
import { API_BASE } from '../utils/api';

interface ErrorBoundaryProps {
    children: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

// Previously there was no error boundary anywhere in this app — a single
// uncaught render exception (a malformed socket payload, an unexpected
// map-data shape, anything) white-screened the ENTIRE dispatcher
// dashboard with no recovery path except a full reload, potentially
// mid-dispatch during live fleet operations. This catches that at the
// top of the tree and offers an actual way back instead of a blank page.
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('Dashboard crashed:', error, info?.componentStack);
        // Both destinations, deliberately. The POST below reaches a person
        // on Telegram within seconds but carries one line and no stack;
        // Sentry keeps the trace, the release, and how many times this has
        // happened to how many people.
        reportToSentry(error, info?.componentStack ?? undefined);
        // Fire-and-forget: without this a white-screened dispatcher is
        // visible only to the person looking at it. Any failure here is
        // swallowed on purpose — a broken error reporter must never throw
        // a second exception on top of the first.
        fetch(`${API_BASE}/client-errors`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: error.message,
                componentStack: info?.componentStack,
                source: 'dashboard',
            }),
        }).catch(() => {});
    }

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (!this.state.hasError) return this.props.children;

        return (
            <div className="h-screen w-screen flex items-center justify-center bg-ink text-paper p-6">
                <div className="max-w-md w-full bg-panel border border-line/10 rounded-md p-6 space-y-4 text-center">
                    <div className="flex justify-center">
                        <div className="w-12 h-12 rounded-full bg-rust/10 border border-rust/30 flex items-center justify-center">
                            <AlertTriangle size={22} strokeWidth={2.5} className="text-rust" />
                        </div>
                    </div>
                    <div>
                        <h1 className="text-body font-bold tracking-tight text-paper">Something went wrong</h1>
                        <p className="text-data text-steel mt-1.5">
                            The dashboard hit an unexpected error and couldn't continue. Your session and any
                            pending dispatch actions are unaffected — reloading will bring the dashboard back.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={this.handleReload}
                        className="w-full bg-route hover:bg-route-deep text-ink hover:text-paper font-mono font-bold py-2 rounded text-data uppercase tracking-wide transition-all"
                    >
                        Reload dashboard
                    </button>
                    {this.state.error?.message && (
                        <div className="text-micro font-mono text-steel/70 border-t border-line/10 pt-3 break-words">
                            {this.state.error.message}
                        </div>
                    )}
                </div>
            </div>
        );
    }
}
