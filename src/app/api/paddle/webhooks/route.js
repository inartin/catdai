import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getPaddleWebhookEventFields, isValidPaddleWebhookSignature } from "@/lib/paddle";
import { mapPaddleProductGrants } from "@/lib/paddle-products";
import { createSystemNotification } from "@/lib/system-notifications";

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

async function findOrder(fields) {
  if (isUuid(fields.orderId)) {
    const { data, error } = await supabaseAdmin
      .from("paddle_payment_orders")
      .select("id, user_id, product_key, status, paddle_price_id, paddle_transaction_id, paddle_subscription_id, language")
      .eq("id", fields.orderId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data) return data;
  }

  if (fields.transactionId) {
    const { data, error } = await supabaseAdmin
      .from("paddle_payment_orders")
      .select("id, user_id, product_key, status, paddle_price_id, paddle_transaction_id, paddle_subscription_id, language")
      .eq("paddle_transaction_id", fields.transactionId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data || null;
  }

  return null;
}

async function findSubscription(fields) {
  if (!fields.subscriptionId) return null;

  const { data, error } = await supabaseAdmin
    .from("paddle_subscriptions")
    .select("paddle_subscription_id, user_id, product_key, paddle_customer_id, paddle_price_id, status, current_period_start, current_period_end, cancel_at_period_end, last_transaction_id")
    .eq("paddle_subscription_id", fields.subscriptionId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data || null;
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
      paddle_subscription_id: fields.subscriptionId,
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

function subscriptionStatusForEvent(fields) {
  if (fields.subscriptionStatus) return fields.subscriptionStatus;
  if (fields.eventType === "subscription.canceled") return "canceled";
  if (fields.eventType === "subscription.past_due") return "past_due";
  if (fields.eventType === "subscription.paused") return "paused";
  if (fields.eventType === "subscription.trialing") return "trialing";
  if (fields.eventType === "subscription.activated" || fields.eventType === "subscription.resumed") return "active";
  if (fields.eventType === "transaction.completed" && fields.subscriptionId) return "active";
  return null;
}

async function upsertSubscription(fields, order, existingSubscription) {
  if (!fields.subscriptionId) return null;

  const userId = order?.user_id || existingSubscription?.user_id || fields.userId || null;
  const productKey = order?.product_key || existingSubscription?.product_key || fields.productKey || null;
  if (!userId || productKey !== "extra_pack") return null;

  const isSubscriptionStateEvent = String(fields.eventType || "").startsWith("subscription.");
  const status = subscriptionStatusForEvent(fields) || existingSubscription?.status || "active";
  const row = {
    paddle_subscription_id: fields.subscriptionId,
    user_id: userId,
    product_key: productKey,
    paddle_customer_id: fields.customerId || existingSubscription?.paddle_customer_id || null,
    paddle_price_id: order?.paddle_price_id || existingSubscription?.paddle_price_id || fields.priceIds[0] || null,
    status,
    current_period_start: fields.billingPeriodStart || existingSubscription?.current_period_start || null,
    current_period_end: fields.billingPeriodEnd || existingSubscription?.current_period_end || null,
    cancel_at_period_end: isSubscriptionStateEvent
      ? fields.cancelAtPeriodEnd === true
      : existingSubscription?.cancel_at_period_end === true,
    last_transaction_id: fields.transactionId || existingSubscription?.last_transaction_id || null,
  };

  const { data, error } = await supabaseAdmin
    .from("paddle_subscriptions")
    .upsert(row, { onConflict: "paddle_subscription_id" })
    .select("paddle_subscription_id, user_id, product_key, paddle_customer_id, paddle_price_id, status, current_period_start, current_period_end, cancel_at_period_end, last_transaction_id")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function attachSubscriptionToOrder(orderId, subscriptionId) {
  if (!orderId || !subscriptionId) return;

  const { error } = await supabaseAdmin
    .from("paddle_payment_orders")
    .update({ paddle_subscription_id: subscriptionId })
    .eq("id", orderId);

  if (error) throw new Error(error.message);
}

async function resetSubscriptionCredits(fields, subscription) {
  const grants = mapPaddleProductGrants(subscription?.product_key);
  if (!grants) throw new Error(`Unknown product grants for ${subscription?.product_key}`);
  if (!fields.billingPeriodStart || !fields.billingPeriodEnd) {
    throw new Error("Missing Paddle subscription billing period.");
  }

  const { data, error } = await supabaseAdmin.rpc("reset_paddle_subscription_period_feature_credits", {
    p_subscription_id: subscription.paddle_subscription_id,
    p_user_id: subscription.user_id,
    p_product_key: subscription.product_key,
    p_paddle_transaction_id: fields.transactionId,
    p_period_start: fields.billingPeriodStart,
    p_period_end: fields.billingPeriodEnd,
    p_credit_grants: grants,
  });

  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data[0] : data;
}

function shouldClearSubscriptionCredits(fields, subscription) {
  if (!fields.subscriptionId || !subscription?.paddle_subscription_id) return false;
  if (fields.eventType === "transaction.payment_failed") return true;
  if (fields.eventType === "subscription.canceled") return true;
  if (fields.eventType === "subscription.past_due") return true;
  if (fields.eventType === "subscription.paused") return true;
  return ["past_due", "paused", "canceled"].includes(String(subscription.status || ""));
}

async function clearSubscriptionCredits(subscription) {
  if (!subscription?.paddle_subscription_id) return null;

  const { data, error } = await supabaseAdmin.rpc("clear_paddle_subscription_feature_credits", {
    p_subscription_id: subscription.paddle_subscription_id,
  });

  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data[0] : data;
}

async function resolveSubscriptionNotificationLang(order, subscription) {
  if (order?.language) return order.language;

  const subscriptionId = subscription?.paddle_subscription_id;
  const userId = subscription?.user_id;
  if (!subscriptionId && !userId) return "ro";

  let query = supabaseAdmin
    .from("paddle_payment_orders")
    .select("language")
    .eq("product_key", "extra_pack")
    .order("created_at", { ascending: false })
    .limit(1);

  query = subscriptionId ? query.eq("paddle_subscription_id", subscriptionId) : query.eq("user_id", userId);

  const { data, error } = await query.maybeSingle();
  if (!error && data?.language) return data.language;

  if (subscriptionId && userId) {
    const fallback = await supabaseAdmin
      .from("paddle_payment_orders")
      .select("language")
      .eq("user_id", userId)
      .eq("product_key", "extra_pack")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!fallback.error && fallback.data?.language) return fallback.data.language;
  }

  return "ro";
}

async function notifySubscriptionPaid({ fields, order, previousSubscription, currentSubscription, reset }) {
  if (!currentSubscription?.user_id || reset?.reset_applied === false) return;

  const isExtended = Boolean(
    previousSubscription?.last_transaction_id
    && previousSubscription.last_transaction_id !== fields.transactionId
  ) || Boolean(!order && previousSubscription);

  const lang = await resolveSubscriptionNotificationLang(order, currentSubscription);
  await createSystemNotification({
    userId: currentSubscription.user_id,
    type: isExtended ? "extra_subscription_extended" : "extra_subscription_started",
    lang,
    periodEnd: fields.billingPeriodEnd || currentSubscription.current_period_end,
  });
}

async function notifySubscriptionStatus({ type, order, subscription }) {
  if (!subscription?.user_id) return;

  const lang = await resolveSubscriptionNotificationLang(order, subscription);
  await createSystemNotification({
    userId: subscription.user_id,
    type,
    lang,
    periodEnd: subscription.current_period_end,
  });
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

function validateSubscriptionCompletedEvent(fields, order, subscription) {
  if (!fields.eventId) return "Missing Paddle event id.";
  if (fields.transactionStatus !== "completed") return "Paddle transaction is not completed.";
  if (!fields.transactionId) return "Missing Paddle transaction id.";
  if (!fields.subscriptionId) return "Missing Paddle subscription id.";
  if (!order && !subscription) return "Paddle subscription not found.";
  if (order?.paddle_transaction_id && order.paddle_transaction_id !== fields.transactionId) {
    return "Paddle transaction id mismatch.";
  }

  const productKey = order?.product_key || subscription?.product_key || fields.productKey;
  if (productKey !== "extra_pack") return "Unsupported subscription product.";
  if (fields.productKey && fields.productKey !== productKey) return "Product mismatch.";

  const expectedPriceId = order?.paddle_price_id || subscription?.paddle_price_id;
  if (expectedPriceId && !fields.priceIds.includes(expectedPriceId)) {
    return "Paddle subscription price id mismatch.";
  }
  if (fields.collectionMode && fields.collectionMode !== "automatic") {
    return "Unsupported Paddle collection mode.";
  }
  if (!fields.billingPeriodStart || !fields.billingPeriodEnd) {
    return "Missing Paddle subscription billing period.";
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
  let subscription = null;
  let webhook = null;
  let processingError = null;

  try {
    order = await findOrder(fields);
    subscription = await findSubscription(fields);

    if (signatureError) {
      processingError = signatureError;
    } else if (!signatureValid) {
      processingError = "Invalid Paddle signature.";
    } else if (fields.eventType === "transaction.completed" && fields.subscriptionId) {
      processingError = validateSubscriptionCompletedEvent(fields, order, subscription);
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
      if (fields.subscriptionId) {
        if (order?.id) {
          await completeOrder({ ...fields, orderId: order.id }, payload);
          await attachSubscriptionToOrder(order.id, fields.subscriptionId);
        }

        const currentSubscription = await upsertSubscription(fields, order, subscription);
        if (!currentSubscription) {
          throw new Error("Paddle Extra subscription could not be matched to a user.");
        }

        const reset = await resetSubscriptionCredits(fields, currentSubscription);
        await notifySubscriptionPaid({
          fields,
          order,
          previousSubscription: subscription,
          currentSubscription,
          reset,
        });
        await markWebhookProcessed(webhook.id);
        return NextResponse.json({ success: true, subscription: true, reset });
      }

      const completed = await completeOrder({ ...fields, orderId: order.id }, payload);
      const grants = await grantOrderCredits(completed.order_id, completed.product_key);
      await markWebhookProcessed(webhook.id);
      return NextResponse.json({ success: true, grants });
    }

    if (String(fields.eventType || "").startsWith("subscription.")) {
      const currentSubscription = await upsertSubscription(fields, order, subscription);
      const clear = shouldClearSubscriptionCredits(fields, currentSubscription)
        ? await clearSubscriptionCredits(currentSubscription)
        : null;
      if (fields.eventType === "subscription.canceled") {
        await notifySubscriptionStatus({
          type: "extra_subscription_canceled",
          order,
          subscription: currentSubscription,
        });
      } else if (fields.eventType === "subscription.past_due") {
        await notifySubscriptionStatus({
          type: "extra_subscription_failed",
          order,
          subscription: currentSubscription,
        });
      }
      await markWebhookProcessed(webhook.id);
      return NextResponse.json({ success: true, subscription: Boolean(currentSubscription), clear, ignored: !currentSubscription });
    }

    if (fields.eventType === "transaction.canceled") {
      await markOrderStatus(order, "canceled", fields, payload);
    } else if (fields.eventType === "transaction.payment_failed") {
      await markOrderStatus(order, "payment_failed", fields, payload);
      if (fields.subscriptionId) {
        const currentSubscription = await upsertSubscription(fields, order, subscription);
        const clear = shouldClearSubscriptionCredits(fields, currentSubscription)
          ? await clearSubscriptionCredits(currentSubscription)
          : null;
        await notifySubscriptionStatus({
          type: "extra_subscription_failed",
          order,
          subscription: currentSubscription,
        });
        await markWebhookProcessed(webhook.id);
        return NextResponse.json({ success: true, subscription: Boolean(currentSubscription), clear });
      }
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
