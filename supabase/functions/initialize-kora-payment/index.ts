import { initializeApp, cert, getApps } from "https://esm.sh/firebase-admin@12/app";
import { getFirestore } from "https://esm.sh/firebase-admin@12/firestore";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Initialize Firebase Admin (singleton)
function getFirebaseAdmin() {
  if (getApps().length > 0) return getApps()[0];
  const serviceAccount = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT")!);
  return initializeApp({ credential: cert(serviceAccount) });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const koraSecretKey = Deno.env.get("KORA_SECRET_KEY");
    if (!koraSecretKey) {
      return new Response(
        JSON.stringify({ error: "KoraPay secret key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { order_id, amount, customer_email, customer_name, redirect_url, user_id } = body;

    if (!order_id || !amount || !customer_email || !user_id) {
      return new Response(
        JSON.stringify({ error: "order_id, amount, customer_email and user_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reference = `OLA-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    // Call KoraPay API
    const koraRes = await fetch("https://api.korapay.com/merchant/api/v1/charges/initialize", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${koraSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reference,
        amount,
        currency: "NGN",
        customer: { email: customer_email, name: customer_name || customer_email },
        redirect_url: redirect_url || `${Deno.env.get("SITE_URL") || "https://www.olasandbselectronics.com.ng"}/payment/callback`,
        notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-webhook`,
        metadata: { order_id, user_id, gateway: "korapay" },
      }),
    });

    const koraData = await koraRes.json();

    if (!koraRes.ok || !koraData.data?.checkout_url) {
      console.error("Kora API error:", JSON.stringify(koraData));
      return new Response(
        JSON.stringify({ error: koraData.message || "Failed to initialize KoraPay payment" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save payment record to Firebase
    const app = getFirebaseAdmin();
    const firestoreDb = getFirestore(app);

    await firestoreDb.collection("payments").add({
      order_id,
      user_id,
      amount,
      payment_gateway: "korapay",
      payment_reference: reference,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({ success: true, checkout_url: koraData.data.checkout_url, reference }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("initialize-kora-payment error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
