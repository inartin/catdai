# News

## Stage
Admin storage, CRUD UI, public listing, and public detail pages are prepared.

## Data
- News rows live in `news_posts`.
- Fields are `slug`, `title`, `description`, `cover_image_url`, and `created_at`.
- `cover_image_url` is stored as text and is expected to be an image link.
- `description` stores sanitized rich article HTML created in the admin editor.
- Slugs are generated from the title at creation time and stored so article URLs stay stable after edits.
- If the current database has not been migrated with the `slug` column yet, the app derives the public URL slug from the current title.
- External news images are allowed by CSP through `img-src https:`.
- RLS blocks direct public table access; public pages and admin API routes read through server-side `SUPABASE_SERVICE_KEY`.

## Admin
- `/admin/news` is linked from the admin sidebar.
- Admins can list news, create a news item, edit title/rich description/cover image link, and remove news.
- The rich content editor uses Quill with headings, bold, italic, underline, ordered/bullet lists, links, image URL insertion, and clear formatting.
- Admin API routes sanitize rich content with `sanitize-html` before writing it to `news_posts`.
- Admin rows show the stable public URL `/noutati/[slug]`.
- Cover image links can be pasted from `/admin/uploads`, which returns the public Supabase Storage URL for a public bucket.
- `POST /api/admin/news` creates rows.
- `PATCH /api/admin/news/[id]` updates rows.
- `DELETE /api/admin/news/[id]` removes rows.

## Public Pages
- `/noutati` server-renders all news rows as linked cards with cover image and title.
- `/noutati/[slug]` server-renders an individual news article with sanitized rich HTML, a back link to `/noutati`, and a right sidebar with up to 5 latest other news items in the relevant-listings card style.
- News detail pages use narrower mobile padding and mobile article type, and sanitized article HTML normalizes non-breaking spaces so admin-authored paragraphs can wrap within the viewport.
- `sitemap.xml` includes every news detail URL with `created_at` as `lastModified`.
- Static page chrome and list-page metadata on `/noutati` and `/noutati/[slug]` use the active UI language from the URL prefix or `catdai-lang` cookie, while database news title/body content stays exactly as stored in `news_posts`.

## Related Files
- `src/app/admin/news/page.js`
- `src/components/admin/RichTextEditor.js`
- `src/app/noutati/page.js`
- `src/app/noutati/layout.js`
- `src/app/noutati/[slug]/page.js`
- `src/lib/news-content.js`
- `src/app/api/admin/news/route.js`
- `src/app/api/admin/news/[id]/route.js`
- `src/components/admin/AdminSidebar.js`
- `src/lib/news-posts.js`
- `src/app/sitemap.js`
- `db/news_posts.sql`
