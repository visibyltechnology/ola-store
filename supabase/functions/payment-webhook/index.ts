import { initializeApp, cert, getApps } from "https://esm.sh/firebase-admin@12/app";
import { getFirestore } from "https://esm.sh/firebase-admin@12/firestore";
import { getAuth } from "https://esm.sh/firebase-admin@12/auth";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOGO_URL = "https://www.olasandbselectronics.com.ng/assets/somisteam-logo-CqBWvMMV.jpg";

function getFirebaseAdmin() {
  if (getApps().length > 0) return getApps()[0];
  const serviceAccount = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT")!);
  return initializeApp({ credential: cert(serviceAccount) });
}

async function sendEmail(to: string, subject: string, html: string) {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) { console.log("RESEND_API_KEY not set — skipping email"); return; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Olas & Bs Electronics <noreply@olasandbselectronics.com.ng>", to: [to], subject, html }),
  });
  if (!res.ok) console.error("Resend email failed:", await res.text());
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(amount);
}

function orderConfirmationEmail(order: any, payment: any) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0}
  .container{max-width:580px;margin:30px auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.08)}
  .header{background:#1a56db;padding:24px;text-align:center}
  .header h1{color:#fff;margin:8px 0 0;font-size:22px}
  .gold{color:#f59e0b}
  .body{padding:28px;color:#333}
  table{width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin:16px 0}
  td{padding:12px 16px;font-size:13px;border-bottom:1px solid #e2e8f0}
  td:first-child{color:#666;width:45%}
  td:last-child{font-weight:bold}
  tr:last-child td{border-bottom:none}
  .badge{display:inline-block;background:#dcfce7;color:#16a34a;padding:3px 12px;border-radius:20px;font-weight:bold;font-size:13px}
  .footer{background:#f8fafc;padding:16px;text-align:center;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0}
</style>
</head><body>
<div class="container">
  <div class="header">
    <img src="${LOGO_URL}" alt="Olas & Bs Electronics" style="height:56px;border-radius:8px;display:block;margin:0 auto"/>
    <h1>Olas & Bs <span class="gold">Electronics</span></h1>
    <p style="color:#cbd5e1;margin:4px 0 0;font-size:13px">Order Confirmation</p>
  </div>
  <div class="body">
    <p>Hello <strong>Customer</strong>,</p>
    <p>Your payment was received successfully. Here is a summary of your order:</p>
    <table>
      <tr><td>Product</td><td>${order.product_name}</td></tr>
      <tr><td>Payment Type</td><td>${order.payment_type === "deposit" ? "Save to Buy (Installment)" : "Full Payment"}</td></tr>
      <tr><td>Amount Paid</td><td>${formatAmount(payment.amount)}</td></tr>
      <tr><td>Remaining Balance</td><td>${formatAmount(order.remaining_balance)}</td></tr>
      <tr><td>Reference</td><td style="font-family:monospace">${payment.payment_reference}</td></tr>
      <tr><td>Status</td><td><span class="badge">Confirmed ✓</span></td></tr>
    </table>
    ${order.payment_type === "deposit" && order.remaining_balance > 0 ? `
    <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:14px 16px;margin:16px 0">
      <strong>Next Installment:</strong><br>
      Your next payment of <strong>${formatAmount(order.remaining_balance / Math.max(1, order.installment_months - 1))}</strong> is due in 30 days.
    </div>` : ""}
    <p>Our team will contact you shortly to arrange delivery.</p>
    <p>Thank you for shopping with <strong>Olas & Bs Electronics</strong>.</p>
  </div>
  <div class="footer">
    Olas & Bs NIG Ltd · Lagos, Nigeria<br>
    <a href="https://www.olasandbselectronics.com.ng" style="color:#1a56db">www.olasandbselectronics.com.ng</a>
  </div>
</div>
</body></html>`;
}

async function processWebhook(body: any, firestoreDb: any, app: any): Promise<Response> {
  const reference = body.data?.reference || "";
  const status = body.event === "charge.success" ? "success" : "failed";

  if (!reference) {
    return new Response(JSON.stringify({ error: "Unknown webhook format" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Find payment by reference in Firebase
  const paymentsSnap = await firestoreDb.collection("payments")
    .where("payment_reference", "==", reference)
    .limit(1)
    .get();

  if (paymentsSnap.empty) {
    console.error("Payment not found:", reference);
    return new Response(JSON.stringify({ error: "Payment not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const paymentDoc = paymentsSnap.docs[0];
  const payment = { id: paymentDoc.id, ...paymentDoc.data() };

  // Update payment status
  await firestoreDb.collection("payments").doc(paymentDoc.id).update({ status });

  if (status === "success") {
    const orderDoc = await firestoreDb.collection("orders").doc(payment.order_id as string).get();
    if (orderDoc.exists) {
      const order = { id: orderDoc.id, ...orderDoc.data() };
      const newTotalPaid = Number(order.total_paid) + Number(payment.amount);
      const newBalance = Number(order.total_payable) - newTotalPaid;
      const isFullyPaid = newBalance <= 0;
      const newStatus = isFullyPaid ? "fully_paid" : "deposit_paid";
      const nextDue = !isFullyPaid ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null;

      await firestoreDb.collection("orders").doc(orderDoc.id).update({
        total_paid: newTotalPaid,
        remaining_balance: Math.max(0, newBalance),
        status: newStatus,
        next_payment_due: nextDue,
      });

      // Send confirmation email via Firebase Auth user lookup
      try {
        const userRecord = await getAuth(app).getUser(order.user_id as string);
        if (userRecord.email) {
          const updatedOrder = { ...order, total_paid: newTotalPaid, remaining_balance: Math.max(0, newBalance), status: newStatus };
          await sendEmail(
            userRecord.email,
            `Order Confirmed – ${order.product_name} | Olas & Bs Electronics`,
            orderConfirmationEmail(updatedOrder, payment)
          );
        }
      } catch (authErr) {
        console.error("Could not fetch user for email:", authErr);
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const app = getFirebaseAdmin();
    const firestoreDb = getFirestore(app);

    // Verify KoraPay webhook signature (HMAC-SHA256)
    const webhookSecret = Deno.env.get("KORA_WEBHOOK_SECRET");
    const rawBody = await req.text();

    if (webhookSecret) {
      const koraSignature = req.headers.get("x-korapay-signature") || "";
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw", encoder.encode(webhookSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
      );
      const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
      const expectedSig = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");

      if (koraSignature && koraSignature !== expectedSig) {
        console.error("Invalid webhook signature — rejecting");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = JSON.parse(rawBody);
    console.log("Webhook received:", body.event, body.data?.reference);
    return await processWebhook(body, firestoreDb, app);

  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: "Webhook processing failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
