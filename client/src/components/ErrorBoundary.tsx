import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background text-white/80 p-8 gap-4">
          <p className="text-lg font-sans font-semibold">Something went wrong.</p>
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
