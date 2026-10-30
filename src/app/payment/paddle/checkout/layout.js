import { paymentMetadata } from '@/lib/payment-metadata';
export const generateMetadata = () => paymentMetadata(false);

export default function PaddleCheckoutLayout({ children }) {
  return children;
}
