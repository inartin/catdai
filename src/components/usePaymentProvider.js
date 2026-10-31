'use client';
import { useEffect, useState } from 'react';
let configPromise;
export function usePaymentConfig() {
  const [config, setConfig] = useState({ provider: 'maib' });
  useEffect(() => {
    configPromise ||= fetch('/api/payments/config', { cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error('Payment config unavailable');
      return response.json();
    }).catch(() => { configPromise = null; return { provider: 'maib' }; });
    let active = true;
    configPromise.then(value => { if (active) setConfig(value); });
    return () => { active = false; };
  }, []);
  return config;
}

export default function usePaymentProvider() {
  return usePaymentConfig().provider;
}
