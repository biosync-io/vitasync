function layout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>VitaSync</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:-0.5px;">VitaSync</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #e4e4e7;text-align:center;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;line-height:1.6;">
                This email was sent by VitaSync. If you didn't request this, please ignore it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

const ctaButton = (url: string, label: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;">
    <tr>
      <td align="center" style="background-color:#6366f1;border-radius:8px;">
        <a href="${url}" target="_blank" style="display:inline-block;background-color:#6366f1;color:#ffffff;font-size:16px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`

export const emailTemplates = {
  verification(verifyUrl: string): string {
    return layout(`
      <h2 style="margin:0 0 16px;font-size:22px;color:#18181b;">Verify your email</h2>
      <p style="margin:0 0 8px;font-size:15px;color:#3f3f46;line-height:1.6;">
        Thanks for signing up for VitaSync! Please verify your email address by clicking the button below.
      </p>
      ${ctaButton(verifyUrl, "Verify Email")}
      <p style="margin:16px 0 0;font-size:13px;color:#71717a;line-height:1.6;">
        If the button doesn't work, copy and paste this link into your browser:<br/>
        <a href="${verifyUrl}" style="color:#6366f1;word-break:break-all;">${verifyUrl}</a>
      </p>
      <p style="margin:12px 0 0;font-size:13px;color:#a1a1aa;">This link expires in 24 hours.</p>
    `)
  },

  passwordReset(resetUrl: string): string {
    return layout(`
      <h2 style="margin:0 0 16px;font-size:22px;color:#18181b;">Reset your password</h2>
      <p style="margin:0 0 8px;font-size:15px;color:#3f3f46;line-height:1.6;">
        We received a request to reset the password for your VitaSync account. Click below to choose a new password.
      </p>
      ${ctaButton(resetUrl, "Reset Password")}
      <p style="margin:16px 0 0;font-size:13px;color:#71717a;line-height:1.6;">
        If the button doesn't work, copy and paste this link into your browser:<br/>
        <a href="${resetUrl}" style="color:#6366f1;word-break:break-all;">${resetUrl}</a>
      </p>
      <p style="margin:12px 0 0;font-size:13px;color:#a1a1aa;">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
    `)
  },

  adminInvitation(acceptUrl: string, invitedBy: string): string {
    return layout(`
      <h2 style="margin:0 0 16px;font-size:22px;color:#18181b;">You've been invited!</h2>
      <p style="margin:0 0 8px;font-size:15px;color:#3f3f46;line-height:1.6;">
        <strong>${invitedBy}</strong> has invited you to join VitaSync as an administrator.
      </p>
      <p style="margin:0 0 8px;font-size:15px;color:#3f3f46;line-height:1.6;">
        Click the button below to accept the invitation and set up your account.
      </p>
      ${ctaButton(acceptUrl, "Accept Invitation")}
      <p style="margin:16px 0 0;font-size:13px;color:#71717a;line-height:1.6;">
        If the button doesn't work, copy and paste this link into your browser:<br/>
        <a href="${acceptUrl}" style="color:#6366f1;word-break:break-all;">${acceptUrl}</a>
      </p>
      <p style="margin:12px 0 0;font-size:13px;color:#a1a1aa;">This invitation expires in 48 hours.</p>
    `)
  },

  setupPassword(setupUrl: string, displayName: string): string {
    return layout(`
      <h2 style="margin:0 0 16px;font-size:22px;color:#18181b;">Welcome to VitaSync</h2>
      <p style="margin:0 0 8px;font-size:15px;color:#3f3f46;line-height:1.6;">
        Hi ${displayName}, your VitaSync account has been upgraded with secure login.
      </p>
      <p style="margin:0 0 8px;font-size:15px;color:#3f3f46;line-height:1.6;">
        Click below to set your password and access the health dashboard.
      </p>
      ${ctaButton(setupUrl, "Set Your Password")}
      <p style="margin:16px 0 0;font-size:13px;color:#71717a;line-height:1.6;">
        If the button doesn't work, copy and paste this link into your browser:<br/>
        <a href="${setupUrl}" style="color:#6366f1;word-break:break-all;">${setupUrl}</a>
      </p>
      <p style="margin:12px 0 0;font-size:13px;color:#a1a1aa;">This link expires in 24 hours.</p>
    `)
  },

  welcome(displayName: string): string {
    return layout(`
      <h2 style="margin:0 0 16px;font-size:22px;color:#18181b;">Welcome to VitaSync, ${displayName}!</h2>
      <p style="margin:0 0 8px;font-size:15px;color:#3f3f46;line-height:1.6;">
        Your account is all set up and ready to go. VitaSync helps you track, analyze, and optimize your health data all in one place.
      </p>
      <p style="margin:0 0 8px;font-size:15px;color:#3f3f46;line-height:1.6;">
        Here's how to get started:
      </p>
      <ul style="margin:8px 0 16px;padding-left:20px;font-size:15px;color:#3f3f46;line-height:1.8;">
        <li>Connect your wearable devices and health apps</li>
        <li>Set your health goals and targets</li>
        <li>Explore your personalized health insights</li>
      </ul>
      <p style="margin:0;font-size:15px;color:#3f3f46;line-height:1.6;">
        We're glad to have you on board!
      </p>
    `)
  },
}
