/* 共用元件，照 repo 根目錄的 DESIGN.md：膠囊按鈕（主要＝深藍黑底）、白色 16px 卡片、紅色區段編號、10px 圓角輸入框。 */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function cx(...a: (string | false | null | undefined)[]): string {
  return a.filter(Boolean).join(" ");
}

/** 頁標＋（最多）一個主要按鈕；lead 是一行短提示 */
export function PageHeader({ title, lead, actions }: { title: string; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-[-0.02em] text-ink">{title}</h1>
        {lead && <p className="mt-1 text-sm text-mute">{lead}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** 區段標題：前面放紅色小編號（01、02…） */
export function SectionTitle({ no, children, extra, className }: { no?: number | string; children: ReactNode; extra?: ReactNode; className?: string }) {
  const n = typeof no === "number" ? String(no).padStart(2, "0") : no;
  return (
    <h2 className={cx("mt-8 mb-3 flex flex-wrap items-baseline gap-2.5 text-xl font-bold tracking-[-0.02em] text-ink first:mt-0", className)}>
      {n && <span className="text-[13px] font-bold tracking-[0.08em] text-red tabular-nums">{n}</span>}
      {children}
      {extra && <small className="text-sm font-normal tracking-normal text-mute">{extra}</small>}
    </h2>
  );
}

export function Card({
  title,
  icon,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("rounded-2xl border border-line bg-card p-5 shadow-[0_1px_2px_rgba(31,36,48,0.04)] sm:p-6", className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && (
            <h3 className="flex items-center gap-2 text-[17px] font-bold tracking-[-0.02em] text-ink">
              {icon && <span className="text-blue">{icon}</span>}
              {title}
            </h3>
          )}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

type Tone = "default" | "primary" | "ghost" | "danger";

export function Button({ tone = "default", size = "md", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; size?: "md" | "sm" }) {
  const t: Record<Tone, string> = {
    default: "border border-line2 bg-card text-ink hover:bg-hover",
    primary: "border border-ink bg-ink text-on-ink hover:opacity-90",
    ghost: "border border-transparent text-ink2 hover:bg-hover hover:text-ink",
    danger: "border border-line2 bg-card text-bad hover:bg-bad-l",
  };
  return (
    <button
      type="button"
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "min-h-9 px-3.5 text-sm" : "min-h-10 px-4 text-[15px]",
        t[tone],
        className,
      )}
    />
  );
}

const field = "min-h-10 rounded-[10px] border border-line2 bg-field px-3 text-base text-ink focus:outline-2 focus:outline-focus";
export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input {...p} className={cx(field, className)} />;
}
export function Select({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cx(field, "pr-8", className)} />;
}
export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea {...p} className={cx(field, "py-2", className)} />;
}

export function Badge({ tone = "default", children }: { tone?: "default" | "acc" | "ok" | "warn" | "bad" | "info"; children: ReactNode }) {
  const t = {
    default: "bg-sunk text-ink2",
    acc: "bg-blue-l text-blue",
    ok: "bg-ok-l text-ok",
    warn: "bg-warn-l text-warn",
    bad: "bg-bad-l text-bad",
    info: "bg-blue-l text-blue",
  }[tone];
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] font-medium whitespace-nowrap", t)}>{children}</span>;
}

export function Note({ tone = "default", children }: { tone?: "default" | "warn" | "bad" | "ok"; children: ReactNode }) {
  const t = {
    default: "border-line bg-sunk text-ink2",
    warn: "border-warn/30 bg-warn-l text-ink",
    bad: "border-bad/30 bg-bad-l text-ink",
    ok: "border-ok/30 bg-ok-l text-ink",
  }[tone];
  return <div className={cx("rounded-[10px] border px-3 py-2 text-sm leading-relaxed", t)}>{children}</div>;
}

/** 空白狀態：一行字＋（最多）一個按鈕 */
export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-4 text-mute">
      <span>{children}</span>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-card px-4 py-3">
      <div className="text-[13px] text-mute">{label}</div>
      <div className="mt-0.5 text-2xl font-bold text-ink tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[13px] text-ink2">{hint}</div>}
    </div>
  );
}

/** 品牌標誌：兩個疊在一起的圓角方塊＋「資源班管理系統」 */
export function Brand({ sub }: { sub?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span className="logo" aria-hidden>
        <i />
        <i />
      </span>
      <span className="min-w-0">
        <b className="block truncate text-base leading-tight font-bold tracking-[-0.01em] text-ink">資源班管理系統</b>
        {sub && <small className="block truncate text-[13px] text-mute">{sub}</small>}
      </span>
    </span>
  );
}

/** 分段按鈕（膠囊） */
export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-sunk p-1">
      {options.map(([k, n]) => (
        <button
          key={k}
          type="button"
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          className={cx(
            "min-h-9 rounded-full px-4 text-sm whitespace-nowrap",
            value === k ? "bg-card font-bold text-ink shadow-[0_1px_2px_rgba(31,36,48,0.06),0_0_0_1px_var(--line)]" : "text-ink2 hover:text-ink",
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
