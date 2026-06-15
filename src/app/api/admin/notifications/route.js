import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { rateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";

const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 1000;
const PAGE = 1000;
const INSERT_CHUNK_SIZE = 500;
const DEVELOPMENT_BROADCAST_EMAILS = new Set([
  "catdai.info@gmail.com",
  "iamdevandrei@gmail.com",
]);
const limiter = rateLimit({ interval: 60_000, limit: 20 });

function getClientIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || request.ip || "unknown";
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, maxLength);
}

async function listAllUsers() {
  let users = [];
  let page = 1;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw new Error(`listUsers failed: ${error.message}`);

    const chunk = data?.users || [];
    users = users.concat(chunk);
    if (chunk.length < PAGE) break;
    page += 1;
  }

  return users;
}

function chunkRows(rows, size) {
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function filterBroadcastUsers(users) {
  if (process.env.NODE_ENV !== "development") return users;

  return users.filter((user) =>
    DEVELOPMENT_BROADCAST_EMAILS.has(String(user?.email || "").trim().toLowerCase())
  );
}

export async function POST(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  const limit = limiter.check(getClientIp(request));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many notification requests." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const userId = cleanText(body?.userId, 80);
  const title = cleanText(body?.title, MAX_TITLE_LENGTH);
  const message = cleanText(body?.message ?? body?.body, MAX_BODY_LENGTH);
  const audience = cleanText(body?.audience, 20);

  if (!title || !message) {
    return NextResponse.json({ error: "Missing title or message." }, { status: 400 });
  }

  if (audience === "all") {
    let users = [];
    try {
      users = await listAllUsers();
    } catch (err) {
      console.error("[admin-notifications] list users failed:", err.message);
      return NextResponse.json({ error: "Failed to load users." }, { status: 500 });
    }

    const broadcastUsers = filterBroadcastUsers(users);
    const userIds = [...new Set(broadcastUsers.map((user) => user?.id).filter(Boolean))];
    if (userIds.length === 0) {
      return NextResponse.json({ error: "No users found." }, { status: 404 });
    }

    const rows = userIds.map((id) => ({
      user_id: id,
      title,
      body: message,
      source: "admin",
    }));

    for (const chunk of chunkRows(rows, INSERT_CHUNK_SIZE)) {
      const { error } = await supabaseAdmin.from("user_notifications").insert(chunk);
      if (error) {
        console.error("[admin-notifications] broadcast failed:", error.message);
        return NextResponse.json({ error: "Failed to create notifications." }, { status: 500 });
      }
    }

    return NextResponse.json({ createdCount: rows.length }, { status: 201 });
  }

  if (!userId) {
    return NextResponse.json({ error: "Missing userId." }, { status: 400 });
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (userError || !userData?.user?.id) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("user_notifications")
    .insert({
      user_id: userId,
      title,
      body: message,
      source: "admin",
    })
    .select("id, user_id, title, body, source, created_at")
    .single();

  if (error) {
    console.error("[admin-notifications] create failed:", error.message);
    return NextResponse.json({ error: "Failed to create notification." }, { status: 500 });
  }

  return NextResponse.json({ notification: data }, { status: 201 });
}
