"use client";

import { useTranslation } from "@/context/LanguageContext";

const CATEGORIES = ["schools", "supermarkets", "pharmacies", "food", "parks", "public_transport"];

function CategoryIcon({ category }) {
  const paths = {
    schools: <><path d="m3 10 9-6 9 6" /><path d="M5 9v11h14V9M9 20v-7h6v7" /></>,
    supermarkets: <><path d="M3 4h2l2 11h11l2-8H6" /><circle cx="9" cy="20" r="1" /><circle cx="17" cy="20" r="1" /></>,
    pharmacies: <><path d="M6 3h12v18H6z" /><path d="M12 8v8M8 12h8" /></>,
    food: <path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v18M20 21V3c-3 2-4 5-4 9h4" />,
    parks: <><path d="M12 3 5 14h14L12 3ZM8 13l-3 5h14l-3-5M12 18v3" /></>,
    public_transport: <><rect x="5" y="3" width="14" height="15" rx="3" /><path d="M5 11h14M8 18l-1 3m9-3 1 3M9 7h.01M15 7h.01" /></>,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      {paths[category]}
    </svg>
  );
}

export default function CadastruNearbyCard({ nearby, loading, unavailable }) {
  const { lang, t } = useTranslation();
  const groups = CATEGORIES.map((category) => ({
    category,
    places: Array.isArray(nearby?.categories?.[category]?.places) ? nearby.categories[category].places : [],
  })).filter((group) => group.places.length);
  const formatDistance = new Intl.NumberFormat(lang === "ru" ? "ru-RU" : "ro-MD", { maximumFractionDigits: 0 });

  return (
    <section className="mx-1 mt-6 rounded-2xl border-2 border-emerald-200 bg-white p-5 shadow-md sm:p-7" aria-busy={loading}>
      <h2 className="text-xl font-bold text-gray-950 sm:text-2xl">{t("cadastru.nearbyTitle")}</h2>
      {loading ? <p className="mt-4 text-sm text-gray-500">{t("cadastru.nearbyLoading")}</p> : null}
      {unavailable ? <p className="mt-4 text-sm text-gray-500">{t("cadastru.nearbyUnavailable")}</p> : null}
      {!loading && !unavailable && nearby && groups.length === 0
        ? <p className="mt-4 text-sm text-gray-500">{t("cadastru.nearbyEmpty")}</p>
        : null}
      {groups.length ? (
        <div className="mt-6 grid gap-x-8 gap-y-7 md:grid-cols-2">
          {groups.map(({ category, places }) => (
            <div key={category}>
              <h3 className="mb-3 flex items-center gap-2.5 text-base font-semibold text-gray-900">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                  <CategoryIcon category={category} />
                </span>
                {t(`cadastru.nearby.${category}`)}
              </h3>
              <div className="space-y-2.5 pl-0.5">
                {places.map((place) => (
                  <div key={`${place.osm_type}-${place.osm_id}`} className="flex items-start justify-between gap-4 text-sm sm:text-base">
                    <span className="min-w-0 break-words text-gray-800">{place.name || t("cadastru.nearbyUnnamed")}</span>
                    <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-gray-500">
                      <svg viewBox="0 0 512 512" fill="currentColor" className="h-5 w-5" aria-hidden="true">
                        <path fillRule="evenodd" d="M385 16C392.5 16.5 404.3 16.8 414 22C423.7 27.2 435.3 36.2 443 47C450.7 57.8 456.5 72 460 87C463.5 102 464.8 118.8 464 137C463.2 155.2 459.5 179.5 455 196C450.5 212.5 444.5 225.5 437 236C429.5 246.5 421.3 254.2 410 259C398.7 263.8 382.5 266 369 265C355.5 264 339.5 258.7 329 253C318.5 247.3 311.7 239.7 306 231C300.3 222.3 297 212.7 295 201C293 189.3 292.5 175.8 294 161C295.5 146.2 298.2 129.5 304 112C309.8 94.5 321.2 69.7 329 56C336.8 42.3 344.3 36.2 351 30C357.7 23.8 363.3 21.3 369 19C374.7 16.7 377.5 15.5 385 16Z M384 48C376.8 49.8 368 57.7 362 64C356 70.3 352.7 76.3 348 86C343.3 95.7 337.7 109.2 334 122C330.3 134.8 327.3 151.2 326 163C324.7 174.8 324.8 184.5 326 193C327.2 201.5 329.8 208.5 333 214C336.2 219.5 339.3 222.8 345 226C350.7 229.2 358.3 232.3 367 233C375.7 233.7 389.5 232.7 397 230C404.5 227.3 407.5 223.7 412 217C416.5 210.3 420.7 202.3 424 190C427.3 177.7 431 158.2 432 143C433 127.8 432 111.2 430 99C428 86.8 424.2 77.7 420 70C415.8 62.3 411 56.7 405 53C399 49.3 391.2 46.2 384 48Z M119 112C127 110.2 130.2 111.5 136 113C141.8 114.5 146.8 115.5 154 121C161.2 126.5 170.7 133.7 179 146C187.3 158.3 197.5 176 204 195C210.5 214 216 242.3 218 260C220 277.7 218.5 289.2 216 301C213.5 312.8 209 322.7 203 331C197 339.3 189.8 346 180 351C170.2 356 155.7 359.8 144 361C132.3 362.2 121.2 362.3 110 358C98.8 353.7 85.5 344.7 77 335C68.5 325.3 63.7 314.5 59 300C54.3 285.5 50.5 265.7 49 248C47.5 230.3 47.3 210.3 50 194C52.7 177.7 58.7 161.7 65 150C71.3 138.3 79 130.3 88 124C97 117.7 111 113.8 119 112Z M122 144C115.7 144.8 106.7 149 101 154C95.3 159 91.5 164.8 88 174C84.5 183.2 81 195.2 80 209C79 222.8 80 242.3 82 257C84 271.7 88.2 286.7 92 297C95.8 307.3 100.3 313.8 105 319C109.7 324.2 113.3 326.3 120 328C126.7 329.7 137.5 329.8 145 329C152.5 328.2 159.2 326.3 165 323C170.8 319.7 176.5 314.7 180 309C183.5 303.3 185.2 298.7 186 289C186.8 279.3 186.3 262.7 185 251C183.7 239.3 182 231.3 178 219C174 206.7 167.5 188.7 161 177C154.5 165.3 145.5 154.5 139 149C132.5 143.5 128.3 143.2 122 144Z M302 271C308.3 269.2 308 268.8 321 271C334 273.2 367.3 280.5 380 284C392.7 287.5 392.3 288.7 397 292C401.7 295.3 405.5 300 408 304C410.5 308 412 308.5 412 316C412 323.5 410.7 339.8 408 349C405.3 358.2 401.8 364 396 371C390.2 378 381.5 386.2 373 391C364.5 395.8 353.3 398.8 345 400C336.7 401.2 330.5 400.3 323 398C315.5 395.7 306.7 391.3 300 386C293.3 380.7 287.5 374.2 283 366C278.5 357.8 274.7 347 273 337C271.3 327 271.3 315.2 273 306C274.7 296.8 278.2 287.8 283 282C287.8 276.2 295.7 272.8 302 271Z M310 302C297.8 300.3 306 302.5 305 307C304 311.5 303.2 322 304 329C304.8 336 307.5 343.7 310 349C312.5 354.3 315.8 358 319 361C322.2 364 324.8 365.8 329 367C333.2 368.2 337.3 370.2 344 368C350.7 365.8 363 359.8 369 354C375 348.2 378.5 339.2 380 333C381.5 326.8 389.7 322.2 378 317C366.3 311.8 322.2 303.7 310 302Z M191 367C205.3 364.8 207 365.3 214 368C221 370.7 228.5 374.5 233 383C237.5 391.5 240.3 409.2 241 419C241.7 428.8 240.2 433.2 237 442C233.8 450.8 227.5 464.3 222 472C216.5 479.7 211.3 484 204 488C196.7 492 186.5 495.2 178 496C169.5 496.8 162 496.3 153 493C144 489.7 131.2 481.8 124 476C116.8 470.2 114 465.7 110 458C106 450.3 101.3 438.8 100 430C98.7 421.2 100 411.7 102 405C104 398.3 107.7 394 112 390C116.3 386 114.8 384.8 128 381C141.2 377.2 176.7 369.2 191 367Z M200 398C187.7 399.7 144.3 409 133 414C121.7 419 130.3 422 132 428C133.7 434 137.2 444 143 450C148.8 456 161 461.7 167 464C173 466.3 174.5 465.3 179 464C183.5 462.7 189.2 462.3 194 456C198.8 449.7 205.8 434.7 208 426C210.2 417.3 208.3 408.7 207 404C205.7 399.3 212.3 396.3 200 398Z" />
                      </svg>
                      {t("cadastru.nearbyWalk", {
                        minutes: place.walking_duration_min,
                        distance: formatDistance.format(place.walking_distance_m),
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {nearby?.cache?.stale ? <p className="mt-5 text-xs text-gray-500">{t("cadastru.nearbyStale")}</p> : null}
      {nearby?.incomplete ? <p className="mt-5 text-xs text-gray-500">{t("cadastru.nearbyIncomplete")}</p> : null}
      {nearby ? (
        <p className="mt-6 text-xs text-gray-400">
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-700 hover:underline">
            {nearby.attribution || "© OpenStreetMap contributors"}
          </a>
        </p>
      ) : null}
    </section>
  );
}
