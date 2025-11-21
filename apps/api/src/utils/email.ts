import { Resend } from 'resend';
import { logger } from '@imaginecalendar/logger';

// Initialize Resend with API key
const getResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn('RESEND_API_KEY is not set in environment variables');
    return null;
  }
  return new Resend(apiKey);
};

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'notifications@crackon.ai';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://dashboard.crackon.ai';

interface WelcomeEmailParams {
  to: string;
  firstName: string;
  lastName: string;
}

export async function sendWelcomeEmail({ to, firstName, lastName }: WelcomeEmailParams) {
  try {
    // Validate inputs
    if (!to || !to.trim()) {
      logger.error({ to, firstName, lastName }, 'Cannot send welcome email: missing recipient email');
      return null;
    }

    if (!firstName || !lastName) {
      logger.error({ to, firstName, lastName }, 'Cannot send welcome email: missing name fields');
      return null;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to.trim())) {
      logger.error({ to, firstName, lastName }, 'Cannot send welcome email: invalid email format');
      return null;
    }

    // Check if Resend API key is configured
    if (!process.env.RESEND_API_KEY) {
      logger.error({ to }, 'Cannot send welcome email: RESEND_API_KEY is not configured');
      return null;
    }

    // Get Resend client
    const resend = getResendClient();
    if (!resend) {
      logger.error({ to }, 'Cannot send welcome email: Failed to initialize Resend client');
      return null;
    }

    logger.info({ 
      to, 
      firstName, 
      from: FROM_EMAIL,
      hasApiKey: !!process.env.RESEND_API_KEY,
    }, 'Sending welcome email');

    const fullName = `${firstName} ${lastName}`;

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: to.trim(),
      subject: 'Welcome to CrackOn - Your WhatsApp AI Assistant is Ready!',
      html: getWelcomeEmailTemplate(fullName),
    });

    if (error) {
      logger.error({ 
        error, 
        errorMessage: error.message,
        errorName: error.name,
        to,
        from: FROM_EMAIL,
      }, 'Resend API returned an error when sending welcome email');
      throw error;
    }

    if (!data) {
      logger.warn({ to }, 'Resend API returned no data when sending welcome email');
      return null;
    }

    logger.info({ 
      emailId: data.id, 
      to,
      from: FROM_EMAIL,
    }, 'Welcome email sent successfully');
    return data;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error({ 
      error: errorMessage,
      errorStack,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      to,
      from: FROM_EMAIL,
      hasApiKey: !!process.env.RESEND_API_KEY,
    }, 'Error sending welcome email');
    
    // Don't throw - we don't want to fail onboarding if email fails
    return null;
  }
}

function getWelcomeEmailTemplate(fullName: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to CrackOn</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333333;
      background-color: #f4f7fa;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 40px 30px;
      text-align: center;
    }
    .logo {
      max-width: 200px;
      height: auto;
      margin-bottom: 20px;
    }
    .header-title {
      color: #ffffff;
      font-size: 28px;
      font-weight: 700;
      margin: 0;
      text-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .content {
      padding: 40px 30px;
    }
    .greeting {
      font-size: 24px;
      font-weight: 600;
      color: #1a202c;
      margin-bottom: 20px;
    }
    .message {
      font-size: 16px;
      color: #4a5568;
      line-height: 1.8;
      margin-bottom: 20px;
    }
    .highlight-box {
      background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
      border-left: 4px solid #667eea;
      padding: 20px;
      margin: 30px 0;
      border-radius: 8px;
    }
    .highlight-title {
      font-size: 18px;
      font-weight: 600;
      color: #667eea;
      margin-bottom: 12px;
    }
    .feature-list {
      list-style: none;
      padding: 0;
      margin: 20px 0;
    }
    .feature-item {
      padding: 12px 0;
      font-size: 15px;
      color: #4a5568;
      border-bottom: 1px solid #e2e8f0;
    }
    .feature-item:last-child {
      border-bottom: none;
    }
    .feature-icon {
      display: inline-block;
      width: 24px;
      height: 24px;
      margin-right: 10px;
      vertical-align: middle;
    }
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #ffffff;
      text-decoration: none;
      padding: 16px 40px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
      margin: 20px 0;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      transition: transform 0.2s;
    }
    .cta-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(102, 126, 234, 0.5);
    }
    .steps {
      margin: 30px 0;
    }
    .step {
      margin: 20px 0;
      padding-left: 40px;
      position: relative;
    }
    .step-number {
      position: absolute;
      left: 0;
      top: 0;
      width: 28px;
      height: 28px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #ffffff;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
    }
    .step-title {
      font-weight: 600;
      color: #1a202c;
      margin-bottom: 5px;
    }
    .step-description {
      color: #718096;
      font-size: 14px;
    }
    .footer {
      background-color: #f7fafc;
      padding: 30px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
    }
    .footer-text {
      color: #718096;
      font-size: 14px;
      margin: 5px 0;
    }
    .social-links {
      margin: 20px 0;
    }
    .social-link {
      display: inline-block;
      margin: 0 10px;
      color: #667eea;
      text-decoration: none;
      font-size: 14px;
    }
    .divider {
      height: 1px;
      background: linear-gradient(to right, transparent, #e2e8f0, transparent);
      margin: 30px 0;
    }
    @media only screen and (max-width: 600px) {
      .content {
        padding: 30px 20px;
      }
      .header {
        padding: 30px 20px;
      }
      .greeting {
        font-size: 20px;
      }
      .cta-button {
        display: block;
        text-align: center;
      }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <!-- Header -->
    <div class="header">
      <img src="${APP_URL}/crack-on-logo.png" alt="CrackOn Logo" class="logo" />
      <h1 class="header-title">Welcome to CrackOn!</h1>
    </div>

    <!-- Content -->
    <div class="content">
      <h2 class="greeting">Hi ${fullName}! 👋</h2>
      
      <p class="message">
        We're thrilled to have you join CrackOn! You've just unlocked the power of AI-driven scheduling through WhatsApp. 
        Say goodbye to back-and-forth messages and hello to effortless calendar management.
      </p>

      <div class="highlight-box">
        <div class="highlight-title">🎉 Your Account is Ready!</div>
        <p class="message" style="margin-bottom: 0;">
          You can now manage your entire schedule using natural language through WhatsApp. 
          Just send a voice note or text message, and CrackOn will handle the rest.
        </p>
      </div>

      <!-- Features -->
      <h3 style="color: #1a202c; font-size: 20px; margin: 30px 0 20px;">What You Can Do With CrackOn:</h3>
      <ul class="feature-list">
        <li class="feature-item">
          <span class="feature-icon">📅</span>
          <strong>Smart Scheduling:</strong> Create meetings with natural language like "Schedule a meeting with John tomorrow at 2pm"
        </li>
        <li class="feature-item">
          <span class="feature-icon">🗣️</span>
          <strong>Voice Commands:</strong> Send voice notes in any language - we'll understand and act on them
        </li>
        <li class="feature-item">
          <span class="feature-icon">🔄</span>
          <strong>Easy Updates:</strong> Move, reschedule, or cancel events with simple messages
        </li>
        <li class="feature-item">
          <span class="feature-icon">📱</span>
          <strong>Calendar Sync:</strong> Connects with Google Calendar, Microsoft Outlook, and more
        </li>
        <li class="feature-item">
          <span class="feature-icon">⏰</span>
          <strong>Smart Reminders:</strong> Get timely notifications for all your upcoming events
        </li>
      </ul>

      <div class="divider"></div>

      <!-- Getting Started Steps -->
      <h3 style="color: #1a202c; font-size: 20px; margin: 30px 0 20px;">Get Started in 3 Easy Steps:</h3>
      <div class="steps">
        <div class="step">
          <div class="step-number">1</div>
          <div class="step-title">Connect Your Calendar</div>
          <div class="step-description">Link your Google Calendar or Microsoft Outlook to start managing your schedule</div>
        </div>
        <div class="step">
          <div class="step-number">2</div>
          <div class="step-title">Send a WhatsApp Message</div>
          <div class="step-description">Text or voice note us your scheduling request in plain English</div>
        </div>
        <div class="step">
          <div class="step-number">3</div>
          <div class="step-title">Sit Back & Relax</div>
          <div class="step-description">CrackOn handles the rest - your calendar is automatically updated!</div>
        </div>
      </div>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 40px 0;">
        <a href="${APP_URL}/dashboard" class="cta-button">
          Go to Your Dashboard
        </a>
      </div>

      <div class="highlight-box" style="background: #fff5f5; border-left-color: #f56565;">
        <div class="highlight-title" style="color: #f56565;">💡 Pro Tip</div>
        <p class="message" style="margin-bottom: 0; font-size: 14px;">
          For the best experience, make sure to connect your calendar first! This allows CrackOn to create and manage events seamlessly.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p class="footer-text" style="font-weight: 600; color: #4a5568; margin-bottom: 10px;">
        Need Help?
      </p>
      <p class="footer-text">
        Visit our <a href="${APP_URL}/help" style="color: #667eea; text-decoration: none;">Help Center</a> or 
        reach out to our support team at 
        <a href="mailto:support@crackon.ai" style="color: #667eea; text-decoration: none;">support@crackon.ai</a>
      </p>
      
      <div class="divider" style="margin: 20px 0;"></div>
      
      <p class="footer-text">
        © ${new Date().getFullYear()} CrackOn. All rights reserved.
      </p>
      <p class="footer-text" style="font-size: 12px; color: #a0aec0; margin-top: 10px;">
        You're receiving this email because you signed up for CrackOn.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

