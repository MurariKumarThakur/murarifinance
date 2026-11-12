const sgMail = require("@sendgrid/mail");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

/**
 * Send an email via SendGrid
 * @param {{ to: string, subject: string, html: string, text?: string }} opts
 */
const sendEmail = async ({ to, subject, html, text }) => {
  try {
    await sgMail.send({
      to,
      from: { email: process.env.SENDGRID_FROM_EMAIL, name: "MyLoanApp" },
      subject,
      html,
      ...(text && { text }),
    });
  } catch (err) {
    const detail = err.response?.body?.errors?.[0]?.message || err.message;
    console.error("❌ SendGrid error:", detail);
    throw new Error(`Email delivery failed: ${detail}`);
  }
};

module.exports = sendEmail;
