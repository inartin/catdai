export default function InfoCallout({ title, children, className = "" }) {
  return (
    <section className={`rounded-2xl border border-blue-100 bg-blue-50/60 p-5 shadow-sm sm:p-6 ${className}`}>
      <div className="flex gap-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </span>
        <div>
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-gray-600">{children}</p>
        </div>
      </div>
    </section>
  );
}
