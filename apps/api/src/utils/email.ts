import { Resend } from 'resend';
import { logger } from '@imaginecalendar/logger';

// Initialize Resend with API key
const getResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn('RESEND_API_KEY is not set in environment variables');
    return null;
  }
  if (!apiKey.startsWith('re_')) {
    logger.warn({ 
      apiKeyPrefix: apiKey.substring(0, 10),
      apiKeyLength: apiKey.length 
    }, 'RESEND_API_KEY does not start with "re_" - may be invalid');
  }
  return new Resend(apiKey);
};

// Validate and get FROM_EMAIL (called at runtime, not module load)
const getFromEmail = (): string | null => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'notifications@crackon.ai';
  
  // Check if it's just a domain (missing @)
  if (!fromEmail.includes('@')) {
    logger.error({ 
      provided: fromEmail,
      suggestion: `noreply@${fromEmail} or mail@${fromEmail}`
    }, 'RESEND_FROM_EMAIL must be a full email address, not just a domain');
    return null;
  }
  
  // Validate email format
  if (!emailRegex.test(fromEmail.trim())) {
    logger.error({ 
      provided: fromEmail 
    }, 'RESEND_FROM_EMAIL has invalid email format');
    return null;
  }
  
  return fromEmail.trim();
};

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://dashboard.crackon.ai';

// Validate email configuration at module load (for early detection)
export function validateEmailConfig(): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  if (!process.env.RESEND_API_KEY) {
    issues.push('RESEND_API_KEY is not set');
  } else if (!process.env.RESEND_API_KEY.startsWith('re_')) {
    issues.push('RESEND_API_KEY does not start with "re_" - may be invalid');
  }
  
  const fromEmail = getFromEmail();
  if (!fromEmail) {
    issues.push(`RESEND_FROM_EMAIL is invalid: ${process.env.RESEND_FROM_EMAIL || 'not set'}. Must be a full email address like noreply@mail.crackon.ai`);
  }
  
  if (issues.length > 0) {
    logger.warn({ issues }, 'Email configuration validation failed');
  } else {
    logger.info({ 
      fromEmail: getFromEmail(),
      hasApiKey: !!process.env.RESEND_API_KEY 
    }, 'Email configuration validated successfully');
  }
  
  return { valid: issues.length === 0, issues };
}

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

    // Get and validate FROM_EMAIL at runtime
    const fromEmail = getFromEmail();
    if (!fromEmail) {
      logger.error({ 
        to,
        resendFromEmail: process.env.RESEND_FROM_EMAIL 
      }, 'Cannot send welcome email: RESEND_FROM_EMAIL is invalid or not configured properly');
      return null;
    }

    // Get Resend client
    const resend = getResendClient();
    if (!resend) {
      logger.error({ to }, 'Cannot send welcome email: Failed to initialize Resend client');
      return null;
    }

    const fullName = `${firstName} ${lastName}`;
    const emailHtml = getWelcomeEmailTemplate(fullName);

    logger.info({ 
      to, 
      firstName,
      lastName,
      from: fromEmail,
      hasApiKey: !!process.env.RESEND_API_KEY,
      apiKeyPrefix: process.env.RESEND_API_KEY?.substring(0, 10) || 'NOT_SET',
    }, '[WELCOME_EMAIL] Attempting to send welcome email');

    try {
      const { data, error } = await resend.emails.send({
        from: fromEmail,
        to: to.trim(),
        subject: 'Welcome to CrackOn - Your WhatsApp AI Assistant is Ready!',
        html: emailHtml,
      });

      if (error) {
        logger.error({ 
          error, 
          errorMessage: error.message,
          errorName: error.name,
          errorType: typeof error,
          errorString: String(error),
          to,
          from: fromEmail,
          hasApiKey: !!process.env.RESEND_API_KEY,
        }, '[WELCOME_EMAIL] Resend API returned an error when sending welcome email');
        throw error;
      }

      if (!data) {
        logger.warn({ 
          to,
          from: fromEmail,
        }, '[WELCOME_EMAIL] Resend API returned no data when sending welcome email');
        return null;
      }

      logger.info({ 
        emailId: data.id, 
        to,
        from: fromEmail,
      }, '[WELCOME_EMAIL] Welcome email sent successfully');
      return data;
    } catch (sendError) {
      // Log detailed error information
      logger.error({
        error: sendError instanceof Error ? sendError.message : String(sendError),
        errorStack: sendError instanceof Error ? sendError.stack : undefined,
        errorType: sendError instanceof Error ? sendError.constructor.name : typeof sendError,
        errorDetails: sendError,
        to,
        from: fromEmail,
        hasApiKey: !!process.env.RESEND_API_KEY,
        apiKeyPrefix: process.env.RESEND_API_KEY?.substring(0, 10) || 'NOT_SET',
      }, '[WELCOME_EMAIL] Exception caught while sending welcome email');
      throw sendError;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error({ 
      error: errorMessage,
      errorStack,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      to,
      from: getFromEmail(),
      hasApiKey: !!process.env.RESEND_API_KEY,
      apiKeyPrefix: process.env.RESEND_API_KEY?.substring(0, 10) || 'NOT_SET',
    }, '[WELCOME_EMAIL] Error sending welcome email');
    
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
      background: #446DE1;
      color: #ffffff;
      text-decoration: none;
      text-color: #ffffff;
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
      <img src="https://dashboard.crackon.ai/crack-on-logo.png" alt="CrackOn Logo" class="logo" />
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
        <a href="https://dashboard.crackon.ai/dashboard" class="cta-button">
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
        Visit our <a href="https://dashboard.crackon.ai/help" style="color: #667eea; text-decoration: none;">Help Center</a> or 
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

interface SubscriptionEmailParams {
  to: string;
  firstName: string;
  lastName: string;
  planName: string;
  planAmount: number; // Amount in cents
  currency: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  isNewSubscription: boolean; // true for new, false for upgrade/renewal
}

export async function sendSubscriptionEmail({
  to,
  firstName,
  lastName,
  planName,
  planAmount,
  currency,
  currentPeriodStart,
  currentPeriodEnd,
  isNewSubscription,
}: SubscriptionEmailParams) {
  try {
    // Validate inputs
    if (!to || !to.trim()) {
      logger.error({ to, firstName, lastName }, 'Cannot send subscription email: missing recipient email');
      return null;
    }

    if (!firstName || !lastName) {
      logger.error({ to, firstName, lastName }, 'Cannot send subscription email: missing name fields');
      return null;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to.trim())) {
      logger.error({ to, firstName, lastName }, 'Cannot send subscription email: invalid email format');
      return null;
    }

    // Check if Resend API key is configured
    if (!process.env.RESEND_API_KEY) {
      logger.error({ to }, 'Cannot send subscription email: RESEND_API_KEY is not configured');
      return null;
    }

    // Get and validate FROM_EMAIL at runtime
    const fromEmail = getFromEmail();
    if (!fromEmail) {
      logger.error({ 
        to,
        resendFromEmail: process.env.RESEND_FROM_EMAIL 
      }, 'Cannot send subscription email: RESEND_FROM_EMAIL is invalid or not configured properly');
      return null;
    }

    // Get Resend client
    const resend = getResendClient();
    if (!resend) {
      logger.error({ to }, 'Cannot send subscription email: Failed to initialize Resend client');
      return null;
    }

    const fullName = `${firstName} ${lastName}`;
    const formattedAmount = (planAmount / 100).toFixed(2);
    const currencySymbol = currency === 'ZAR' ? 'R' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : currency;
    const emailHtml = getSubscriptionEmailTemplate({
      fullName,
      planName,
      amount: formattedAmount,
      currencySymbol,
      currentPeriodStart,
      currentPeriodEnd,
      isNewSubscription,
    });

    logger.info({ 
      to, 
      firstName,
      lastName,
      planName,
      from: fromEmail,
      hasApiKey: !!process.env.RESEND_API_KEY,
      apiKeyPrefix: process.env.RESEND_API_KEY?.substring(0, 10) || 'NOT_SET',
      isNewSubscription,
    }, '[SUBSCRIPTION_EMAIL] Attempting to send subscription confirmation email');

    try {
      const { data, error } = await resend.emails.send({
        from: fromEmail,
        to: to.trim(),
        subject: isNewSubscription 
          ? `Welcome to ${planName} - Your CrackOn Subscription is Active!`
          : `Your CrackOn Subscription to ${planName} is Active!`,
        html: emailHtml,
      });

      if (error) {
        logger.error({ 
          error, 
          errorMessage: error.message,
          errorName: error.name,
          errorType: typeof error,
          errorString: String(error),
          to,
          from: fromEmail,
          hasApiKey: !!process.env.RESEND_API_KEY,
        }, '[SUBSCRIPTION_EMAIL] Resend API returned an error when sending subscription email');
        throw error;
      }

      if (!data) {
        logger.warn({ 
          to,
          from: fromEmail,
        }, '[SUBSCRIPTION_EMAIL] Resend API returned no data when sending subscription email');
        return null;
      }

      logger.info({ 
        emailId: data.id, 
        to,
        from: fromEmail,
        planName,
      }, '[SUBSCRIPTION_EMAIL] Subscription confirmation email sent successfully');
      return data;
    } catch (sendError) {
      // Log detailed error information
      logger.error({
        error: sendError instanceof Error ? sendError.message : String(sendError),
        errorStack: sendError instanceof Error ? sendError.stack : undefined,
        errorType: sendError instanceof Error ? sendError.constructor.name : typeof sendError,
        errorDetails: sendError,
        to,
        from: fromEmail,
        hasApiKey: !!process.env.RESEND_API_KEY,
        apiKeyPrefix: process.env.RESEND_API_KEY?.substring(0, 10) || 'NOT_SET',
      }, '[SUBSCRIPTION_EMAIL] Exception caught while sending subscription email');
      throw sendError;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error({ 
      error: errorMessage,
      errorStack,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      to,
      from: getFromEmail(),
      hasApiKey: !!process.env.RESEND_API_KEY,
      apiKeyPrefix: process.env.RESEND_API_KEY?.substring(0, 10) || 'NOT_SET',
    }, '[SUBSCRIPTION_EMAIL] Error sending subscription email');
    
    // Don't throw - we don't want to fail subscription if email fails
    return null;
  }
}

function getSubscriptionEmailTemplate({
  fullName,
  planName,
  amount,
  currencySymbol,
  currentPeriodStart,
  currentPeriodEnd,
  isNewSubscription,
}: {
  fullName: string;
  planName: string;
  amount: string;
  currencySymbol: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  isNewSubscription: boolean;
}): string {
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  };

  const periodStart = formatDate(currentPeriodStart);
  const periodEnd = formatDate(currentPeriodEnd);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Subscription Confirmation - CrackOn</title>
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
    .subscription-box {
      background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
      border-left: 4px solid #667eea;
      padding: 25px;
      margin: 30px 0;
      border-radius: 8px;
    }
    .subscription-title {
      font-size: 20px;
      font-weight: 600;
      color: #667eea;
      margin-bottom: 15px;
    }
    .subscription-details {
      margin: 15px 0;
    }
    .subscription-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #e2e8f0;
    }
    .subscription-row:last-child {
      border-bottom: none;
    }
    .subscription-label {
      font-weight: 600;
      color: #4a5568;
    }
    .subscription-value {
      color: #1a202c;
      font-weight: 500;
    }
    .amount-highlight {
      font-size: 24px;
      font-weight: 700;
      color: #667eea;
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
      .subscription-row {
        flex-direction: column;
      }
      .subscription-value {
        margin-top: 5px;
      }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <!-- Header -->
    <div class="header">
      <img src="https://dashboard.crackon.ai/crack-on-logo.png" alt="CrackOn Logo" class="logo" />
      <h1 class="header-title">${isNewSubscription ? 'Subscription Confirmed!' : 'Subscription Updated!'}</h1>
    </div>

    <!-- Content -->
    <div class="content">
      <h2 class="greeting">Hi ${fullName}! 👋</h2>
      
      <p class="message">
        ${isNewSubscription 
          ? "Thank you for subscribing to CrackOn! Your subscription is now active and you have full access to all premium features."
          : "Great news! Your CrackOn subscription has been updated and is now active."}
      </p>

      <div class="subscription-box">
        <div class="subscription-title">📦 Subscription Details</div>
        <div class="subscription-details">
          <div class="subscription-row">
            <span class="subscription-label">Plan:</span>
            <span class="subscription-value">${planName}</span>
          </div>
          <div class="subscription-row">
            <span class="subscription-label">Amount:</span>
            <span class="subscription-value amount-highlight">${currencySymbol}${amount}</span>
          </div>
          <div class="subscription-row">
            <span class="subscription-label">Billing Period Start:</span>
            <span class="subscription-value">${periodStart}</span>
          </div>
          <div class="subscription-row">
            <span class="subscription-label">Billing Period End:</span>
            <span class="subscription-value">${periodEnd}</span>
          </div>
        </div>
      </div>

      <p class="message">
        ${isNewSubscription 
          ? "You can now enjoy all the premium features of CrackOn, including unlimited scheduling, advanced calendar integrations, and priority support."
          : "Your subscription benefits are now active. Continue managing your schedule effortlessly with CrackOn!"}
      </p>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 40px 0;">
        <a href="https://dashboard.crackon.ai/dashboard" class="cta-button">
          Go to Dashboard
        </a>
      </div>

      <div class="divider"></div>

      <p class="message" style="font-size: 14px; color: #718096;">
        <strong>Need Help?</strong><br>
        If you have any questions about your subscription, visit our <a href="https://dashboard.crackon.ai/help" style="color: #667eea; text-decoration: none;">Help Center</a> or 
        reach out to our support team at 
        <a href="mailto:support@crackon.ai" style="color: #667eea; text-decoration: none;">support@crackon.ai</a>
      </p>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p class="footer-text" style="font-weight: 600; color: #4a5568; margin-bottom: 10px;">
        Manage Your Subscription
      </p>
      <p class="footer-text">
        You can view and manage your subscription anytime from your 
        <a href="https://dashboard.crackon.ai/billing" style="color: #667eea; text-decoration: none;">Billing Dashboard</a>
      </p>
      
      <div class="divider" style="margin: 20px 0;"></div>
      
      <p class="footer-text">
        © ${new Date().getFullYear()} CrackOn. All rights reserved.
      </p>
      <p class="footer-text" style="font-size: 12px; color: #a0aec0; margin-top: 10px;">
        You're receiving this email because you have an active subscription with CrackOn.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

interface ShareNotificationEmailParams {
  to: string;
  recipientFirstName: string;
  recipientLastName: string;
  ownerFirstName: string;
  ownerLastName: string;
  resourceType: "task" | "task_folder" | "note" | "note_folder";
  resourceName: string;
  permission: "view" | "edit";
}

export async function sendShareNotificationEmail({
  to,
  recipientFirstName,
  recipientLastName,
  ownerFirstName,
  ownerLastName,
  resourceType,
  resourceName,
  permission,
}: ShareNotificationEmailParams) {
  try {
    // Validate inputs
    if (!to || !to.trim()) {
      logger.error({ to }, 'Cannot send share notification email: missing recipient email');
      return null;
    }

    if (!recipientFirstName || !recipientLastName) {
      logger.error({ to }, 'Cannot send share notification email: missing recipient name fields');
      return null;
    }

    if (!ownerFirstName || !ownerLastName) {
      logger.error({ to }, 'Cannot send share notification email: missing owner name fields');
      return null;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to.trim())) {
      logger.error({ to }, 'Cannot send share notification email: invalid email format');
      return null;
    }

    // Check if Resend API key is configured
    if (!process.env.RESEND_API_KEY) {
      logger.error({ to }, 'Cannot send share notification email: RESEND_API_KEY is not configured');
      return null;
    }

    // Get and validate FROM_EMAIL at runtime
    const fromEmail = getFromEmail();
    if (!fromEmail) {
      logger.error({ 
        to,
        resendFromEmail: process.env.RESEND_FROM_EMAIL 
      }, 'Cannot send share notification email: RESEND_FROM_EMAIL is invalid or not configured properly');
      return null;
    }

    // Get Resend client
    const resend = getResendClient();
    if (!resend) {
      logger.error({ to }, 'Cannot send share notification email: Failed to initialize Resend client');
      return null;
    }

    const recipientFullName = `${recipientFirstName} ${recipientLastName}`;
    const ownerFullName = `${ownerFirstName} ${ownerLastName}`;
    const resourceTypeLabel = resourceType === "task" || resourceType === "note" 
      ? (resourceType === "task" ? "task" : "note")
      : "folder";
    const permissionLabel = permission === "edit" ? "edit" : "view";
    const emailHtml = getShareNotificationEmailTemplate({
      recipientFullName,
      ownerFullName,
      resourceType,
      resourceTypeLabel,
      resourceName,
      permissionLabel,
    });

    logger.info({ 
      to, 
      recipientFirstName,
      recipientLastName,
      ownerFullName,
      resourceType,
      resourceName,
      from: fromEmail,
      hasApiKey: !!process.env.RESEND_API_KEY,
      apiKeyPrefix: process.env.RESEND_API_KEY?.substring(0, 10) || 'NOT_SET',
    }, '[SHARE_NOTIFICATION_EMAIL] Attempting to send share notification email');

    try {
      const { data, error } = await resend.emails.send({
        from: fromEmail,
        to: to.trim(),
        subject: `${ownerFullName} shared a ${resourceTypeLabel} with you on CrackOn`,
        html: emailHtml,
      });

      if (error) {
        logger.error({ 
          error, 
          errorMessage: error.message,
          errorName: error.name,
          errorType: typeof error,
          errorString: String(error),
          to,
          from: fromEmail,
          hasApiKey: !!process.env.RESEND_API_KEY,
        }, '[SHARE_NOTIFICATION_EMAIL] Resend API returned an error when sending share notification email');
        throw error;
      }

      if (!data) {
        logger.warn({ 
          to,
          from: fromEmail,
        }, '[SHARE_NOTIFICATION_EMAIL] Resend API returned no data when sending share notification email');
        return null;
      }

      logger.info({ 
        emailId: data.id, 
        to,
        from: fromEmail,
        resourceType,
        resourceName,
      }, '[SHARE_NOTIFICATION_EMAIL] Share notification email sent successfully');
      return data;
    } catch (sendError) {
      // Log detailed error information
      logger.error({
        error: sendError instanceof Error ? sendError.message : String(sendError),
        errorStack: sendError instanceof Error ? sendError.stack : undefined,
        errorType: sendError instanceof Error ? sendError.constructor.name : typeof sendError,
        errorDetails: sendError,
        to,
        from: fromEmail,
        hasApiKey: !!process.env.RESEND_API_KEY,
        apiKeyPrefix: process.env.RESEND_API_KEY?.substring(0, 10) || 'NOT_SET',
      }, '[SHARE_NOTIFICATION_EMAIL] Exception caught while sending share notification email');
      throw sendError;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error({ 
      error: errorMessage,
      errorStack,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      to,
      from: getFromEmail(),
      hasApiKey: !!process.env.RESEND_API_KEY,
      apiKeyPrefix: process.env.RESEND_API_KEY?.substring(0, 10) || 'NOT_SET',
    }, '[SHARE_NOTIFICATION_EMAIL] Error sending share notification email');
    
    // Don't throw - we don't want to fail sharing if email fails
    return null;
  }
}

function getShareNotificationEmailTemplate({
  recipientFullName,
  ownerFullName,
  resourceType,
  resourceTypeLabel,
  resourceName,
  permissionLabel,
}: {
  recipientFullName: string;
  ownerFullName: string;
  resourceType: "task" | "task_folder" | "note" | "note_folder";
  resourceTypeLabel: string;
  resourceName: string;
  permissionLabel: string;
}): string {
  const resourceIcon = resourceType === "task" ? "✓" : resourceType === "note" ? "📝" : "📁";
  const dashboardLink = resourceType === "task" || resourceType === "task_folder"
    ? `https://dashboard.crackon.ai/tasks`
    : `https://dashboard.crackon.ai/notes`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${ownerFullName} Shared a ${resourceTypeLabel.charAt(0).toUpperCase() + resourceTypeLabel.slice(1)} with You</title>
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
    .share-box {
      background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
      border-left: 4px solid #667eea;
      padding: 25px;
      margin: 30px 0;
      border-radius: 8px;
    }
    .share-title {
      font-size: 20px;
      font-weight: 600;
      color: #667eea;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .share-details {
      margin: 15px 0;
    }
    .share-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #e2e8f0;
    }
    .share-row:last-child {
      border-bottom: none;
    }
    .share-label {
      font-weight: 600;
      color: #4a5568;
    }
    .share-value {
      color: #1a202c;
      font-weight: 500;
    }
    .permission-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 600;
      background: ${permissionLabel === "edit" ? "#10b981" : "#3b82f6"};
      color: white;
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
      .share-row {
        flex-direction: column;
      }
      .share-value {
        margin-top: 5px;
      }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <!-- Header -->
    <div class="header">
      <img src="https://dashboard.crackon.ai/crack-on-logo.png" alt="CrackOn Logo" class="logo" />
      <h1 class="header-title">New Share Notification</h1>
    </div>

    <!-- Content -->
    <div class="content">
      <h2 class="greeting">Hi ${recipientFullName}! 👋</h2>
      
      <p class="message">
        <strong>${ownerFullName}</strong> has shared a ${resourceTypeLabel} with you on CrackOn.
      </p>

      <div class="share-box">
        <div class="share-title">
          <span>${resourceIcon}</span>
          <span>Shared ${resourceTypeLabel.charAt(0).toUpperCase() + resourceTypeLabel.slice(1)} Details</span>
        </div>
        <div class="share-details">
          <div class="share-row">
            <span class="share-label">${resourceType === "task" ? "Task" : resourceType === "note" ? "Note" : "Folder"} Name:</span>
            <span class="share-value">${resourceName}</span>
          </div>
          <div class="share-row">
            <span class="share-label">Shared By:</span>
            <span class="share-value">${ownerFullName}</span>
          </div>
          <div class="share-row">
            <span class="share-label">Permission:</span>
            <span class="share-value">
              <span class="permission-badge">${permissionLabel.charAt(0).toUpperCase() + permissionLabel.slice(1)}</span>
            </span>
          </div>
        </div>
      </div>

      <p class="message">
        ${permissionLabel === "edit" 
          ? `You can now view and edit this ${resourceTypeLabel}. Any changes you make will be visible to ${ownerFullName} and other collaborators.`
          : `You can now view this ${resourceTypeLabel}. If you need to make changes, ask ${ownerFullName} to grant you edit permissions.`}
      </p>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 40px 0;">
        <a href="${dashboardLink}" class="cta-button">
          View ${resourceType === "task" ? "Task" : resourceType === "note" ? "Note" : "Folder"}
        </a>
      </div>

      <div class="divider"></div>

      <p class="message" style="font-size: 14px; color: #718096;">
        <strong>Need Help?</strong><br>
        If you have any questions about this share, visit our <a href="https://dashboard.crackon.ai/help" style="color: #667eea; text-decoration: none;">Help Center</a> or 
        reach out to our support team at 
        <a href="mailto:support@crackon.ai" style="color: #667eea; text-decoration: none;">support@crackon.ai</a>
      </p>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p class="footer-text" style="font-weight: 600; color: #4a5568; margin-bottom: 10px;">
        Manage Your Shared Resources
      </p>
      <p class="footer-text">
        You can view all shared ${resourceType === "task" || resourceType === "task_folder" ? "tasks" : "notes"} from your 
        <a href="${dashboardLink}" style="color: #667eea; text-decoration: none;">${resourceType === "task" || resourceType === "task_folder" ? "Tasks" : "Notes"} Dashboard</a>
      </p>
      
      <div class="divider" style="margin: 20px 0;"></div>
      
      <p class="footer-text">
        © ${new Date().getFullYear()} CrackOn. All rights reserved.
      </p>
      <p class="footer-text" style="font-size: 12px; color: #a0aec0; margin-top: 10px;">
        You're receiving this email because ${ownerFullName} shared a ${resourceTypeLabel} with you on CrackOn.
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}


interface InviteEmailParams {
  to: string;
  friendName: string;
  inviterName: string;
}

export async function sendInviteEmail({ to, friendName, inviterName }: InviteEmailParams) {
  try {
    // Validate inputs
    if (!to || !to.trim()) {
      logger.error({ to, friendName, inviterName }, 'Cannot send invite email: missing recipient email');
      return null;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to.trim())) {
      logger.error({ to, friendName, inviterName }, 'Cannot send invite email: invalid email format');
      return null;
    }

    // Check if Resend API key is configured
    if (!process.env.RESEND_API_KEY) {
      logger.error({ to }, 'Cannot send invite email: RESEND_API_KEY is not configured');
      return null;
    }

    // Get and validate FROM_EMAIL at runtime
    const fromEmail = getFromEmail();
    if (!fromEmail) {
      logger.error({ 
        to,
        resendFromEmail: process.env.RESEND_FROM_EMAIL 
      }, 'Cannot send invite email: RESEND_FROM_EMAIL is invalid or not configured properly');
      return null;
    }

    // Get Resend client
    const resend = getResendClient();
    if (!resend) {
      logger.error({ to }, 'Cannot send invite email: Failed to initialize Resend client');
      return null;
    }

    const signupUrl = `${APP_URL}/sign-up`;
    const emailHtml = getInviteEmailTemplate(friendName, inviterName, signupUrl);

    logger.info({ 
      to, 
      friendName,
      inviterName,
      from: fromEmail,
      hasApiKey: !!process.env.RESEND_API_KEY,
      apiKeyPrefix: process.env.RESEND_API_KEY?.substring(0, 10) || 'NOT_SET',
    }, '[INVITE_EMAIL] Attempting to send invite email');

    try {
      const { data, error } = await resend.emails.send({
        from: fromEmail,
        to: to.trim(),
        subject: `You've been invited to signup to CrackOn by ${inviterName}`,
        html: emailHtml,
      });

      if (error) {
        logger.error({ 
          error, 
          errorMessage: error.message,
          errorName: error.name,
          errorType: typeof error,
          errorString: String(error),
          to,
          from: fromEmail,
          hasApiKey: !!process.env.RESEND_API_KEY,
        }, '[INVITE_EMAIL] Resend API returned an error when sending invite email');
        throw error;
      }

      if (!data) {
        logger.warn({ 
          to,
          from: fromEmail,
        }, '[INVITE_EMAIL] Resend API returned no data when sending invite email');
        return null;
      }

      logger.info({ 
        emailId: data.id, 
        to,
        from: fromEmail,
        friendName,
        inviterName,
      }, '[INVITE_EMAIL] Invite email sent successfully');
      return data;
    } catch (sendError) {
      logger.error({
        error: sendError instanceof Error ? sendError.message : String(sendError),
        errorStack: sendError instanceof Error ? sendError.stack : undefined,
        errorType: sendError instanceof Error ? sendError.constructor.name : typeof sendError,
        errorDetails: sendError,
        to,
        from: fromEmail,
        hasApiKey: !!process.env.RESEND_API_KEY,
        apiKeyPrefix: process.env.RESEND_API_KEY?.substring(0, 10) || 'NOT_SET',
      }, '[INVITE_EMAIL] Exception caught while sending invite email');
      throw sendError;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error({ 
      error: errorMessage,
      errorStack,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      to,
      from: getFromEmail(),
      hasApiKey: !!process.env.RESEND_API_KEY,
      apiKeyPrefix: process.env.RESEND_API_KEY?.substring(0, 10) || 'NOT_SET',
    }, '[INVITE_EMAIL] Error sending invite email');
    
    return null;
  }
}

function getInviteEmailTemplate(friendName: string, inviterName: string, signupUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You've been invited to CrackOn</title>
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
    .content {
      padding: 40px 30px;
    }
    .greeting {
      font-size: 18px;
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
    .cta-button {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #ffffff;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
      margin: 30px 0;
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }
    .footer {
      background-color: #f7fafc;
      padding: 30px;
      text-align: left;
      border-top: 1px solid #e2e8f0;
    }
    .footer-text {
      color: #718096;
      font-size: 14px;
      margin: 8px 0;
      line-height: 1.6;
    }
    .footer-link {
      color: #667eea;
      text-decoration: none;
    }
    @media only screen and (max-width: 600px) {
      .content {
        padding: 30px 20px;
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
    <div class="content">
      <p class="greeting">Hi ${friendName}</p>
      
      <p class="message">
        You've been invited to signup to CrackOn by ${inviterName}
      </p>
      
      <p class="message">
        CrackOn helps you stay organised, collaborate easily, and keep everything important in one place.
      </p>
      
      <p class="message">
        Click the Signup button below to register.
      </p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${signupUrl}" class="cta-button">
          Accept Invitation
        </a>
      </div>
    </div>
    
    <div class="footer">
      <p class="footer-text">
        If you weren't expecting this invitation, you can safely ignore this email.
      </p>
      <p class="footer-text">
        If you have any questions, feel free to reply to this message, we are happy to help.
      </p>
      <p class="footer-text" style="margin-top: 20px;">
        Best regards,<br>
        The CrackOn Team<br>
        <a href="${signupUrl}" class="footer-link">CrackOn.ai</a>
      </p>
    </div>
  </div>
</body>
</html>
  `.trim();
}
