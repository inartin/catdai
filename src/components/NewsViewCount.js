export default function NewsViewCount({ count = 0, label, className = "" }) {
  const value = Number.isFinite(Number(count)) ? Number(count) : 0;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 font-semibold text-gray-500 ${className}`}
      title={label}
      aria-label={`${label}: ${value}`}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      {value}
    </span>
  );
}
