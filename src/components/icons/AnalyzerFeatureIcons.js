"use client";

import { memo } from "react";

const baseProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function IconShell({ size, children, ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      {...baseProps}
      {...props}
    >
      {children}
    </svg>
  );
}

const PriceAnalysisIcon = memo(function PriceAnalysisIcon({ size = 18, ...props }) {
  return (
    <IconShell size={size} {...props}>
      <path d="M4 18V6" />
      <path d="M4 18h16" />
      <path d="m7 15 4-5 3 3 5-7" />
      <path d="M17 6h2v2" />
    </IconShell>
  );
});

const SimilarListingsIcon = memo(function SimilarListingsIcon({ size = 18, ...props }) {
  return (
    <IconShell size={size} {...props}>
      <rect x="4" y="5" width="10" height="13" rx="2" />
      <path d="M8 9h4" />
      <path d="M8 13h3" />
      <path d="M16 7h1a2 2 0 0 1 2 2v9" />
      <path d="M17 18h2" />
    </IconShell>
  );
});

const DuplicateCheckIcon = memo(function DuplicateCheckIcon({ size = 18, ...props }) {
  return (
    <IconShell size={size} {...props}>
      <rect x="7" y="7" width="11" height="11" rx="2" />
      <path d="M5 15V6a1 1 0 0 1 1-1h9" />
      <path d="m10 13 2 2 4-5" />
    </IconShell>
  );
});

const PriceHistoryIcon = memo(function PriceHistoryIcon({ size = 18, ...props }) {
  return (
    <IconShell size={size} {...props}>
      <path d="M12 8v5l3 2" />
      <path d="M5.5 7.5A8 8 0 1 1 4 12" />
      <path d="M4 5v4h4" />
    </IconShell>
  );
});

export {
  DuplicateCheckIcon,
  PriceAnalysisIcon,
  PriceHistoryIcon,
  SimilarListingsIcon,
};
