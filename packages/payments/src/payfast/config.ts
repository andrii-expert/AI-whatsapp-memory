export interface PayFastConfig {
  merchantId: string;
  merchantKey: string;
  passphrase: string;
  baseUrl: string;
  apiBaseUrl: string;
  returnUrl: string;
  cancelUrl: string;
  billingReturnUrl: string;
  billingCancelUrl: string;
  notifyUrl: string;
}

// PayFast IP whitelist for ITN validation
// Source: PayFast documentation
export const PAYFAST_IP_WHITELIST = {
  production: [
    // PayFast production IP addresses
    '41.74.179.194',
    '41.74.179.195', 
    '41.74.179.196',
    '41.74.179.197',
    '41.74.179.200',
    '41.74.179.201',
    '41.74.179.203',
    '41.74.179.204',
    '41.74.179.210',
    '41.74.179.211',
    '41.74.179.212',
    '41.74.179.217',
    '41.74.179.218',
    '144.126.193.139',
    // Additional production IPs
    '196.33.227.224',
    '196.33.227.225',
    '196.33.227.226',
    '196.33.227.227',
    '196.33.227.228',
  ],
  sandbox: [
    // PayFast sandbox IP addresses
    '41.74.179.194',
    '41.74.179.195',
    '41.74.179.196',
    '41.74.179.197',
    '41.74.179.200',
    '41.74.179.201',
    '41.74.179.203',
    '41.74.179.204',
    '41.74.179.210',
    '41.74.179.211',
    '41.74.179.212',
    '41.74.179.217',
    '41.74.179.218',
    // Cloudflare tunnel IP for testing
    '144.126.193.139',
  ]
};

export const getPayFastConfig = (): PayFastConfig => {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    merchantId: isProduction
      ? process.env.PAYFAST_MERCHANT_ID!
      : process.env.PAYFAST_SANDBOX_MERCHANT_ID!,
    merchantKey: isProduction
      ? process.env.PAYFAST_MERCHANT_KEY!
      : process.env.PAYFAST_SANDBOX_MERCHANT_KEY!,
    passphrase: isProduction
      ? process.env.PAYFAST_PASSPHRASE!
      : process.env.PAYFAST_SANDBOX_PASSPHRASE!,
    baseUrl: isProduction
      ? 'https://sandbox.payfast.co.za'
      : 'https://sandbox.payfast.co.za',
    apiBaseUrl: 'https://api.payfast.co.za', // Same for both prod and sandbox
    returnUrl: process.env.PAYFAST_RETURN_URL!,
    cancelUrl: process.env.PAYFAST_CANCEL_URL!,
    billingReturnUrl: process.env.PAYFAST_BILLING_RETURN_URL!,
    billingCancelUrl: process.env.PAYFAST_BILLING_CANCEL_URL!,
    notifyUrl: process.env.PAYFAST_NOTIFY_URL!,
  };
};

export const getPayFastIPWhitelist = (): string[] => {
  const isProduction = process.env.NODE_ENV === 'production';
  return isProduction ? PAYFAST_IP_WHITELIST.production : PAYFAST_IP_WHITELIST.sandbox;
};