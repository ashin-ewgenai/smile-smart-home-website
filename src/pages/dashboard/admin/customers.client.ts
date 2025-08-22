document.addEventListener('DOMContentLoaded', () => {
  // Admin guard
  const userEmail = localStorage.getItem('userEmail');
  const isAdmin = userEmail === 'admin@smilesmarthome.in';
  if (!userEmail || !isAdmin) {
    window.location.href = '/login';
    return;
  }

  type CustomerDevice = { name: string; purchaseDate: string; warrantyMonths: number };
  type Customer = { name: string; email: string; devices: CustomerDevice[] };
  type Bill = { id: string; customer: string; device: string; amount: number; date: string; notes: string };

  const STORAGE_KEY = 'adminCustomers';

  const tbody = document.getElementById('customersBody') as HTMLTableSectionElement | null;
  const modal = document.getElementById('customerModal') as HTMLDivElement | null;
  const addBtn = document.getElementById('addCustomerBtn') as HTMLButtonElement | null;
  const cancelBtn = document.getElementById('cancelModal') as HTMLButtonElement | null;
  const form = document.getElementById('customerForm') as HTMLFormElement | null;
  const modalTitle = document.getElementById('modalTitle') as HTMLElement | null;
  const editIndexInput = document.getElementById('editIndex') as HTMLInputElement | null;
  const nameInput = document.getElementById('custName') as HTMLInputElement | null;
  const emailInput = document.getElementById('custEmail') as HTMLInputElement | null;
  const devicesContainer = document.getElementById('devicesContainer') as HTMLDivElement | null;
  const addDeviceRowBtn = document.getElementById('addDeviceRow') as HTMLButtonElement | null;

  const detailsModal = document.getElementById('detailsModal') as HTMLDivElement | null;
  const detailsContent = document.getElementById('detailsContent') as HTMLDivElement | null;
  const closeDetails = document.getElementById('closeDetails') as HTMLButtonElement | null;

  const defaultCustomers: Customer[] = [
    {
      name: 'Acme Corp',
      email: 'ops@acme.com',
      devices: [
        { name: 'Smart Thermostat', purchaseDate: '2024-07-10', warrantyMonths: 24 },
        { name: 'Door Lock', purchaseDate: '2023-05-01', warrantyMonths: 12 },
      ],
    },
    {
      name: 'John Family',
      email: 'john@example.com',
      devices: [
        { name: 'Security Camera', purchaseDate: '2023-12-15', warrantyMonths: 18 },
      ],
    },
  ];

  function loadCustomers(): Customer[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultCustomers;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as Customer[];
      return defaultCustomers;
    } catch {
      return defaultCustomers;
    }
  }

  function saveCustomers(customers: Customer[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customers));
  }

  function addDeviceRow(row?: CustomerDevice) {
    if (!devicesContainer) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'grid grid-cols-1 md:grid-cols-3 gap-2';
    wrapper.innerHTML = `
        <input placeholder="Device name" value="${row?.name ?? ''}" class="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
        <input type="date" value="${row?.purchaseDate ?? ''}" class="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
        <input type="number" min="0" placeholder="Warranty (months)" value="${row?.warrantyMonths ?? ''}" class="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" />
      `;
    devicesContainer.appendChild(wrapper);
  }

  function clearDeviceRows() {
    if (!devicesContainer) return;
    devicesContainer.innerHTML = '';
  }

  function getWarrantyInfo(device: CustomerDevice) {
    const purchase = new Date(device.purchaseDate);
    const end = new Date(purchase);
    end.setMonth(end.getMonth() + (device.warrantyMonths || 0));
    const now = new Date();
    const remainingMs = end.getTime() - now.getTime();
    const remainingDays = Math.ceil(remainingMs / (1000 * 60 * 60 * 24));
    const active = remainingMs > 0;
    return { end, remainingDays, active };
  }

  // Helpers for display formatting
  function formatDate(d: Date) {
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  }
  function remainingText(end: Date) {
    const now = new Date();
    const diffMs = end.getTime() - now.getTime();
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (days <= 0) return 'Expired';
    if (days > 365) return `${(days / 365).toFixed(1)} years`;
    return `${days} days`;
  }

  function openModal(mode: 'add' | 'edit', index: number | null = null, customer: Customer = { name: '', email: '', devices: [] }) {
    if (!modal || !modalTitle || !editIndexInput || !nameInput || !emailInput) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    modalTitle.textContent = mode === 'add' ? 'Add Customer' : 'Edit Customer';
    editIndexInput.value = index !== null ? String(index) : '';
    nameInput.value = customer.name || '';
    emailInput.value = customer.email || '';
    clearDeviceRows();
    (customer.devices || []).forEach(addDeviceRow);
    if ((customer.devices || []).length === 0) addDeviceRow();
  }

  function closeModal() {
    if (!modal || !form || !editIndexInput) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    form.reset();
    editIndexInput.value = '';
    clearDeviceRows();
  }

  function collectDevices(): CustomerDevice[] {
    if (!devicesContainer) return [];
    const rows = Array.from(devicesContainer.children) as HTMLElement[];
    const devices: CustomerDevice[] = [];
    rows.forEach((row) => {
      const inputs = row.querySelectorAll('input');
      const name = (inputs[0] as HTMLInputElement).value.trim();
      const date = (inputs[1] as HTMLInputElement).value;
      const months = Number((inputs[2] as HTMLInputElement).value || 0);
      if (name && date) devices.push({ name, purchaseDate: date, warrantyMonths: months });
    });
    return devices;
  }

  function render() {
    const customers = loadCustomers();
    if (!tbody) return;
    tbody.innerHTML = customers.map((c, idx) => {
      const count = (c.devices || []).length;
      const anyActive = (c.devices || []).some(d => getWarrantyInfo(d).active);
      const label = count === 0 ? '-' : (anyActive ? 'Active' : 'Expired');
      const badgeClass = anyActive ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
      return `
          <tr>
            <td class="px-6 py-4 whitespace-nowrap"><div class="text-sm font-medium text-gray-900 dark:text-white">${c.name}</div><div class="text-xs text-gray-500 dark:text-gray-400">${c.email}</div></td>
            <td class="px-6 py-4 whitespace-nowrap"><div class="text-sm text-gray-900 dark:text-gray-200">${count}</div></td>
            <td class="px-6 py-4 whitespace-nowrap text-center">
              <div class="flex items-center gap-3 justify-center">
                <span class="inline-flex items-center justify-center h-6 w-20 px-2 rounded text-xs ${badgeClass}">${label}</span>
                <button data-action="details" data-index="${idx}" class="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded border border-gray-300 dark:border-gray-600">Details</button>
              </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right">
              <div class="flex items-center gap-2 justify-end">
                <button data-action="edit" data-index="${idx}" class="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded border border-gray-300 dark:border-gray-600">Edit</button>
                <button data-action="delete" data-index="${idx}" class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded">Delete</button>
              </div>
            </td>
          </tr>
        `;
    }).join('');
  }

  function openDetails(customer: Customer) {
    if (!detailsModal || !detailsContent) return;
    detailsModal.classList.remove('hidden');
    detailsModal.classList.add('flex');
    try {
      document.documentElement.classList.add('overflow-hidden');
    } catch {}
    const rows = (customer.devices || []).map((d) => {
      const info = getWarrantyInfo(d);
      const start = new Date(d.purchaseDate);
      const end = info.end;
      const remaining = remainingText(end);
      return `
          <tr>
            <td class="px-6 py-4">
              <div class="text-sm font-medium text-gray-900 dark:text-white">${d.name}</div>
              <div class="text-xs text-gray-500 dark:text-gray-400">${''}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-200">${formatDate(start)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-200">${formatDate(end)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm ${remaining === 'Expired' ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-200'}">${remaining}</td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm">
              <button class="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">Extend</button>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-right text-sm">
              <div class="flex items-center justify-end gap-2">
                <button data-action="view-bill" data-device="${d.name}" class="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">View Bill</button>
                <button data-action="create-bill" data-device="${d.name}" class="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-teal-600 text-white hover:bg-teal-700">Create Bill</button>
              </div>
            </td>
          </tr>
        `;
    }).join('');

    if (!rows) {
      detailsContent.innerHTML = '<div class="text-sm text-gray-500 dark:text-gray-400">No devices</div>';
      return;
    }

    detailsContent.innerHTML = `
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Device Name</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Warranty Start</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Warranty End</th>
                <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Remaining</th>
                <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Extend Warranty</th>
                <th scope="col" class="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Bill</th>
              </tr>
            </thead>
            <tbody class="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              ${rows}
            </tbody>
          </table>
        </div>
      `;
  }

  function closeDetailsModal() {
    if (!detailsModal) return;
    detailsModal.classList.add('hidden');
    detailsModal.classList.remove('flex');
    try {
      document.documentElement.classList.remove('overflow-hidden');
    } catch {}
  }

  // Event bindings
  addBtn?.addEventListener('click', () => openModal('add'));
  cancelBtn?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  closeDetails?.addEventListener('click', closeDetailsModal);
  detailsModal?.addEventListener('click', (e) => { if (e.target === detailsModal) closeDetailsModal(); });
  addDeviceRowBtn?.addEventListener('click', () => addDeviceRow());

  // Bills storage
  const BILLS_KEY = 'adminBills' as const;
  function loadBills(): Bill[] {
    try { return JSON.parse(localStorage.getItem(BILLS_KEY) || '[]') || []; } catch { return []; }
  }
  function saveBills(v: Bill[]) { try { localStorage.setItem(BILLS_KEY, JSON.stringify(v)); } catch {} }

  let currentDetailsCustomer: Customer | null = null;

  // Bill view modal elements
  const billViewModal = document.getElementById('billViewModal') as HTMLDivElement | null;
  const billImagePreview = document.getElementById('billImagePreview') as HTMLImageElement | null;
  const billImageInput = document.getElementById('billImageInput') as HTMLInputElement | null;
  const changeBillImageBtn = document.getElementById('changeBillImage') as HTMLButtonElement | null;
  const sendBillBtn = document.getElementById('sendBillToCustomer') as HTMLButtonElement | null;
  const closeBillViewBtn = document.getElementById('closeBillView') as HTMLButtonElement | null;

  let currentBillDevice: string | null = null;

  function billImageKey(customerName: string, deviceName: string) {
    return `billImage:${customerName}::${deviceName}`;
  }
  function loadBillImage(customerName: string, deviceName: string): string | null {
    try { return localStorage.getItem(billImageKey(customerName, deviceName)); } catch { return null; }
  }
  function saveBillImage(customerName: string, deviceName: string, dataUrl: string) {
    try { localStorage.setItem(billImageKey(customerName, deviceName), dataUrl); } catch {}
  }

  function openBillView(deviceName: string) {
    if (!billViewModal) return;
    currentBillDevice = deviceName;
    const customerName = currentDetailsCustomer?.name || '';
    const img = loadBillImage(customerName, deviceName);
    if (billImagePreview) {
      billImagePreview.src = img || '';
      billImagePreview.alt = img ? `Bill image for ${deviceName}` : 'No bill image uploaded yet';
    }
    billViewModal.classList.remove('hidden');
    billViewModal.classList.add('flex');
    try { document.documentElement.classList.add('overflow-hidden'); } catch {}
  }
  function closeBillView() {
    if (!billViewModal) return;
    billViewModal.classList.add('hidden');
    billViewModal.classList.remove('flex');
    try { document.documentElement.classList.remove('overflow-hidden'); } catch {}
  }

  function dataURLToBlob(dataUrl: string): Blob | null {
    try {
      const parts = dataUrl.split(',');
      const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) u8arr[n] = bstr.charCodeAt(n);
      return new Blob([u8arr], { type: mime });
    } catch { return null; }
  }

  // Open/close Bill modal helpers
  const billModal = document.getElementById('billModal') as HTMLDivElement | null;
  const billForm = document.getElementById('billForm') as HTMLFormElement | null;
  const billCustomer = document.getElementById('billCustomer') as HTMLInputElement | null;
  const billDevice = document.getElementById('billDevice') as HTMLInputElement | null;
  const billAmount = document.getElementById('billAmount') as HTMLInputElement | null;
  const billDate = document.getElementById('billDate') as HTMLInputElement | null;
  const billNotes = document.getElementById('billNotes') as HTMLTextAreaElement | null;
  const cancelBill = document.getElementById('cancelBill');

  function openBillModal(deviceName: string) {
    if (!billModal) return;
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth()+1).padStart(2,'0');
    const dd = String(today.getDate()).padStart(2,'0');
    billCustomer && (billCustomer.value = currentDetailsCustomer?.name || '');
    billDevice && (billDevice.value = deviceName || '');
    billAmount && (billAmount.value = '');
    billDate && (billDate.value = `${yyyy}-${mm}-${dd}`);
    billNotes && (billNotes.value = '');
    billModal.classList.remove('hidden');
    billModal.classList.add('flex');
    document.documentElement.classList.add('overflow-hidden');
  }

  function closeBillModal() {
    if (!billModal) return;
    billModal.classList.add('hidden');
    billModal.classList.remove('flex');
    document.documentElement.classList.remove('overflow-hidden');
  }

  // Handle clicks on details table for bill actions
  detailsContent?.addEventListener('click', (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    const btn = t.closest('button');
    if (!(btn instanceof HTMLElement)) return;
    const action = btn.getAttribute('data-action');
    const deviceName = btn.getAttribute('data-device') || '';
    if (action === 'create-bill') {
      openBillModal(deviceName);
    } else if (action === 'view-bill') {
      // Open the image preview modal instead of alert
      openBillView(deviceName);
    }
  });

  // Save bill
  billForm?.addEventListener('submit', (e: SubmitEvent) => {
    e.preventDefault();
    const bill: Bill = {
      id: `${Date.now()}`,
      customer: billCustomer?.value || '',
      device: billDevice?.value || '',
      amount: parseFloat(billAmount?.value || '0') || 0,
      date: billDate?.value || '',
      notes: billNotes?.value || '',
    };
    const list = loadBills();
    list.push(bill);
    saveBills(list);
    closeBillModal();
    alert('Bill saved.');
  });

  cancelBill?.addEventListener('click', closeBillModal);
  billModal?.addEventListener('click', (e) => { if (e.target === billModal) closeBillModal(); });

  // Bill view modal bindings
  closeBillViewBtn?.addEventListener('click', closeBillView);
  billViewModal?.addEventListener('click', (e) => { if (e.target === billViewModal) closeBillView(); });
  changeBillImageBtn?.addEventListener('click', () => billImageInput?.click());
  billImageInput?.addEventListener('change', async () => {
    if (!billImageInput?.files || billImageInput.files.length === 0) return;
    const file = billImageInput.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (billImagePreview) billImagePreview.src = dataUrl;
      if (currentDetailsCustomer && currentBillDevice) {
        saveBillImage(currentDetailsCustomer.name, currentBillDevice, dataUrl);
      }
    };
    reader.readAsDataURL(file);
  });

  sendBillBtn?.addEventListener('click', async () => {
    if (!currentDetailsCustomer || !currentBillDevice) return;
    const img = loadBillImage(currentDetailsCustomer.name, currentBillDevice);
    if (!img) {
      alert('No bill image found. Please upload an image first.');
      return;
    }
    const blob = dataURLToBlob(img);
    const customerEmail = currentDetailsCustomer.email || '';
    try {
      if (navigator.share && blob) {
        const file = new File([blob], `${currentBillDevice.replace(/\s+/g,'_')}_bill.png`, { type: blob.type || 'image/png' });
        await navigator.share({
          title: 'Bill',
          text: `Bill for ${currentBillDevice} — ${currentDetailsCustomer.name}`,
          files: [file]
        } as any);
        return;
      }
    } catch {}
    // Fallback: trigger download, then open mailto
    try {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentBillDevice.replace(/\s+/g,'_')}_bill.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
    } catch {}
    const subject = encodeURIComponent(`Bill for ${currentBillDevice}`);
    const body = encodeURIComponent(`Hi,\n\nPlease find the bill for ${currentBillDevice}.\n\nRegards,\nSmile Smart Home`);
    const mailto = `mailto:${encodeURIComponent(customerEmail)}?subject=${subject}&body=${body}`;
    window.location.href = mailto;
  });

  // Note: Removing rows is disabled intentionally (no remove buttons rendered).

  // Create/Update submit
  form?.addEventListener('submit', (e: SubmitEvent) => {
    e.preventDefault();
    if (!nameInput || !emailInput || !editIndexInput) return;
    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    if (!name || !email) return;

    const customers = loadCustomers();
    const editIdx = editIndexInput.value !== '' ? Number(editIndexInput.value) : null;

    // Prevent duplicate email for different customer
    const duplicate = customers.some((u, i) => u.email.toLowerCase() === email.toLowerCase() && i !== editIdx);
    if (duplicate) {
      alert('A customer with this email already exists.');
      return;
    }

    const devices = collectDevices();

    if (editIdx === null) {
      customers.push({ name, email, devices });
    } else {
      customers[editIdx] = { name, email, devices };
    }

    saveCustomers(customers);
    closeModal();
    render();
  });

  // Row actions: details/edit/delete
  tbody?.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('button');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const idxStr = btn.getAttribute('data-index');
    if (!action || idxStr === null) return;
    const index = Number(idxStr);
    const customers = loadCustomers();

    if (action === 'details') {
      currentDetailsCustomer = customers[index];
      openDetails(customers[index]);
    } else if (action === 'edit') {
      openModal('edit', index, customers[index]);
    } else if (action === 'delete') {
      if (confirm('Delete this customer?')) {
        customers.splice(index, 1);
        saveCustomers(customers);
        render();
      }
    }
  });

  // Initial render; seed storage if empty
  if (!localStorage.getItem(STORAGE_KEY)) {
    saveCustomers(defaultCustomers);
  }
  render();
});
