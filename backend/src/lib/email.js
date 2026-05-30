async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`\n📧 [DEV EMAIL]`)
    console.log(`   To:      ${to}`)
    console.log(`   Subject: ${subject}`)
    console.log(`   Body:    ${html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)}`)
    console.log()
    return
  }

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    process.env.EMAIL_FROM || 'PackTrack <noreply@packtrack.app>',
      to,
      subject,
      html,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Email send failed (${res.status}): ${body}`)
  }
}

module.exports = { sendEmail }
