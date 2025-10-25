import React from 'react';
import { Text, View, StyleSheet, Image } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  companyInfo: {
    flexDirection: 'column',
    flex: 1,
  },
  companyName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  companyDetails: {
    fontSize: 10,
    color: '#6b7280',
    marginBottom: 2,
  },
  logoContainer: {
    width: 100,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    maxWidth: 100,
    maxHeight: 50,
  },
  receiptTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#374151',
    marginTop: 20,
    textAlign: 'center',
  },
  subscriptionBadge: {
    backgroundColor: '#86efac',
    color: '#14532d',
    padding: '4 8',
    borderRadius: 4,
    fontSize: 10,
    fontWeight: 'bold',
    alignSelf: 'flex-start',
    marginTop: 8,
  },
});

interface HeaderProps {
  company: {
    name: string;
    address?: string;
    email?: string;
    phone?: string;
    taxNumber?: string;
    logo?: string;
  };
}

export const Header: React.FC<HeaderProps> = ({ company }) => {
  return (
    <>
      <View style={styles.header}>
        <View style={styles.companyInfo}>
          <Text style={styles.companyName}>{company.name}</Text>
          
        </View>
        
        {company.logo && (
          <View style={styles.logoContainer}>
            {/* Note: For local images, you'll need to use a base64 string or URL */}
            {/* <Image style={styles.logo} src={company.logo} /> */}
            <View style={{
              width: 80,
              height: 40,
              backgroundColor: '#86efac',
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#14532d' }}>
                LOGO
              </Text>
            </View>
          </View>
        )}
      </View>
      
      <Text style={styles.receiptTitle}>
        Receipt for your {company.name} Subscription
      </Text>
    </>
  );
};