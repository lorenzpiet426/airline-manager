import type { ReactNode } from 'react';

/** The basic ops-console box: small uppercase header, optional code on the right. */
export function Panel({
  title,
  code,
  children,
  className = '',
}: {
  title: string;
  code?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel__header">
        <h2 className="panel__title">{title}</h2>
        {code && <span className="panel__code">{code}</span>}
      </header>
      <div className="panel__body">{children}</div>
    </section>
  );
}
