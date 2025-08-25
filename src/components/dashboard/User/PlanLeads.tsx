import React, { useEffect, useState } from 'react';
import { db } from '../../../lib/firebase';
import { getDocs, orderBy, query } from 'firebase/firestore';
import { plannerLeadsCollection } from '../../../models/Collections';

type Lead = {
  id: string;
  email?: string;
  planText?: string;
};

const PlanLeads: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const q = query(plannerLeadsCollection(db), orderBy('updatedAt', 'desc'));
        const snap = await getDocs(q);
        if (cancelled) return;
        const list: Lead[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setLeads(list);
      } catch (e: any) {
        setError(e?.message || 'Failed to load plan leads');
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <section className="p-6">
        <h1 className="text-2xl font-semibold text-white mb-4">Plan Leads</h1>
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-6 text-gray-300">Loading…</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="p-6">
        <h1 className="text-2xl font-semibold text-white mb-4">Plan Leads</h1>
        <div className="rounded-xl border border-red-800 bg-red-900/30 p-6 text-red-200">{error}</div>
      </section>
    );
  }

  const renderPlan = (text?: string) => {
    const raw = (text || '').trim();
    if (!raw) return <div className="text-gray-400">-</div>;
    const lines = raw.split(/\r?\n/);
    const elements: React.ReactNode[] = [];
    let bufferList: string[] = [];

    const flushList = () => {
      if (bufferList.length > 0) {
        elements.push(
          <ul className="list-disc pl-6 space-y-1" key={`ul-${elements.length}`}>
            {bufferList.map((li, idx) => (
              <li key={idx} className="text-gray-200">{li}</li>
            ))}
          </ul>
        );
        bufferList = [];
      }
    };

    lines.forEach((line, i) => {
      const l = line.trim();
      if (!l) {
        flushList();
        elements.push(<div key={`br-${i}`} className="h-3" />);
        return;
      }
      if (l.startsWith('- ')) {
        bufferList.push(l.replace(/^-\s*/, ''));
        return;
      }
      // New section label like "Recommended Setup:" or "Your Preferences:"
      const labelMatch = l.match(/^(.*?:)\s*(.*)$/);
      if (labelMatch) {
        flushList();
        const [, label, rest] = labelMatch;
        elements.push(
          <div key={`lbl-${i}`} className="text-gray-200">
            <span className="font-semibold text-white">{label} </span>
            {rest}
          </div>
        );
        return;
      }
      // Fallback paragraph
      flushList();
      elements.push(
        <div key={`p-${i}`} className="text-gray-200">
          {l}
        </div>
      );
    });
    flushList();
    return <div className="space-y-1">{elements}</div>;
  };

  return (
    <section className="p-6">
      <h1 className="text-2xl font-semibold text-white mb-4">Plan Leads</h1>
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 divide-y divide-gray-800">
        {leads.length === 0 && (
          <div className="p-6 text-gray-400">No leads found.</div>
        )}
        {leads.map((lead) => (
          <div key={lead.id} className="p-6 flex flex-col gap-3">
            <button
              type="button"
              className="text-left text-sm text-gray-400 hover:text-gray-200 flex items-center gap-2 focus:outline-none"
              onClick={() =>
                setOpenIds((prev) => {
                  // Accordion behavior: one open at a time; clicking the same closes all
                  if (prev.has(lead.id)) return new Set();
                  return new Set([lead.id]);
                })
              }
              aria-expanded={openIds.has(lead.id)}
              aria-controls={`lead-panel-${lead.id}`}
            >
              <span className={`transition-transform duration-200 inline-block ${
                openIds.has(lead.id) ? 'rotate-90' : 'rotate-0'
              }`}
                aria-hidden="true"
              >▶</span>
              <span>{lead.email || 'Unknown email'}</span>
            </button>
            {openIds.has(lead.id) && (
              <div id={`lead-panel-${lead.id}`}>{renderPlan(lead.planText)}</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};

export default PlanLeads;
