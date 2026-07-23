import React from 'react';
import { ErrorState } from './shared/ErrorState';

export class RouteErrorBoundary extends React.Component<{ children: React.ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('WMS Console route render failed', error, info);
  }

  componentDidUpdate(prevProps: { resetKey: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (this.state.error) return <ErrorState error={this.state.error} onRetry={() => window.location.reload()} />;
    return this.props.children;
  }
}
