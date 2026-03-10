const categories = [
  {
    name: "Auto",
    cta: "Analiză Piață Auto",
    gradient: "from-red-200 to-red-400",
    backgroundImage: "/images/cd-auto.webp",
    iconBg: "bg-red-500",
    disabled: true,
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="w-4 h-4"
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 17h10M5 13l1.5-5h11L19 13M5 13h14v4H5z" />
        <circle cx="7.5" cy="17" r="1.5" />
        <circle cx="16.5" cy="17" r="1.5" />
      </svg>
    ),
  },
  {
    name: "Imobil",
    cta: "Analizează Piața Imobiliară",
    gradient: "from-green-200 to-emerald-400",
    backgroundImage: "/images/cd-imobil.webp",
    iconBg: "bg-green-600",
    disabled: false,
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="w-4 h-4"
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    name: "Electronice",
    cta: "Analiză Piață Gadget",
    gradient: "from-blue-200 to-indigo-300",
    backgroundImage: "/images/CD-electronics.webp",
    iconBg: "bg-amber-500",
    disabled: true,
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="w-4 h-4"
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
        <line x1="12" y1="18" x2="12.01" y2="18" />
      </svg>
    ),
  },
];

function EvalIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  );
}

export default function CategoryCards({ onCategorySelect }) {
  return (
    <section className="pb-16 px-4">
      {/* <h2 className="text-xl font-bold text-center mb-8">
        Ce vrei să faci azi?
      </h2> */}

      <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6">
        {categories.map((cat) => {
          const isActive = !cat.disabled;

          return (
            <div key={cat.name} className="group/card w-full h-full min-w-0">
              <button
                type="button"
                disabled={cat.disabled}
                onClick={() => isActive && onCategorySelect?.(cat.name)}
                className={`relative w-full h-full rounded-2xl overflow-hidden bg-white border border-gray-100 text-left transition-all duration-200 ${
                  isActive
                    ? "shadow-md hover:shadow-lg hover:-translate-y-0.5 cursor-pointer"
                    : "cursor-default"
                }`}
              >
                {cat.disabled && (
                  <span className="absolute top-3 right-3 z-20 bg-white border border-gray-200 text-xs font-semibold text-gray-700 px-3 py-1.5 rounded-full shadow-md">
                    În curând
                  </span>
                )}

                <div className={cat.disabled ? "opacity-60" : ""}>
                  <div className="relative">
                    <div
                      className={`h-44 ${cat.backgroundImage ? "bg-cover bg-center bg-no-repeat" : `bg-linear-to-br ${cat.gradient}`} ${cat.disabled && cat.backgroundImage ? "grayscale group-hover/card:grayscale-0 transition-[filter] duration-300" : ""}`}
                      style={cat.backgroundImage ? { backgroundImage: `url(${cat.backgroundImage})` } : undefined}
                    />
                </div>

                <div className="p-5 text-center space-y-3">
                <div className="flex items-center justify-center gap-2">
                  <span
                    className={`w-7 h-7 rounded-md ${cat.iconBg} flex items-center justify-center`}
                  >
                    {cat.icon}
                  </span>
                  <span className="font-bold text-base">{cat.name}</span>
                </div>

                <span
                  className={`inline-flex items-center gap-1.5 font-medium text-sm ${
                    isActive
                      ? "text-primary"
                      : "text-gray-400"
                  }`}
                >
                  <EvalIcon />
                  {cat.cta}
                </span>
                </div>
              </div>
            </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
