'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 rounded border border-rose-900/60 bg-rose-950/20 text-xs font-sans space-y-3 my-4">
          <div className="flex items-center gap-2 text-rose-400 font-semibold text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{this.props.fallbackTitle || 'Component Rendering Error'}</span>
          </div>
          <p className="text-zinc-300 leading-relaxed font-sans">
            A client-side exception occurred while rendering this view. Tab data may be incomplete or structured differently.
          </p>
          {this.state.error?.message && (
            <div className="p-2.5 rounded bg-black/80 border border-rose-900/40 text-rose-300 font-mono text-[11px] break-all">
              {this.state.error.message}
            </div>
          )}
          <div className="pt-2">
            <button
              onClick={this.handleReset}
              className="px-3 py-1.5 bg-rose-900/40 hover:bg-rose-900/60 border border-rose-800 text-rose-200 rounded text-xs font-medium flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry Rendering Tab</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
