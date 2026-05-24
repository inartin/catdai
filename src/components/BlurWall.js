"use client";

export default function BlurWall({
  children,
  className = "",
  intensity = "sm",
  overlayClassName = "bg-white/55",
}) {
  const blurClassName = {
    none: "",
    sm: "backdrop-blur-sm",
    md: "backdrop-blur-md",
    lg: "backdrop-blur-lg",
  }[intensity] ?? "backdrop-blur-sm";

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {children}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 ${overlayClassName} ${blurClassName}`}
      />
    </div>
  );
}
