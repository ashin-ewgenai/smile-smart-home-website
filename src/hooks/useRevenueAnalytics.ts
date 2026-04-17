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
  loading: boolean;
  error: Error | null;
  debugInfo?: {
    rawEstimations: number;
    rawLeads: number;
  };
}

export function useRevenueAnalytics(dateRange: { start: Date; end: Date }) {
  const [estimations, setEstimations] = useState<(EstimationQuote & { id: string })[]>([]);
  const [acceptedLeads, setAcceptedLeads] = useState<any[]>([]);
  const [totalQuotesCount, setTotalQuotesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    
    // 1. Confirmed Bills
    const q1 = query(
      collection(db, 'Estimation_Quote'),
      where('status', 'in', ['Confirmed', 'confirmed'])
    );

    // 2. Accepted Leads
    const q2 = query(
      collection(db, 'Planner_Leads'),
      where('status', 'in', ['accepted', 'Accepted'])
    );

    // 3. Static count
    getDocs(collection(db, 'quotes')).then(snap => {
      setTotalQuotesCount(snap.size);
    }).catch(err => console.warn('Quotes count fetch failed:', err));

    const unsub1 = onSnapshot(q1, (snap) => {
      setEstimations(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
      if (loading) setLoading(false);
    }, err => setError(err));

    const unsub2 = onSnapshot(q2, (snap) => {
      setAcceptedLeads(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      if (loading) setLoading(false);
    }, err => setError(err));

    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  const stats = useMemo(() => {
    // Process Estimations
    const filteredEstimations = estimations.filter(est => {
      if (!est.issueDate) return false;
      const date = (est.issueDate as any).toDate ? (est.issueDate as any).toDate() : new Date(est.issueDate as any);
      return date >= dateRange.start && date <= dateRange.end;
    });

    // Process Leads
    const filteredLeads = acceptedLeads.filter(lead => {
      // For leads, we use updatedAt/acceptedAt as the primary date, 
      // because that represents the "Sale" (Acceptance) date.
      const ts = lead.acceptedAt || lead.updatedAt || lead.createdAt;
      if (!ts) return false;
      const date = ts.toDate ? ts.toDate() : new Date(ts);
      return date >= dateRange.start && date <= dateRange.end;
    });

    // Deduplication & Merging
    const processedEmails = new Set<string>();
    let billRevenue = 0;
    let leadRevenue = 0;
    const unifiedSales: { amount: number; date: Date; items?: any[] }[] = [];

    // Prioritize confirmed bills
    filteredEstimations.forEach(est => {
      const email = (est.customerEmail || '').toLowerCase();
      const date = (est.issueDate as any).toDate ? (est.issueDate as any).toDate() : new Date(est.issueDate as any);
      const amount = est.grandTotal || 0;
      
      unifiedSales.push({
        amount,
        date,
        items: est.items
      });
      billRevenue += amount;
      if (email && email !== 'anonymous') processedEmails.add(email);
    });

    // Add accepted leads if no bill exists for that user
    filteredLeads.forEach(lead => {
      const email = (lead.email || lead.formData?.email || '').toLowerCase();
      
      // We skip deduplication if the email is generic/anonymous
      const isDuplicate = email && email !== 'anonymous' && processedEmails.has(email);
      
      if (!isDuplicate) {
        const ts = lead.acceptedAt || lead.updatedAt || lead.createdAt;
        const date = ts.toDate ? ts.toDate() : new Date(ts);
        
        // Extract value from any possible field
        const rawValue = 
          lead.formData?.budget || 
          lead.formData?.totalAmount || 
          lead.formData?.estimatedPrice || 
          lead.estimatedPrice || 
          lead.totalAmount ||
          0;
          
        const amount = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue).replace(/[^0-9.]/g, '')) || 0;
        
        unifiedSales.push({
          amount,
          date
        });
        leadRevenue += amount;
        if (email && email !== 'anonymous') processedEmails.add(email);
      }
    });

    let totalRevenue = billRevenue + leadRevenue;
    const monthMap: Record<string, number> = {};
    const deviceMap: Record<string, { count: number; revenue: number }> = {};

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
    const conversionRate = totalQuotesCount > 0 ? (confirmedCount / totalQuotesCount) * 100 : 0;

    return {
      totalRevenue,
      billRevenue,
      leadRevenue,
      confirmedQuotes: confirmedCount,
      totalQuotes: totalQuotesCount,
      averageDealValue,
      conversionRate,
      revenueByMonth,
      topDevices,
      loading,
      error,
      debugInfo: {
        rawEstimations: estimations.length,
        rawLeads: acceptedLeads.length
      }
    };
  }, [estimations, acceptedLeads, totalQuotesCount, dateRange.start.getTime(), dateRange.end.getTime(), loading, error]);

  return stats;
}
