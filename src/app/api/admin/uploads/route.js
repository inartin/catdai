import crypto from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const STORAGE_BUCKET = process.env.SUPABASE_IMAGE_BUCKET || "img";
const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

function cleanFileName(value) {
  const cleaned = String(value || "image")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 90)
    .replace(/^_+|_+$/g, "");

  return cleaned || "image";
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

function buildStoragePath(file) {
  const type = String(file.type || "").toLowerCase();
  const fallbackExt = ALLOWED_IMAGE_TYPES.get(type);
  const originalName = cleanFileName(file.name || `image.${fallbackExt}`);
  const parsed = path.parse(originalName);
  const baseName = cleanFileName(parsed.name).slice(0, 70);
  const suffix = crypto.randomBytes(6).toString("hex");

  return `${Date.now()}-${suffix}-${baseName}.${fallbackExt}`;
}

export async function POST(request) {
  const unauthorized = requireAdminApiAuth(request);
  if (unauthorized) return unauthorized;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");

  if (!file || typeof file !== "object" || typeof file.arrayBuffer !== "function") {
    return NextResponse.json({ error: "Image file is required." }, { status: 400 });
  }

  const type = String(file.type || "").toLowerCase();
  const size = Number(file.size);

  if (!ALLOWED_IMAGE_TYPES.has(type)) {
    return NextResponse.json({ error: "Unsupported image type." }, { status: 400 });
  }

  if (!Number.isFinite(size) || size <= 0 || size > MAX_IMAGE_SIZE) {
    return NextResponse.json({ error: "Image must be 5 MB or smaller." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (buffer.length === 0 || buffer.length > MAX_IMAGE_SIZE) {
    return NextResponse.json({ error: "Image must be 5 MB or smaller." }, { status: 400 });
  }

  if (!matchesImageSignature(buffer, type)) {
    return NextResponse.json({ error: "Invalid image content." }, { status: 400 });
  }

  const storagePath = buildStoragePath(file);
  const { data, error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: type,
      cacheControl: "31536000",
      upsert: false,
    });

  if (error) {
    console.error("[admin-uploads] upload failed:", error.message);
    return NextResponse.json({ error: "Failed to upload image." }, { status: 500 });
  }

  const { data: publicData } = supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(data.path);

  if (!publicData?.publicUrl) {
    return NextResponse.json({ error: "Failed to create public URL." }, { status: 500 });
  }

  return NextResponse.json({
    path: data.path,
    public_url: publicData.publicUrl,
  }, { status: 201 });
}
