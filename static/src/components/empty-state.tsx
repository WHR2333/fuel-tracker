// Empty-state block used when a list has zero items.
// When no icon is passed, renders only text (no placeholder icon).

import * as React from "react";

interface Props {
  icon?: React.ReactNode;
  text: string;
  children?: React.ReactNode;
}

export function EmptyState({ icon, text, children }: Props) {
  return (
    <div className="empty">
      {icon ? <div className="empty-icon">{icon}</div> : null}
      <div className="empty-text">{text}</div>
      {children}
    </div>
  );
}