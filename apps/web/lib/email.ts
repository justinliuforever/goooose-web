import "server-only";

// Resend REST hook — approval works without it; sending only activates once
// RESEND_API_KEY + EMAIL_FROM (verified domain) are configured.
export async function sendApprovalEmail(to: string): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from || !to) {
    return { sent: false, reason: "email_not_configured" };
  }
  const baseUrl = process.env.LOGTO_BASE_URL ?? "https://app.singularity.example";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: "Singularity 内测申请已通过",
        html: [
          "<p>你好，</p>",
          "<p>你的 Singularity 内测申请已通过，现在可以登录使用了。</p>",
          `<p><a href="${baseUrl}">点击进入 Singularity</a>（使用申请时的邮箱登录）</p>`,
          "<p>—— Singularity 团队</p>",
        ].join("\n"),
      }),
    });
    if (!res.ok) {
      return { sent: false, reason: `resend_${res.status}` };
    }
    return { sent: true };
  } catch {
    return { sent: false, reason: "resend_network_error" };
  }
}
