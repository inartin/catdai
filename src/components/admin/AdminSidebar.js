"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/listings", label: "Listings" },
  { href: "/admin/owners", label: "Owners" },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col shrink-0">
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
          className="block text-xs text-gray-400 hover:text-red-500 transition-colors"
        >
          Logout
        </button>
      </div>
    </aside>
  );
}
