import React, { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;

            return (
                <div className="min-h-screen bg-catalog-bg flex items-center justify-center p-8">
                    <div className="max-w-md w-full text-center space-y-6">
                        <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto">
                            <AlertTriangle className="w-10 h-10 text-red-500" />
                        </div>
                        <div className="space-y-2">
                            <h1 className="text-2xl font-outfit font-black text-catalog-text">Something went wrong</h1>
                            <p className="text-catalog-text/60 text-sm">
                                An unexpected error occurred. This has been noted and we'll investigate.
                            </p>
                            {this.state.error && (
                                <details className="mt-4 text-left">
                                    <summary className="text-xs font-bold uppercase tracking-widest text-catalog-text/40 cursor-pointer">Error details</summary>
                                    <pre className="mt-2 p-3 bg-gray-100 rounded-xl text-xs text-gray-600 overflow-auto whitespace-pre-wrap">
                                        {this.state.error.message}
                                    </pre>
                                </details>
                            )}
                        </div>
                        <div className="flex items-center justify-center gap-3">
                            <button
                                onClick={() => this.setState({ hasError: false, error: null })}
                                className="flex items-center gap-2 px-5 py-2.5 bg-catalog-accent text-white font-bold rounded-xl hover:brightness-105 transition-all shadow-md"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Try Again
                            </button>
                            <button
                                onClick={() => window.location.href = '/'}
                                className="px-5 py-2.5 bg-gray-100 text-catalog-text font-semibold rounded-xl hover:bg-gray-200 transition-all"
                            >
                                Go Home
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
