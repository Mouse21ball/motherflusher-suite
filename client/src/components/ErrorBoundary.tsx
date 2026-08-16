import { Component, type ReactNode } from 'react';
import * as Sentry from '@sentry/react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage?: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[CGP][ErrorBoundary] Render crash caught — preventing black screen:', {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
    // Report to Sentry if initialized (no-op when VITE_SENTRY_DSN is not set)
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background text-white/80 p-8 gap-4">
          <p className="text-lg font-sans font-semibold">Something went wrong.</p>
          {this.state.errorMessage && (
            <p className="text-xs font-mono text-white/40 max-w-sm text-center">{this.state.errorMessage}</p>
          )}
          <button
            className="px-5 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-mono transition-colors"
            onClick={() => this.setState({ hasError: false })}
            data-testid="button-recover"
          >
            Try Again
          </button>
          <button
            className="px-5 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-mono text-white/50 transition-colors"
            onClick={() => window.location.reload()}
            data-testid="button-reload"
          >
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
