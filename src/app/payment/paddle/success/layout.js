import { paymentMetadata } from '@/lib/payment-metadata';
export const generateMetadata = () => paymentMetadata(true);

export default function PaddleSuccessLayout({ children }) {
  return children;
}
