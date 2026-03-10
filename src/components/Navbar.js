"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export const GO_HOME_EVENT = "catdai-go-home";

export function emitGoHome() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(GO_HOME_EVENT));
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogoClick = (e) => {
    if (pathname === "/") {
      e.preventDefault();
      emitGoHome();
      router.replace("/");
    }
  };

  return (
    <header className="bg-white sticky top-0 z-50 border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 flex items-center justify-between h-16">
        <Link
          href="/"
          aria-label="Cât Dai? – Pagina principală"
          className="flex items-center gap-3 whitespace-nowrap"
          onClick={handleLogoClick}
        >
          <img
            src="/icon0.svg"
            alt=""
            className="h-11 w-auto object-contain"
          />
          <span className="text-lg font-semibold tracking-tight">Cât Dai?</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm text-gray-500">
          <Link href="#" className="hover:text-foreground transition-colors">
            Despre
          </Link>
          <Link href="#" className="hover:text-foreground transition-colors">
            Noutǎți
          </Link>
          <Link href="#" className="hover:text-foreground transition-colors">
            Pentru Agenți
          </Link>
        </nav>

        <div className="flex items-center gap-4">
          <Link
            href="#"
            className="bg-primary hover:bg-primary-dark text-white text-sm font-medium rounded-lg px-5 py-2 transition-colors"
          >
            Loghează-te
          </Link>
          <Link
            href="#"
            className="text-sm text-gray-500 hover:text-foreground transition-colors hidden sm:inline"
          >
            înregistrare
          </Link>
        </div>
      </div>
    </header>
  );
}
