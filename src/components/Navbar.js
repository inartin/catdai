import Link from "next/link";

export default function Navbar() {
  return (
    <header className="bg-white sticky top-0 z-50 border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-primary block" />
          <span className="text-lg font-semibold tracking-tight">catdai</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm text-gray-500">
          <Link href="#" className="hover:text-foreground transition-colors">
            Despre
          </Link>
          <Link href="#" className="hover:text-foreground transition-colors">
            Blog
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
