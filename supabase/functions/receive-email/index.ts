import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const WEBHOOK_SECRET = Deno.env.get("RESEND_INBOUND_SECRET");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;  // required for fallback fetch

async function verifySignature(req: Request): Promise<boolean> {
  if (!WEBHOOK_SECRET) return true;
  const header = req.headers.get("Resend-Signature");
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map(p => { const [k,v] = p.trim().split("="); return [k,v]; })
  );
  const timestamp = parts.t, sig = parts.v1;
  if (!timestamp || !sig) return false;
  const rawBody = await req.clone().text();
  const payload = `${timestamp}.${rawBody}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const sigBytes = Uint8Array.from(sig.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));
  return await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(payload));
}

// Attempt to extract text/HTML body from any reasonable field
function extractBody(email: any): { text: string | null; html: string | null } {
  const candidates = [ "text", "text_body", "body", "content" ];
  const htmlCandidates = [ "html", "html_body" ];
  let text = null, html = null;
  for (const key of candidates) if (typeof email[key] === "string" && email[key].trim().length > 0) text = email[key];
  for (const key of htmlCandidates) if (typeof email[key] === "string" && email[key].trim().length > 0) html = email[key];
  // Sometimes it's wrapped in a nested object
  if (!text && email.body && typeof email.body === "object") {
    text = email.body.text || email.body.plain || null;
  }
  return { text, html };
}

serve(async (req: Request) => {
  try {
    if (!(await verifySignature(req))) return new Response("Invalid signature", { status: 401 });

    const rawBody = await req.text();
    console.log("=== Raw body ===", rawBody);
    const payload = JSON.parse(rawBody);
    if (payload.type !== "email.received") return new Response("Ignored", { status: 200 });

    const email = payload.data;
    console.log("=== Email data ===", JSON.stringify(email, null, 2));

    const fromName = email.from_name || email.from?.split("@")[0] || "Unknown";
    let { text: textBody, html: htmlBody } = extractBody(email);

    // If still empty, fetch the full email from Resend API
    if (!textBody && !htmlBody) {
      console.log("⚠️ Body missing, fetching from Resend API for email_id:", email.email_id);
      try {
        const res = await fetch(`https://api.resend.com/emails/${email.email_id}`, {
          headers: { Authorization: `Bearer ${RESEND_API_KEY}` }
        });
        if (res.ok) {
          const full = await res.json();
          textBody = full.text || full.text_body || null;
          htmlBody = full.html || full.html_body || null;
          console.log("✅ Retrieved body from Resend API");
        } else {
          console.error("Resend API fetch failed:", res.status);
        }
      } catch (apiErr) {
        console.error("Resend API fetch error:", apiErr);
      }
    }

    // Skip emails sent from our own domain (avoid notification loops)
    if (email.from?.endsWith("@minalgem.com")) {
      console.log("Skipping own-domain email:", email.from);
      return new Response("Skipped own-domain", { status: 200 });
    }

    const { error: insertError } = await supabase.from("inbound_emails").insert({
      message_id: email.message_id,
      from_address: email.from,
      from_name: fromName,
      to_address: email.to[0],
      subject: email.subject,
      text_body: textBody,
      html_body: htmlBody,
      attachments: email.attachments || [],
      headers: email.headers || {},
    });

    if (insertError) {
      if (insertError.code === "23505") return new Response("Duplicate", { status: 200 });
      console.error("DB insert error:", insertError);
      return new Response("Database error", { status: 500 });
    }

    console.log("✅ Email stored");

    // Notify admins (optional)
    const { data: admins } = await supabase.from("profiles").select("id").eq("role", "admin");
    if (admins) {
      for (const admin of admins) {
        await supabase.from("notifications").insert({
          user_id: admin.id,
          type: "info",
          title: `New email from ${fromName}`,
          message: email.subject,
          reference_type: "inbound_email",
        });
      }
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Function error:", err);
    return new Response("Internal error", { status: 500 });
  }
});