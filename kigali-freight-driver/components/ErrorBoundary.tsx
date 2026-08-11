import { Component, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { theme } from '../lib/theme';
import { captureException } from '../lib/crashReporting';

// Previously there was no error boundary anywhere in this app — any
// uncaught render exception showed React Native's default red-box (dev)
// or just silently crashed/white-screened (production), with zero
// telemetry reaching anyone. This catches it, reports it (see
// captureException — a real Sentry report once EXPO_PUBLIC_SENTRY_DSN is
// set, always at least a console log otherwise), and offers a real way
// back instead of a dead app.
type Props = { children: ReactNode };
type State = { hasError: boolean; error: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: { componentStack?: string | null }) {
        captureException(error, { componentStack: info.componentStack ?? undefined });
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (!this.state.hasError) return this.props.children;

        return (
            <View style={styles.container}>
                <Text style={styles.title}>Something went wrong</Text>
                <Text style={styles.message}>
                    The app hit an unexpected error. Your last synced data is safe — tapping try again reloads
                    this screen.
                </Text>
                <TouchableOpacity style={styles.button} onPress={this.handleRetry}>
                    <Text style={styles.buttonText}>Try again</Text>
                </TouchableOpacity>
                {this.state.error?.message ? (
                    <Text style={styles.detail}>{this.state.error.message}</Text>
                ) : null}
            </View>
        );
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        gap: 12,
    },
    title: {
        color: theme.colors.text,
        fontFamily: theme.fonts.headingBlack,
        ...theme.type.title,
    },
    message: {
        color: theme.colors.muted,
        fontFamily: theme.fonts.body,
        ...theme.type.bodySm,
        textAlign: 'center',
    },
    button: {
        marginTop: 8,
        backgroundColor: theme.colors.primary,
        borderRadius: theme.radius.pill,
        paddingVertical: 12,
        paddingHorizontal: 28,
    },
    buttonText: {
        color: theme.colors.ink,
        fontFamily: theme.fonts.body,
        fontWeight: '700',
    },
    detail: {
        marginTop: 16,
        color: theme.colors.muted,
        fontFamily: theme.fonts.mono,
        ...theme.type.micro,
        textAlign: 'center',
    },
});
