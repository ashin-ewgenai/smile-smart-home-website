import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

// Optional: register a font (keeps layout stable across devices)
// Font.register({ family: 'Inter', src: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3x06lQ.ttf' });

const styles = StyleSheet.create({
  page: {
    padding: 24,
    fontSize: 11,
    color: '#111827',
  },
  header: {
    marginBottom: 16,
    borderBottom: '1px solid #e5e7eb',
    paddingBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    marginTop: 16,
    marginBottom: 8,
  },
  grid: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gridItem: {
    flexGrow: 1,
    minWidth: '33%',
  },
  label: {
    color: '#6b7280',
    marginBottom: 2,
  },
  value: {
    fontSize: 11,
  },
  table: {
    marginTop: 8,
    border: '1px solid #e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
  },
  th: {
    flex: 1,
    backgroundColor: '#f9fafb',
    padding: 6,
    fontWeight: 600,
    borderRight: '1px solid #e5e7eb',
  },
  td: {
    flex: 1,
    padding: 6,
    borderTop: '1px solid #e5e7eb',
    borderRight: '1px solid #e5e7eb',
  },
  totals: {
    marginTop: 10,
    gap: 4,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  small: { fontSize: 10, color: '#374151' },
});

export type EstimateItem = {
  id: string;
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discount?: number; // absolute
  taxPercent?: number;
};

export interface EstimatePDFProps {
  createForm: {
    quoteId: string;
    issueDate: string; // yyyy-mm-dd
    expiryDate?: string;
    customerEmail: string;
    paymentTerms?: string;
    warranty?: string;
    deliveryTimeline?: string;
    notes?: string;
  };
  items: EstimateItem[];
  totals: { subtotal: number; taxes: number; grand: number };
}

const currency = (n: number) => `₹ ${Number(n || 0).toFixed(2)}`;

const EstimatePDF: React.FC<EstimatePDFProps> = ({ createForm, items, totals }) => {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Estimation Quote</Text>
          <Text style={styles.small}>Generated from Smile Smart Home</Text>
        </View>

        {/* Quote Information */}
        <Text style={styles.sectionTitle}>Quote Information</Text>
        <View style={styles.grid}>
          <View style={styles.gridItem}>
            <Text style={styles.label}>Quote ID</Text>
            <Text style={styles.value}>{createForm.quoteId}</Text>
          </View>
          <View style={styles.gridItem}>
            <Text style={styles.label}>Date of Issue</Text>
            <Text style={styles.value}>{createForm.issueDate}</Text>
          </View>
          <View style={styles.gridItem}>
            <Text style={styles.label}>Expiry Date</Text>
            <Text style={styles.value}>{createForm.expiryDate || '-'}</Text>
          </View>
          <View style={styles.gridItem}>
            <Text style={styles.label}>Customer Email</Text>
            <Text style={styles.value}>{createForm.customerEmail}</Text>
          </View>
        </View>

        {/* Items Table */}
        <Text style={styles.sectionTitle}>Products & Services</Text>
        <View style={styles.table}>
          <View style={styles.row}>
            <Text style={[styles.th, { flex: 2 }]}>Item</Text>
            <Text style={[styles.th, { flex: 3 }]}>Description</Text>
            <Text style={styles.th}>Qty</Text>
            <Text style={styles.th}>Unit</Text>
            <Text style={styles.th}>Discount</Text>
            <Text style={styles.th}>Tax %</Text>
            <Text style={styles.th}>Total</Text>
          </View>
          {items.map((it) => {
            const line = Math.max(0, (it.quantity || 0) * (it.unitPrice || 0) - (it.discount || 0));
            const tax = (line * (it.taxPercent || 0)) / 100;
            const total = line + tax;
            return (
              <View key={it.id} style={styles.row}>
                <Text style={[styles.td, { flex: 2 }]}>{it.name || '-'}</Text>
                <Text style={[styles.td, { flex: 3 }]}>{it.description || '-'}</Text>
                <Text style={styles.td}>{it.quantity ?? 0}</Text>
                <Text style={styles.td}>{currency(it.unitPrice || 0)}</Text>
                <Text style={styles.td}>{currency(it.discount || 0)}</Text>
                <Text style={styles.td}>{it.taxPercent ?? 0}</Text>
                <Text style={styles.td}>{currency(total)}</Text>
              </View>
            );
          })}
        </View>

        {/* Totals */}
        <View style={styles.totals}>
          <View style={styles.totalsRow}>
            <Text>Subtotal</Text>
            <Text>{currency(totals.subtotal)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text>Taxes</Text>
            <Text>{currency(totals.taxes)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text>Grand Total</Text>
            <Text>{currency(totals.grand)}</Text>
          </View>
        </View>

        {/* Terms (upto the Notes label — exclude Notes content) */}
        {(createForm.paymentTerms || createForm.warranty || createForm.deliveryTimeline) && (
          <>
            <Text style={styles.sectionTitle}>Terms & Conditions</Text>
            {createForm.paymentTerms && (
              <Text style={styles.small}>Payment Terms: {createForm.paymentTerms}</Text>
            )}
            {createForm.warranty && (
              <Text style={styles.small}>Warranty: {createForm.warranty}</Text>
            )}
            {createForm.deliveryTimeline && (
              <Text style={styles.small}>Delivery: {createForm.deliveryTimeline}</Text>
            )}
          </>
        )}
      </Page>
    </Document>
  );
};

export default EstimatePDF;
