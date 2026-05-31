const nodemailer = require('nodemailer')

async function sendEmail({ to, subject, html }) {
  console.log(`[EMAIL] Sending to ${to} | RESEND=${!!process.env.RESEND_API_KEY} | GMAIL=${!!process.env.EMAIL_USER}`)

  // Resend (preferred)
  if (process.env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
        to,
        subject,
        html,
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Resend failed (${res.status}): ${body}`)
    }
    return
  }

  // Gmail fallback
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    console.log(`[EMAIL] Using Gmail: ${process.env.EMAIL_USER}`)
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    })
    const info = await transporter.sendMail({
      from: `PackTrack <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    })
    console.log(`[EMAIL] Gmail sent: ${info.messageId}`)
    return
  }

  // Dev fallback — log to console
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const urlMatch = text.match(/https?:\/\/\S+verify-email\S+/)
  console.log(`\n📧 [DEV EMAIL]`)
  console.log(`   To:      ${to}`)
  console.log(`   Subject: ${subject}`)
  if (urlMatch) console.log(`   Link:    ${urlMatch[0]}`)
  else console.log(`   Body:    ${text}`)
  console.log()
}

module.exports = { sendEmail }
