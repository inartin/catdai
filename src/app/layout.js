import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata = {
  title: "Catdai – Nu ghici prețul. Verifică-l.",
  description:
    "Află un preț realist în câteva secunde. Evaluare imobile, auto și gadgeturi.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ro">
      <body className={`${geistSans.variable} antialiased`}>{children}</body>
    </html>
  );
}
