import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getPaynetMerchantCode,
  getPaynetNotificationFields,
  isValidPaynetNotificationHash,
} from "@/lib/paynet";
import { mapProductGrants } from "@/lib/paynet-products";

function isSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function normalizeStoredEventType(eventType) {
  return String(eventType || "").toLowerCase() === "paid" ? eventType : null;
}

async function findOrder(fields) {
  const { data, error } = await supabaseAdmin
    .from("payment_orders")
    .select("id, invoice_no, user_id, product_key, amount_minor, paynet_payment_id, status")
    .eq("invoice_no", fields.invoiceNo)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data || null;
}

async function insertNotification({ fields, hashHeader, hashValid, payload, orderId = null, processingError = null }) {
  const { data, error } = await supabaseAdmin
    .from("paynet_notifications")
    .insert({
      event_id: isSafeInteger(fields.eventId) ? fields.eventId : null,
      event_type: normalizeStoredEventType(fields.eventType),
      event_date: fields.eventDate,
      order_id: orderId,
      paynet_payment_id: isSafeInteger(fields.paynetPaymentId) ? fields.paynetPaymentId : null,
      invoice_no: isSafeInteger(fields.invoiceNo) ? fields.invoiceNo : null,
      merchant_code: fields.merchantCode,
      payment_customer: fields.paymentCustomer,
      amount_minor: isSafeInteger(fields.amountMinor) ? fields.amountMinor : null,
      hash_header: hashHeader,
      hash_valid: hashValid,
      payload,
      processed_at: null,
      processing_error: processingError,
    })
    .select("id, processing_error, processed_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: existing, error: existingError } = await supabaseAdmin
        .from("paynet_notifications")
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

async function markNotificationProcessed(notificationId) {
  if (!notificationId) return;

  const { error } = await supabaseAdmin
    .from("paynet_notifications")
    .update({
      processed_at: new Date().toISOString(),
      processing_error: null,
    })
    .eq("id", notificationId);

  if (error) throw new Error(error.message);
}

async function markNotificationFailed(notificationId, errorMessage) {
  if (!notificationId) return;

  await supabaseAdmin
    .from("paynet_notifications")
    .update({
      processed_at: null,
      processing_error: String(errorMessage || "Notification processing failed.").slice(0, 500),
    })
    .eq("id", notificationId);
}

async function completeOrder(fields, payload) {
  const { data, error } = await supabaseAdmin.rpc("complete_paynet_payment", {
    p_invoice_no: fields.invoiceNo,
    p_paynet_payment_id: fields.paynetPaymentId,
    p_amount_minor: fields.amountMinor,
    p_paynet_status: fields.paynetStatus,
    p_payload: payload,
    p_paid_at: fields.eventDate || new Date().toISOString(),
  });

  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data[0] : data;
}

async function grantOrderCredits(orderId, productKey) {
  const grants = mapProductGrants(productKey);
  if (!grants) throw new Error(`Unknown product grants for ${productKey}`);

  const results = [];
  for (const [featureKey, usesCount] of Object.entries(grants)) {
    const { data, error } = await supabaseAdmin.rpc("grant_payment_order_feature_credits", {
      p_order_id: orderId,
      p_feature_key: featureKey,
      p_uses_count: usesCount,
    });

    if (error) throw new Error(error.message);
    results.push({ feature_key: featureKey, result: Array.isArray(data) ? data[0] : data });
  }

  return results;
}

function validateFields(fields) {
  if (String(fields.eventType || "").toLowerCase() !== "paid") return "Unsupported event type.";
  if (!isSafeInteger(fields.eventId)) return "Missing Paynet event id.";
  if (!isSafeInteger(fields.invoiceNo)) return "Missing Paynet invoice.";
  if (!isSafeInteger(fields.paynetPaymentId)) return "Missing Paynet payment id.";
  if (!isSafeInteger(fields.amountMinor)) return "Missing Paynet amount.";
  if (fields.paynetStatus !== 4) return "Paynet status is not paid.";
  if (fields.merchantCode !== getPaynetMerchantCode()) return "Merchant mismatch.";
  return null;
}

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ResultCode: "ERROR", ResultMessage: "Invalid JSON." }, { status: 400 });
  }

  const hashHeader = request.headers.get("hash") || request.headers.get("Hash") || "";
  const fields = getPaynetNotificationFields(payload);

  let order = null;
  let notification = null;
  let processingError = null;

  try {
    const hashValid = isValidPaynetNotificationHash(payload, hashHeader);
    const validationError = validateFields(fields);

    if (isSafeInteger(fields.invoiceNo)) {
      order = await findOrder(fields);
    }

    if (!hashValid) processingError = "Invalid Paynet hash.";
    else if (validationError) processingError = validationError;
    else if (!order) processingError = "Payment order not found.";
    else if (order.amount_minor !== fields.amountMinor) processingError = "Amount mismatch.";
    else if (order.paynet_payment_id && order.paynet_payment_id !== fields.paynetPaymentId) {
      processingError = "Paynet payment id mismatch.";
    }

    notification = await insertNotification({
      fields,
      hashHeader,
      hashValid,
      payload,
      orderId: order?.id || null,
      processingError,
    });

    if (notification.duplicate && notification.processedAt) {
      return NextResponse.json({
        ResultCode: "SUCCESS",
        ResultMessage: "Duplicate notification ignored.",
      });
    }

    if (processingError) {
      await markNotificationFailed(notification.id, processingError);
      console.error("[paynet-notification] rejected:", processingError);
      return NextResponse.json({ ResultCode: "ERROR", ResultMessage: processingError }, { status: 400 });
    }

    const completed = await completeOrder(fields, payload);
    const grants = await grantOrderCredits(completed.order_id, completed.product_key);
    await markNotificationProcessed(notification.id);

    return NextResponse.json({
      ResultCode: "SUCCESS",
      ResultMessage: "Payment processed.",
      grants,
    });
  } catch (error) {
    console.error("[paynet-notification] processing failed:", error.message);
    await markNotificationFailed(notification?.id, error.message);

    if (!processingError && !notification?.id) {
      await insertNotification({
        fields,
        hashHeader,
        hashValid: false,
        payload,
        orderId: order?.id || null,
        processingError: error.message,
      }).catch(() => {});
    }

    return NextResponse.json(
      { ResultCode: "ERROR", ResultMessage: "Notification processing failed." },
      { status: 500 }
    );
  }
}
