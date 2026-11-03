import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import userData from '../model/user.js';

const resetLinkMessage =
  'If an account matches that email and role, a password reset link will be sent shortly.';

const hashToken = (token) =>
  createHash('sha256').update(token).digest('hex');

const clearResetToken = async (userId, tokenHash) => {
  try {
    await userData.updateOne(
      { _id: userId, passwordResetTokenHash: tokenHash },
      {
        $unset: {
          passwordResetTokenHash: '',
          passwordResetExpiresAt: ''
        }
      }
    );
  } catch (error) {
    console.error('Failed to clear an unsent password reset token:', error.message);
  }
};

const getEmailConfiguration = () => {
  const { BREVO_API_KEY, BREVO_SENDER_EMAIL, FRONTEND_URL } = process.env;

  if (!BREVO_API_KEY || !BREVO_SENDER_EMAIL || !FRONTEND_URL) {
    return null;
  }

  const frontendUrl = FRONTEND_URL.replace(/\/+$/, '');
  const parsedUrl = new URL(frontendUrl);

  if (
    !['http:', 'https:'].includes(parsedUrl.protocol) ||
    parsedUrl.pathname !== '/' ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    return null;
  }

  return {
    apiKey: BREVO_API_KEY,
    senderEmail: BREVO_SENDER_EMAIL,
    senderName: process.env.BREVO_SENDER_NAME || 'Expense Tracker',
    frontendUrl
  };
};

export const requestPasswordReset = async (req, res) => {
  const email =
    typeof req.body.email === 'string'
      ? req.body.email.trim().toLowerCase()
      : '';
  const { role } = req.body;

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    !['user', 'admin'].includes(role)
  ) {
    return res.status(400).json({
      message: 'A valid email and account type are required.'
    });
  }

  let emailConfig;
  try {
    emailConfig = getEmailConfiguration();
  } catch (error) {
    console.error('Invalid password reset email configuration:', error.message);
  }

  if (!emailConfig) {
    console.error(
      'Password reset is unavailable: configure BREVO_API_KEY, BREVO_SENDER_EMAIL, and FRONTEND_URL.'
    );
    return res.status(503).json({
      message: 'Password reset is temporarily unavailable. Please try again later.'
    });
  }

  try {
    const user = await userData.findOne({ email, role });

    if (!user) {
      return res.status(202).json({ message: resetLinkMessage });
    }

    const token = randomBytes(32).toString('hex');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await userData.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordResetTokenHash: tokenHash,
          passwordResetExpiresAt: expiresAt
        }
      }
    );
    const resetUrl = `${emailConfig.frontendUrl}/reset-password/${token}`;
    let brevoResponse;
    try {
      brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'api-key': emailConfig.apiKey,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          sender: {
            name: emailConfig.senderName,
            email: emailConfig.senderEmail
          },
          to: [{ email: user.email, name: user.name }],
          subject: 'Reset your Expense Tracker password',
          textContent: `Use this link within 30 minutes to reset your password: ${resetUrl}`,
          htmlContent: `<p>We received a request to reset your Expense Tracker password.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in 30 minutes. If you did not request a reset, you can ignore this email.</p>`
        }),
        signal: AbortSignal.timeout(10000)
      });
    } catch (error) {
      console.error('Brevo password reset email request failed:', error.message);
      await clearResetToken(user._id, tokenHash);
      return res.status(202).json({ message: resetLinkMessage });
    }

    if (!brevoResponse.ok) {
      console.error(
        `Brevo rejected a password reset email (HTTP ${brevoResponse.status}).`
      );
      await clearResetToken(user._id, tokenHash);
    }

    return res.status(202).json({ message: resetLinkMessage });
  } catch (error) {
    console.error('Password reset request failed:', error.message);
    return res.status(500).json({
      message: 'Unable to process the password reset request right now.'
    });
  }
};

export const resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  if (
    typeof token !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(token) ||
    typeof password !== 'string' ||
    password.length < 6 ||
    Buffer.byteLength(password, 'utf8') > 72
  ) {
    return res.status(400).json({
      message: 'The reset link or new password is invalid.'
    });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const tokenHash = hashToken(token);
    const updatedUser = await userData.findOneAndUpdate(
      {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: { $gt: new Date() }
      },
      {
        $set: { password: passwordHash },
        $unset: {
          passwordResetTokenHash: '',
          passwordResetExpiresAt: ''
        }
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(400).json({
        message: 'The reset link is invalid or has expired.'
      });
    }

    return res.status(200).json({
      message: 'Password has been reset successfully.'
    });
  } catch (error) {
    console.error('Password reset failed:', error.message);
    return res.status(500).json({
      message: 'Unable to reset the password right now.'
    });
  }
};
