import { useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X, Wrench } from 'lucide-react';

interface Device {
  id: string;
  name: string;
  type: string;
  status: string;
  lastActivity: string;
  warranty?: string;
  modelNumber?: string;
  brand?: string;
}

interface RequestItem {
  id: string;
  service: string;
  devices: Device[];  // New devices array
  device?: string;    // Kept for backward compatibility
  priority: string;
  status: string;
  date?: string;
  time?: string;
  createdAt?: any;
  adminResponse?: string;
  response?: string;
  message?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  myRequests: RequestItem[];
  reqListLoading: boolean;
  reqListError: string;
}

const RequestStatusModal: React.FC<Props> = ({ open, onClose, myRequests, reqListLoading, reqListError }) => {
  const [selectedReq, setSelectedReq] = useState<RequestItem | null>(null);
  
  // Lock background/body scroll when modal is open
  useEffect(() => {
    if (!open) return;
    
    // Save current scroll position
    const scrollY = window.scrollY;
    const body = document.body;
    const html = document.documentElement;
    
    // Lock the body scroll
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    
    // Prevent touch events from reaching document
    const preventDefault = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      const isScrollable = target.closest('.modal-scroll-content');
      if (!isScrollable) {
        e.preventDefault();
      }
    };
    
    document.addEventListener('touchmove', preventDefault, { passive: false });

    // Prevent background scroll from touchpads/mouse wheels when outside modal content
    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      const isInsideScrollable = target?.closest?.('.modal-scroll-content');
      if (!isInsideScrollable) {
        e.preventDefault();
      }
    };
    document.addEventListener('wheel', onWheel, { passive: false });
    
    return () => {
      // Restore body styles and scroll position
      const scrollY = body.style.top;
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.overflow = '';
      html.style.overflow = '';
      window.scrollTo(0, parseInt(scrollY || '0') * -1);
      
      // Remove event listener
      document.removeEventListener('touchmove', preventDefault);
      document.removeEventListener('wheel', onWheel as EventListener);
    };
  }, [open]);

  const handleClose = useCallback(() => {
    onClose();
    setSelectedReq(null);
  }, [onClose]);

  if (!open) return null;

  const MainModal = () => (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
      role="dialog" 
      aria-modal="true" 
      aria-label="Request Status"
      onClick={onClose}
      onWheel={(e) => {
        // Keep the wheel from bubbling to body; rely on CSS overscroll-behavior to contain
        e.stopPropagation();
      }}
    >
      <div 
        className="w-full max-w-5xl max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200/80 dark:border-gray-700/80 ring-1 ring-black/5 overflow-hidden flex flex-col max-h-[90vh]">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 flex justify-between items-center bg-gradient-to-r from-white to-gray-50 dark:from-gray-800 dark:to-gray-750/40">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Your Service Requests</h2>
            <button onClick={onClose} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-800 transition" aria-label="Close">
              <X className="h-4 w-4" />
              <span className="text-sm font-medium">Close</span>
            </button>
          </div>
          {reqListError && (
            <div className="mx-6 mt-4 rounded-md bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3">{reqListError}</div>
          )}
          <div className="overflow-y-auto flex-1">
            <div 
              className="modal-scroll-content px-6 py-4"
              style={{
                maxHeight: 'calc(90vh - 120px)',
                overscrollBehavior: 'contain',
                WebkitOverflowScrolling: 'touch',
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(156, 163, 175, 0.5) transparent',
                touchAction: 'pan-y',
                msOverflowStyle: 'none',
                overflowY: 'auto',
                willChange: 'transform',
                WebkitTransform: 'translateZ(0)',
                transform: 'translateZ(0)'
              }}
              onWheel={(e) => {
                // Keep wheel inside the modal and let browser handle scroll without preventDefault
                e.stopPropagation();
              }}
              onTouchMove={(e) => {
                // Avoid preventDefault because React sets touch listeners as passive
                e.stopPropagation();
              }}
          >
            {reqListLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-teal-500"></div>
              </div>
            ) : myRequests.length === 0 ? (
              <div className="min-h-[50vh] flex flex-col items-center justify-end pb-6 px-6 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center mb-3">
                  <Wrench className="h-6 w-6 text-teal-600 dark:text-teal-300" />
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300">No service requests yet.</p>
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold tracking-wider text-gray-500 dark:text-gray-300 uppercase">Created</th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold tracking-wider text-gray-500 dark:text-gray-300 uppercase">Service</th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold tracking-wider text-gray-500 dark:text-gray-300 uppercase">Priority</th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold tracking-wider text-gray-500 dark:text-gray-300 uppercase">Details</th>
                    <th className="px-6 py-3 text-left text-[11px] font-semibold tracking-wider text-gray-500 dark:text-gray-300 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {myRequests.map((r) => {
                    const created = (r as any).createdAt?.toDate ? (r as any).createdAt.toDate() as Date : undefined;
                    const createdText = created ? created.toLocaleString() : '-';
                    return (
                      <tr key={r.id} className="odd:bg-white even:bg-gray-50/60 dark:odd:bg-gray-800 dark:even:bg-gray-800/60 hover:bg-teal-50/60 dark:hover:bg-gray-700/60 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-200">{createdText}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 dark:text-gray-100 capitalize">{r.service}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 dark:text-gray-100 capitalize">{r.priority}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            type="button"
                            onClick={() => setSelectedReq(r)}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            View Details
                          </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${r.status==='open' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${r.status==='open' ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const DetailsModal = (): ReactNode => (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Request Details">
      <div className="relative w-full max-w-xl">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Request Details</h3>
            <button
              onClick={() => setSelectedReq(null)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <X className="h-4 w-4" />
              <span className="text-sm font-medium">Close</span>
            </button>
          </div>
          <div
            className="max-h-[70vh] overflow-y-auto overscroll-contain touch-pan-y px-5 py-4 text-sm text-gray-700 dark:text-gray-200"
            onWheel={(e) => { e.stopPropagation(); }}
            onTouchMove={(e) => { e.stopPropagation(); }}
          >
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Created</dt>
                <dd>{((selectedReq as any)?.createdAt?.toDate ? (selectedReq as any).createdAt.toDate() as Date : undefined)?.toLocaleString() || '-'}</dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Service</dt>
                <dd className="capitalize">{selectedReq?.service}</dd>
              </div>
              {selectedReq?.devices && selectedReq.devices.length > 0 ? (
                <div className="col-span-2 mt-2">
                  <dt className="text-gray-500 dark:text-gray-400 mb-2">Devices</dt>
                  <dd className="space-y-3">
                    {selectedReq.devices.map((device, idx) => (
                      <div key={device.id || idx} className="bg-gray-50 dark:bg-gray-700/40 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-medium text-gray-900 dark:text-white">{device.name || `Device ${idx + 1}`}</h4>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {device.brand && <span>{device.brand} • </span>}
                              {device.type}
                            </div>
                          </div>
                          <span className={`px-2 py-1 text-xs rounded-full ${device.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'}`}>
                            {device.status || 'unknown'}
                          </span>
                        </div>
                        {(device.modelNumber || device.warranty) && (
                          <div className="mt-2 text-xs text-gray-600 dark:text-gray-300 space-y-1">
                            {device.modelNumber && <div>Model: {device.modelNumber}</div>}
                            {device.warranty && <div>Warranty: {device.warranty}</div>}
                          </div>
                        )}
                      </div>
                    ))}
                  </dd>
                </div>
              ) : (
                <div className="col-span-2">
                  <dt className="text-gray-500 dark:text-gray-400">Device</dt>
                  <dd className="text-gray-900 dark:text-white">
                    {selectedReq?.device || 'No device specified'}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Priority</dt>
                <dd className="capitalize">{selectedReq?.priority}</dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Preferred</dt>
                <dd>{(selectedReq as any)?.date || '--'} {(selectedReq as any)?.time || ''}</dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Status</dt>
                <dd className="capitalize">{selectedReq?.status}</dd>
              </div>
            </dl>
            {/* Admin Response removed as requested */}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(
    <>
      <MainModal />
      {selectedReq && <DetailsModal />}
    </>,
    document.body
  );
};

export default RequestStatusModal;
