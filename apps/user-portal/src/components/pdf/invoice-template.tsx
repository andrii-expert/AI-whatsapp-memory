import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';
import { Header } from './components/header';
import { InvoiceMeta } from './components/invoice-meta';
import { CustomerInfo } from './components/customer-info';
import { LineItems } from './components/line-items';
import { Summary } from './components/summary';
import { Footer } from './components/footer';

// Register fonts if needed (optional - uses default fonts if not specified)
// Font.register({
//   family: 'Inter',
//   src: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2',
// });

// Create styles
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    padding: 40,
    fontFamily: 'Helvetica',
  },
  container: {
    flex: 1,
    flexDirection: 'column',
  },
  divider: {
    marginVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
});

export interface InvoiceData {
  company: {
    name: string;
    address?: string;
    email?: string;
    phone?: string;
    taxNumber?: string;
    logo?: string;
  };
  invoice: {
    number: string;
    date: Date | null;
    dueDate?: Date | null;
    status: string;
  };
  customer: {
    name: string;
    email: string;
    company?: string;
    phone?: string;
  };
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
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
  notes?: string;
}

interface InvoiceTemplateProps {
  data: InvoiceData;
}

// Main Invoice Template Component
export const InvoiceTemplate: React.FC<InvoiceTemplateProps> = ({ data }) => {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.container}>
          {/* Header with company info and branding */}
          <Header company={data.company} />
          
          <View style={styles.divider} />
          
          {/* Invoice metadata and customer info */}
          <InvoiceMeta
            invoice={data.invoice}
            totals={data.totals}
            payment={data.payment}
          />
          
          <View style={styles.divider} />
          
          {/* Line items table */}
          <LineItems items={data.lineItems} currency={data.totals.currency} />
          
          <View style={styles.divider} />
          
          {/* Summary with totals */}
          <Summary totals={data.totals} payment={data.payment} />
          
          
        </View>
      </Page>
    </Document>
  );
};