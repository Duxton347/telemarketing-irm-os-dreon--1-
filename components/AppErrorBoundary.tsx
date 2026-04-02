import React from 'react';
import { publishAppError } from '../utils/appErrorBus';

interface AppErrorBoundaryProps {
  children: React.ReactNode;
  resetKey?: string;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  errorMessage?: string;
  errorStack?: string;
}

class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    errorMessage: undefined,
    errorStack: undefined
  };

  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      errorMessage: error?.message || 'Erro desconhecido'
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Erro de renderizacao capturado pela AppErrorBoundary:', error, errorInfo);
    publishAppError({
      source: 'renderizacao',
      message: error?.message || 'Erro desconhecido',
      details: errorInfo.componentStack || error?.stack
    });
    this.setState({
      errorMessage: error?.message || 'Erro desconhecido',
      errorStack: errorInfo.componentStack || undefined
    });
  }

  componentDidUpdate(prevProps: AppErrorBoundaryProps) {
    if (this.state.hasError && this.props.resetKey !== prevProps.resetKey) {
      this.setState({ hasError: false, errorMessage: undefined, errorStack: undefined });
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: undefined, errorStack: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex items-center justify-center p-6">
          <div className="max-w-xl w-full bg-white border border-rose-200 rounded-[32px] shadow-sm p-8 text-center space-y-4">
            <div className="mx-auto h-12 w-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center text-2xl font-black">
              !
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                O modulo encontrou um erro
              </h2>
              <p className="text-sm font-medium text-slate-500">
                A tela foi protegida para o restante do sistema nao ficar em branco. Voce pode tentar recarregar este modulo agora.
              </p>
              {this.state.errorMessage && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                    Detalhe tecnico
                  </p>
                  <p className="text-xs font-mono text-rose-700 break-words">
                    {this.state.errorMessage}
                  </p>
                </div>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={this.handleReset}
                className="px-5 py-3 rounded-2xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest"
              >
                Tentar novamente
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-5 py-3 rounded-2xl bg-slate-100 text-slate-700 text-xs font-black uppercase tracking-widest"
              >
                Recarregar sistema
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;
