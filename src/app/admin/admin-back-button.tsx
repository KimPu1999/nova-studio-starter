'use client';

import {ArrowLeft} from 'lucide-react';
import {usePathname,useRouter} from 'next/navigation';

export function AdminBackButton(){
  const router=useRouter();
  const pathname=usePathname();
  if(pathname==='/admin')return null;
  return <button type="button" className="admin-back-button" onClick={()=>{if(window.history.length>1)router.back();else router.push('/admin')}} aria-label="Go back to the previous admin page"><ArrowLeft size={16}/> Back</button>;
}
