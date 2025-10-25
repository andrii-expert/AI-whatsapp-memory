import crypto from 'crypto';
import { getPayFastConfig, getPayFastIPWhitelist } from './config';

export interface PaymentPlanDetails {
  id: string;
  name: string;
  description: string;
  amountCents: number;
  payfastConfig: {
    recurring: boolean;
    frequency: number | null;
  };
}

export interface PaymentRequestOptions {
  userId: string;
  plan: PaymentPlanDetails;
  userEmail: string;
  userName: string;
  userPhone?: string;
  isBillingFlow?: boolean; // Determines which return/cancel URLs to use
}

export interface PaymentFormData {
  action: string;
  fields: Record<string, any>;
}

export class PayFastService {
  private config = getPayFastConfig();

  // PayFast's official signature verification method
  private pfValidSignature(pfData: any, pfParamString: string, pfPassphrase: string | null = null): boolean {
    // Calculate security signature
    let tempParamString = pfParamString;

    console.log('PayFast Signature Generation Debug:', {
      originalParamString: pfParamString,
      passphraseProvided: pfPassphrase !== null,
      passphraseValue: pfPassphrase ? `[${pfPassphrase.length} chars]` : 'null'
    });

    if (pfPassphrase !== null && pfPassphrase !== '') {
      const encodedPassphrase = encodeURIComponent(pfPassphrase.trim()).replace(/%20/g, "+");
      tempParamString += `&passphrase=${encodedPassphrase}`;
      console.log('Added passphrase to string:', {
        encodedPassphrase: `passphrase=${encodedPassphrase}`,
        finalStringLength: tempParamString.length
      });
    }

    const signature = crypto.createHash("md5").update(tempParamString).digest("hex");

    console.log('PayFast Signature Verification:', {
      paramStringForHash: tempParamString.substring(0, 200) + '...',
      generatedSignature: signature,
      receivedSignature: pfData['signature'],
      matches: pfData['signature'] === signature,
      signatureLengths: {
        generated: signature.length,
        received: pfData['signature']?.length
      }
    });

    return pfData['signature'] === signature;
  }

  async createPaymentRequest(options: PaymentRequestOptions): Promise<PaymentFormData> {
    const plan = options.plan;
    const amount = plan.amountCents / 100;
    
    const data: Record<string, any> = {
      merchant_id: this.config.merchantId,
      merchant_key: this.config.merchantKey,
      return_url: options.isBillingFlow ? this.config.billingReturnUrl : this.config.returnUrl,
      cancel_url: options.isBillingFlow ? this.config.billingCancelUrl : this.config.cancelUrl,
      notify_url: this.config.notifyUrl,
      
      //name_first: options.userName.split(' ')[0] || '',
      //name_last: options.userName.split(' ').slice(1).join(' ') || '',
      email_address: options.userEmail,
      //cell_number: options.userPhone || '',
      
      m_payment_id: `USR_${options.userId}_${Date.now()}`,
      amount: amount.toFixed(2),
      item_name: `CrackOn ${plan.name}`,
      item_description: plan.description,
      
      // Store userId and plan for ITN processing
      custom_str1: options.userId,
      custom_str2: plan.id,
    };

    // Add subscription fields for recurring payments
    if (plan.payfastConfig.recurring) {
      data.subscription_type = '1'; // Recurring subscription
      data.billing_date = new Date().toISOString().split('T')[0];
      data.recurring_amount = amount.toFixed(2);
      if (plan.payfastConfig.frequency != null) {
        data.frequency = String(plan.payfastConfig.frequency); // 3 for monthly, 6 for annual
      }
      data.cycles = '0'; // Indefinite
    }

    // Generate signature server-side
    data.signature = this.generateSignature(data);

    return {
      action: `${this.config.baseUrl}/eng/process`,
      fields: data,
    };
  }

  async validateITN(payload: any, remoteIp: string, expectedAmount: number): Promise<boolean> {
    console.log('PayFast ITN Validation Starting:', {
      remoteIp,
      expectedAmount,
      receivedAmount: payload.amount_gross,
      paymentId: payload.m_payment_id,
      receivedSignature: payload.signature
    });

    // Build parameter string using PayFast's official method
    let pfParamString = "";
    for (let key in payload) {
      if (payload.hasOwnProperty(key) && key !== "signature") {
        pfParamString += `${key}=${encodeURIComponent(payload[key].trim()).replace(/%20/g, "+")}&`;
      }
    }
    // Remove last ampersand
    pfParamString = pfParamString.slice(0, -1);

    console.log('PayFast Parameter String:', pfParamString);

    // PayFast's 4 official security checks
    const check1 = this.pfValidSignature(payload, pfParamString, this.config.passphrase);
    const check2 = this.pfValidIP(remoteIp);
    const check3 = this.pfValidPaymentData(expectedAmount, payload);
    const check4 = await this.pfValidServerConfirmation(pfParamString);

    console.log('PayFast Security Checks Detailed:', {
      check1_signature: check1,
      check1_details: {
        passed: check1,
        receivedSignature: payload.signature,
        passphrase: this.config.passphrase ? 'SET' : 'NOT SET'
      },
      check2_ip: check2,
      check2_details: {
        passed: check2,
        remoteIp,
        whitelist: getPayFastIPWhitelist()
      },
      check3_amount: check3,
      check3_details: {
        passed: check3,
        expectedAmount,
        receivedAmount: payload.amount_gross,
        difference: Math.abs(expectedAmount - parseFloat(payload.amount_gross))
      },
      check4_server: check4,
      check4_details: {
        passed: check4,
        validationUrl: `${this.config.baseUrl}/eng/query/validate`
      },
      allPassed: check1 && check2 && check3 && check4
    });

    if (check1 && check2 && check3 && check4) {
      // All checks have passed, the payment is successful
      console.log('PayFast ITN: All security checks passed');
      return true;
    } else {
      // Some checks have failed, check payment manually and log for investigation
      const failedChecks = [];
      if (!check1) failedChecks.push('signature');
      if (!check2) failedChecks.push('ip_whitelist');
      if (!check3) failedChecks.push('amount');
      if (!check4) failedChecks.push('server_confirmation');

      console.error('PayFast ITN: One or more security checks failed', {
        failedChecks,
        payload: {
          m_payment_id: payload.m_payment_id,
          pf_payment_id: payload.pf_payment_id,
          amount: payload.amount_gross,
          status: payload.payment_status
        }
      });
      return false;
    }
  }

  // PayFast's official IP validation method
  private pfValidIP(remoteIp: string): boolean {
    const validIps = getPayFastIPWhitelist();
    return validIps.includes(remoteIp);
  }

  // PayFast's official amount validation method
  private pfValidPaymentData(expectedAmount: number, payload: any): boolean {
    const actualAmount = parseFloat(payload.amount_gross);
    return Math.abs(expectedAmount - actualAmount) <= 0.01;
  }

  // PayFast's official server confirmation method
  private async pfValidServerConfirmation(pfParamString: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/eng/query/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: pfParamString,
      });
      const result = await response.text();
      return result === 'VALID';
    } catch (error) {
      console.error('PayFast server confirmation error:', error);
      return false;
    }
  }

  async validateAmount(paymentId: string, expectedAmount: number, actualAmount: string): Promise<boolean> {
    // Security check 3: Verify amount matches expected
    const actualCents = Math.round(parseFloat(actualAmount) * 100);
    const expectedCents = Math.round(expectedAmount * 100);
    
    if (actualCents !== expectedCents) {
      console.error(`PayFast ITN: Amount mismatch for ${paymentId}. Expected: ${expectedCents}, Actual: ${actualCents}`);
      return false;
    }
    
    return true;
  }

  private generateSignature(data: Record<string, any>): string {
    // Build parameter string using PayFast's official method
    let pfParamString = "";
    for (let key in data) {
      if (data.hasOwnProperty(key) && key !== "signature") {
        pfParamString += `${key}=${encodeURIComponent(data[key].trim()).replace(/%20/g, "+")}&`;
      }
    }
    // Remove last ampersand
    pfParamString = pfParamString.slice(0, -1);

    // Add passphrase if present
    let tempParamString = pfParamString;
    if (this.config.passphrase) {
      tempParamString += `&passphrase=${encodeURIComponent(this.config.passphrase.trim()).replace(/%20/g, "+")}`;
    }

    // Generate MD5 hash
    return crypto.createHash("md5").update(tempParamString).digest("hex");
  }

  private async confirmWithPayFast(data: any): Promise<boolean> {
    const paramString = Object.keys(data)
      .filter(key => key !== 'signature')
      .map(key => `${key}=${encodeURIComponent(data[key]).replace(/%20/g, '+')}`)
      .join('&');

    try {
      const response = await fetch(`${this.config.baseUrl}/eng/query/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: paramString,
      });

      const result = await response.text();
      return result === 'VALID';
    } catch (error) {
      console.error('Error confirming with PayFast:', error);
      return false;
    }
  }

  // PayFast Subscription Management API Methods
  private generateApiHeaders(bodyParams?: Record<string, any>, urlParams?: Record<string, any>): Record<string, string> {
    // PayFast requires ISO-8601 timestamp without milliseconds and timezone
    // Format: YYYY-MM-DDTHH:MM:SS (e.g. 2025-09-19T08:59:58)
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 19); // Remove milliseconds and Z
    const version = 'v1';

    // Start with header data
    const data: Record<string, string> = {
      'merchant-id': this.config.merchantId,
      'version': version,
      'timestamp': timestamp
    };

    // Add body parameters if provided (for methods like updateSubscription)
    if (bodyParams) {
      Object.keys(bodyParams).forEach(key => {
        if (bodyParams[key] !== undefined && bodyParams[key] !== null) {
          data[key] = String(bodyParams[key]);
        }
      });
    }

    // Add URL parameters if provided
    if (urlParams) {
      Object.keys(urlParams).forEach(key => {
        if (urlParams[key] !== undefined && urlParams[key] !== null) {
          data[key] = String(urlParams[key]);
        }
      });
    }

    // Add passphrase to data object before sorting (like Postman script)
    if (this.config.passphrase !== null && this.config.passphrase.trim() !== '') {
      data['passphrase'] = this.config.passphrase.trim();
    }

    // Sort variables alphabetically (exactly like Postman script)
    const sortedEntries = Object.entries(data).sort((a, b) => a[0].localeCompare(b[0]));

    // Create the signature string (exactly like Postman script)
    let signatureString = '';
    for (const [key, value] of sortedEntries) {
      if (value !== '' && key !== 'signature' && key !== 'testing') {
        signatureString += key + '=' + encodeURIComponent(value) + '&';
      }
    }

    // Remove the last '&'
    signatureString = signatureString.slice(0, -1);

    console.log('PayFast API Signature Debug:', {
      timestamp,
      merchant_id: this.config.merchantId,
      version,
      bodyParams,
      urlParams,
      sortedData: sortedEntries,
      signatureString,
      passphrase: this.config.passphrase ? '[SET]' : '[NOT SET]'
    });

    // Hash the data and create the signature (exactly like Postman script)
    const signature = crypto.createHash("md5").update(signatureString).digest("hex");

    console.log('PayFast API Generated Signature:', signature);

    return {
      'merchant-id': this.config.merchantId,
      'version': version,
      'timestamp': timestamp,
      'signature': signature,
      'Content-Type': 'application/json'
    };
  }

  async updateSubscription(token: string, updates: {
    amount?: number;
    frequency?: number;
    cycles?: number;
    run_date?: string;
  }): Promise<boolean> {
    try {
      const headers = this.generateApiHeaders(updates);
      const apiUrl = `${this.config.apiBaseUrl}/subscriptions/${token}/update?testing=true`;

      console.log('PayFast Update Request:', {
        url: apiUrl,
        method: 'PATCH',
        headers: {
          'merchant-id': headers['merchant-id'],
          'version': headers['version'],
          'timestamp': headers['timestamp'],
          'signature': headers['signature'],
          'Content-Type': headers['Content-Type']
        },
        updates
      });

      console.log('PayFast Update - Equivalent curl command:');
      console.log(`curl --location '${apiUrl}' \\`);
      console.log(`--header 'merchant-id: ${headers['merchant-id']}' \\`);
      console.log(`--header 'version: ${headers['version']}' \\`);
      console.log(`--header 'timestamp: ${headers['timestamp']}' \\`);
      console.log(`--header 'signature: ${headers['signature']}' \\`);
      console.log(`--header 'Content-Type: ${headers['Content-Type']}' \\`);
      console.log(`--data '${JSON.stringify(updates)}'`);

      const response = await fetch(apiUrl, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updates)
      });

      console.log('PayFast Update Response:', {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type')
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('PayFast Update API error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        return false;
      }

      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        const responseText = await response.text();
        console.log('PayFast Update non-JSON response:', responseText);
        return responseText.toLowerCase().includes('success') || response.status === 200;
      }

      const result = await response.json();
      console.log('PayFast Update Result:', result);
      return result.status === 'success';
    } catch (error) {
      console.error('Error updating PayFast subscription:', error);
      return false;
    }
  }

  async cancelSubscription(token: string): Promise<boolean> {
    try {
      // First, check the subscription status
      console.log('Checking subscription status before cancellation...');
      const subscriptionInfo = await this.getSubscription(token);
      console.log('Subscription info before cancel:', subscriptionInfo);

      const headers = this.generateApiHeaders();
      // Use testing=true for both production and sandbox for now
      const apiUrl = `${this.config.apiBaseUrl}/subscriptions/${token}/cancel?testing=true`;

      console.log('PayFast Cancel Request:', {
        url: apiUrl,
        method: 'PUT',
        headers: {
          'merchant-id': headers['merchant-id'],
          'version': headers['version'],
          'timestamp': headers['timestamp'],
          'signature': headers['signature'],
          'Content-Type': headers['Content-Type']
        }
      });

      console.log('PayFast Cancel - Equivalent curl command:');
      console.log(`curl --location '${apiUrl}' \\`);
      console.log(`--header 'merchant-id: ${headers['merchant-id']}' \\`);
      console.log(`--header 'version: ${headers['version']}' \\`);
      console.log(`--header 'timestamp: ${headers['timestamp']}' \\`);
      console.log(`--header 'signature: ${headers['signature']}'`);

      const response = await fetch(apiUrl, {
        method: 'PUT',
        headers
      });

      console.log('PayFast Cancel Response:', {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type')
      });

      // Check if response is successful
      if (!response.ok) {
        const errorText = await response.text();
        console.error('PayFast API error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        return false;
      }

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        const responseText = await response.text();
        console.log('PayFast non-JSON response:', responseText);

        // Some APIs return plain text "success" for successful operations
        if (responseText.toLowerCase().includes('success') || response.status === 200) {
          return true;
        }
        return false;
      }

      const result = await response.json();
      console.log('PayFast Cancel Result:', result);
      return result.status === 'success';
    } catch (error) {
      console.error('Error cancelling PayFast subscription:', error);
      return false;
    }
  }

  async pauseSubscription(token: string, cycles: number = 1): Promise<boolean> {
    try {
      const bodyParams = { cycles };
      const headers = this.generateApiHeaders(bodyParams);

      const response = await fetch(`${this.config.apiBaseUrl}/subscriptions/${token}/pause?testing=true`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ cycles })
      });

      const result = await response.json();
      return result.status === 'success';
    } catch (error) {
      console.error('Error pausing PayFast subscription:', error);
      return false;
    }
  }

  async unpauseSubscription(token: string): Promise<boolean> {
    try {
      const headers = this.generateApiHeaders();

      const response = await fetch(`${this.config.apiBaseUrl}/subscriptions/${token}/unpause?testing=true`, {
        method: 'PUT',
        headers
      });

      const result = await response.json();
      return result.status === 'success';
    } catch (error) {
      console.error('Error unpausing PayFast subscription:', error);
      return false;
    }
  }

  async getSubscription(token: string): Promise<any> {
    try {
      const headers = this.generateApiHeaders();
      const apiUrl = `${this.config.apiBaseUrl}/subscriptions/${token}/fetch?testing=true`;

      console.log('PayFast Get Subscription Request:', {
        url: apiUrl,
        method: 'GET',
        headers: {
          'merchant-id': headers['merchant-id'],
          'version': headers['version'],
          'timestamp': headers['timestamp'],
          'signature': headers['signature']
        }
      });

      console.log('PayFast Get Subscription - Equivalent curl command:');
      console.log(`curl --location '${apiUrl}' \\`);
      console.log(`--header 'merchant-id: ${headers['merchant-id']}' \\`);
      console.log(`--header 'version: ${headers['version']}' \\`);
      console.log(`--header 'timestamp: ${headers['timestamp']}' \\`);
      console.log(`--header 'signature: ${headers['signature']}'`);

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers
      });

      const result = await response.json();
      return result.status === 'success' ? result.data.response : null;
    } catch (error) {
      console.error('Error fetching PayFast subscription:', error);
      return null;
    }
  }
}