"use client";

import { Component, ErrorInfo, ReactNode } from "react";
import { logger } from "@/core/infrastructure/logging/logger";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.logError({
      codigo: "CLIENT_ERROR_BOUNDARY",
      mensaje: `Client-side error caught: ${error.message}`,
      modulo: "api",
      severity: "error",
      metadata: {
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
      },
    });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-[200px] flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
          <div className="mb-4 text-4xl" role="img" aria-label="Advertencia">⚠️</div>
          <h3 className="mb-2 text-lg font-semibold text-destructive">
            Algo salió mal
          </h3>
          <p className="mb-4 text-sm text-muted-foreground max-w-md">
            Ha ocurrido un error inesperado. Por favor, recarga la página o contacta al soporte si el problema persiste.
          </p>
          <button
            onClick={() => globalThis.location.reload()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Recargar página
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}