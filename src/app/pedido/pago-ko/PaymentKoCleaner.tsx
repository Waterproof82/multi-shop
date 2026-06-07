"use client";

import { useEffect } from 'react';
import { removeTrackingToken } from '@/lib/order-tracking';

export function PaymentKoCleaner({ token }: { token: string }) {
  useEffect(() => {
    removeTrackingToken(token);
  }, [token]);

  return null;
}
