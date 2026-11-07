import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

/** Last line of defence: a render bug on one page must never blank the whole app mid-demo. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-crit-soft text-crit"><AlertTriangle size={17} /></div>
        <div>
          <div className="text-[14px] font-semibold text-ink">This view hit an unexpected problem</div>
          <p className="mt-1 text-[13px] text-ink-3">{this.state.error.message}</p>
          <button
            className="mt-3 rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-surface-2"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
