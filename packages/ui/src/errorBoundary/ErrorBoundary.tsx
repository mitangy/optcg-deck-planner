import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** The fallback clears itself when this value changes, e.g. the current pathname. */
  resetKey?: string;
};

export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught render error", error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="app-main">
        <div className="empty-state" role="alert">
          <h2>Something went wrong</h2>
          <p>Reload the page to keep going. Your saved decks and collection are safe.</p>
          <button type="button" className="btn primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </main>
    );
  }
}
