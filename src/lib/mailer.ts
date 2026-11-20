import nodemailer from 'nodemailer';

function buildOtpEmailContent(code: string, purpose: 'login' | 'signup' | 'otp') {
  const actionLabel =
    purpose === 'signup'
      ? 'creating your Shift account'
      : 'signing in to Shift';

  const subject = `${code} is your Shift verification code`;

  const text = [
    `Your Shift verification code is: ${code}`,
    '',
    `Use this 6-digit code to finish ${actionLabel}.`,
    'This code expires in 10 minutes. If you did not request it, you can safely ignore this email.',
  ].join('\n');

  const html = `
    <div style="background-color:#FAF8F5;padding:36px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1E293B;">
      <div style="max-width:460px;margin:0 auto;background:#FFFFFF;border:1px solid #E7E1D8;border-radius:20px;padding:32px;">
        <p style="margin:0 0 16px;font-size:20px;font-weight:600;letter-spacing:-0.02em;color:#1E293B;">Shift</p>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#475569;">
          Use the 6-digit code below to finish ${actionLabel}:
        </p>
        <div style="margin:24px 0;padding:18px;background:#FAF8F5;border:1px solid #E3DBD0;border-radius:14px;text-align:center;">
          <span style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:28px;font-weight:600;letter-spacing:0.35em;color:#1E293B;">${code}</span>
        </div>
        <p style="margin:0;font-size:13px;line-height:1.5;color:#64748B;">
          This code expires in 10 minutes. If you didn’t request this email, you can safely ignore it.
        </p>
      </div>
    </div>
  `.trim();

  return { subject, text, html };
}

export async function sendOtpEmail(
  toEmail: string,
  code: string,
  purpose: 'login' | 'signup' | 'otp'
): Promise<{ delivered: 'email' | 'preview' }> {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const smtpHost = process.env.SMTP_HOST?.trim();
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  const fromAddress =
    process.env.EMAIL_FROM?.trim() ||
    smtpUser ||
    'Shift <onboarding@resend.dev>';

  const { subject, text, html } = buildOtpEmailContent(code, purpose);

  if (resendKey) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [toEmail],
        subject,
        text,
        html,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.error('Resend OTP delivery failed:', response.status, errBody);
      throw new Error(
        'Could not deliver verification email. Check your RESEND_API_KEY and sender settings.'
      );
    }
    return { delivered: 'email' };
  }

  if (smtpHost && smtpUser && smtpPass) {
    const port = Number(process.env.SMTP_PORT || 587);
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port,
      secure: port === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    await transporter.sendMail({
      from: fromAddress,
      to: toEmail,
      subject,
      text,
      html,
    });
    return { delivered: 'email' };
  }

  return { delivered: 'preview' };
}
