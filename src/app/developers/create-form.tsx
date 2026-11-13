'use client';

import { useActionState } from 'react';
import Link from 'next/link';

type CreationResult = { ok: boolean; error?: string; secretOnce?: string; id?: string };

export function SecretOnce({ value, label, href }: { value: string; label: string; href?: string }) {
  return (
    <div className="admin-panel mt-6 border-cyan-400/40">
      <p className="text-xs uppercase tracking-widest text-cyan-300">{label} — shown only once</p>
      <pre className="mt-3 overflow-x-auto rounded-xl bg-[#09090F] p-4 text-sm text-cyan-100"><code>{value}</code></pre>
      <p className="mt-3 text-xs text-slate-500">Store it now. It cannot be retrieved again — only rotated or revoked.</p>
      {href && <Link href={href} className="btn-outline mt-4 inline-block">Continue</Link>}
    </div>
  );
}

export function FormFeedback({ state }: { state: CreationResult | null }) {
  if (!state) return null;
  if (state.error) return <p className="mt-3 text-sm text-red-300">{state.error}</p>;
  if (!state.ok && state.error) return null;
  return null;
}

export function ScopePicker({ scopes, selected }: { scopes: string[]; selected?: string[] }) {
  return (
    <fieldset className="mt-2 space-y-2">
      <legend className="label">Scopes (least privilege)</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {scopes.map((scope) => (
          <label key={scope} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm">
            <input type="checkbox" name="scopes" value={scope} defaultChecked={selected?.includes(scope)} className="accent-violet-500" />
            <span className="font-mono text-xs text-cyan-200">{scope}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function CreationForm({
  action,
  children,
  submitLabel,
  secretLabel,
  secretHref,
}: {
  action: (formData: FormData) => Promise<CreationResult>;
  children: React.ReactNode;
  submitLabel: string;
  secretLabel: string;
  secretHref?: string;
}) {
  const [state, formAction, pending] = useActionState(async (prev: CreationResult | null, formData: FormData) => {
    try {
      return await action(formData);
    } catch {
      return { ok: false, error: 'The request could not be completed.' };
    }
  }, null);

  return (
    <div>
      <form action={formAction} className="space-y-4">
        {children}
        <button type="submit" className="btn-primary" disabled={pending}>{pending ? 'Working…' : submitLabel}</button>
      </form>
      {state?.error && <p className="mt-3 text-sm text-red-300">{state.error}</p>}
      {state?.ok && state.secretOnce && <SecretOnce value={state.secretOnce} label={secretLabel} href={secretHref} />}
    </div>
  );
}
