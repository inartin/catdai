"use client";

export default function BackButton({ children, onClick, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 text-gray-400 transition-colors hover:text-gray-700 group ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 transition-transform group-hover:-translate-x-0.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      <span className="text-sm font-medium">{children}</span>
    </button>
  );
}
