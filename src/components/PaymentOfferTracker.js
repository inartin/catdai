'use client';
import { useEffect, useRef } from 'react';
import { trackPaymentAnalytics } from '@/lib/ga4-payment-client';

// Observe the visible offer container, including CSS-hidden desktop/mobile variants.
export default function PaymentOfferTracker({ productKey, checkoutSource, buyerType, language }) {
  const marker = useRef(null);
  const sent = useRef(false);
  useEffect(() => {
    const target = marker.current?.parentElement;
    if (!target || !productKey || sent.current || typeof IntersectionObserver === 'undefined') return;
    let visible = false;
    const track = () => {
      if (visible && !sent.current) sent.current = trackPaymentAnalytics('paid_offer_viewed', productKey,
        { checkout_source: checkoutSource, buyer_type: buyerType, language });
      if (sent.current) observer.disconnect();
    };
    const observer = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      track();
    });
    observer.observe(target);
    window.addEventListener('catdai:analytics-consent', track);
    return () => { observer.disconnect(); window.removeEventListener('catdai:analytics-consent', track); };
  }, [productKey, checkoutSource, buyerType, language]);
  return <span ref={marker} hidden aria-hidden="true" />;
}
