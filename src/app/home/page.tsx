'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function HomeRedirectPage() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.location.replace('/');
    }
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white px-6 text-center">
      <p className="text-lg font-medium text-slate-700 mb-4">Redirecting to homepage...</p>
      <p className="text-sm text-slate-500">
        If you are not redirected automatically,{' '}
        <Link href="/" className="text-blue-600 underline">
          click here
        </Link>
        .
      </p>
    </main>
  );
}