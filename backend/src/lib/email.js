const nodemailer = require('nodemailer')

function getTransporter() {
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    })
  }
  return null
}

async function sendEmail({ to, subject, html }) {
  const transporter = getTransporter()

  if (!transporter) {
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const urlMatch = text.match(/https?:\/\/\S+verify-email\S+/)
    console.log(`\n📧 [DEV EMAIL]`)
    console.log(`   To:      ${to}`)
    console.log(`   Subject: ${subject}`)
    if (urlMatch) console.log(`   Link:    ${urlMatch[0]}`)
    else console.log(`   Body:    ${text}`)
    console.log()
    return
  }

  await transporter.sendMail({
    from: `PackTrack <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  })
}

module.exports = { sendEmail }
