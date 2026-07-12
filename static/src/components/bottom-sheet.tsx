// Bottom-sheet modal — slides up from the bottom of the screen, never
// centered. Matches v4's `.modal-overlay` + `.modal` styling.

import * as React from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Where the footer buttons live. We just render the body here. */
  footer?: React.ReactNode;
}

export function BottomSheet({ open, onClose, title, children, footer }: Props) {
  // Lock body scroll while the sheet is open so the page underneath doesn't
  // scroll when the user drags inside the sheet on mobile.
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="sheet-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="sheet-title">
          <span>{title}</span>
          <button className="sheet-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div>{children}</div>
        {footer ? <div className="btn-row">{footer}</div> : null}
      </div>
    </div>
  );
}