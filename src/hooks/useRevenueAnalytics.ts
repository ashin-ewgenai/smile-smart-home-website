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
  const [availableQuotes, setAvailableQuotes] = useState<any[]>([]);
  const [totalQuotesCount, setTotalQuotesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    
    // 1. Confirmed Bills (Official estimations)
    const q1 = query(
      collection(db, 'Estimation_Quote'),
      where('status', 'in', ['Confirmed', 'confirmed'])
    );

    // 2. Accepted/Confirmed Leads (Home Planner, Floorplan, AI Consultant)
    const q2 = query(
      collection(db, 'Planner_Leads'),
      where('status', 'in', ['accepted', 'Accepted', 'confirmed', 'Confirmed'])
    );

    // 3. Formally Confirmed Quotes (Flat collection used by EstimationTool)
    const q3 = query(
      collection(db, 'quotes'),
      where('status', 'in', ['confirmed', 'Confirmed', 'approved', 'Approved'])
    );

    // 4. Static count for conversion metric
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

    const unsub3 = onSnapshot(q3, (snap) => {
      setAvailableQuotes(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      if (loading) setLoading(false);
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
      // Handle Firestore Timestamp
      if (obj.toDate) return obj.toDate();
      // Handle local snapshots with pending server timestamps
      if (typeof obj === 'object' && obj.nanoseconds !== undefined) return new Date(); 
      const d = new Date(obj);
      return isNaN(d.getTime()) ? null : d;
    };

    // Helper to parse amount from various fields
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

    // Process everything into a tiered structure to avoid double counting
    // Tier 1: Official Bills (Estimation_Quote)
    // Tier 2: Confirmed Quotes (quotes collection)
    // Tier 3: Accepted Leads (Planner_Leads)
    
    const processedQuoteIds = new Set<string>(); // IDs from 'quotes' collection
    const unifiedSales: { amount: number; date: Date; items?: any[]; source: string }[] = [];
    
    let billRevenue = 0;
    let leadRevenue = 0;

    // 1. Process Estimations (Highest priority)
    estimations.forEach(est => {
      const date = getDate(est.issueDate);
      if (isWithinRange(date)) {
        const amount = parseAmount(est);
        unifiedSales.push({ amount, date: date!, items: est.items, source: 'bill' });
        billRevenue += amount;
        
        // Track which formal quotes and leads this bill covers
        if (est.originalQuoteId) processedQuoteIds.add(est.originalQuoteId);
        if (est.leadId) processedQuoteIds.add(est.leadId); // Trace back to lead if linked
      }
    });

    // 2. Process Confirmed Quotes (Medium priority)
    availableQuotes.forEach(quote => {
      if (processedQuoteIds.has(quote.id)) return; // Already counted as a Bill

      // Use a local fallback for the date to ensure "lively" updates before serverTimestamp settles
      const date = getDate(quote.confirmedAt || quote.updatedAt || quote.createdAt) || new Date();
      if (isWithinRange(date)) {
        const amount = parseAmount(quote);
        unifiedSales.push({ amount, date: date!, source: 'quote' });
        leadRevenue += amount;
        
        processedQuoteIds.add(quote.id);
        if (quote.leadId) processedQuoteIds.add(quote.leadId); // Trace back to lead if linked
      }
    });

    // 3. Process Accepted Leads (Lowest priority)
    acceptedLeads.forEach(lead => {
      // If this lead has been converted to a formal quote or bill that we already counted, skip it
      if (processedQuoteIds.has(lead.id)) return;

      // Use a local fallback for the date to ensure "lively" updates before serverTimestamp settles
      const date = getDate(lead.acceptedAt || lead.updatedAt || lead.createdAt) || new Date();
      if (isWithinRange(date)) {
        const amount = parseAmount(lead);
        unifiedSales.push({ amount, date: date!, source: 'lead' });
        leadRevenue += amount;
        
        processedQuoteIds.add(lead.id); // Mark as processed
      }
    });

    let totalRevenue = billRevenue + leadRevenue;
    const monthMap: Record<string, number> = {};
    const deviceMap: Record<string, { count: number; revenue: number }> = {};

    // Generate all months in the date range
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
        rawLeads: acceptedLeads.length,
        rawQuotes: availableQuotes.length
      }
    };
  }, [estimations, acceptedLeads, availableQuotes, totalQuotesCount, dateRange.start.getTime(), dateRange.end.getTime(), loading, error]);

  return stats;
}
