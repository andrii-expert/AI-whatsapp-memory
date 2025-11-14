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
    // New PayFast production IPs (3.163.x.237 range)
    '3.163.232.237',
    '3.163.233.237',
    '3.163.234.237',
    '3.163.235.237',
    '3.163.236.237',
    '3.163.237.237',
    '3.163.238.237',
    '3.163.239.237',
    '3.163.240.237',
    '3.163.241.237',
    '3.163.242.237',
    '3.163.243.237',
    '3.163.244.237',
    '3.163.245.237',
    '3.163.246.237',
    '3.163.247.237',
    '3.163.248.237',
    '3.163.249.237',
    '3.163.250.237',
    '3.163.251.237',
    '3.163.252.237',
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
    // New PayFast IPs (may be used in sandbox as well)
    '3.163.232.237',
    '3.163.233.237',
    '3.163.234.237',
    '3.163.235.237',
    '3.163.236.237',
    '3.163.237.237',
    '3.163.238.237',
    '3.163.239.237',
    '3.163.240.237',
    '3.163.241.237',
    '3.163.242.237',
    '3.163.243.237',
    '3.163.244.237',
    '3.163.245.237',
    '3.163.246.237',
    '3.163.247.237',
    '3.163.248.237',
    '3.163.249.237',
    '3.163.250.237',
    '3.163.251.237',
    '3.163.252.237',
  ]
};

export const getPayFastConfig = (): PayFastConfig => {
  // Check PAYMENT_MODE first, then fall back to NODE_ENV
  // PAYMENT_MODE can be 'production' or 'sandbox' to explicitly control mode
  const paymentMode = process.env.PAYMENT_MODE?.toLowerCase();
  const isProduction = paymentMode === 'production' 
    ? true 
    : paymentMode === 'sandbox' 
    ? false 
    : process.env.NODE_ENV === 'production';

  const merchantId = isProduction
    ? process.env.PAYFAST_MERCHANT_ID
    : process.env.PAYFAST_SANDBOX_MERCHANT_ID;
  const merchantKey = isProduction
    ? process.env.PAYFAST_MERCHANT_KEY
    : process.env.PAYFAST_SANDBOX_MERCHANT_KEY;
  const passphrase = isProduction
    ? process.env.PAYFAST_PASSPHRASE
    : process.env.PAYFAST_SANDBOX_PASSPHRASE;

  // Validate required credentials
  if (!merchantId || !merchantKey) {
    const envPrefix = isProduction ? 'PAYFAST' : 'PAYFAST_SANDBOX';
    throw new Error(
      `PayFast configuration error: Missing required credentials. ` +
      `Please set ${envPrefix}_MERCHANT_ID and ${envPrefix}_MERCHANT_KEY environment variables. ` +
      `Current mode: ${isProduction ? 'PRODUCTION' : 'SANDBOX'} (determined by: ${paymentMode ? `PAYMENT_MODE=${paymentMode}` : `NODE_ENV=${process.env.NODE_ENV || 'not set'}`})`
    );
  }

  // Log configuration (without sensitive data) for debugging
  console.log('PayFast Configuration:', {
    mode: isProduction ? 'PRODUCTION' : 'SANDBOX',
    determinedBy: paymentMode ? `PAYMENT_MODE=${paymentMode}` : `NODE_ENV=${process.env.NODE_ENV || 'not set'}`,
    merchantId: merchantId ? `${merchantId.substring(0, 4)}...${merchantId.substring(merchantId.length - 4)}` : 'NOT SET',
    merchantKey: merchantKey ? `${merchantKey.substring(0, 4)}...${merchantKey.substring(merchantKey.length - 4)}` : 'NOT SET',
    passphrase: passphrase ? `[SET - ${passphrase.length} chars]` : '[NOT SET]',
    baseUrl: isProduction ? 'https://www.payfast.co.za' : 'https://sandbox.payfast.co.za',
  });

  return {
    merchantId,
    merchantKey,
    passphrase: passphrase || '',
    baseUrl: isProduction
      ? 'https://www.payfast.co.za'
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
  // Use same logic as getPayFastConfig to determine environment
  const paymentMode = process.env.PAYMENT_MODE?.toLowerCase();
  const isProduction = paymentMode === 'production' 
    ? true 
    : paymentMode === 'sandbox' 
    ? false 
    : process.env.NODE_ENV === 'production';
  return isProduction ? PAYFAST_IP_WHITELIST.production : PAYFAST_IP_WHITELIST.sandbox;
};