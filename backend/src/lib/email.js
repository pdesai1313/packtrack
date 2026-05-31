const nodemailer = require('nodemailer')

async function sendEmail({ to, subject, html }) {
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
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    })
    await transporter.sendMail({
      from: `PackTrack <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    })
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
