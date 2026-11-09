'use client';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="content"><h1>Unable to open this page</h1><p>Check the service configuration or contact your administrator.</p><button className="button primary" onClick={reset}>Try again</button></main>;
}