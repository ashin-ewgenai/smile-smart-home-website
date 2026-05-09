import React, { useState } from 'react';
import { useDevices } from '../../../contexts/DevicesContext';
import { Layout, Search, Filter, Loader2, MoreVertical, Calendar, User, Mail, MessageSquare, AlertCircle, Trash2, Clock } from 'lucide-react';

interface KanbanColumn {
  id: string;
  title: string;
  color: string;
}

interface KanbanBoardProps<T> {
  items: T[];
  columns: KanbanColumn[];
  onStatusChange: (id: string, newStatus: string) => Promise<void>;
  onReorder?: (id: string, newIndex: number) => Promise<void>; // New reorder callback
  onDeleteItem: (item: T) => Promise<void>;
  renderCardDetails: (item: T) => React.ReactNode;
  getCardId: (item: T) => string;
  getCardStatus: (item: T) => string;
  getCardTitle: (item: T) => string;
  getCardSubtitle?: (item: T) => string;
  getCardIndex?: (item: T) => number; // New index getter
  getCardDate?: (item: T) => any;
  itemType: 'Planner_Leads' | 'contactRequests' | 'Support_Tickets';
  disableDrag?: boolean;
  renderActions?: (item: T) => React.ReactNode;
  renderSourceBadge?: (item: T) => React.ReactNode;
}

export function KanbanBoard<T extends { id: string }>({
  items,
  columns,
  onStatusChange,
  onReorder,
  onDeleteItem,
  renderCardDetails,
  getCardId,
  getCardStatus,
  getCardTitle,
  getCardSubtitle,
  getCardIndex,
  getCardDate,
  itemType,
  disableDrag = false,
  renderActions,
  renderSourceBadge
}: KanbanBoardProps<T>) {
  const { isFloorplanItem } = useDevices();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [columnSearch, setColumnSearch] = useState<Record<string, string>>({});
  const [columnDateRange, setColumnDateRange] = useState<Record<string, string>>({});
  const [columnStartDate, setColumnStartDate] = useState<Record<string, string>>({});
  const [columnEndDate, setColumnEndDate] = useState<Record<string, string>>({});
  const [activeFilters, setActiveFilters] = useState<Record<string, boolean>>({});

  // Group and sort items by status and dragIndex
  const boardData = React.useMemo(() => {
    return columns.reduce((acc, col) => {
      let colItems = items.filter(item => {
        const status = getCardStatus(item)?.toLowerCase();
        const normalizedStatus = status?.replace(/\s+/g, '_');
        const normalizedColId = col.id.toLowerCase().replace(/\s+/g, '_');
        return normalizedStatus === normalizedColId || status === col.id.toLowerCase();
      });

      // Apply Column-level Search
      const search = columnSearch[col.id]?.toLowerCase();
      if (search) {
        colItems = colItems.filter(item => 
          getCardTitle(item).toLowerCase().includes(search) || 
          getCardSubtitle?.(item).toLowerCase().includes(search)
        );
      }

      // Apply Column-level Date Range
      const range = columnDateRange[col.id] || 'all';
      if (range !== 'all') {
        const now = new Date();
        colItems = colItems.filter(item => {
          const timestamp = getCardDate?.(item);
          if (!timestamp) return false;
          const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
          
          if (range === 'custom') {
            const startStr = columnStartDate[col.id];
            const endStr = columnEndDate[col.id];
            if (startStr) {
              const start = new Date(startStr);
              start.setHours(0, 0, 0, 0);
              if (date < start) return false;
            }
            if (endStr) {
              const end = new Date(endStr);
              end.setHours(23, 59, 59, 999);
              if (date > end) return false;
            }
            return true;
          }

          if (range === 'today') return date.toDateString() === now.toDateString();
          if (range === 'week') return (now.getTime() - date.getTime()) < 7 * 24 * 60 * 60 * 1000;
          if (range === 'month') return (now.getTime() - date.getTime()) < 30 * 24 * 60 * 60 * 1000;
          return true;
        });
      }

      acc[col.id] = colItems.sort((a, b) => {
        // 1. Sort by Date Descending (Latest First)
        const dateA = getCardDate?.(a);
        const dateB = getCardDate?.(b);
        
        const getTime = (d: any) => {
          if (!d) return 0;
          if (d.toDate) return d.toDate().getTime();
          if (d.seconds) return d.seconds * 1000;
          return new Date(d).getTime();
        };
        
        const valA = getTime(dateA);
        const valB = getTime(dateB);
        
        if (valB !== valA) return valB - valA;

        // 2. Fallback to dragIndex
        const idxA = getCardIndex?.(a) ?? 0;
        const idxB = getCardIndex?.(b) ?? 0;
        return idxA - idxB;
      });
      return acc;
    }, {} as Record<string, T[]>);
  }, [items, columns, getCardStatus, getCardIndex, getCardDate, columnSearch, columnDateRange, columnStartDate, columnEndDate]);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    setDraggedId(null);
    setDropTargetId(null);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  };

  const handleDragOver = (e: React.DragEvent, isCard = false, id?: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (isCard && id) {
      setDropTargetId(id);
    }
  };

  const handleDrop = async (e: React.DragEvent, newStatus: string, targetCardId?: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (!id || id === targetCardId) return;

    // 1. Identify which card we are dragging
    const item = items.find(it => getCardId(it) === id);
    if (!item) return;

    const oldStatus = getCardStatus(item);

    // 2. Handle Status Change
    if (oldStatus.toLowerCase() !== newStatus.toLowerCase()) {
      await onStatusChange(id, newStatus);
    }

    // 3. Handle Reordering (if targetCardId is provided or if we dropped on a specific position)
    if (onReorder) {
      const colItems = boardData[newStatus] || [];
      let newIndex = 0;

      if (targetCardId) {
        // Find position of target card
        const targetIdx = colItems.findIndex(it => getCardId(it) === targetCardId);
        const prevItem = colItems[targetIdx - 1];
        const nextItem = colItems[targetIdx];

        if (!prevItem) {
          // Top of list
          newIndex = (getCardIndex?.(nextItem) ?? 0) - 1000;
        } else {
          // Between items
          newIndex = ((getCardIndex?.(prevItem) ?? 0) + (getCardIndex?.(nextItem) ?? 0)) / 2;
        }
      } else {
        // Bottom of list
        const lastItem = colItems[colItems.length - 1];
        newIndex = (getCardIndex?.(lastItem) ?? 0) + 1000;
      }
      
      await onReorder(id, newIndex);
    }
    
    setDropTargetId(null);
  };

  const fmtDate = (val: any) => {
    if (!val) return 'No date';
    const d = val.toDate ? val.toDate() : new Date(val);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 min-h-[calc(100vh-250px)]">
      {columns.map(column => (
        <div
          key={column.id}
          className="flex-shrink-0 w-80 bg-gray-50/50 dark:bg-gray-900/30 rounded-xl border border-gray-200 dark:border-gray-800 flex flex-col"
          onDragOver={(e) => handleDragOver(e)}
          onDrop={(e) => handleDrop(e, column.id)}
        >
          {/* Column Header */}
          <div className="p-3 border-b border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm sticky top-0 z-10">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${column.color}`} />
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {column.title}
                </h3>
                <span className="text-xs text-gray-500 bg-gray-200 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                  {boardData[column.id]?.length || 0}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setActiveFilters(prev => ({ ...prev, [column.id]: !prev[column.id] }))}
                  className={`p-1 rounded-md transition-colors ${activeFilters[column.id] ? 'bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  <Filter className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Inline Column Filters */}
            {activeFilters[column.id] && (
              <div className="space-y-2 pt-2 animate-in fade-in slide-in-from-top-1">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search in this box..."
                    value={columnSearch[column.id] || ''}
                    onChange={(e) => setColumnSearch(prev => ({ ...prev, [column.id]: e.target.value }))}
                    className="w-full pl-7 pr-2 py-1.5 text-[11px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-1 focus:ring-teal-500/30"
                  />
                </div>
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-1">
                  {['all', 'today', 'week', 'month', 'custom'].map(r => (
                    <button
                      key={r}
                      onClick={() => setColumnDateRange(prev => ({ ...prev, [column.id]: r }))}
                      className={`flex-shrink-0 px-2 py-1 rounded-md text-[10px] font-medium transition-all flex items-center gap-1 ${
                        (columnDateRange[column.id] || 'all') === r
                          ? 'bg-teal-600 text-white'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600'
                      }`}
                    >
                      {r === 'custom' && <Calendar className="h-2.5 w-2.5" />}
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </button>
                  ))}
                </div>

                {columnDateRange[column.id] === 'custom' && (
                  <div className="flex flex-col gap-1.5 p-2 bg-gray-100 dark:bg-gray-800/50 rounded-lg animate-in fade-in slide-in-from-left-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-gray-400 font-semibold uppercase">Range Selection</span>
                      <button 
                        onClick={() => {
                          setColumnStartDate(prev => ({ ...prev, [column.id]: '' }));
                          setColumnEndDate(prev => ({ ...prev, [column.id]: '' }));
                        }}
                        className="text-[9px] text-teal-600 hover:text-teal-700"
                      >
                        Reset
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="date"
                        value={columnStartDate[column.id] || ''}
                        onChange={(e) => setColumnStartDate(prev => ({ ...prev, [column.id]: e.target.value }))}
                        className="w-full px-1.5 py-1 text-[10px] bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded outline-none"
                      />
                      <span className="text-gray-400 text-[10px]">-</span>
                      <input
                        type="date"
                        value={columnEndDate[column.id] || ''}
                        onChange={(e) => setColumnEndDate(prev => ({ ...prev, [column.id]: e.target.value }))}
                        className="w-full px-1.5 py-1 text-[10px] bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Column Body */}
          <div 
            className="flex-1 p-2 space-y-3 overflow-y-auto max-h-[calc(100vh-320px)] scrollbar-thin"
            style={{ scrollbarGutter: 'stable', touchAction: 'pan-y', overscrollBehaviorY: 'contain' }}
            onWheel={(e) => {
              // Stop propagation to prevent dashboard-level wheel listeners from blocking this scroll
              e.stopPropagation();
            }}
          >
            {boardData[column.id]?.map(item => (
              <div
                key={item.id}
                draggable={!disableDrag}
                onDragStart={(e) => !disableDrag && handleDragStart(e, item.id)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => !disableDrag && handleDragOver(e, true, item.id)}
                onDrop={(e) => !disableDrag && handleDrop(e, column.id, item.id)}
                className={`
                  bg-white dark:bg-gray-800/80 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm 
                  transition-all relative
                  ${!disableDrag ? 'hover:shadow-md hover:border-teal-500/50 cursor-grab active:cursor-grabbing' : 'cursor-default'}
                  ${draggedId === item.id ? 'ring-2 ring-teal-500 border-transparent opacity-50' : ''}
                  ${dropTargetId === item.id ? 'border-t-4 border-t-teal-500' : ''}
                `}
              >
                {/* Card Header */}
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {getCardTitle(item)}
                    </h4>
                    {getCardSubtitle && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {getCardSubtitle(item)}
                      </p>
                    )}
                  </div>
                  {!disableDrag && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); onDeleteItem(item); }}
                      className="p-1 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors pointer-events-auto"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Card Badges */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {renderSourceBadge && renderSourceBadge(item)}
                  {isFloorplanItem(item) && !renderSourceBadge && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      <Layout className="h-2.5 w-2.5 mr-1" />
                      Floorplan
                    </span>
                  )}
                  {getCardDate && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                      <Clock className="h-2.5 w-2.5 mr-1" />
                      {fmtDate(getCardDate(item))}
                    </span>
                  )}
                </div>

                {/* Card Actions */}
                <div className="flex flex-col gap-2 mt-auto pt-2 border-t border-gray-100 dark:border-gray-700/50">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === item.id ? null : item.id); }}
                      className="text-[10px] font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300"
                    >
                      {expandedId === item.id ? 'Hide details' : 'View details'}
                    </button>
                    
                    {renderActions && (
                      <div className="flex gap-2">
                        {renderActions(item)}
                      </div>
                    )}
                  </div>

                  {/* Expanded Details */}
                  {expandedId === item.id && (
                    <div className="mt-1 pt-3 border-t border-gray-100 dark:border-gray-700/50 animate-in fade-in slide-in-from-top-1">
                      {renderCardDetails(item)}
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {boardData[column.id]?.length === 0 && (
              <div className="h-24 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-lg flex items-center justify-center p-4">
                <p className="text-xs text-gray-400 text-center italic">Drop items here</p>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
