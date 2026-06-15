"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const navItems = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/news", label: "News" },
  { href: "/admin/uploads", label: "Uploads" },
  { href: "/admin/feedback", label: "Feedback" },
  { href: "/admin/ad-tracking", label: "Ad tracking" },
  { href: "/admin/listings", label: "Listings" },
  { href: "/admin/owners", label: "Owners" },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMobileMenuOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobileMenuOpen]);

  const navContent = (
    <>
      <div className="px-5 py-4 border-b border-gray-200">
        <Link href="/admin" className="text-lg font-bold text-primary-dark">
          CatDai <span className="text-primary font-normal text-sm">Admin</span>
        </Link>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map(({ href, label }) => {
          const active =
            href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-primary-light text-primary-dark"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-200 space-y-2">
        <Link
          href="/"
          className="block text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          &larr; Back to site
        </Link>
        <button
          onClick={async () => {
            await fetch("/api/admin/auth", { method: "DELETE" });
            window.location.href = "/admin/login";
          }}
          className="block text-xs text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
        >
          Logout
        </button>
      </div>
    </>
  );

  return (
    <>
      <div className="md:hidden sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/admin" className="text-base font-bold text-primary-dark">
            CatDai <span className="text-primary font-normal text-sm">Admin</span>
          </Link>
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-700 transition-colors hover:border-primary/40 hover:text-primary cursor-pointer"
            aria-label="Open menu"
            aria-expanded={isMobileMenuOpen}
          >
            <span className="sr-only">Open menu</span>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setIsMobileMenuOpen(false)}
            className="absolute inset-0 bg-black/40 cursor-pointer"
          />
          <aside className="relative z-10 flex h-full w-[min(20rem,88vw)] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <Link href="/admin" className="text-lg font-bold text-primary-dark">
                CatDai <span className="text-primary font-normal text-sm">Admin</span>
              </Link>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-700 transition-colors hover:border-primary/40 hover:text-primary cursor-pointer"
                aria-label="Close menu"
              >
                <span className="text-xl leading-none">×</span>
              </button>
            </div>
            {navContent}
          </aside>
        </div>
      )}

      <aside className="hidden w-56 shrink-0 flex-col border-r border-gray-200 bg-white md:flex">
        {navContent}
      </aside>
    </>
  );
}
