import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cx(...a: (string | false | null | undefined)[]): string {
  return a.filter(Boolean).join(" ");
}

export function PageHeader({ title, lead, actions }: { title: string; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-ink sm:text-2xl">{title}</h1>
        {lead && <p className="mt-1 text-md text-ink2">{lead}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Card({
  title,
  icon,
  actions,
  children,
  className,
}: {
  title?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("rounded-xl border border-line bg-card p-4 shadow-[0_1px_0_rgba(80,60,40,0.04)] sm:p-5", className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && (
            <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
              {icon && <span className="text-acc">{icon}</span>}
              {title}
            </h2>
          )}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

type Tone = "default" | "primary" | "ghost" | "danger";

export function Button({ tone = "default", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  const t: Record<Tone, string> = {
    default: "border border-line2 bg-card text-ink hover:bg-hover",
    primary: "border border-acc bg-acc text-white hover:bg-acc-d",
    ghost: "text-ink2 hover:bg-hover hover:text-ink",
    danger: "border border-bad/40 bg-card text-bad hover:bg-bad-l",
  };
  return (
    <button
      type="button"
      {...p}
      className={cx(
        "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        t[tone],
        className,
      )}
    />
  );
}

export function Badge({ tone = "default", children }: { tone?: "default" | "acc" | "ok" | "warn" | "bad" | "info"; children: ReactNode }) {
  const t = {
    default: "bg-sunk text-ink2",
    acc: "bg-acc-l text-acc-d",
    ok: "bg-acc-l text-ok",
    warn: "bg-warn-l text-warn",
    bad: "bg-bad-l text-bad",
    info: "bg-info-l text-info",
  }[tone];
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", t)}>{children}</span>;
}

export function Note({ tone = "default", children }: { tone?: "default" | "warn" | "bad" | "ok"; children: ReactNode }) {
  const t = {
    default: "border-line bg-sunk text-ink2",
    warn: "border-warn/30 bg-warn-l text-ink",
    bad: "border-bad/30 bg-bad-l text-ink",
    ok: "border-ok/30 bg-acc-l text-ink",
  }[tone];
  return <div className={cx("rounded-lg border px-3 py-2 text-md leading-relaxed", t)}>{children}</div>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-card px-4 py-3">
      <div className="text-xs text-mute">{label}</div>
      <div className="mt-0.5 font-serif text-2xl font-semibold text-ink">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink2">{hint}</div>}
    </div>
  );
}
