import "./lib/fetchProxy";
import React, { StrictMode, ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 font-sans">
          <div className="bg-slate-900 border border-red-500/30 p-8 rounded-xl max-w-lg w-full text-center shadow-2xl">
            <h1 className="text-2xl font-bold text-red-500 mb-4">Đã xảy ra lỗi hệ thống ⚠️</h1>
            <p className="text-slate-400 mb-6 text-sm">
              Ứng dụng gặp sự cố khi tải trang. Chi tiết lỗi bên dưới:
            </p>
            <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 text-left overflow-auto max-h-48 mb-6 font-mono text-xs text-red-400">
              {this.state.error?.toString()}
              {this.state.error?.stack && (
                <pre className="mt-2 text-[10px] text-slate-500 whitespace-pre-wrap text-wrap break-all">
                  {this.state.error.stack}
                </pre>
              )}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="bg-red-600 hover:bg-red-500 text-white font-medium py-2 px-6 rounded-lg transition-colors text-sm"
            >
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

