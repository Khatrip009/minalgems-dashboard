import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")! // uses service role for auth bypass
);

const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);

// Mapping of notification types to email templates
const EMAIL_TEMPLATES: Record<string, { subject: string; body: (payload: any) => string }> = {
  success: {
    subject: "✅ {title}",
    body: (p) => `Good news! ${p.message}`,
  },
  warning: {
    subject: "⚠️ {title}",
    body: (p) => `Heads up: ${p.message}`,
  },
  alert: {
    subject: "🚨 {title}",
    body: (p) => `Action required: ${p.message}`,
  },
  info: {
    subject: "ℹ️ {title}",
    body: (p) => `${p.message}`,
  },
  reminder: {
    subject: "⏰ {title}",
    body: (p) => `Reminder: ${p.message}`,
  },
};

serve(async (req: Request) => {
  try {
    const { record } = await req.json();
    const notification = record; // inserted row

    // Only send email if user_id is not null (system-wide may be handled separately)
    if (!notification.user_id) return new Response("no recipient", { status: 200 });

    // Fetch user email from auth.users (or profiles)
    const { data: userData, error: userError } = await supabase
      .from("auth.users")
      .select("email")
      .eq("id", notification.user_id)
      .single();

    if (userError || !userData?.email) {
      return new Response("user not found", { status: 200 });
    }

    const template = EMAIL_TEMPLATES[notification.type] || EMAIL_TEMPLATES.info;
    const subject = template.subject.replace("{title}", notification.title);
    const html = template.body(notification);

    await resend.emails.send({
      from: "Minal Gems <notifications@yourdomain.com>", // replace with verified domain
      to: [userData.email],
      subject,
      html: `<p>${html}</p>`,
    });

    return new Response("email sent", { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response("error", { status: 500 });
  }
});