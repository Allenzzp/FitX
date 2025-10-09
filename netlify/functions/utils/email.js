const nodemailer = require('nodemailer');

// Configure Gmail transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER || 'fitx.official.vancouver@gmail.com',
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

/**
 * Send email verification email
 * @param {String} to - Recipient email address
 * @param {String} username - User's username
 * @param {String} verificationToken - Email verification token
 * @returns {Promise<Object>} Nodemailer response
 */
async function sendVerificationEmail(to, username, verificationToken) {
  // Construct verification URL
  // In development: http://localhost:8888
  // In production: your actual domain
  const baseUrl = process.env.BASE_URL || process.env.URL || 'http://localhost:8888';
  const verificationUrl = `${baseUrl}/verify-email?token=${verificationToken}`;

  try {
    const response = await transporter.sendMail({
      from: `"FitX" <${process.env.GMAIL_USER || 'fitx.official.vancouver@gmail.com'}>`,
      to: to,
      subject: 'Verify your FitX account',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .button { display: inline-block; background-color: #81D8D0; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: 600; }
            .footer { margin-top: 30px; text-align: center; color: #6e6e73; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="color: #2C2C2E;">Welcome to FitX!</h1>
            </div>
            <p>Hi <strong>${username}</strong>,</p>
            <p>Thank you for signing up for FitX. Please verify your email address to activate your account.</p>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" class="button">Verify Email Address</a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #81D8D0;">${verificationUrl}</p>
            <p style="color: #6e6e73; font-size: 14px;">This link will expire in 1 hour.</p>
            <div class="footer">
              <p>If you didn't create a FitX account, you can safely ignore this email.</p>
              <p>— FitX Team</p>
            </div>
          </div>
        </body>
        </html>
      `
    });

    console.log('Verification email sent:', response);
    return response;
  } catch (error) {
    console.error('Failed to send verification email:', error);
    throw error;
  }
}

module.exports = {
  sendVerificationEmail
};
