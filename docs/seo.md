# SEO (status curent)

## Ce este implementat
- `robots.txt` generat dinamic din `src/app/robots.js`.
- `sitemap.xml` generat dinamic din `src/app/sitemap.js`.
- `metadataBase` + canonical pentru URL-uri curate:
  - global în `src/app/layout.js`
  - pe pagini dinamice `/imobil/[slug]` în `src/app/imobil/[slug]/page.js`
- metadata specifică pe paginile statice:
  - `/about`, `/terms`, `/privacy` prin route layouts dedicate
- `noindex, nofollow` pe rute private/utilitare prin header `X-Robots-Tag`:
  - `/admin/:path*`
  - `/profile/:path*`
  - `/evaluare/:path*`
  - `/api/:path*`
  - configurate în `next.config.mjs`
- JSON-LD (structured data):
  - global: `Organization` + `WebSite` în `src/app/layout.js`
  - dinamic: `BreadcrumbList` + `WebPage` în `src/app/imobil/[slug]/page.js`
  - static: `AboutPage` în `src/app/about/layout.js`

## Cum funcționează (pe scurt)
- URL-ul canonic este centralizat în `src/lib/seo.js` (`getCanonicalSiteUrl`).
- `robots.txt` permite indexarea publică și blochează zonele private.
- `sitemap.xml` include:
  - pagini statice indexabile (`/`, `/about`, `/terms`, `/privacy`)
  - pagini dinamice `/imobil/{slug}` din tabela `shared_links`.
- canonical evită duplicatele SEO pentru aceeași pagină.
- JSON-LD ajută motoarele de căutare să înțeleagă entitatea (`Organization`),
  site-ul (`WebSite`) și contextul paginii (breadcrumb + webpage).

## Notă de mentenanță
- Dacă schimbi domeniul, actualizează variabila de mediu (`NEXT_PUBLIC_SITE_URL` sau `NEXT_PUBLIC_APP_URL` / `APP_URL`).
- Dacă adaugi rute publice noi, include-le în sitemap.
- Dacă adaugi rute private noi, pune-le în `noindex` + `robots disallow`.
