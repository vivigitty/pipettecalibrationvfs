'use client';

import { useEffect } from 'react';

export function NavigationGuard() {
  useEffect(() => {
    const guard = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('a,button[role="tab"]')) return;
      if (document.querySelector('form[data-unsaved="true"]') && !window.confirm('Reading changes have not been saved. Leave this page?')) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    document.addEventListener('click',guard,true);
    return () => { document.removeEventListener('click',guard,true); };
  },[]);
  return null;
}