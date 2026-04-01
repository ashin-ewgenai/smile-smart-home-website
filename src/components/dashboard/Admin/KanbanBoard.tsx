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
  itemType
}: KanbanBoardProps<T>) {
  const { isFloorplanItem } = useDevices();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null); // Visual feedback for reordering

  // Group and sort items by status and dragIndex
  const boardData = columns.reduce((acc, col) => {
    const colItems = items.filter(item => {
      const status = getCardStatus(item)?.toLowerCase();
      const normalizedStatus = status?.replace(/\s+/g, '_');
      const normalizedColId = col.id.toLowerCase().replace(/\s+/g, '_');
      return normalizedStatus === normalizedColId || status === col.id.toLowerCase();
    });

    // Sort by dragIndex (descending to put high index on top or vice-versa? Let's say ascending: higher index = lower on list)
    acc[col.id] = colItems.sort((a, b) => {
      const idxA = getCardIndex?.(a) ?? 0;
      const idxB = getCardIndex?.(b) ?? 0;
      return idxA - idxB;
    });
    return acc;
  }, {} as Record<string, T[]>);

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
          <div className="p-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${column.color}`} />
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {column.title}
              </h3>
              <span className="text-xs text-gray-500 bg-gray-200 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                {boardData[column.id]?.length || 0}
              </span>
            </div>
            <MoreVertical className="h-4 w-4 text-gray-400 cursor-pointer" />
          </div>

          {/* Column Body */}
          <div className="flex-1 p-2 space-y-3 overflow-y-auto max-h-[calc(100vh-320px)] scrollbar-thin">
            {boardData[column.id]?.map(item => (
              <div
                key={item.id}
                draggable
                onDragStart={(e) => handleDragStart(e, item.id)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, true, item.id)}
                onDrop={(e) => handleDrop(e, column.id, item.id)}
                className={`
                  bg-white dark:bg-gray-800/80 rounded-lg border border-gray-200 dark:border-gray-700 p-3 shadow-sm 
                  hover:shadow-md hover:border-teal-500/50 transition-all cursor-grab active:cursor-grabbing relative
                  ${draggedId === item.id ? 'ring-2 ring-teal-500 border-transparent opacity-50' : ''}
                  ${dropTargetId === item.id ? 'border-t-4 border-t-teal-500' : ''}
                `}
              >
                {/* Card Header */}
                <div className="flex justify-between items-start mb-2 pointer-events-none">
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
                  <button 
                    onClick={(e) => { e.stopPropagation(); onDeleteItem(item); }}
                    className="p-1 text-gray-400 hover:text-red-500 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors pointer-events-auto"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Card Badges */}
                <div className="flex flex-wrap gap-1.5 mb-3 pointer-events-none">
                  {isFloorplanItem(item) && (
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
                <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100 dark:border-gray-700/50">
                  <button
                    onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === item.id ? null : item.id); }}
                    className="text-[10px] font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 pointer-events-auto"
                  >
                    {expandedId === item.id ? 'Hide details' : 'View details'}
                  </button>
                </div>

                {/* Expanded Details */}
                {expandedId === item.id && (
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50 animate-in fade-in slide-in-from-top-1 pointer-events-auto">
                    {renderCardDetails(item)}
                  </div>
                )}
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
