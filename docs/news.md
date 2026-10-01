# News

## Stage
Admin storage, CRUD UI, public listing, and public detail pages are prepared.

## Data
- News rows live in `news_posts`.
- Fields are `slug`, `title`, `description`, `cover_image_url`, and `created_at`.
- Authenticated article upvotes live in `news_post_upvotes` with one row per `news_post_id + user_id`.
- Unique article views live in `news_post_views`, with a database primary key on `(news_post_id, visitor_id)` to prevent repeat/concurrent views from incrementing the count. Apply `db/news_post_views.sql` before deploying; counts start at zero, with no historical backfill.
- Views use a server-generated UUID in the signed `catdai-news-visitor` cookie. It is HttpOnly, SameSite=Lax, Secure over HTTPS, scoped to `/api/news/views`, and renewed for one year on successful tracking. Uniqueness is per browser per article, including anonymous readers; accounts are not linked. Other browsers/devices, cookie expiry, or clearing cookies create a new visitor.
- Cookie signatures use HMAC-SHA256 with `NEWS_VIEW_COOKIE_SECRET` when configured, otherwise the existing server-only `SUPABASE_SERVICE_KEY`, with a news-specific signing prefix. Keep the chosen secret stable; changing it invalidates existing visitor cookies. The API ignores any submitted visitor ID.
- View rows and the `news_post_view_counts` aggregate RPC are accessible only to the server service role. Counts aggregate in PostgreSQL rather than fetching individual rows, avoiding PostgREST row-limit truncation.
- `cover_image_url` is stored as text and is expected to be an image link.
- `description` stores sanitized rich article HTML created in the admin editor.
- Slugs are generated from the title at creation time and stored so article URLs stay stable after edits.
- If the current database has not been migrated with the `slug` column yet, the app derives the public URL slug from the current title.
- External news images are allowed by CSP through `img-src https:`.
- RLS blocks direct public table access; public pages and admin API routes read through server-side `SUPABASE_SERVICE_KEY`.
- `news_post_upvotes` has a unique `(news_post_id, user_id)` constraint so a user can upvote each article only once.

## Admin
- `/admin/news` is linked from the admin sidebar.
- Admins can list news, create a news item, edit title/rich description/cover image link, and remove news.
- The rich content editor uses Tiptap with headings, bold, italic, underline, ordered/bullet lists, custom ordered-list start/item numbers, public marker fallback for custom item numbers, links, image URL insertion, small/medium/large/full image sizing, left/center/right image alignment, and clear formatting.
- Admin API routes sanitize rich content with `sanitize-html` before writing it to `news_posts`.
- Admin rows show the stable public URL `/noutati/[slug]`.
- Cover image links can be pasted from `/admin/uploads`, which returns the public Supabase Storage URL for a public bucket.
- `POST /api/admin/news` creates rows.
- `PATCH /api/admin/news/[id]` updates rows.
- `DELETE /api/admin/news/[id]` removes rows.

## Public Pages
- `/noutati` server-renders all news rows as linked cards with cover image and title.
- `/noutati` and `/noutati/[slug]` show article upvote counters.
- An eye icon with the unique view count appears beside upvotes on news cards, article headers, and latest-news cards, with RO/RU accessible labels.
- `POST /api/news/views` records a view only after the article is opened in a visible browser tab and returns the current total. List impressions, server renders, metadata generation, and link prefetches do not add views. Repeated opens are deduplicated by the database.
- The first tracking request establishes the cookie without writing a view; one background retry confirms the browser accepts cookies and records the view. Later visits use one request. Requests are serialized within a tab to avoid duplicate cookie issuance on simultaneous mounts. Cookie-blocked browsers skip tracking after the one retry. Article rendering does not wait for tracking.
- View writes follow runtime persistence rules: production or `ENABLE_RUNTIME_PERSISTENCE=true`. Default local development reads counts without adding views. The endpoint validates IDs, checks request origin, and rate-limits requests; this is a browser-based readership metric, not fraud-proof identity tracking.
- Origin checks accept the request URL origin and configured canonical site origin (`src/lib/seo.js`), so the public HTTPS site works when a reverse proxy forwards to an internal HTTP URL. Foreign origins remain rejected.
- The open article updates its eye counter when the tracking request returns the current total. The news list and latest-news cards read totals on page load; they do not poll for other readers' views. Reopening an article with the same visitor cookie returns the total without incrementing it.
- `/noutati/[slug]` server-renders an individual news article with sanitized rich HTML, a back link to `/noutati`, a top-page upvote button, and a right sidebar with up to 5 latest other news items in the relevant-listings card style.
- `GET /api/news/upvotes?post_id=...` returns the public count and, for authenticated users, their upvote status.
- `POST /api/news/upvotes` requires a bearer token and inserts one upvote for the authenticated user.
- The article upvote action refreshes the Supabase session once and retries if production rejects the first bearer token. The same-origin request also includes the access token in the JSON body so production proxy/header handling cannot drop auth only for this action.
- Article body images on `/noutati/[slug]` open in a full-size lightbox when clicked.
- News detail pages use narrower mobile padding and mobile article type, and sanitized article HTML normalizes non-breaking spaces so admin-authored paragraphs can wrap within the viewport.
- `sitemap.xml` includes every news detail URL with `created_at` as `lastModified`.
- Static page chrome and list-page metadata on `/noutati` and `/noutati/[slug]` use the active UI language from the URL prefix or `catdai-lang` cookie, while database news title/body content stays exactly as stored in `news_posts`.

## Related Files
- `src/app/admin/news/page.js`
- `src/components/admin/RichTextEditor.js`
- `src/app/noutati/page.js`
- `src/app/noutati/layout.js`
- `src/app/noutati/[slug]/page.js`
- `src/app/noutati/[slug]/NewsPostPageContent.js`
- `src/app/api/news/upvotes/route.js`
- `src/lib/news-content.js`
- `src/lib/news-upvotes.js`
- `src/app/api/admin/news/route.js`
- `src/app/api/admin/news/[id]/route.js`
- `src/components/admin/AdminSidebar.js`
- `src/lib/news-posts.js`
- `src/app/sitemap.js`
- `db/news_posts.sql`
- `db/news_post_upvotes.sql`
- `db/news_post_views.sql`
- `src/lib/news-views.js`
- `src/components/NewsViewCount.js`
- `src/app/api/news/views/route.js`
- `src/lib/news-visitor-cookie.js`
- `src/lib/news-view-tracking.js`
