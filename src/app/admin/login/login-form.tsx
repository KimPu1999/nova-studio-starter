'use client';
import {useActionState} from 'react';
import {loginAction} from '../actions';
import {PasswordInput} from '@/components/password-input';
export function LoginForm(){const [state,action,pending]=useActionState(loginAction,{error:''});return <form action={action} className="admin-form"><label>Email<input name="email" type="email" autoComplete="username" required className="form-input"/></label><label>Password<PasswordInput name="password" minLength={8} maxLength={12} autoComplete="current-password"/></label>{state?.error&&<p className="admin-error" role="alert">{state.error}</p>}<button className="btn-primary w-full" disabled={pending}>{pending?'Signing in…':'Sign in'}</button></form>}
