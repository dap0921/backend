import { createHash, randomBytes, randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import userData from '../model/user.js';

const hashToken = (token) =>
  createHash('sha256').update(token).digest('hex');

const clearResetCode = async (userId, codeHash) => {
  try {
    await userData.updateOne(
      { _id: userId, passwordResetCodeHash: codeHash },
      {
        $unset: {
          passwordResetCodeHash: '',
          passwordResetCodeExpiresAt: '',
          passwordResetCodeAttempts: ''
        }
      }
    );
  } catch (error) {
    console.error('Failed to clear an unsent password reset code:', error.message);
  }
};

const getEmailConfiguration = () => {
  const {
    BREVO_API_KEY: rawApiKey,
    BREVO_SENDER_EMAIL: rawSenderEmail,
    BREVO_SENDER_NAME
  } = process.env;

  const apiKey = String(rawApiKey || '').trim();
  const senderEmail = String(rawSenderEmail || '').trim();

  if (!apiKey || !senderEmail) {
    return null;
  }

  return {
    apiKey,
    senderEmail,
    senderName: (BREVO_SENDER_NAME || 'Expense Tracker').trim() || 'Expense Tracker'
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

  console.info('Password reset code request received.');

  const emailConfig = getEmailConfiguration();

  if (!emailConfig) {
    console.error(
      'Password reset is unavailable: configure BREVO_API_KEY and BREVO_SENDER_EMAIL.'
    );
    return res.status(503).json({
      message: 'Password reset is temporarily unavailable. Please try again later.'
    });
  }

  try {
    const user = await userData.findOne({ email, role });

    if (!user) {
      console.info('Password reset code request did not match an account.');
      return res.status(404).json({
        message: 'This email is not registered for the selected account type.'
      });
    }

    const code = String(randomInt(100000, 1000000));
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await userData.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordResetCodeHash: codeHash,
          passwordResetCodeExpiresAt: expiresAt,
          passwordResetCodeAttempts: 0
        },
        $unset: {
          passwordResetTokenHash: '',
          passwordResetExpiresAt: ''
        }
      }
    );

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
          subject: 'Your Expense Tracker password reset code',
          textContent: `Your Expense Tracker password reset verification code is ${code}. It expires in 10 minutes. If you did not request this code, you can ignore this email.`,
          htmlContent: `<p>We received a request to reset your Expense Tracker password.</p><p>Your verification code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:6px">${code}</p><p>This code expires in 10 minutes. If you did not request this code, you can ignore this email.</p>`
        }),
        signal: AbortSignal.timeout(10000)
      });
    } catch (error) {
      console.error('Brevo password reset email request failed:', error.message);
      await clearResetCode(user._id, codeHash);
      return res.status(503).json({
        message: 'Unable to send a verification code right now. Please try again later.'
      });
    }

    if (!brevoResponse.ok) {
      console.error(
        `Brevo rejected a password reset email (HTTP ${brevoResponse.status}).`
      );
      await clearResetCode(user._id, codeHash);
      return res.status(503).json({
        message: 'Unable to send a verification code right now. Please try again later.'
      });
    } else {
      console.info('Brevo accepted a password reset code email.');
    }

    return res.status(200).json({
      message: 'A verification code has been sent to your registered email address.'
    });
  } catch (error) {
    console.error('Password reset request failed:', error.message);
    return res.status(500).json({
      message: 'Unable to process the password reset request right now.'
    });
  }
};

export const resetPasswordWithCode = async (req, res) => {
  const email =
    typeof req.body.email === 'string'
      ? req.body.email.trim().toLowerCase()
      : '';
  const { role, code, password } = req.body;

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    !['user', 'admin'].includes(role) ||
    typeof code !== 'string' ||
    !/^\d{6}$/.test(code) ||
    typeof password !== 'string' ||
    password.length < 6 ||
    Buffer.byteLength(password, 'utf8') > 72
  ) {
    return res.status(400).json({
      message: 'A valid email, verification code, account type, and password are required.'
    });
  }

  try {
    const user = await userData
      .findOne({
        email,
        role,
        passwordResetCodeExpiresAt: { $gt: new Date() },
        passwordResetCodeAttempts: { $lt: 5 }
      })
      .select('+passwordResetCodeHash');

    if (!user?.passwordResetCodeHash) {
      return res.status(400).json({
        message: 'The verification code is invalid or has expired.'
      });
    }

    const codeMatches = await bcrypt.compare(code, user.passwordResetCodeHash);

    if (!codeMatches) {
      await userData.updateOne(
        {
          _id: user._id,
          passwordResetCodeHash: user.passwordResetCodeHash,
          passwordResetCodeExpiresAt: { $gt: new Date() },
          passwordResetCodeAttempts: { $lt: 5 }
        },
        { $inc: { passwordResetCodeAttempts: 1 } }
      );
      return res.status(400).json({
        message: 'The verification code is invalid or has expired.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const updatedUser = await userData.findOneAndUpdate(
      {
        _id: user._id,
        passwordResetCodeHash: user.passwordResetCodeHash,
        passwordResetCodeExpiresAt: { $gt: new Date() },
        passwordResetCodeAttempts: { $lt: 5 }
      },
      {
        $set: { password: passwordHash },
        $unset: {
          passwordResetCodeHash: '',
          passwordResetCodeExpiresAt: '',
          passwordResetCodeAttempts: ''
        }
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(400).json({
        message: 'The verification code is invalid or has expired.'
      });
    }

    return res.status(200).json({
      message: 'Password has been reset successfully.'
    });
  } catch (error) {
    console.error('Password reset with verification code failed:', error.message);
    return res.status(500).json({
      message: 'Unable to reset the password right now.'
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
