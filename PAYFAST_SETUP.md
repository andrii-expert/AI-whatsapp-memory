# PayFast Sandbox Setup Guide

This guide explains how to configure PayFast sandbox for testing payments.

## Step 1: Get Your PayFast Sandbox Credentials

1. **Create/Login to PayFast Sandbox Account**
   - Go to: https://sandbox.payfast.co.za
   - Sign up for a free sandbox account (separate from production)

2. **Get Your Credentials**
   - Log into your PayFast sandbox dashboard
   - Navigate to: **My Account** → **Integration** → **Settings**
   - You'll find:
     - **Merchant ID** (e.g., `10000100`)
     - **Merchant Key** (e.g., `46f0cd694581a`)
     - **Passphrase** (if you set one - optional but recommended)

## Step 2: Set Environment Variables

Add these variables to your `.env` or `.env.local` file in the **root directory** of your project:

### Required Variables for Sandbox

```bash
# Payment Mode (explicitly set to sandbox)
PAYMENT_MODE=sandbox

# PayFast Sandbox Credentials
PAYFAST_SANDBOX_MERCHANT_ID=your_merchant_id_here
PAYFAST_SANDBOX_MERCHANT_KEY=your_merchant_key_here
PAYFAST_SANDBOX_PASSPHRASE=your_passphrase_here

# PayFast URLs (replace with your actual URLs)
PAYFAST_RETURN_URL=https://your-domain.com/api/payment/success
PAYFAST_CANCEL_URL=https://your-domain.com/api/payment/cancel
PAYFAST_NOTIFY_URL=https://your-domain.com/api/webhook/payfast
PAYFAST_BILLING_RETURN_URL=https://your-domain.com/api/payment/billing-success
PAYFAST_BILLING_CANCEL_URL=https://your-domain.com/api/payment/billing-cancel
```

### Variable Details

#### 1. `PAYMENT_MODE` (Recommended)
- **Purpose**: Explicitly controls whether to use sandbox or production
- **Values**: `sandbox` or `production`
- **Example**: `PAYMENT_MODE=sandbox`
- **Note**: If not set, it falls back to checking `NODE_ENV`

#### 2. `PAYFAST_SANDBOX_MERCHANT_ID`
- **Purpose**: Your PayFast sandbox merchant ID
- **Where to find**: PayFast Sandbox Dashboard → Integration → Settings
- **Format**: Usually a numeric string (e.g., `10000100`)
- **Example**: `PAYFAST_SANDBOX_MERCHANT_ID=10000100`

#### 3. `PAYFAST_SANDBOX_MERCHANT_KEY`
- **Purpose**: Your PayFast sandbox merchant key
- **Where to find**: PayFast Sandbox Dashboard → Integration → Settings
- **Format**: Alphanumeric string (e.g., `46f0cd694581a`)
- **Example**: `PAYFAST_SANDBOX_MERCHANT_KEY=46f0cd694581a`
- **Important**: This is different from your production merchant key!

#### 4. `PAYFAST_SANDBOX_PASSPHRASE`
- **Purpose**: Optional security passphrase for signature generation
- **Where to find**: PayFast Sandbox Dashboard → Integration → Settings
- **Format**: Any string you set (or leave empty if not set)
- **Example**: `PAYFAST_SANDBOX_PASSPHRASE=my_secret_passphrase`
- **Note**: 
  - If you set a passphrase in PayFast, you MUST use the same one here
  - If you didn't set one in PayFast, leave this empty or omit the variable
  - **This is a common source of errors!**

#### 5. `PAYFAST_RETURN_URL`
- **Purpose**: Where PayFast redirects users after successful payment
- **Format**: Full HTTPS URL
- **Example**: `PAYFAST_RETURN_URL=https://your-app.com/api/payment/success`
- **Note**: Must be publicly accessible (not localhost unless using a tunnel)

#### 6. `PAYFAST_CANCEL_URL`
- **Purpose**: Where PayFast redirects users if they cancel payment
- **Format**: Full HTTPS URL
- **Example**: `PAYFAST_CANCEL_URL=https://your-app.com/api/payment/cancel`

#### 7. `PAYFAST_NOTIFY_URL`
- **Purpose**: Webhook endpoint where PayFast sends Instant Transaction Notifications (ITN)
- **Format**: Full HTTPS URL
- **Example**: `PAYFAST_NOTIFY_URL=https://your-app.com/api/webhook/payfast`
- **Important**: 
  - Must be publicly accessible
  - PayFast will POST payment status updates here
  - This is how your app knows when payments succeed/fail

#### 8. `PAYFAST_BILLING_RETURN_URL`
- **Purpose**: Return URL for billing/subscription flows
- **Format**: Full HTTPS URL
- **Example**: `PAYFAST_BILLING_RETURN_URL=https://your-app.com/api/payment/billing-success`

#### 9. `PAYFAST_BILLING_CANCEL_URL`
- **Purpose**: Cancel URL for billing/subscription flows
- **Format**: Full HTTPS URL
- **Example**: `PAYFAST_BILLING_CANCEL_URL=https://your-app.com/api/payment/billing-cancel`

## Step 3: Example .env File

Here's a complete example for local development:

```bash
# Environment
NODE_ENV=development
PAYMENT_MODE=sandbox

# PayFast Sandbox Credentials
PAYFAST_SANDBOX_MERCHANT_ID=10000100
PAYFAST_SANDBOX_MERCHANT_KEY=46f0cd694581a
PAYFAST_SANDBOX_PASSPHRASE=

# PayFast URLs (for local development with ngrok/tunnel)
PAYFAST_RETURN_URL=https://your-ngrok-url.ngrok.io/api/payment/success
PAYFAST_CANCEL_URL=https://your-ngrok-url.ngrok.io/api/payment/cancel
PAYFAST_NOTIFY_URL=https://your-ngrok-url.ngrok.io/api/webhook/payfast
PAYFAST_BILLING_RETURN_URL=https://your-ngrok-url.ngrok.io/api/payment/billing-success
PAYFAST_BILLING_CANCEL_URL=https://your-ngrok-url.ngrok.io/api/payment/billing-cancel
```

## Step 4: Common Issues & Solutions

### Issue: "Merchant unable to receive payments due to invalid account details"

**Possible Causes:**

1. **Wrong Merchant ID or Key**
   - ✅ Verify you're using **sandbox** credentials, not production
   - ✅ Copy-paste directly from PayFast dashboard (no extra spaces)
   - ✅ Check for typos

2. **Passphrase Mismatch**
   - ✅ If you set a passphrase in PayFast, it MUST match exactly
   - ✅ Check for extra spaces or newlines
   - ✅ If no passphrase in PayFast, leave `PAYFAST_SANDBOX_PASSPHRASE` empty

3. **Using Production Credentials in Sandbox**
   - ✅ Make sure you're using `PAYFAST_SANDBOX_*` variables, not `PAYFAST_*`
   - ✅ Set `PAYMENT_MODE=sandbox` to force sandbox mode

4. **Account Not Activated**
   - ✅ Log into PayFast sandbox and verify account is active
   - ✅ Check that merchant ID and key are enabled

### Issue: Environment Variables Not Loading

1. **Check File Location**
   - ✅ `.env` or `.env.local` should be in the **root directory** of your project
   - ✅ Not in `apps/` or `packages/` subdirectories

2. **Restart Your Server**
   - ✅ Environment variables are loaded at startup
   - ✅ Restart your dev server after changing `.env`

3. **Check Variable Names**
   - ✅ Use exact names: `PAYFAST_SANDBOX_MERCHANT_ID` (not `PAYFAST_MERCHANT_ID`)
   - ✅ Case-sensitive: `PAYMENT_MODE` not `payment_mode`

## Step 5: Verify Configuration

When you start your application, you should see a log message like:

```
PayFast Configuration: {
  mode: 'SANDBOX',
  determinedBy: 'PAYMENT_MODE=sandbox',
  merchantId: '1000...0100',
  merchantKey: '46f0...581a',
  passphrase: '[SET - 15 chars]' or '[NOT SET]',
  baseUrl: 'https://sandbox.payfast.co.za'
}
```

This confirms:
- ✅ Sandbox mode is active
- ✅ Credentials are loaded (partially masked for security)
- ✅ Passphrase status

## Step 6: Testing

1. **Test Payment Flow**
   - Create a test payment in your app
   - You should be redirected to `https://sandbox.payfast.co.za/eng/process`
   - Use PayFast test card: `5200000000000007` (any future expiry, any CVV)

2. **Test Webhook**
   - PayFast will send ITN to your `PAYFAST_NOTIFY_URL`
   - Ensure this URL is publicly accessible
   - Check server logs for webhook requests

## Production Setup

When ready for production, set:

```bash
PAYMENT_MODE=production
PAYFAST_MERCHANT_ID=your_production_merchant_id
PAYFAST_MERCHANT_KEY=your_production_merchant_key
PAYFAST_PASSPHRASE=your_production_passphrase
# ... same URL variables (they work for both)
```

**Important**: Never use production credentials in development!

## Additional Resources

- PayFast Sandbox: https://sandbox.payfast.co.za
- PayFast Documentation: https://payfast.io/documentation/
- PayFast Integration Guide: https://payfast.io/integration/

