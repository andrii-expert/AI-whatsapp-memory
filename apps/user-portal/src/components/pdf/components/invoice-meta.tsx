import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  container: {
    marginTop: 20,
    marginBottom: 10,
  },
  invoiceNumber: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  metaGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  metaColumn: {
    flex: 1,
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 10,
    color: '#6b7280',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  metaValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111827',
  },
  paymentMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentIcon: {
    width: 40,
    height: 20,
    backgroundColor: '#0070ba',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  paymentText: {
    fontSize: 8,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'center',
  },
  statusPaid: {
    backgroundColor: '#dcfce7',
  },
  statusPending: {
    backgroundColor: '#fef3c7',
  },
  statusFailed: {
    backgroundColor: '#fee2e2',
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  statusTextPaid: {
    color: '#166534',
  },
  statusTextPending: {
    color: '#92400e',
  },
  statusTextFailed: {
    color: '#991b1b',
  },
});

interface InvoiceMetaProps {
  invoice: {
    number: string;
    date: Date | null;
    dueDate?: Date | null;
    status: string;
  };
  totals: {
    total: number;
    currency: string;
  };
  payment: {
    method?: string;
    status: string;
  };
}

export const InvoiceMeta: React.FC<InvoiceMetaProps> = ({ invoice, totals, payment }) => {
  const formatDate = (date: Date | null | undefined) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatCurrency = (amount: number) => {
    const symbol = totals.currency === 'ZAR' ? 'R' :
                   totals.currency === 'USD' ? '$' :
                   totals.currency === 'EUR' ? '€' : '£';
    return `${symbol}${(amount / 100).toFixed(2)}`;
  };

  const getPaymentMethodDisplay = () => {
    const method = payment.method || 'Card';
    return method.charAt(0).toUpperCase() + method.slice(1);
  };

  const getPaymentProviderDisplay = () => {
    // Simple logic based on payment method - can be enhanced
    const method = payment.method?.toLowerCase() || 'card';
    if (method.includes('eft')) return 'EFT';
    if (method.includes('debit')) return 'DEBIT';
    return 'CARD';
  };

  const getStatusStyle = () => {
    switch (invoice.status) {
      case 'completed':
        return { badge: styles.statusPaid, text: styles.statusTextPaid };
      case 'pending':
      case 'processing':
        return { badge: styles.statusPending, text: styles.statusTextPending };
      case 'failed':
      case 'refunded':
        return { badge: styles.statusFailed, text: styles.statusTextFailed };
      default:
        return { badge: styles.statusPending, text: styles.statusTextPending };
    }
  };

  const statusStyle = getStatusStyle();

  return (
    <View style={styles.container}>
      <Text style={styles.invoiceNumber}>
        Receipt # {invoice.number}
      </Text>
      
      <View style={styles.metaGrid}>
        <View style={styles.metaColumn}>
          <Text style={styles.metaLabel}>Amount Paid</Text>
          <Text style={styles.metaValue}>{formatCurrency(totals.total)}</Text>
        </View>

        <View style={styles.metaColumn}>
          <Text style={styles.metaLabel}>Receipt Date</Text>
          <Text style={styles.metaValue}>{formatDate(invoice.date)}</Text>
        </View>

        <View style={styles.metaColumn}>
          <Text style={styles.metaLabel}>Payment Method</Text>
          <View style={styles.paymentMethod}>
            <Text style={styles.metaValue}>{getPaymentMethodDisplay()}</Text>
            <View style={styles.paymentIcon}>
              <Text style={styles.paymentText}>{getPaymentProviderDisplay()}</Text>
            </View>
          </View>
        </View>
      </View>
      
      <View style={[styles.statusBadge, statusStyle.badge]}>
        <Text style={[styles.statusText, statusStyle.text]}>
          {invoice.status}
        </Text>
      </View>
    </View>
  );
};