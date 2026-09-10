'use client';

import { useEffect } from 'react';
import HomePage from '../page';

export default function HomeRoutePage() {
  useEffect(() => {
    // Silently normalize the address bar URL to '/' without page reload, redirect screens, or loops
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/home')) {
      window.history.replaceState(null, '', '/');
    }
  }, []);

  return <HomePage />;
}