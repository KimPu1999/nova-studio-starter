import Link from 'next/link';

/** Money convention: integer MMK kyat. */
export function fmtMmk(amount: number): string {
  return `${amount.toLocaleString()} MMK`;
}

/** UTC date display (Asia/Yangon is a display-only concern). */
export function fmtDate(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 10) : '—';
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

export function PageHeader({ eyebrow, title, note }: { eyebrow: string; title: string; note?: string }) {
  return (
    <>
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="admin-title">{title}</h1>
      {note ? <p className="mb-8 mt-2 max-w-2xl text-sm text-slate-400">{note}</p> : null}
    </>
  );
}

/** Renders the `?error=` message returned by a failed server action. */
export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return <div className="admin-error mt-5">{message}</div>;
}

export function SuccessBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-sm text-emerald-200">{message}</div>
  );
}

export function StatusBadge({ value }: { value: string }) {
  return <span className={`status-badge status-${value.toLowerCase()}`}>{value.replaceAll('_', ' ')}</span>;
}

export function KpiCard({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="admin-stat">
      <p className={`text-2xl font-bold${accent ? ' text-violet-300' : ''}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{label}</p>
    </div>
  );
}

export function FilterPills({ basePath, current, options }: { basePath: string; current?: string; options: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link className={`filter-pill${current ? '' : ' filter-active'}`} href={basePath}>
        All
      </Link>
      {options.map((option) => (
        <Link
          key={option}
          className={`filter-pill${current === option ? ' filter-active' : ''}`}
          href={`${basePath}?status=${option}`}
        >
          {option.replaceAll('_', ' ')}
        </Link>
      ))}
    </div>
  );
}

/** 10/page pagination with an optional status filter preserved in the links. */
export function Pager({ basePath, page, total, status }: { basePath: string; page: number; total: number; status?: string }) {
  const pages = Math.max(1, Math.ceil(total / 10));
  if (pages <= 1) return null;
  const href = (target: number) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (target > 1) params.set('page', String(target));
    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ''}`;
  };
  return (
    <div className="mt-5 flex items-center justify-between text-sm text-slate-400">
      <span>
        Page {page} of {pages}
      </span>
      <span className="flex gap-2">
        {page > 1 ? (
          <Link className="btn-outline" href={href(page - 1)}>
            ← Previous
          </Link>
        ) : null}
        {page < pages ? (
          <Link className="btn-outline" href={href(page + 1)}>
            Next →
          </Link>
        ) : null}
      </span>
    </div>
  );
}
