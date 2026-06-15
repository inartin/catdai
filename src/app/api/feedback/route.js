import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { resolveAccessTier } from "@/lib/access-tier";
import { supabaseAdmin } from "@/lib/supabase-admin";

const MAX_MESSAGE_LENGTH = 500;
const MAX_EMAIL_LENGTH = 120;
const MAX_PHONE_LENGTH = 60;
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const MAX_IMAGE_BASE64_LENGTH = Math.ceil(MAX_IMAGE_SIZE / 3) * 4;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const limiter = rateLimit({ interval: 60_000, limit: 10 });

function getClientIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || request.ip || "unknown";
}

function cleanMessage(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, MAX_MESSAGE_LENGTH);
}

function cleanOptionalText(value, maxLength) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, maxLength);
  return cleaned || null;
}

function isValidEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function cleanFileName(value) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return cleaned || null;
}

function matchesImageSignature(buffer, type) {
  if (type === "image/jpeg") {
    return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (type === "image/png") {
    return buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }

  if (type === "image/webp") {
    return buffer.length > 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }

  if (type === "image/gif") {
    const signature = buffer.subarray(0, 6).toString("ascii");
    return signature === "GIF87a" || signature === "GIF89a";
  }

  return false;
}

function normalizeImage(image) {
  if (!image) return null;

  if (typeof image !== "object" || Array.isArray(image)) {
    throw new Error("Invalid image.");
  }

  const type = typeof image.type === "string" ? image.type.toLowerCase() : "";
  const name = cleanFileName(image.name);
  const declaredSize = Number(image.size);
  const data = typeof image.data === "string" ? image.data : "";
  const prefix = `data:${type};base64,`;

  if (!ALLOWED_IMAGE_TYPES.has(type)) {
    throw new Error("Unsupported image type.");
  }

  if (!Number.isFinite(declaredSize) || declaredSize < 0 || declaredSize > MAX_IMAGE_SIZE) {
    throw new Error("Image is too large.");
  }

  if (!data.startsWith(prefix)) {
    throw new Error("Invalid image data.");
  }

  const base64 = data.slice(prefix.length);
  if (base64.length > MAX_IMAGE_BASE64_LENGTH || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new Error("Invalid image data.");
  }

  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_SIZE) {
    throw new Error("Image is too large.");
  }

  if (!matchesImageSignature(buffer, type)) {
    throw new Error("Invalid image content.");
  }

  return {
    name,
    type,
    size: buffer.length,
    data: base64,
  };
}

export async function POST(request) {
  const limit = limiter.check(getClientIp(request));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many feedback submissions." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const contactEmail = cleanOptionalText(body.contact_email, MAX_EMAIL_LENGTH);
  const contactPhone = cleanOptionalText(body.contact_phone, MAX_PHONE_LENGTH);
  const isPricingCustomRequest = body.kind === "pricing_custom_request";
  if (contactEmail && !isValidEmail(contactEmail)) {
    return NextResponse.json({ error: "Invalid email." }, { status: 400 });
  }

  const access = await resolveAccessTier(request);
  if (!access.user_id && (!isPricingCustomRequest || !contactEmail)) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  if (!access.user_id && body.image) {
    return NextResponse.json({ error: "Authentication required for image uploads." }, { status: 401 });
  }

  const message = cleanMessage(body.message);
  if (!message) {
    return NextResponse.json({ error: "Feedback message is required." }, { status: 400 });
  }

  let image = null;
  try {
    image = normalizeImage(body.image);
  } catch (imageError) {
    return NextResponse.json({ error: imageError.message }, { status: 400 });
  }

  const insertPayload = {
    user_id: access.user_id || null,
    message,
    image_name: image?.name || null,
    image_type: image?.type || null,
    image_size: image?.size || null,
    image_data: image?.data || null,
  };

  if (contactEmail) {
    insertPayload.message = [
      message,
      "",
      `Email: ${contactEmail}`,
      ...(contactPhone ? [`Telefon: ${contactPhone}`] : []),
    ].join("\n").slice(0, MAX_MESSAGE_LENGTH);
  }

  let { error } = await supabaseAdmin.from("user_feedback").insert({
    ...insertPayload,
    contact_email: contactEmail,
    contact_phone: contactPhone,
  });

  if (error?.message?.includes("Could not find") && error.message.includes("contact_email")) {
    ({ error } = await supabaseAdmin.from("user_feedback").insert(insertPayload));
  }

  if (error) {
    console.error("[feedback] insert failed:", error.message);
    return NextResponse.json({ error: "Failed to submit feedback." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
