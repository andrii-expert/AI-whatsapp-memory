import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  container: {
    marginTop: 20,
    marginBottom: 20,
  },
  title: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  label: {
    fontSize: 10,
    color: '#6b7280',
    width: 80,
  },
  value: {
    fontSize: 10,
    color: '#111827',
    flex: 1,
  },
});

interface CustomerInfoProps {
  customer: {
    name: string;
    email: string;
    company?: string;
    phone?: string;
  };
}

export const CustomerInfo: React.FC<CustomerInfoProps> = ({ customer }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bill To</Text>
      
      <View style={styles.infoRow}>
        <Text style={styles.label}>Name:</Text>
        <Text style={styles.value}>{customer.name}</Text>
      </View>
      
      <View style={styles.infoRow}>
        <Text style={styles.label}>Email:</Text>
        <Text style={styles.value}>{customer.email}</Text>
      </View>
      
      {customer.company && (
        <View style={styles.infoRow}>
          <Text style={styles.label}>Company:</Text>
          <Text style={styles.value}>{customer.company}</Text>
        </View>
      )}
      
      {customer.phone && (
        <View style={styles.infoRow}>
          <Text style={styles.label}>Phone:</Text>
          <Text style={styles.value}>{customer.phone}</Text>
        </View>
      )}
    </View>
  );
};