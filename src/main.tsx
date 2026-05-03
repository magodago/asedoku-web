import React, { Component, type ErrorInfo, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

function installNoZoomGuards() {
  if (typeof window === "undefined") return;

  const preventPinchTouch = (e: TouchEvent) => {
    if (!e.cancelable) return;
    if (e.touches.length > 1) e.preventDefault();
  };
  const preventGesture = (e: Event) => {
    if ((e as Event).cancelable) e.preventDefault();
  };
  const preventCtrlWheelZoom = (e: WheelEvent) => {
    if (!e.cancelable) return;
    if (e.ctrlKey) e.preventDefault();
  };

  document.addEventListener("touchstart", preventPinchTouch, { passive: false });
  document.addEventListener("touchmove", preventPinchTouch, { passive: false });
  document.addEventListener("gesturestart", preventGesture, { passive: false });
  document.addEventListener("gesturechange", preventGesture, { passive: false });
  document.addEventListener("gestureend", preventGesture, { passive: false });
  window.addEventListener("wheel", preventCtrlWheelZoom, { passive: false });
}

class RootErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state: { message: string | null } = { message: null };

  static getDerivedStateFromError(err: Error) {
    return { message: err?.message ?? String(err) };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error("ASE DOKU render error:", err, info.componentStack);
  }

  render() {
    if (this.state.message) {
      return (
        <div
          style={{
            minHeight: "100vh",
            boxSizing: "border-box",
            padding: 24,
            background: "#1c1814",
            color: "#fecaca",
            fontFamily: "system-ui, sans-serif",
            maxWidth: 560,
            margin: "0 auto"
          }}
        >
          <h1 style={{ color: "#f87171", fontSize: "1.1rem" }}>Error al cargar la app</h1>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, marginTop: 12, color: "#e7e5e4" }}>{this.state.message}</pre>
          <p style={{ fontSize: 12, marginTop: 16, color: "#a8a29e" }}>
            Abre la consola del navegador (F12) para mas detalle. Prueba recargar con Ctrl+Shift+R.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

installNoZoomGuards();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
