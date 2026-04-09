import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function FaqPage({ title, subtitle, items }) {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Navbar />
      <main className="flex-1">
        <section className="max-w-4xl mx-auto px-6 py-16 sm:py-20">
          <div className="rounded-3xl border border-gray-200 bg-white p-8 sm:p-10 shadow-sm">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">{title}</h1>
            <p className="mt-4 text-base sm:text-lg text-gray-600">{subtitle}</p>

            <div className="mt-8 space-y-3">
              {items.map((item) => (
                <details
                  key={item.question}
                  className="group rounded-2xl border border-gray-200 bg-gray-50 open:bg-white open:shadow-sm"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left font-semibold text-gray-900 [&::-webkit-details-marker]:hidden">
                    <span>{item.question}</span>
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5 shrink-0 text-gray-400 transition-transform group-open:rotate-180"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </summary>

                  <div className="space-y-3 px-5 pb-5 text-gray-600">
                    {item.answers.map((answer) => (
                      <p key={answer}>{answer}</p>
                    ))}

                    {item.links ? (
                      <div className="flex flex-wrap gap-4 pt-1">
                        {item.links.map((link) => (
                          <Link
                            key={`${link.href}-${link.label}`}
                            href={link.href}
                            className="text-blue-600 hover:text-blue-700 hover:underline"
                          >
                            {link.label}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
