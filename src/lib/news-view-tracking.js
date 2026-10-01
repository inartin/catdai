// Serialize view requests in this tab so simultaneous mounts cannot create
// multiple visitor cookies before the browser has accepted the first one.
let pendingView = Promise.resolve();

async function sendView(postId) {
  const response = await fetch("/api/news/views", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ post_id: postId }),
  });
  return response.ok ? response.json() : null;
}

export function recordNewsView(postId) {
  pendingView = pendingView.catch(() => null).then(async () => {
    const payload = await sendView(postId);
    if (!payload?.cookie_required) return payload;
    // One retry after Set-Cookie. If cookies are blocked, do not count a view
    // or retry indefinitely with a new identity on every request.
    const retry = await sendView(postId);
    return retry?.cookie_required ? null : retry;
  });
  return pendingView;
}
