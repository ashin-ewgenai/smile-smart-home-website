import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { EstimationQuote } from '../models/Collections';

export interface RevenueStats {
  totalRevenue: number;
  billRevenue: number;
  leadRevenue: number;
  confirmedQuotes: number;
  totalQuotes: number;
  averageDealValue: number;
  conversionRate: number;
  revenueByMonth: { month: string; amount: number }[];
  topDevices: { name: string; count: number; revenue: number }[];
  funnelData: { stage: string; value: number; color: string; percentage: number }[];
  loading: boolean;
  error: Error | null;
  debugInfo?: {
    rawEstimations: number;
    rawLeads: number;
    rawQuotes: number;
  };
}

export function useRevenueAnalytics(dateRange: { start: Date; end: Date }) {
  const [estimations, setEstimations] = useState<(EstimationQuote & { id: string })[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);

    // 1. All official estimations
    const q1 = collection(db, 'Estimation_Quote');

    // 2. All Leads (Home Planner, Floorplan, AI Consultant)
    const q2 = collection(db, 'Planner_Leads');

    // 3. All Formally Created Quotes
    const q3 = collection(db, 'quotes');

    const unsub1 = onSnapshot(q1, (snap) => {
      setEstimations(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
    }, err => setError(err));

    const unsub2 = onSnapshot(q2, (snap) => {
      setLeads(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, err => setError(err));

    const unsub3 = onSnapshot(q3, (snap) => {
      setQuotes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    }, err => setError(err));

    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, []);

  const stats = useMemo(() => {
    // Helper to get consistent date from various formats
    const getDate = (obj: any): Date | null => {
      if (!obj) return null;
      if (obj.toDate) return obj.toDate();
      if (typeof obj === 'object' && obj.nanoseconds !== undefined) return new Date();
      const d = new Date(obj);
      return isNaN(d.getTime()) ? null : d;
    };

    const parseAmount = (item: any): number => {
      const rawValue =
        item.grandTotal ||
        item.budget ||
        item.totalAmount ||
        item.estimatedPrice ||
        item.total ||
        item.formData?.budget ||
        item.formData?.totalAmount ||
        item.formData?.estimatedPrice ||
        0;

      if (typeof rawValue === 'number') return rawValue;
      return parseFloat(String(rawValue).replace(/[^0-9.]/g, '')) || 0;
    };

    const isWithinRange = (date: Date | null) =>
      date && date >= dateRange.start && date <= dateRange.end;

    // Filters for revenue aggregation (Accepted/Confirmed/Paid)
    const confirmedEstimations = estimations.filter(e => isWithinRange(getDate(e.issueDate)) && ['Confirmed', 'confirmed', 'Paid', 'paid'].includes(e.status));
    const confirmedQuotes = quotes.filter(q => ['confirmed', 'Confirmed', 'approved', 'Approved', 'Paid', 'paid'].includes(q.status));
    const acceptedLeads = leads.filter(l => ['accepted', 'Accepted', 'confirmed', 'Confirmed'].includes(l.status));

    const processedQuoteIds = new Set<string>();
    const unifiedSales: { amount: number; date: Date; items?: any[]; source: string }[] = [];

    let billRevenue = 0;
    let leadRevenue = 0;

    // 1. Process Estimations
    confirmedEstimations.forEach(est => {
      const date = getDate(est.issueDate);
      const amount = parseAmount(est);
      unifiedSales.push({ amount, date: date!, items: est.items, source: 'bill' });
      billRevenue += amount;
      if (est.originalQuoteId) processedQuoteIds.add(est.originalQuoteId);
      if (est.leadId) processedQuoteIds.add(est.leadId);
    });

    // 2. Process Quotes
    confirmedQuotes.forEach(quote => {
      if (processedQuoteIds.has(quote.id)) return;
      const date = getDate(quote.confirmedAt || quote.updatedAt || quote.createdAt) || new Date();
      if (isWithinRange(date)) {
        const amount = parseAmount(quote);
        unifiedSales.push({ amount, date: date!, source: 'quote' });
        leadRevenue += amount;
        processedQuoteIds.add(quote.id);
        if (quote.leadId) processedQuoteIds.add(quote.leadId);
      }
    });

    // 3. Process Leads
    acceptedLeads.forEach(lead => {
      if (processedQuoteIds.has(lead.id)) return;
      const date = getDate(lead.acceptedAt || lead.updatedAt || lead.createdAt) || new Date();
      if (isWithinRange(date)) {
        const amount = parseAmount(lead);
        unifiedSales.push({ amount, date: date!, source: 'lead' });
        leadRevenue += amount;
        processedQuoteIds.add(lead.id);
      }
    });

    // Funnel Data Calculation (Deduplicated by Email/ID to ensure accurate progression)
    const getEmails = (list: any[]) => new Set(list.map(i => (i.customerEmail || i.email || i.id || '').toLowerCase()).filter(Boolean));

    const leadsInRange = leads.filter(l => isWithinRange(getDate(l.createdAt || l.updatedAt)));
    const quotesInRange = quotes.filter(q => isWithinRange(getDate(q.createdAt || q.updatedAt)));
    const billsInRange = estimations.filter(e => isWithinRange(getDate(e.issueDate || e.createdAt)));

    // Unique Customers at each stage
    const uniqueLeads = getEmails(leadsInRange);
    const uniqueQuotes = getEmails(quotesInRange);
    const uniqueBills = getEmails(billsInRange.filter(e => ['Confirmed', 'confirmed', 'Paid', 'paid'].includes(e.status)));
    const uniquePaid = getEmails(billsInRange.filter(e => ['Paid', 'paid'].includes(e.status)));
    
    // "Accepted" Leads are considered "Converted" to the finalized/quote stage
    const uniqueAcceptedLeads = getEmails(leadsInRange.filter(l => ['accepted', 'Accepted', 'confirmed', 'Confirmed'].includes(l.status)));

    // 1. Leads Captured: Anyone who entered the system (Leads + Direct Quotes + Direct Bills)
    const stage1Set = new Set([...uniqueLeads, ...uniqueQuotes, ...uniqueBills]);
    const leadsCaptured = stage1Set.size;

    // 2. Quotes Created: Formal quotes OR Accepted Leads
    const stage2Set = new Set([...uniqueQuotes, ...uniqueAcceptedLeads]);
    const quotesCreated = stage2Set.size;

    // 3. Bills Finalized: Confirmed/Paid Bills OR Accepted Leads (Finalized intent)
    const stage3Set = new Set([...uniqueBills, ...uniqueAcceptedLeads]);
    const billsFinalized = stage3Set.size;

    // 4. Payment Received: Only those who paid
    const stage4Set = uniquePaid;
    const paymentReceived = stage4Set.size;

    const funnelData = [
      { stage: 'Leads Captured', value: leadsCaptured, color: '#0ea5e9', percentage: 100 },
      { stage: 'Quotes Created', value: quotesCreated, color: '#6366f1', percentage: leadsCaptured > 0 ? (quotesCreated / leadsCaptured) * 100 : 0 },
      { stage: 'Bills Finalized', value: billsFinalized, color: '#14b8a6', percentage: quotesCreated > 0 ? (billsFinalized / quotesCreated) * 100 : 0 },
      { stage: 'Payment Received', value: paymentReceived, color: '#10b981', percentage: billsFinalized > 0 ? (paymentReceived / billsFinalized) * 100 : 0 },
    ];

    let totalRevenue = billRevenue + leadRevenue;
    const monthMap: Record<string, number> = {};
    const deviceMap: Record<string, { count: number; revenue: number }> = {};

    const current = new Date(dateRange.start.getFullYear(), dateRange.start.getMonth(), 1);
    const stop = new Date(dateRange.end.getFullYear(), dateRange.end.getMonth(), 1);
    while (current <= stop) {
      const mStr = current.toLocaleString('default', { month: 'short', year: 'numeric' });
      monthMap[mStr] = 0;
      current.setMonth(current.getMonth() + 1);
    }

    unifiedSales.forEach(sale => {
      const month = sale.date.toLocaleString('default', { month: 'short', year: 'numeric' });
      monthMap[month] = (monthMap[month] || 0) + sale.amount;
      sale.items?.forEach(item => {
        const name = item.name || 'Unknown Device';
        deviceMap[name] = deviceMap[name] || { count: 0, revenue: 0 };
        deviceMap[name].count += (item.quantity || 0);
        deviceMap[name].revenue += ((item.unitPrice || 0) * (item.quantity || 0));
      });
    });

    const revenueByMonth = Object.entries(monthMap)
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime());

    const topDevices = Object.entries(deviceMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const confirmedCount = unifiedSales.length;
    const averageDealValue = confirmedCount > 0 ? totalRevenue / confirmedCount : 0;
    const conversionRate = quotes.length > 0 ? (confirmedCount / quotes.length) * 100 : 0;

    return {
      totalRevenue, billRevenue, leadRevenue, confirmedQuotes: confirmedCount,
      totalQuotes: quotes.length, averageDealValue, conversionRate,
      revenueByMonth, topDevices, funnelData, loading, error,
      debugInfo: { rawEstimations: estimations.length, rawLeads: leads.length, rawQuotes: quotes.length }
    };
  }, [estimations, leads, quotes, dateRange.start.getTime(), dateRange.end.getTime(), loading, error]);

  return stats;
}
