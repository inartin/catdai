"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";

export default function Tooltip({ text, children, className = "" }) {
  const triggerRef = useRef(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState(null);

  const updateTooltipPosition = useCallback(() => {
    if (!triggerRef.current || typeof window === "undefined") return;
    const rect = triggerRef.current.getBoundingClientRect();
    const baseLeft = rect.left + rect.width / 2;
    const halfTooltip = 160;
    const gap = 8;
    const estimatedHeight = 44;
    const shouldShowBelow = rect.top < estimatedHeight + gap * 2;
    const clampedLeft = Math.min(
      Math.max(baseLeft, halfTooltip),
      window.innerWidth - halfTooltip
    );

    setTooltipPos({
      left: clampedLeft,
      top: shouldShowBelow ? rect.bottom + gap : rect.top - gap,
      arrowOffset: baseLeft - clampedLeft,
      placement: shouldShowBelow ? "bottom" : "top",
    });
  }, []);

  useEffect(() => {
    if (!showTooltip) return;
    updateTooltipPosition();
    const onReposition = () => updateTooltipPosition();

    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);

    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [showTooltip, updateTooltipPosition]);

  return (
    <span className="relative inline-flex">
      <span
        ref={triggerRef}
        className={className}
        onMouseEnter={() => {
          updateTooltipPosition();
          setShowTooltip(true);
        }}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={() => {
          updateTooltipPosition();
          setShowTooltip(true);
        }}
        onBlur={() => setShowTooltip(false)}
      >
        {children}
      </span>
      {showTooltip && tooltipPos && typeof document !== "undefined"
        ? createPortal(
          <span
            className={`pointer-events-none fixed z-[70] left-1/2 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium text-center max-w-[280px] leading-tight shadow-lg animate-fade-in ${
              tooltipPos.placement === "bottom"
                ? "translate-x-[-50%] translate-y-0"
                : "-translate-x-1/2 -translate-y-full"
            }`}
            style={{ left: tooltipPos.left, top: tooltipPos.top }}
          >
            {text}
            <span
              className={`absolute left-1/2 w-0 h-0 -translate-x-1/2 ${
                tooltipPos.placement === "bottom"
                  ? "bottom-full border-b-[5px] border-b-gray-900 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-0"
                  : "top-full border-t-[5px] border-t-gray-900 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-0"
              }`}
              style={{ left: `calc(50% + ${tooltipPos.arrowOffset}px)` }}
            />
          </span>,
          document.body
        )
        : null}
    </span>
  );
}
