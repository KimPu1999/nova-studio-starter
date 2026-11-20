'use client';

import {PanelLeftClose} from 'lucide-react';

export function AdminSidebarToggle(){
  return <button type="button" className="icon-button admin-sidebar-toggle" onClick={()=>window.dispatchEvent(new Event('nova:admin-sidebar-toggle'))} aria-label="Collapse or expand admin navigation" title="Collapse or expand navigation"><PanelLeftClose size={18}/></button>;
}
