import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { rateLimit } from "@/lib/rate-limit";
import { getPaddleProduct, isValidPaddlePriceId } from "@/lib/paddle-products";
import {
  buildPaddleCustomerSnapshot,
  createPaddleTransaction,
  extractPaddleTransactionSummary,
  getPaddleCheckoutUrl,
  normalizePaddleLang,
} from "@/lib/paddle";

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

function getDebugDetails(error) {
  if (process.env.NODE_ENV === "production") return undefined;

  const message = String(error?.message || "").trim();
  return message ? message.slice(0, 500) : undefined;
}

async function getRequestUser(request) {
  const token = getBearerToken(request);
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user;
}

async function createPendingOrder({ userId, product, lang, customer, requestPayload }) {
  const { data, error } = await supabaseAdmin
    .from("paddle_payment_orders")
    .insert({
      user_id: userId,
      product_key: product.key,
      paddle_price_id: product.priceId,
      status: "pending",
      language: lang,
      customer_snapshot: customer,
      request_payload: requestPayload,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message || "Failed to create Paddle payment order");
  }

  return data;
}

async function markOrderFailed(orderId, errorMessage) {
  await supabaseAdmin
    .from("paddle_payment_orders")
    .update({
      status: "failed",
      response_payload: { error: String(errorMessage || "Paddle transaction creation failed").slice(0, 500) },
    })
    .eq("id", orderId);
}

function buildPaddleTransactionPayload({ order, product, user, customer }) {
  const payload = {
    collection_mode: "automatic",
    items: [
      {
        price_id: product.priceId,
        quantity: 1,
      },
    ],
    custom_data: {
      catdai_order_id: order.id,
      catdai_user_id: user.id,
      product_key: product.key,
    },
  };

  if (customer.email) {
    payload.custom_data.catdai_user_email = customer.email;
  }

  return payload;
}

function isOneTimePaddleTransaction(transaction, product) {
  if (transaction?.subscription_id) return false;
  if (!Array.isArray(transaction?.items) || transaction.items.length === 0) return false;

  return transaction.items.every((item) => {
    const price = item?.price || {};
    return price.id === product.priceId && price.billing_cycle == null;
  });
}

function buildCheckoutUrl(request, orderId, transactionId) {
  const checkoutUrl = getPaddleCheckoutUrl();
  const url = new URL(checkoutUrl || "/payment/paddle/checkout", request.url);
  url.searchParams.set("order_id", orderId);
  url.searchParams.set("_ptxn", transactionId);
  return url.toString();
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

  const product = getPaddleProduct(body?.product_key);
  if (!product) {
    return NextResponse.json({ error: "Unknown payment product." }, { status: 400 });
  }

  if (!isValidPaddlePriceId(product.priceId)) {
    return NextResponse.json(
      { error: `Paddle price is not configured for ${product.key}.` },
      { status: 500 }
    );
  }

  const lang = normalizePaddleLang(body?.lang);
  const customer = buildPaddleCustomerSnapshot(user, body?.customer || {});
  let order;
  try {
    order = await createPendingOrder({
      userId: user.id,
      product,
      lang,
      customer,
      requestPayload: {
        product_key: product.key,
        paddle_price_id: product.priceId,
        lang,
      },
    });
  } catch (error) {
    const details = getDebugDetails(error);
    console.error("[paddle-create] order create failed:", error.message);
    return NextResponse.json(
      details
        ? { error: "Paddle payment order creation failed.", details }
        : { error: "Paddle payment order creation failed." },
      { status: 500 }
    );
  }

  let transactionPayload;
  let paddleRegistration;
  try {
    transactionPayload = buildPaddleTransactionPayload({ order, product, user, customer });
    paddleRegistration = await createPaddleTransaction(transactionPayload);
  } catch (error) {
    await markOrderFailed(order.id, error.message);
    const details = getDebugDetails(error);
    console.error("[paddle-create] transaction failed:", error.message);
    return NextResponse.json(
      details
        ? { error: "Paddle transaction creation failed.", details }
        : { error: "Paddle transaction creation failed." },
      { status: 502 }
    );
  }

  if (!isOneTimePaddleTransaction(paddleRegistration.transaction, product)) {
    await markOrderFailed(order.id, "Paddle transaction contains recurring items");
    return NextResponse.json(
      { error: `Paddle price for ${product.key} must be a one-time price.` },
      { status: 500 }
    );
  }

  const summary = extractPaddleTransactionSummary(paddleRegistration.transaction);
  const checkoutUrl = summary.checkoutUrl || buildCheckoutUrl(request, order.id, summary.transactionId);
  const { error: updateError } = await supabaseAdmin
    .from("paddle_payment_orders")
    .update({
      status: "registered",
      paddle_transaction_id: summary.transactionId,
      paddle_checkout_url: checkoutUrl,
      amount_minor: summary.amountMinor,
      currency_code: summary.currencyCode,
      request_payload: transactionPayload,
      response_payload: paddleRegistration.raw,
    })
    .eq("id", order.id);

  if (updateError) {
    console.error("[paddle-create] order update failed:", updateError.message);
    return NextResponse.json({ error: "Paddle payment order update failed." }, { status: 500 });
  }

  return NextResponse.json({
    order_id: order.id,
    product_key: product.key,
    paddle_transaction_id: summary.transactionId,
    checkout: {
      url: checkoutUrl,
      transaction_id: summary.transactionId,
    },
  });
}
