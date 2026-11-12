'use client';

import {useState} from 'react';
import {Eye,EyeOff} from 'lucide-react';

export function PasswordInput({name,autoComplete,minLength=8,maxLength=12,required=true,placeholder}:{name:string;autoComplete?:string;minLength?:number;maxLength?:number;required?:boolean;placeholder?:string}){
 const [visible,setVisible]=useState(false);
 return <span className="relative block"><input className="form-input pr-12" name={name} type={visible?'text':'password'} autoComplete={autoComplete} minLength={minLength} maxLength={maxLength} required={required} placeholder={placeholder}/><button type="button" onClick={()=>setVisible(value=>!value)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label={visible?'Hide password':'Show password'} aria-pressed={visible}>{visible?<EyeOff size={17}/>:<Eye size={17}/>}</button></span>;
}
