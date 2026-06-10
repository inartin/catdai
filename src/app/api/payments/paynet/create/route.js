import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { rateLimit } from "@/lib/rate-limit";
import { getPaynetProduct, buildPaynetService } from "@/lib/paynet-products";
import {
  buildPaynetCustomer,
  getPaynetAcquiringUrl,
  getPaynetExpiryDate,
  getPaynetMerchantCode,
  normalizePaynetLang,
  registerPaynetPayment,
  toPaynetIsoDate,
} from "@/lib/paynet";
import { toAbsoluteUrl } from "@/lib/seo";

const limiter = rateLimit({ interval: 60_000, limit: 10 });

function getClientIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || request.ip || "unknown";
}

function getBearerToken(request) {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;
  const [scheme, token] = authorization.split(" ");
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return token.trim();
}

async function getRequestUser(request) {
  const token = getBearerToken(request);
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user;
}

function cleanReturnPath(value) {
  const raw = String(value || "").trim();
  if (!raw || !raw.startsWith("/")) return "";
  if (raw.startsWith("//") || raw.startsWith("/api/")) return "";
  return raw.slice(0, 300);
}

function buildReturnUrl(path, fallbackPath, invoiceNo) {
  const targetPath = cleanReturnPath(path) || fallbackPath;
  const url = new URL(toAbsoluteUrl(targetPath));
  url.searchParams.set("invoice", String(invoiceNo));
  return url.toString();
}

async function createPendingOrder({ userId, product, lang, customer, requestPayload }) {
  const { data, error } = await supabaseAdmin
    .from("payment_orders")
    .insert({
      user_id: userId,
      product_key: product.key,
      amount_minor: product.amountMinor,
      currency: product.currency,
      status: "pending",
      language: lang,
      customer_snapshot: customer,
      request_payload: requestPayload,
    })
    .select("id, invoice_no")
    .single();

  if (error || !data?.id || !data?.invoice_no) {
    throw new Error(error?.message || "Failed to create payment order");
  }

  return data;
}

async function markOrderFailed(orderId, errorMessage) {
  await supabaseAdmin
    .from("payment_orders")
    .update({
      status: "failed",
      response_payload: { error: String(errorMessage || "Payment registration failed").slice(0, 500) },
    })
    .eq("id", orderId);
}

export async function POST(request) {
  const limit = limiter.check(getClientIp(request));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many payment attempts." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const product = getPaynetProduct(body?.product_key);
  if (!product) {
    return NextResponse.json({ error: "Unknown payment product." }, { status: 400 });
  }

  const lang = normalizePaynetLang(body?.lang);
  const customer = buildPaynetCustomer(user, body?.customer || {});
  const expiryDate = getPaynetExpiryDate();
  const order = await createPendingOrder({
    userId: user.id,
    product,
    lang,
    customer,
    requestPayload: {
      product_key: product.key,
      amount_minor: product.amountMinor,
      currency: product.currency,
      lang,
    },
  });

  const linkSuccess = buildReturnUrl(body?.success_path, "/payment/paynet/success", order.invoice_no);
  const linkCancel = buildReturnUrl(body?.cancel_path, "/payment/paynet/cancel", order.invoice_no);

  let paymentPayload;
  let paynetRegistration;
  try {
    paymentPayload = {
      Invoice: order.invoice_no,
      MerchantCode: getPaynetMerchantCode(),
      LinkUrlSuccess: linkSuccess,
      LinkUrlCancel: linkCancel,
      Signature: null,
      SignVersion: "v01",
      Customer: customer,
      Payer: null,
      Currency: product.currency,
      ExternalDate: toPaynetIsoDate(),
      ExpiryDate: expiryDate,
      Services: [buildPaynetService(product)],
      MoneyType: null,
      Lang: lang,
    };
    paynetRegistration = await registerPaynetPayment(paymentPayload);
  } catch (error) {
    await markOrderFailed(order.id, error.message);
    console.error("[paynet-create] registration failed:", error.message);
    return NextResponse.json({ error: "Payment registration failed." }, { status: 502 });
  }

  const { error: updateError } = await supabaseAdmin
    .from("payment_orders")
    .update({
      status: "registered",
      paynet_payment_id: paynetRegistration.paymentId,
      paynet_signature: paynetRegistration.signature,
      paynet_registered_at: new Date().toISOString(),
      expires_at: new Date(`${expiryDate}Z`).toISOString(),
      request_payload: paymentPayload,
      response_payload: paynetRegistration.raw,
    })
    .eq("id", order.id);

  if (updateError) {
    console.error("[paynet-create] order update failed:", updateError.message);
    return NextResponse.json({ error: "Payment order update failed." }, { status: 500 });
  }

  return NextResponse.json({
    order_id: order.id,
    invoice_no: order.invoice_no,
    product_key: product.key,
    amount_minor: product.amountMinor,
    currency: product.currency,
    redirect: {
      method: "POST",
      url: getPaynetAcquiringUrl(),
      fields: {
        operation: String(paynetRegistration.paymentId),
        LinkUrlSucces: linkSuccess,
        LinkUrlCancel: linkCancel,
        ExpiryDate: expiryDate,
        Signature: paynetRegistration.signature,
        Lang: lang,
      },
    },
  });
}
