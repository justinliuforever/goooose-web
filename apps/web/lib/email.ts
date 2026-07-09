import "server-only";

// Email HTML runs in a hostile environment (Gmail/QQ mail strip <style>, no web
// fonts, tables only) — everything below is inline-styled and table-laid-out.
const FONT_CJK =
  "-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif";
const FONT_BRAND_EN = "Georgia,'Times New Roman',serif";
const ORANGE = "#E8850C";

// Three little bricks — the 搬砖 brand motif, doubles as a divider.
const BRICK_DIVIDER = `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
  <tr>
    <td width="22" height="6" bgcolor="${ORANGE}" style="background-color:${ORANGE};border-radius:3px;font-size:0;line-height:0;">&nbsp;</td>
    <td width="8" style="font-size:0;line-height:0;">&nbsp;</td>
    <td width="22" height="6" bgcolor="#F2A94F" style="background-color:#F2A94F;border-radius:3px;font-size:0;line-height:0;">&nbsp;</td>
    <td width="8" style="font-size:0;line-height:0;">&nbsp;</td>
    <td width="22" height="6" bgcolor="#FBDFB4" style="background-color:#FBDFB4;border-radius:3px;font-size:0;line-height:0;">&nbsp;</td>
  </tr>
</table>`;

export function renderEmailShell(args: {
  preheader: string;
  bodyHtml: string;
}): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>搬砖小鹅 Goooose</title>
</head>
<body style="margin:0;padding:0;background-color:#F5F4F0;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${args.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F5F4F0" style="background-color:#F5F4F0;">
  <tr>
    <td align="center" style="padding:48px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
        <tr>
          <td align="center" style="padding-bottom:28px;">
            <span style="font-family:${FONT_CJK};font-size:22px;font-weight:700;color:#1A1A1A;letter-spacing:1px;">搬砖小鹅</span>
            <span style="font-family:${FONT_BRAND_EN};font-style:italic;font-size:23px;font-weight:700;color:${ORANGE};">&nbsp;Goooose</span>
          </td>
        </tr>
        <tr>
          <td bgcolor="#FFFFFF" style="background-color:#FFFFFF;border:1px solid #EBE8E1;border-radius:16px;padding:44px 40px 40px;">
            ${args.bodyHtml}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-top:28px;">
            <p style="margin:0;font-family:${FONT_CJK};font-size:12px;line-height:1.9;color:#A8A29E;">
              此邮件由系统自动发送，请勿直接回复<br>
              &copy; 搬砖小鹅 Goooose &middot; <a href="https://goooose.com" style="color:#A8A29E;text-decoration:underline;">goooose.com</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function renderApprovalEmail(baseUrl: string): string {
  const bodyHtml = `
${BRICK_DIVIDER}
<h1 style="margin:26px 0 0;font-family:${FONT_CJK};font-size:22px;font-weight:700;color:#1A1A1A;text-align:center;letter-spacing:0.5px;">内测申请已通过&nbsp;🎉</h1>
<p style="margin:22px 0 0;font-family:${FONT_CJK};font-size:15px;line-height:2;color:#57534E;text-align:center;">
  你好，你的搬砖小鹅 Goooose 内测申请已通过，<br>现在可以登录使用啦
</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:32px auto 0;">
  <tr>
    <td align="center" bgcolor="${ORANGE}" style="background-color:${ORANGE};border-radius:10px;">
      <a href="${baseUrl}" target="_blank" style="display:inline-block;padding:13px 40px;font-family:${FONT_CJK};font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;letter-spacing:1px;">进入搬砖小鹅</a>
    </td>
  </tr>
</table>
<p style="margin:18px 0 0;font-family:${FONT_CJK};font-size:13px;line-height:1.8;color:#A8A29E;text-align:center;">
  使用申请时的邮箱登录
</p>`;
  return renderEmailShell({
    preheader: "内测申请已通过，现在可以登录使用啦",
    bodyHtml,
  });
}

// Resend REST hook — approval works without it; sending only activates once
// RESEND_API_KEY + EMAIL_FROM (verified domain) are configured.
export async function sendApprovalEmail(to: string): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from || !to) {
    return { sent: false, reason: "email_not_configured" };
  }
  const baseUrl = process.env.LOGTO_BASE_URL ?? "https://goooose.com";
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
        subject: "搬砖小鹅 Goooose 内测申请已通过",
        html: renderApprovalEmail(baseUrl),
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
