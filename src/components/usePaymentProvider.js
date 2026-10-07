'use client';
import { useEffect, useState } from 'react';
let configPromise;
export default function usePaymentProvider() {
  const [provider, setProvider] = useState('maib');
  useEffect(() => {
    configPromise ||= fetch('/api/payments/config', { cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error('Payment config unavailable');
      return response.json();
    }).catch(() => { configPromise = null; return { provider: 'maib' }; });
    let active = true;
    configPromise.then(value => { if (active) setProvider(value.provider); });
    return () => { active = false; };
  }, []);
  return provider;
}
