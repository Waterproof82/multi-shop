'use client';

import { useEffect } from 'react';

export function ScrollOnMount() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return null;
}
