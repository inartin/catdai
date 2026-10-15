"use client";

import { useLayoutEffect, useRef } from "react";

let animationStartedAt = null;

export default function CadastruLoadingIcon({
  className = "h-6 w-auto text-primary",
  variant = "animated",
  bold = false,
  ariaLabel = "Se încarcă...",
}) {
  const iconRef = useRef(null);

  useLayoutEffect(() => {
    const icon = iconRef.current;
    const now = document.timeline.currentTime;
    if (!icon || now === null) return;

    // Navigation and Suspense may remount the SVG; resume the same animation phase.
    animationStartedAt ??= now;
    for (const animation of icon.getAnimations({ subtree: true })) {
      animation.startTime = animationStartedAt;
    }
  }, [variant]);

  if (variant === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/images/cadastru-loading.png"
        alt={ariaLabel}
        className={`${className} object-contain`}
      />
    );
  }

  return (
    <svg
      ref={iconRef}
      viewBox="3 3 143 178"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="status"
      aria-label={ariaLabel}
    >
      <style>{`
        @keyframes moldovaStrokeDash {
          0% {
            stroke-dashoffset: 0;
          }
          100% {
            stroke-dashoffset: -576;
          }
        }
        @keyframes moldovaPulsePing {
          0% {
            r: 3.5;
            opacity: 0.9;
          }
          75%, 100% {
            r: 9;
            opacity: 0;
          }
        }
        .animate-moldova-stroke {
          stroke-dasharray: 120 456;
          animation: moldovaStrokeDash 2s linear infinite;
        }
        .animate-moldova-ping {
          animation: moldovaPulsePing 1.6s cubic-bezier(0, 0, 0.2, 1) infinite;
          transform-origin: 91.8px 89.4px;
        }
      `}</style>

      {/* Background outline of Moldova */}
      <path
        d="M42 6 L44 6 L47 8 L52 9 L55 12 L63 16 L63 17 L65 19 L67 19 L69 21 L73 20 L74 21 L74 23 L77 25 L77 27 L78 28 L80 25 L83 25 L84 26 L87 26 L89 27 L93 34 L96 37 L99 37 L103 35 L104 38 L107 42 L106 43 L106 47 L107 48 L106 49 L105 56 L103 60 L103 63 L105 65 L107 65 L114 73 L115 73 L117 71 L118 71 L120 73 L120 76 L119 77 L119 82 L117 84 L117 85 L118 86 L120 85 L121 86 L120 92 L128 98 L130 98 L133 101 L134 103 L134 114 L133 116 L135 117 L141 123 L141 124 L139 125 L135 125 L134 126 L131 126 L130 127 L128 123 L126 121 L122 125 L120 125 L118 123 L117 123 L117 122 L115 120 L113 122 L111 122 L110 121 L109 123 L106 126 L105 126 L105 123 L106 122 L105 119 L104 118 L101 118 L99 119 L95 123 L95 129 L96 130 L96 132 L98 136 L97 140 L96 141 L96 145 L94 147 L91 148 L88 151 L88 155 L86 157 L86 158 L84 159 L79 165 L79 168 L80 170 L79 171 L79 173 L77 174 L70 174 L69 175 L67 175 L63 170 L66 164 L66 162 L65 161 L65 157 L64 156 L64 148 L63 147 L64 137 L65 136 L64 135 L64 133 L68 126 L68 108 L67 107 L67 105 L64 99 L63 92 L53 83 L50 76 L44 71 L43 65 L41 63 L40 63 L38 58 L33 53 L32 51 L32 48 L30 45 L30 42 L28 39 L28 37 L23 30 L23 28 L21 26 L21 25 L19 23 L17 23 L12 19 L7 19 L7 17 L9 15 L11 16 L13 12 L17 12 L18 13 L21 13 L23 11 L29 12 L34 9 L37 9 L42 6 Z"
        stroke="currentColor"
        strokeWidth={bold ? 8 : 4}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={bold ? 0.75 : 0.4}
      />

      {/* Animated active tracer segment running along border */}
      <path
        d="M42 6 L44 6 L47 8 L52 9 L55 12 L63 16 L63 17 L65 19 L67 19 L69 21 L73 20 L74 21 L74 23 L77 25 L77 27 L78 28 L80 25 L83 25 L84 26 L87 26 L89 27 L93 34 L96 37 L99 37 L103 35 L104 38 L107 42 L106 43 L106 47 L107 48 L106 49 L105 56 L103 60 L103 63 L105 65 L107 65 L114 73 L115 73 L117 71 L118 71 L120 73 L120 76 L119 77 L119 82 L117 84 L117 85 L118 86 L120 85 L121 86 L120 92 L128 98 L130 98 L133 101 L134 103 L134 114 L133 116 L135 117 L141 123 L141 124 L139 125 L135 125 L134 126 L131 126 L130 127 L128 123 L126 121 L122 125 L120 125 L118 123 L117 123 L117 122 L115 120 L113 122 L111 122 L110 121 L109 123 L106 126 L105 126 L105 123 L106 122 L105 119 L104 118 L101 118 L99 119 L95 123 L95 129 L96 130 L96 132 L98 136 L97 140 L96 141 L96 145 L94 147 L91 148 L88 151 L88 155 L86 157 L86 158 L84 159 L79 165 L79 168 L80 170 L79 171 L79 173 L77 174 L70 174 L69 175 L67 175 L63 170 L66 164 L66 162 L65 161 L65 157 L64 156 L64 148 L63 147 L64 137 L65 136 L64 135 L64 133 L68 126 L68 108 L67 107 L67 105 L64 99 L63 92 L53 83 L50 76 L44 71 L43 65 L41 63 L40 63 L38 58 L33 53 L32 51 L32 48 L30 45 L30 42 L28 39 L28 37 L23 30 L23 28 L21 26 L21 25 L19 23 L17 23 L12 19 L7 19 L7 17 L9 15 L11 16 L13 12 L17 12 L18 13 L21 13 L23 11 L29 12 L34 9 L37 9 L42 6 Z"
        stroke="currentColor"
        strokeWidth={bold ? 10 : 6}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="animate-moldova-stroke"
      />

      {/* Pulsing beacon radar ring at Chisinau */}
      <circle
        cx="91.8"
        cy="89.4"
        r="4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="animate-moldova-ping"
      />

      {/* Pin ring at Chisinau */}
      <circle
        cx="91.8"
        cy="89.4"
        r="4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.2"
      />

      {/* Center dot at Chisinau */}
      <circle
        cx="91.8"
        cy="89.4"
        r="2"
        fill="currentColor"
      />
    </svg>
  );
}
