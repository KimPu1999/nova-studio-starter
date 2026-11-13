'use client';

import { useActionState } from 'react';
import { SecretOnce } from '../create-form';

type Result = { ok: boolean; error?: string; secretOnce?: string };

export function RotateSecretForm({ action, endpointId }: { action: (formData: FormData) => Promise<Result>; endpointId: string }) {
  const [state, formAction, pending] = useActionState(async (_prev: Result | null, formData: FormData) => {
    try { return await action(formData); } catch { return { ok: false, error: 'Rotation failed.' }; }
  }, null);
  return (
    <div>
      <form action={formAction}>
        <input type="hidden" name="id" value={endpointId} />
        <button className="btn-outline" disabled={pending}>{pending ? 'Rotating…' : 'Rotate signing secret'}</button>
        <p className="mt-2 text-xs text-slate-500">The previous secret stops signing immediately. Deliveries in flight will use the newest secret.</p>
      </form>
      {state?.error && <p className="mt-3 text-sm text-red-300">{state.error}</p>}
      {state?.ok && state.secretOnce && <SecretOnce value={state.secretOnce} label="New signing secret" />}
    </div>
  );
}
