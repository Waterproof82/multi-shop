'use client';

import { useEffect, useState } from 'react';

export function ScrollToTop() {
  const [key, setKey] = useState(0);

  useEffect(() => {
    setKey(prev => prev + 1);
    requestAnimationFrame(() => {
      window.scrollTo(0, 0);
    });
  }, []);

  return <div key={key} style={{ display: 'none' }} aria-hidden="true" />;
}
