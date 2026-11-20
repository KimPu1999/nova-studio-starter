'use client';

import {Menu} from 'lucide-react';

export function AdminMenuButton(){
  return <button type="button" className="icon-button admin-menu-button" onClick={()=>window.dispatchEvent(new Event('nova:admin-menu'))} aria-label="Open admin navigation"><Menu size={19}/></button>;
}
