import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  container: {
    marginTop: 20,
  },
  summaryBox: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    marginVertical: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  label: {
    fontSize: 11,
    color: '#6b7280',
  },
  value: {
    fontSize: 11,
    color: '#111827',
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111827',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#059669',
  },
  vatLabel: {
    fontSize: 10,
    color: '#6b7280',
  },
  actionButton: {
    marginTop: 20,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  paymentInfo: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
  },
  paymentText: {
    fontSize: 10,
    color: '#1e40af',
    textAlign: 'center',
  },
});

interface SummaryProps {
  totals: {
    subtotal: number;
    vatRate: number;
    vatAmount: number;
    total: number;
    currency: string;
  };
  payment: {
    method?: string;
    status: string;
    paidAt?: Date | null;
    reference?: string;
  };
}

export const Summary: React.FC<SummaryProps> = ({ totals, payment }) => {
  const formatCurrency = (amount: number) => {
    const symbol = totals.currency === 'ZAR' ? 'R' : 
                   totals.currency === 'USD' ? '$' : 
                   totals.currency === 'EUR' ? '€' : '£';
    return `${symbol}${(amount / 100).toFixed(2)}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.summaryBox}>
        <View style={styles.row}>
          <Text style={styles.label}>Subtotal</Text>
          <Text style={styles.value}>{formatCurrency(totals.subtotal)}</Text>
        </View>
        
        {totals.vatAmount > 0 && (
          <View style={styles.row}>
            <Text style={styles.vatLabel}>VAT ({totals.vatRate}%)</Text>
            <Text style={styles.value}>{formatCurrency(totals.vatAmount)}</Text>
          </View>
        )}
        
        <View style={styles.divider} />
        
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Amount Paid</Text>
          <Text style={styles.totalValue}>{formatCurrency(totals.total)}</Text>
        </View>
      </View>
      
      {payment.status === 'completed' && (
        <View style={styles.paymentInfo}>
          <Text style={styles.paymentText}>
            Payment processed successfully on {payment.paidAt ? new Date(payment.paidAt).toLocaleDateString() : 'N/A'}
          </Text>
          {payment.reference && (
            <Text style={styles.paymentText}>
              Reference: {payment.reference}
            </Text>
          )}
        </View>
      )}
      
      
    </View>
  );
};