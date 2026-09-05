import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [opts, setOpts] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((options) => {
    return new Promise(resolve => {
      resolver.current?.(false);
      resolver.current = resolve;
      setOpts(options || {});
    });
  }, []);

  const close = (value) => {
    resolver.current?.(value);
    resolver.current = null;
    setOpts(null);
  };

  useEffect(() => {
    if (!opts) return;
    const onKey = e => { if (e.key === "Escape") close(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [opts]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <div className="modal-backdrop confirm-backdrop" onClick={() => close(false)} data-testid="confirm-dialog">
          <section className="modal confirm-dialog" onClick={e => e.stopPropagation()} role="alertdialog" aria-modal="true">
            <h2>{opts.title || "Konfirmasi"}</h2>
            {opts.body && <p className="muted">{opts.body}</p>}
            <div className="modal-foot">
              <span />
              <button type="button" className="secondary" onClick={() => close(false)} data-testid="confirm-dialog-cancel">{opts.cancelLabel || "Batal"}</button>
              <button type="button" className={opts.danger ? "btn-danger" : "primary"} onClick={() => close(true)} data-testid="confirm-dialog-ok" autoFocus>
                {opts.confirmLabel || "Lanjut"}
              </button>
            </div>
          </section>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
