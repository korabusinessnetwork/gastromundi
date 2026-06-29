import { useEffect, useRef } from "react";

// Detects barcode scanner input via USB keyboard (rapid keystrokes + Enter).
// Threshold: keys arriving faster than MAX_INTERVAL_MS are treated as scanner input.
const MAX_INTERVAL_MS = 50;
const MIN_CODE_LENGTH = 3;

export function useBarcodeScanner(onScan, enabled) {
  const bufferRef   = useRef([]);
  const lastKeyRef  = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e) => {
      // Ignore modifier-only keys and functional keys (F1-F12, Tab, etc.)
      if (e.key.length > 1 && e.key !== "Enter") return;
      // Ignore if focus is inside an input/textarea (manual typing) unless it's Enter
      const tag = document.activeElement?.tagName;
      if ((tag === "INPUT" || tag === "TEXTAREA") && e.key !== "Enter") return;

      const now = Date.now();
      const interval = now - lastKeyRef.current;
      lastKeyRef.current = now;

      if (e.key === "Enter") {
        const code = bufferRef.current.join("").trim();
        bufferRef.current = [];
        if (code.length >= MIN_CODE_LENGTH) {
          onScan(code);
        }
        return;
      }

      // If gap since last key is too large, reset buffer (new scan sequence)
      if (interval > MAX_INTERVAL_MS && bufferRef.current.length > 0) {
        bufferRef.current = [];
      }

      bufferRef.current.push(e.key);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onScan, enabled]);
}
