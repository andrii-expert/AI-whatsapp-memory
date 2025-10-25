import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  container: {
    marginTop: 'auto',
    paddingTop: 40,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    marginBottom: 16,
  },
  footerContent: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 9,
    color: '#6b7280',
    marginBottom: 4,
    textAlign: 'center',
  },
  boldText: {
    fontSize: 9,
    color: '#374151',
    fontWeight: 'bold',
  },
  notesContainer: {
    marginBottom: 20,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
  },
  notesTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 4,
  },
  notesText: {
    fontSize: 9,
    color: '#6b7280',
  },
  paymentProcessor: {
    marginTop: 12,
    fontSize: 10,
    color: '#6b7280',
    textAlign: 'center',
  },
  thankYou: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#059669',
    textAlign: 'center',
    marginBottom: 16,
  },
});

interface FooterProps {
  notes?: string;
  payment: {
    method?: string;
    status: string;
    paidAt?: Date | null;
    reference?: string;
  };
}

export const Footer: React.FC<FooterProps> = ({ notes, payment }) => {
  return (
    <View style={styles.container}>
      {payment.status === 'completed' && (
        <Text style={styles.thankYou}>Thank you for your payment!</Text>
      )}
      
      {notes && (
        <View style={styles.notesContainer}>
          <Text style={styles.notesTitle}>Notes</Text>
          <Text style={styles.notesText}>{notes}</Text>
        </View>
      )}
      
      <View style={styles.divider} />
      
      <View style={styles.footerContent}>
        <Text style={styles.footerText}>
          The {formatCurrency(500)} payment will appear on your bank/card statement as:
        </Text>
        <Text style={styles.boldText}>CRACKON* SUBSCRIPTION</Text>
        
        <Text style={styles.paymentProcessor}>
          Payment processed by PayFast (Pty) Ltd
        </Text>
        
        <Text style={styles.footerText}>
          For support, contact billing@crackon.com
        </Text>
        
        <Text style={styles.footerText}>
          CrackOn • 123 Business Street • Cape Town, 8001 • South Africa
        </Text>
        
        <Text style={styles.footerText}>
          This is an electronic receipt. No signature required.
        </Text>
      </View>
    </View>
  );
};

function formatCurrency(amount: number) {
  return `R${(amount / 100).toFixed(2)}`;
}