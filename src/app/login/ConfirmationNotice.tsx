'use client';

import { useEffect,useState } from 'react';

type Notice = { kind: 'confirmed' | 'error'; message: string };

/**
 * Supabase sends the user back from the confirmation email to /login with the outcome in the URL fragment
 * (which the server never sees). Explain what happens next and strip the tokens from the address bar.
 */
export function ConfirmationNotice() {
  const [notice,setNotice] = useState<Notice | null>(null);
  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    if (!fragment.size) return;
    const description = fragment.get('error_description');
    const next: Notice | null = description
      ? { kind: 'error',message: `${description.replaceAll('+',' ')}. If your link expired, create the account again or use Forgot password to get a new email.` }
      : fragment.get('type')==='signup' || fragment.has('access_token')
        ? { kind: 'confirmed',message: 'Email confirmed. Your access request is with the administrator. Sign in once you have been approved; if you sign in sooner you will see that approval is still pending.' }
        : null;
    window.history.replaceState(null,'',window.location.pathname+window.location.search);
    // The fragment is only readable after mount, so this one-time state update is intentional.
    if (next) setNotice(next);
  },[]);
  if (!notice) return null;
  return <p role={notice.kind==='error' ? 'alert' : 'status'} className={notice.kind==='error' ? 'field-error' : 'confirmation-notice'}>{notice.message}</p>;
}
