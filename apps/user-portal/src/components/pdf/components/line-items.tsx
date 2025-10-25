import React from 'react';
import { Text, View, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  container: {
    marginVertical: 20,
  },
  table: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    padding: 12,
  },
  tableRow: {
    flexDirection: 'row',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  lastRow: {
    borderBottomWidth: 0,
  },
  descriptionColumn: {
    flex: 3,
  },
  quantityColumn: {
    flex: 1,
    textAlign: 'center',
  },
  priceColumn: {
    flex: 1,
    textAlign: 'right',
  },
  totalColumn: {
    flex: 1,
    textAlign: 'right',
  },
  headerText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#374151',
    textTransform: 'uppercase',
  },
  cellText: {
    fontSize: 11,
    color: '#111827',
  },
  descriptionText: {
    fontSize: 11,
    color: '#111827',
    fontWeight: 'bold',
  },
  descriptionSubtext: {
    fontSize: 9,
    color: '#6b7280',
    marginTop: 2,
  },
  noteText: {
    fontSize: 9,
    color: '#6b7280',
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
  },
});

interface LineItemsProps {
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  currency: string;
}

export const LineItems: React.FC<LineItemsProps> = ({ items, currency }) => {
  const formatCurrency = (amount: number) => {
    const symbol = currency === 'ZAR' ? 'R' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£';
    return `${symbol}${(amount / 100).toFixed(2)}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.table}>
        {/* Header */}
        <View style={styles.tableHeader}>
          <View style={styles.descriptionColumn}>
            <Text style={styles.headerText}>Description</Text>
          </View>
          <View style={styles.quantityColumn}>
            <Text style={styles.headerText}>Qty</Text>
          </View>
          <View style={styles.priceColumn}>
            <Text style={styles.headerText}>Price</Text>
          </View>
          <View style={styles.totalColumn}>
            <Text style={styles.headerText}>Total</Text>
          </View>
        </View>
        
        {/* Rows */}
        {items.map((item, index) => (
          <View 
            key={index} 
            style={[
              styles.tableRow,
              ...(index === items.length - 1 ? [styles.lastRow] : [])
            ]}
          >
            <View style={styles.descriptionColumn}>
              <Text style={styles.descriptionText}>
                {item.description.split(' - ')[0]}
              </Text>
              {item.description.includes(' - ') && (
                <Text style={styles.descriptionSubtext}>
                  {item.description.split(' - ')[1]}
                </Text>
              )}
            </View>
            <View style={styles.quantityColumn}>
              <Text style={styles.cellText}>{item.quantity}</Text>
            </View>
            <View style={styles.priceColumn}>
              <Text style={styles.cellText}>
                {formatCurrency(item.unitPrice)}
              </Text>
            </View>
            <View style={styles.totalColumn}>
              <Text style={styles.cellText}>
                {formatCurrency(item.total)}
              </Text>
            </View>
          </View>
        ))}
      </View>
      
      <Text style={styles.noteText}>
        Items listed are included in the price
      </Text>
    </View>
  );
};