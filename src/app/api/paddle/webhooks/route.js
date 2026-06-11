import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getPaddleWebhookEventFields, isValidPaddleWebhookSignature } from "@/lib/paddle";
import { mapPaddleProductGrants } from "@/lib/paddle-products";

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

async function findOrder(fields) {
  if (isUuid(fields.orderId)) {
    const { data, error } = await supabaseAdmin
      .from("paddle_payment_orders")
      .select("id, user_id, product_key, status, paddle_price_id, paddle_transaction_id")
      .eq("id", fields.orderId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data) return data;
  }

  if (fields.transactionId) {
    const { data, error } = await supabaseAdmin
      .from("paddle_payment_orders")
      .select("id, user_id, product_key, status, paddle_price_id, paddle_transaction_id")
      .eq("paddle_transaction_id", fields.transactionId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data || null;
  }

  return null;
}

async function insertWebhookEvent({ fields, signatureHeader, signatureValid, payload, orderId = null, processingError = null }) {
  const { data, error } = await supabaseAdmin
    .from("paddle_webhook_events")
    .insert({
      event_id: fields.eventId,
      event_type: fields.eventType,
      notification_id: fields.notificationId,
      occurred_at: fields.occurredAt,
      order_id: orderId,
      paddle_transaction_id: fields.transactionId,
      signature_header: signatureHeader,
      signature_valid: signatureValid,
      payload,
      processed_at: null,
      processing_error: processingError,
    })
    .select("id, processing_error, processed_at")
    .single();

  if (error) {
    if (error.code === "23505" && fields.eventId) {
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("paddle_webhook_events")
        .select("id, processing_error, processed_at")
        .eq("event_id", fields.eventId)
        .maybeSingle();

      if (existingError) throw new Error(existingError.message);

      return {
        duplicate: true,
        id: existing?.id || null,
        processingError: existing?.processing_error || null,
        processedAt: existing?.processed_at || null,
      };
    }
    throw new Error(error.message);
  }

  return {
    duplicate: false,
    id: data?.id || null,
    processingError: data?.processing_error || null,
    processedAt: data?.processed_at || null,
  };
}

async function markWebhookProcessed(webhookId) {
  if (!webhookId) return;

  const { error } = await supabaseAdmin
    .from("paddle_webhook_events")
    .update({
      processed_at: new Date().toISOString(),
      processing_error: null,
    })
    .eq("id", webhookId);

  if (error) throw new Error(error.message);
}

async function markWebhookFailed(webhookId, errorMessage) {
  if (!webhookId) return;

  await supabaseAdmin
    .from("paddle_webhook_events")
    .update({
      processed_at: null,
      processing_error: String(errorMessage || "Paddle webhook processing failed.").slice(0, 500),
    })
    .eq("id", webhookId);
}

async function completeOrder(fields, payload) {
  const { data, error } = await supabaseAdmin.rpc("complete_paddle_payment", {
    p_order_id: fields.orderId,
    p_paddle_transaction_id: fields.transactionId,
    p_paddle_customer_id: fields.customerId,
    p_amount_minor: fields.amountMinor,
    p_currency_code: fields.currencyCode,
    p_payload: payload,
    p_paid_at: fields.occurredAt || new Date().toISOString(),
  });

  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data[0] : data;
}

async function grantOrderCredits(orderId, productKey) {
  const grants = mapPaddleProductGrants(productKey);
  if (!grants) throw new Error(`Unknown product grants for ${productKey}`);

  const results = [];
  for (const [featureKey, usesCount] of Object.entries(grants)) {
    const { data, error } = await supabaseAdmin.rpc("grant_paddle_payment_order_feature_credits", {
      p_order_id: orderId,
      p_feature_key: featureKey,
      p_uses_count: usesCount,
    });

    if (error) throw new Error(error.message);
    results.push({ feature_key: featureKey, result: Array.isArray(data) ? data[0] : data });
  }

  return results;
}

async function markOrderStatus(order, status, fields, payload) {
  if (!order?.id || order.status === "paid") return;

  const { error } = await supabaseAdmin
    .from("paddle_payment_orders")
    .update({
      status,
      paddle_customer_id: fields.customerId,
      amount_minor: fields.amountMinor,
      currency_code: fields.currencyCode,
      response_payload: { webhook: payload },
    })
    .eq("id", order.id);

  if (error) throw new Error(error.message);
}

function validateCompletedEvent(fields, order) {
  if (!fields.eventId) return "Missing Paddle event id.";
  if (fields.eventType !== "transaction.completed") return null;
  if (fields.transactionStatus !== "completed") return "Paddle transaction is not completed.";
  if (!fields.transactionId) return "Missing Paddle transaction id.";
  if (!order) return "Paddle payment order not found.";
  if (fields.subscriptionId) return "Subscriptions are not supported.";
  if (order.paddle_transaction_id && order.paddle_transaction_id !== fields.transactionId) {
    return "Paddle transaction id mismatch.";
  }
  if (fields.productKey && fields.productKey !== order.product_key) {
    return "Product mismatch.";
  }
  if (!fields.priceIds.includes(order.paddle_price_id)) {
    return "Paddle price id mismatch.";
  }
  if (fields.collectionMode && fields.collectionMode !== "automatic") {
    return "Unsupported Paddle collection mode.";
  }
  return null;
}

export async function POST(request) {
  const signatureHeader = request.headers.get("paddle-signature") || "";
  const rawBody = await request.text();

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON." }, { status: 400 });
  }

  const fields = getPaddleWebhookEventFields(payload);
  let signatureValid = false;
  let signatureError = null;
  try {
    signatureValid = isValidPaddleWebhookSignature(rawBody, signatureHeader);
  } catch (error) {
    signatureError = error.message;
    console.error("[paddle-webhook] signature check failed:", error.message);
  }

  let order = null;
  let webhook = null;
  let processingError = null;

  try {
    order = await findOrder(fields);

    if (signatureError) {
      processingError = signatureError;
    } else if (!signatureValid) {
      processingError = "Invalid Paddle signature.";
    } else {
      processingError = validateCompletedEvent(fields, order);
    }

    webhook = await insertWebhookEvent({
      fields,
      signatureHeader,
      signatureValid,
      payload,
      orderId: order?.id || null,
      processingError,
    });

    if (webhook.duplicate && webhook.processedAt) {
      return NextResponse.json({ success: true, duplicate: true });
    }

    if (processingError) {
      await markWebhookFailed(webhook.id, processingError);
      console.error("[paddle-webhook] rejected:", processingError);
      return NextResponse.json(
        { success: false, error: processingError },
        { status: signatureError ? 500 : signatureValid ? 400 : 401 }
      );
    }

    if (fields.eventType === "transaction.completed") {
      const completed = await completeOrder({ ...fields, orderId: order.id }, payload);
      const grants = await grantOrderCredits(completed.order_id, completed.product_key);
      await markWebhookProcessed(webhook.id);
      return NextResponse.json({ success: true, grants });
    }

    if (fields.eventType === "transaction.canceled") {
      await markOrderStatus(order, "canceled", fields, payload);
    } else if (fields.eventType === "transaction.payment_failed") {
      await markOrderStatus(order, "payment_failed", fields, payload);
    }

    await markWebhookProcessed(webhook.id);
    return NextResponse.json({ success: true, ignored: true });
  } catch (error) {
    console.error("[paddle-webhook] processing failed:", error.message);
    await markWebhookFailed(webhook?.id, error.message);

    if (!webhook?.id) {
      await insertWebhookEvent({
        fields,
        signatureHeader,
        signatureValid,
        payload,
        orderId: order?.id || null,
        processingError: error.message,
      }).catch(() => {});
    }

    return NextResponse.json(
      { success: false, error: "Paddle webhook processing failed." },
      { status: 500 }
    );
  }
}
