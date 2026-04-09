/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Download, 
  Trash2, 
  Pencil,
  Package, 
  Truck, 
  ClipboardList, 
  BarChart3,
  Calendar,
  User,
  Tag,
  Hash,
  Coins,
  Search,
  ChevronRight,
  AlertCircle,
  Clock,
  Bell
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster, toast } from 'react-hot-toast';
import { format, differenceInDays, parseISO, isPast, isToday } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { PreSaleContract, ProcurementRecord } from './types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [contracts, setContracts] = useState<PreSaleContract[]>([]);
  const [records, setRecords] = useState<ProcurementRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'contracts' | 'records'>('dashboard');
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<PreSaleContract | null>(null);
  const [editingRecord, setEditingRecord] = useState<ProcurementRecord | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<{id: number, type: 'contract' | 'record'} | null>(null);

  // Form states for auto-population
  const [selectedContractId, setSelectedContractId] = useState<string>('');
  const [recordFormValues, setRecordFormValues] = useState({
    item_name: '',
    specification: '',
    unit_price: '',
    vendor: ''
  });

  // Reset form values when modal opens/closes
  useEffect(() => {
    if (!isRecordModalOpen) {
      setSelectedContractId('');
      setRecordFormValues({ item_name: '', specification: '', unit_price: '', vendor: '' });
      setEditingRecord(null);
    }
  }, [isRecordModalOpen]);

  useEffect(() => {
    if (!isContractModalOpen) {
      setEditingContract(null);
    }
  }, [isContractModalOpen]);

  const handleEditContract = (contract: PreSaleContract) => {
    setEditingContract(contract);
    setIsContractModalOpen(true);
  };

  const handleEditRecord = (record: ProcurementRecord) => {
    setEditingRecord(record);
    setSelectedContractId(record.contract_id?.toString() || '');
    setRecordFormValues({
      item_name: record.item_name,
      specification: record.specification || '',
      unit_price: record.unit_price.toString(),
      vendor: record.vendor || ''
    });
    setIsRecordModalOpen(true);
  };

  const handleContractChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setSelectedContractId(id);
    
    if (id) {
      const contract = contracts.find(c => c.id === Number(id));
      if (contract) {
        setRecordFormValues({
          item_name: contract.item_name,
          specification: contract.specification === '全' ? '' : (contract.specification || ''),
          unit_price: contract.unit_price.toString(),
          vendor: contract.vendor
        });
      }
    } else {
      setRecordFormValues({ item_name: '', specification: '', unit_price: '', vendor: '' });
    }
  };

  // Fetch data
  const fetchData = async () => {
    try {
      const [contractsRes, recordsRes] = await Promise.all([
        fetch('/api/contracts'),
        fetch('/api/records')
      ]);
      const contractsData = await contractsRes.json();
      const recordsData = await recordsRes.json();
      setContracts(contractsData);
      setRecords(recordsData);
    } catch (error) {
      toast.error('無法獲取資料');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // CSV Export
  const exportFullReport = () => {
    if (records.length === 0 && contracts.length === 0) {
      toast.error('沒有資料可供匯出');
      return;
    }

    // Combine records with contracts that have no records yet
    let exportData = [...records];
    const recordContractIds = new Set(records.map(r => r.contract_id).filter(id => id !== null));
    
    contracts.forEach(c => {
      if (!recordContractIds.has(c.id)) {
        exportData.push({
          delivery_date: c.purchase_date || '',
          vendor: c.vendor,
          contract_no: c.contract_no,
          item_name: c.item_name,
          specification: c.specification,
          quantity: 0,
          unit_price: c.unit_price,
          total_price: 0,
          receiver: '尚未進料',
          order_type: 'pre_sale_empty'
        });
      }
    });

    // Sort records: Vendor -> Contract No/Type -> Date
    const sortedRecords = exportData.sort((a, b) => {
      // Vendor
      const vendorA = a.vendor || '一般單';
      const vendorB = b.vendor || '一般單';
      if (vendorA !== vendorB) return vendorA.localeCompare(vendorB);
      
      // Contract No
      const contractA = a.contract_no || 'ZZZ'; // Standard orders at the end
      const contractB = b.contract_no || 'ZZZ';
      if (contractA !== contractB) return contractA.localeCompare(contractB);
      
      // Date
      const dateA = a.delivery_date || '0000-00-00';
      const dateB = b.delivery_date || '0000-00-00';
      return dateA.localeCompare(dateB);
    });

    const headers = ['進料/採購日期', '廠商', '預售單號', '品項名稱', '規格', '進料數量(kg)', '單價', '總價', '簽收人', '狀態'];
    const rows = sortedRecords.map(r => [
      r.delivery_date || '-',
      r.vendor || '一般單',
      r.contract_no || '-',
      r.item_name,
      r.specification || '-',
      r.quantity === 0 && r.order_type === 'pre_sale_empty' ? '-' : r.quantity,
      r.unit_price,
      r.total_price === 0 && r.order_type === 'pre_sale_empty' ? '-' : r.total_price,
      r.receiver,
      r.order_type === 'pre_sale_delivery' ? '預售進料' : 
      r.order_type === 'pre_sale_empty' ? '預售(尚未進料)' : '一般採購'
    ]);

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(row => row.map(val => `"${val}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `採購進料全紀錄_${format(new Date(), 'yyyyMMdd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('全紀錄匯出成功');
  };

  const exportToCSV = (data: any[], filename: string) => {
    if (data.length === 0) {
      toast.error('沒有資料可供匯出');
      return;
    }
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(obj => 
      Object.values(obj).map(val => `"${val}"`).join(',')
    ).join('\n');
    
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + headers + "\n" + rows;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${filename}_${format(new Date(), 'yyyyMMdd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('匯出成功');
  };

  // Forms
  const handleAddContract = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      contract_no: formData.get('contract_no'),
      vendor: formData.get('vendor'),
      item_name: formData.get('item_name'),
      total_quantity: Number(formData.get('total_quantity')),
      total_type: formData.get('total_type') || 'weight',
      unit_price: Number(formData.get('unit_price')),
      specification: formData.get('specification'),
      purchase_date: formData.get('purchase_date'),
      expected_arrival_date: formData.get('expected_arrival_date'),
    };

    try {
      const url = editingContract ? `/api/contracts/${editingContract.id}` : '/api/contracts';
      const method = editingContract ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        toast.success(editingContract ? '預售單據已更新' : '預售單據已新增');
        setIsContractModalOpen(false);
        setEditingContract(null);
        fetchData();
      }
    } catch (error) {
      toast.error(editingContract ? '更新失敗' : '新增失敗');
    }
  };

  const handleAddRecord = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const contractId = formData.get('contract_id');
    const quantity = Number(formData.get('quantity')) || 0;
    const unitPrice = Number(formData.get('unit_price')) || 0;
    const rawTotalPriceStr = formData.get('total_price_input');
    const totalPrice = rawTotalPriceStr ? Number(rawTotalPriceStr) : (quantity * unitPrice);
    
    const data = {
      contract_id: contractId ? Number(contractId) : null,
      vendor: formData.get('vendor'),
      delivery_date: formData.get('delivery_date'),
      receiver: formData.get('receiver'),
      item_name: formData.get('item_name'),
      specification: formData.get('specification'),
      quantity: quantity,
      unit_price: unitPrice,
      total_price: totalPrice,
      order_type: contractId ? 'pre_sale_delivery' : 'standard',
    };

    try {
      const url = editingRecord ? `/api/records/${editingRecord.id}` : '/api/records';
      const method = editingRecord ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        toast.success(editingRecord ? '進料紀錄已更新' : '進料紀錄已新增');
        setIsRecordModalOpen(false);
        setEditingRecord(null);
        fetchData();
      }
    } catch (error) {
      toast.error(editingRecord ? '更新失敗' : '新增失敗');
    }
  };

  const handleDeleteContract = async (id: number) => {
    if (confirmDeleteId?.id === id && confirmDeleteId?.type === 'contract') {
      try {
        const res = await fetch(`/api/contracts/${id}`, { method: 'DELETE' });
        if (res.ok) {
          fetchData();
          toast.success('預售單據已刪除');
          setConfirmDeleteId(null);
        } else {
          toast.error('刪除失敗');
        }
      } catch (error) {
        toast.error('刪除失敗');
      }
    } else {
      setConfirmDeleteId({ id, type: 'contract' });
      // Auto-reset after 3 seconds
      setTimeout(() => setConfirmDeleteId(null), 3000);
    }
  };

  const handleDeleteRecord = async (id: number) => {
    if (confirmDeleteId?.id === id && confirmDeleteId?.type === 'record') {
      try {
        const res = await fetch(`/api/records/${id}`, { method: 'DELETE' });
        if (res.ok) {
          fetchData();
          toast.success('進料紀錄已刪除');
          setConfirmDeleteId(null);
        } else {
          toast.error('刪除失敗');
        }
      } catch (error) {
        toast.error('刪除失敗');
      }
    } else {
      setConfirmDeleteId({ id, type: 'record' });
      // Auto-reset after 3 seconds
      setTimeout(() => setConfirmDeleteId(null), 3000);
    }
  };

  const filteredContracts = contracts.filter(c => 
    c.contract_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.vendor.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.item_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredRecords = records.filter(r => 
    r.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.receiver.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.contract_no && r.contract_no.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const incompleteContracts = contracts.filter(c => c.received_quantity < c.total_quantity);

  const filteredContractsForDashboard = contracts.filter(c => {
    // 儀表板搜尋
    const matchesSearch = 
      c.contract_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.vendor.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.item_name.toLowerCase().includes(searchTerm.toLowerCase());
    
    // 如果開啟了「僅顯示未完成」，過濾掉 >= 100% 的
    const matchesCompletion = showIncompleteOnly ? c.received_quantity < c.total_quantity : true;

    return matchesSearch && matchesCompletion;
  });

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-[#1A1A1A] selection:text-white">
      <Toaster position="top-right" />
      
      {/* Sidebar / Navigation */}
      <nav className="fixed left-0 top-0 h-full w-64 border-r border-black/5 bg-white z-40 hidden md:flex flex-col shadow-sm">
        <div className="p-8 border-b border-black/5">
          <h1 className="text-2xl font-black tracking-tight text-black">採購進料管理系統</h1>
        </div>
        
        <div className="flex-1 px-4 py-8 space-y-2">
          <NavItem 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')}
            icon={<BarChart3 size={18} />}
            label="儀表板概覽"
          />
          <NavItem 
            active={activeTab === 'contracts'} 
            onClick={() => setActiveTab('contracts')}
            icon={<ClipboardList size={18} />}
            label="預售單據管理"
          />
          <NavItem 
            active={activeTab === 'records'} 
            onClick={() => setActiveTab('records')}
            icon={<Truck size={18} />}
            label="進料紀錄清單"
          />
        </div>

        <div className="p-8 border-t border-black/5 opacity-30 text-[10px] uppercase tracking-widest font-bold">
          v1.1.0 © 2024
        </div>
      </nav>

      {/* Main Content */}
      <main className="md:ml-64 p-4 md:p-12">
        <header className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-6">
          <div>
            <h2 className="text-4xl md:text-6xl font-bold tracking-tighter">
              {activeTab === 'dashboard' && '概覽'}
              {activeTab === 'contracts' && '預售單據'}
              {activeTab === 'records' && '進料紀錄'}
            </h2>
            <p className="text-sm opacity-80 mt-2">
              {activeTab === 'dashboard' && '追蹤預售進度與採購統計'}
              {activeTab === 'contracts' && '管理長期採購合約與預購量'}
              {activeTab === 'records' && '紀錄所有進料與一般採購單'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" size={16} />
              <input 
                type="text" 
                placeholder="搜尋..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-transparent border border-[#141414] rounded-full py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-[#141414] w-48 md:w-64"
              />
            </div>
            <button 
              onClick={exportFullReport}
              className="flex items-center gap-2 border border-[#141414] rounded-full px-4 py-2 hover:bg-[#141414] hover:text-[#E4E3E0] transition-all"
              title="匯出全紀錄 CSV"
            >
              <Download size={18} />
              <span className="text-sm font-bold">匯出全紀錄</span>
            </button>
          </div>
        </header>

        {/* Quick Actions / Summary */}
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <button 
              onClick={() => setIsContractModalOpen(true)}
              className="group flex items-center justify-between p-8 bg-[#1A1A1A] text-white rounded-3xl hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
            >
              <div className="text-left">
                <p className="text-xs uppercase tracking-widest opacity-90 font-bold mb-1">快速操作</p>
                <h3 className="text-2xl font-bold">新增預售單</h3>
              </div>
              <div className="bg-white/10 p-3 rounded-full group-hover:bg-white/20 transition-colors">
                <Plus className="group-hover:rotate-90 transition-transform" size={24} />
              </div>
            </button>
            <button 
              onClick={() => setIsRecordModalOpen(true)}
              className="group flex items-center justify-between p-8 bg-white border border-black/5 rounded-3xl hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
            >
              <div className="text-left">
                <p className="text-xs uppercase tracking-widest opacity-90 font-bold mb-1 text-[#1A1A1A]">快速操作</p>
                <h3 className="text-2xl font-bold text-[#1A1A1A]">記錄進料</h3>
              </div>
              <div className="bg-black/5 p-3 rounded-full group-hover:bg-black/10 transition-colors">
                <Plus className="group-hover:rotate-90 transition-transform text-[#1A1A1A]" size={24} />
              </div>
            </button>
            <button 
              onClick={() => setShowIncompleteOnly(!showIncompleteOnly)}
              className={cn(
                "p-8 border rounded-3xl flex items-center justify-between shadow-sm transition-all duration-300 hover:shadow-md",
                showIncompleteOnly ? "bg-orange-50 border-orange-200" : "bg-white border-black/5"
              )}
            >
              <div className="text-left">
                <p className={cn("text-xs uppercase tracking-widest font-bold mb-1", showIncompleteOnly ? "text-orange-800/70" : "opacity-90 text-[#1A1A1A]")}>到貨提醒</p>
                <h3 className={cn("text-2xl font-bold", showIncompleteOnly ? "text-orange-900" : "text-[#1A1A1A]")}>
                  {incompleteContracts.length} 筆待到貨
                </h3>
              </div>
              <div className={cn("p-3 rounded-full transition-colors", showIncompleteOnly ? "bg-orange-200" : "bg-orange-50")}>
                <Bell className={cn("transition-colors", showIncompleteOnly ? "text-orange-700" : "text-orange-500")} size={24} />
              </div>
            </button>
          </div>
        )}

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {filteredContractsForDashboard.map(contract => (
                <DashboardCard key={contract.id} contract={contract} />
              ))}
              {filteredContractsForDashboard.length === 0 && (
                <div className="col-span-full py-20 border border-dashed border-[#141414] rounded-2xl flex flex-col items-center justify-center opacity-40">
                  <Package size={48} strokeWidth={1} />
                  <p className="mt-4 font-bold">尚無預售單據</p>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'contracts' && (
            <motion.div 
              key="contracts"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden"
            >
              <div className="grid grid-cols-8 py-6 px-8 text-lg uppercase tracking-normal text-[#1A1A1A] font-black bg-slate-100/80">
                <div className="col-span-1">單號/日期</div>
                <div className="col-span-1">廠商</div>
                <div className="col-span-1">品項/規格</div>
                <div className="col-span-1">總量/總額</div>
                <div className="col-span-1">已進料</div>
                <div className="col-span-1 text-orange-700">未進料</div>
                <div className="col-span-1">預計到貨</div>
                <div className="col-span-1 text-right">操作</div>
              </div>
              {filteredContracts.map(contract => {
                const isAmountBased = contract.total_type === 'amount';
                const unitStr = isAmountBased ? '$' : 'kg';
                const received = isAmountBased ? (contract.received_amount || 0) : contract.received_quantity;
                const remaining = Math.max(0, contract.total_quantity - received);
                
                return (
                <div key={contract.id} className="grid grid-cols-8 py-8 px-8 border-t border-black/5 hover:bg-slate-50 transition-colors group items-center">
                  <div className="col-span-1">
                    <div className="font-mono text-base font-bold text-[#1A1A1A]">{contract.contract_no}</div>
                    <div className="text-xs text-[#1A1A1A]/80 font-medium mt-1">{contract.purchase_date}</div>
                  </div>
                  <div className="col-span-1 text-base font-medium text-[#1A1A1A]">{contract.vendor}</div>
                  <div className="col-span-1">
                    <div className="text-base font-medium text-[#1A1A1A]">{contract.item_name}</div>
                    <div className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded inline-block mt-1",
                      contract.specification === '全' ? "bg-emerald-100 text-emerald-800 font-bold" : "bg-slate-100 text-[#1A1A1A]/90"
                    )}>
                      {contract.specification === '全' ? '全規格適用' : (contract.specification || '無規格')}
                    </div>
                  </div>
                  <div className="col-span-1 font-mono text-base font-bold text-[#1A1A1A]">
                    {unitStr === '$' ? '$' : ''}{contract.total_quantity.toLocaleString()}{unitStr === 'kg' ? ' kg' : ''}
                  </div>
                  <div className="col-span-1 font-mono text-base text-emerald-600 font-bold">
                    {unitStr === '$' ? '$' : ''}{received.toLocaleString()}{unitStr === 'kg' ? ' kg' : ''}
                  </div>
                  <div className="col-span-1 font-mono text-base text-orange-600 font-bold">
                    {unitStr === '$' ? '$' : ''}{remaining.toLocaleString()}{unitStr === 'kg' ? ' kg' : ''}
                  </div>
                  <div className="col-span-1 font-mono text-sm text-[#1A1A1A] font-medium">{contract.expected_arrival_date}</div>
                  <div className="col-span-1 flex justify-end gap-2">
                    <button 
                      onClick={() => handleEditContract(contract)}
                      className="p-2 rounded-full hover:bg-slate-100 text-slate-400 opacity-0 group-hover:opacity-100 transition-all"
                      title="編輯"
                    >
                      <Pencil size={18} />
                    </button>
                    <button 
                      onClick={() => handleDeleteContract(contract.id)}
                      className={cn(
                        "p-2 rounded-full transition-all flex items-center gap-1",
                        confirmDeleteId?.id === contract.id && confirmDeleteId?.type === 'contract'
                          ? "bg-red-500 text-white px-3 opacity-100"
                          : "hover:bg-red-50 text-red-400 opacity-0 group-hover:opacity-100"
                      )}
                    >
                      {confirmDeleteId?.id === contract.id && confirmDeleteId?.type === 'contract' ? (
                        <span className="text-[10px] font-bold">確認刪除</span>
                      ) : (
                        <Trash2 size={18} />
                      )}
                    </button>
                  </div>
                </div>
              )})}
            </motion.div>
          )}

          {activeTab === 'records' && (
            <motion.div 
              key="records"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden"
            >
              <div className="grid grid-cols-9 py-6 px-8 text-lg uppercase tracking-normal text-[#1A1A1A] font-black bg-slate-100/80">
                <div className="col-span-1">日期</div>
                <div className="col-span-1">類型</div>
                <div className="col-span-1">廠商</div>
                <div className="col-span-1">品項/規格</div>
                <div className="col-span-1">數量 (kg)</div>
                <div className="col-span-1">單價</div>
                <div className="col-span-1 text-[#1A1A1A]">總價</div>
                <div className="col-span-1">簽收人</div>
                <div className="col-span-1 text-right">操作</div>
              </div>
              {filteredRecords.map(record => (
                <div key={record.id} className="grid grid-cols-9 py-8 px-8 border-t border-black/5 hover:bg-slate-50 transition-colors group items-center">
                  <div className="col-span-1 font-mono text-sm font-bold text-[#1A1A1A]">{record.delivery_date}</div>
                  <div className="col-span-1">
                    <span className={cn(
                      "text-xs px-3 py-1 rounded-full font-bold uppercase tracking-tighter",
                      record.order_type === 'pre_sale_delivery' ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"
                    )}>
                      {record.order_type === 'pre_sale_delivery' ? '預售進料' : '一般單'}
                    </span>
                    {record.contract_no && <div className="text-xs mt-1.5 text-[#1A1A1A]/90 font-mono font-bold">{record.contract_no}</div>}
                  </div>
                  <div className="col-span-1 text-base font-medium text-[#1A1A1A]">{record.vendor || '一般單'}</div>
                  <div className="col-span-1">
                    <div className="text-base font-medium text-[#1A1A1A]">{record.item_name}</div>
                    <div className="text-xs font-medium text-[#1A1A1A]/90 bg-slate-100 px-2 py-0.5 rounded inline-block mt-1">{record.specification}</div>
                  </div>
                  <div className="col-span-1 font-mono text-base font-bold text-[#1A1A1A]">{record.quantity.toLocaleString()}</div>
                  <div className="col-span-1 font-mono text-sm text-[#1A1A1A] font-medium">${record.unit_price.toLocaleString()}</div>
                  <div className="col-span-1 font-mono text-base font-bold text-[#1A1A1A]">${record.total_price.toLocaleString()}</div>
                  <div className="col-span-1 text-sm font-medium text-[#1A1A1A]">{record.receiver}</div>
                  <div className="col-span-1 flex justify-end gap-2">
                    <button 
                      onClick={() => handleEditRecord(record)}
                      className="p-2 rounded-full hover:bg-slate-100 text-slate-400 opacity-0 group-hover:opacity-100 transition-all"
                      title="編輯"
                    >
                      <Pencil size={18} />
                    </button>
                    <button 
                      onClick={() => handleDeleteRecord(record.id)}
                      className={cn(
                        "p-2 rounded-full transition-all flex items-center gap-1",
                        confirmDeleteId?.id === record.id && confirmDeleteId?.type === 'record'
                          ? "bg-red-500 text-white px-3 opacity-100"
                          : "hover:bg-red-50 text-red-400 opacity-0 group-hover:opacity-100"
                      )}
                    >
                      {confirmDeleteId?.id === record.id && confirmDeleteId?.type === 'record' ? (
                        <span className="text-[10px] font-bold">確認刪除</span>
                      ) : (
                        <Trash2 size={18} />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Modals */}
      <Modal isOpen={isContractModalOpen} onClose={() => setIsContractModalOpen(false)} title={editingContract ? "編輯預售單據" : "新增預售單據"}>
        <form onSubmit={handleAddContract} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <Input label="預售單號" name="contract_no" required defaultValue={editingContract?.contract_no} icon={<Hash size={14} />} />
            <Input label="廠商名稱" name="vendor" required defaultValue={editingContract?.vendor} icon={<User size={14} />} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="品項名稱" name="item_name" required defaultValue={editingContract?.item_name} icon={<Tag size={14} />} />
            <Input label="規格" name="specification" defaultValue={editingContract?.specification || ''} icon={<ClipboardList size={14} />} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-widest text-[#1A1A1A]/70 font-black ml-1 text-[#1A1A1A]">預購類型</label>
              <select name="total_type" className="w-full bg-slate-50 border border-black/5 rounded-2xl p-4 focus:outline-none focus:ring-2 focus:ring-black/5 focus:bg-white transition-all text-sm font-medium" defaultValue={editingContract?.total_type || 'weight'}>
                <option value="weight">預購總重量 (kg)</option>
                <option value="amount">預購總金額 ($)</option>
              </select>
            </div>
            <Input label="預購總數 (單位依類型而定)" name="total_quantity" type="number" step="0.01" required defaultValue={editingContract?.total_quantity} icon={<Package size={14} />} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="預購單價" name="unit_price" type="number" step="0.01" required defaultValue={editingContract?.unit_price} icon={<Coins size={14} />} />
            <Input label="採購日期" name="purchase_date" type="date" required defaultValue={editingContract?.purchase_date || format(new Date(), 'yyyy-MM-dd')} icon={<Calendar size={14} />} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="預計到貨日期" name="expected_arrival_date" type="date" required defaultValue={editingContract?.expected_arrival_date} icon={<Clock size={14} />} />
          </div>
          <button type="submit" className="w-full bg-[#141414] text-[#E4E3E0] py-4 rounded-xl font-bold hover:opacity-90 transition-opacity">
            {editingContract ? "確認更新" : "確認新增"}
          </button>
        </form>
      </Modal>

      <Modal isOpen={isRecordModalOpen} onClose={() => setIsRecordModalOpen(false)} title={editingRecord ? "編輯進料/採購紀錄" : "新增進料/採購紀錄"}>
        <form onSubmit={handleAddRecord} className="space-y-6">
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-widest text-[#1A1A1A]/70 font-black ml-1 text-[#1A1A1A]">關聯預售單 (選填)</label>
            <select 
              name="contract_id" 
              value={selectedContractId}
              onChange={handleContractChange}
              className="w-full bg-slate-50 border border-black/5 rounded-2xl p-4 focus:outline-none focus:ring-2 focus:ring-black/5 focus:bg-white transition-all text-sm font-medium appearance-none"
            >
              <option value="">-- 一般採購單 (非預售) --</option>
              {contracts.map(c => (
                <option key={c.id} value={c.id}>
                  {c.contract_no} - {c.vendor} - {c.item_name}{c.specification ? ` - ${c.specification}` : ''}
                </option>
              ))}
            </select>
            {selectedContractId && contracts.find(c => c.id === Number(selectedContractId))?.specification === '全' && (
              <p className="text-[10px] text-emerald-600 font-bold mt-1 ml-1 uppercase tracking-wider">
                💡 此預售單規格為「全」，任何規格進料皆會扣除此單重量
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input 
              label="廠商" 
              name="vendor" 
              required 
              value={recordFormValues.vendor}
              onChange={(e) => setRecordFormValues({ ...recordFormValues, vendor: e.target.value })}
              icon={<User size={14} />} 
            />
            <Input label="進料日期" name="delivery_date" type="date" required defaultValue={editingRecord?.delivery_date || format(new Date(), 'yyyy-MM-dd')} icon={<Calendar size={14} />} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="簽收人" name="receiver" required defaultValue={editingRecord?.receiver} icon={<User size={14} />} />
            <Input 
              label="品項名稱" 
              name="item_name" 
              required 
              value={recordFormValues.item_name}
              onChange={(e) => setRecordFormValues({ ...recordFormValues, item_name: e.target.value })}
              icon={<Tag size={14} />} 
            />
            <Input 
              label="規格" 
              name="specification" 
              value={recordFormValues.specification}
              onChange={(e) => setRecordFormValues({ ...recordFormValues, specification: e.target.value })}
              icon={<ClipboardList size={14} />} 
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="進料重量 (kg, 選填)" name="quantity" type="number" step="0.01" defaultValue={editingRecord?.quantity} icon={<Package size={14} />} />
            <Input 
              label="單價 (選填)" 
              name="unit_price" 
              type="number" 
              step="0.01" 
              value={recordFormValues.unit_price}
              onChange={(e) => setRecordFormValues({ ...recordFormValues, unit_price: e.target.value })}
              icon={<Coins size={14} />} 
            />
          </div>
          <div className="grid grid-cols-1 gap-4">
            <Input 
              label="進料金額 (選填)" 
              name="total_price_input" 
              type="number" 
              step="0.01" 
              defaultValue={editingRecord?.total_price}
              placeholder="若留空，將自動以 重量 × 單價 進行計算"
              icon={<Coins size={14} />} 
            />
          </div>
          <button type="submit" className="w-full bg-[#1A1A1A] text-white py-5 rounded-[2rem] font-bold hover:shadow-xl hover:-translate-y-0.5 transition-all">
            {editingRecord ? "確認更新" : "確認記錄"}
          </button>
        </form>
      </Modal>
    </div>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-5 py-4 rounded-2xl transition-all duration-300",
        active 
          ? "bg-[#1A1A1A] text-white shadow-lg shadow-black/10 translate-x-1" 
          : "hover:bg-black/5 text-[#1A1A1A]/60 hover:text-[#1A1A1A]"
      )}
    >
      <div className={cn("transition-transform duration-300", active && "scale-110")}>
        {icon}
      </div>
      <span className="text-sm font-bold tracking-tight">{label}</span>
      {active && <ChevronRight size={14} className="ml-auto opacity-50" />}
    </button>
  );
}

interface DashboardCardProps {
  contract: PreSaleContract;
}

const DashboardCard: React.FC<DashboardCardProps> = ({ contract }) => {
  const isAmountBased = contract.total_type === 'amount';
  const unitStr = isAmountBased ? '$' : 'kg';
  const received = isAmountBased ? (contract.received_amount || 0) : contract.received_quantity;
  const progress = (received / contract.total_quantity) * 100;
  const isOver = received > contract.total_quantity;
  const isComplete = received >= contract.total_quantity && !isOver;

  const arrivalStatus = useMemo(() => {
    if (isComplete || isOver) return { label: '已完成', color: 'text-slate-500 bg-slate-100 border-slate-200' };
    if (!contract.expected_arrival_date) return null;
    const date = parseISO(contract.expected_arrival_date);
    const days = differenceInDays(date, new Date());
    
    if (isPast(date) && !isToday(date)) return { label: '已逾期', color: 'text-red-600 bg-red-50 border-red-200' };
    if (days <= 3) return { label: '即將到貨', color: 'text-orange-600 bg-orange-50 border-orange-200' };
    return { label: '準時', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' };
  }, [contract.expected_arrival_date]);

  return (
    <div className={cn(
      "border border-black/5 rounded-3xl p-8 shadow-sm hover:shadow-xl transition-all duration-300 relative overflow-hidden group",
      (isComplete || isOver) ? "bg-slate-50 opacity-80" : "bg-white"
    )}>
      {arrivalStatus && (
        <div className={cn(
          "absolute top-0 right-0 px-4 py-1.5 text-xs font-bold uppercase tracking-widest border-l border-b rounded-bl-2xl",
          arrivalStatus.color
        )}>
          {arrivalStatus.label}
        </div>
      )}
      
      <div className="flex justify-between items-start mb-8">
        <div>
          <h3 className={cn("text-2xl font-bold", (isComplete || isOver) ? "text-slate-600" : "text-[#1A1A1A]")}>{contract.contract_no}</h3>
          <p className="text-xs text-[#1A1A1A]/70 font-medium mt-1">{contract.vendor}</p>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-widest text-[#1A1A1A]/70 font-bold">進度</div>
          <div className={cn("text-2xl font-mono font-bold", isOver ? "text-red-500" : isComplete ? "text-emerald-600" : "text-[#1A1A1A]")}>
            {progress.toFixed(1)}%
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <span className="text-xs text-[#1A1A1A]/70 font-bold uppercase tracking-wider">品項/規格</span>
          <div className="text-right">
            <div className="text-base font-bold text-[#1A1A1A]">{contract.item_name}</div>
            {contract.specification && (
              <div className={cn(
                "text-xs font-medium px-2 py-0.5 rounded inline-block mt-1",
                contract.specification === '全' ? "bg-emerald-100 text-emerald-800 font-bold" : "bg-slate-100 text-[#1A1A1A]/90"
              )}>
                {contract.specification === '全' ? '全規格適用' : contract.specification}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-slate-50 rounded-2xl">
            <span className="text-xs text-[#1A1A1A]/70 font-bold uppercase block mb-1">採購日期</span>
            <span className="text-sm font-mono font-bold">{contract.purchase_date || '未設定'}</span>
          </div>
          <div className="p-3 bg-slate-50 rounded-2xl">
            <span className="text-xs text-[#1A1A1A]/70 font-bold uppercase block mb-1">預計到貨</span>
            <span className="text-sm font-mono font-bold">{contract.expected_arrival_date || '未設定'}</span>
          </div>
        </div>
        
        <div className="space-y-2">
          <div className="flex justify-between text-xs uppercase tracking-widest font-bold">
            <span className="text-[#1A1A1A]/70">已進度 / 總數</span>
            <span className={cn((isComplete || isOver) ? "text-slate-600" : "text-[#1A1A1A]")}>
              {unitStr === '$' ? '$' : ''}{received.toLocaleString()} / {unitStr === '$' ? '$' : ''}{contract.total_quantity.toLocaleString()} {unitStr === 'kg' ? 'kg' : ''}
            </span>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(progress, 100)}%` }}
              className={cn("h-full rounded-full", isOver ? "bg-red-500" : isComplete ? "bg-emerald-500" : "bg-[#1A1A1A]")}
            />
          </div>
          <div className="flex justify-between text-[11px] font-bold">
            <span className={cn((isComplete || isOver) ? "text-slate-500" : "text-orange-600")}>剩餘未完成</span>
            <span className={cn("font-mono", (isComplete || isOver) ? "text-slate-500" : "text-orange-600")}>
              {unitStr === '$' ? '$' : ''}{Math.max(0, contract.total_quantity - received).toLocaleString()} {unitStr === 'kg' ? 'kg' : ''}
            </span>
          </div>
        </div>

        {isOver && (
          <div className="flex items-center gap-2 text-red-500 text-xs font-bold uppercase bg-red-50 p-2 rounded-lg">
            <AlertCircle size={14} />
            進料量已超過預購量
          </div>
        )}
      </div>
    </div>
  );
}

function Modal({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-[#141414]/40 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-white border border-black/5 rounded-[2.5rem] w-full max-w-lg overflow-hidden shadow-2xl"
      >
        <div className="p-10 border-b border-black/5 flex justify-between items-center bg-[#1A1A1A] text-white">
          <h3 className="text-3xl font-bold">{title}</h3>
          <button onClick={onClose} className="bg-white/10 p-2 rounded-full hover:bg-white/20 transition-all">
            <Plus size={24} className="rotate-45" />
          </button>
        </div>
        <div className="p-10">
          {children}
        </div>
      </motion.div>
    </div>
  );
}

function Input({ label, icon, ...props }: { label: string, icon?: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  const [dateVal, setDateVal] = useState(props.defaultValue || props.value || '');

  // Handle external changes (if any)
  useEffect(() => {
    if (props.value !== undefined) setDateVal(props.value);
  }, [props.value]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDateVal(e.target.value);
    if (props.onChange) props.onChange(e);
  };

  const isDate = props.type === 'date';

  return (
    <div className="space-y-1.5">
      <label className="text-xs uppercase tracking-widest text-[#1A1A1A]/70 font-black ml-1 text-[#1A1A1A]">{label}</label>
      <div className="relative">
        {icon && <div className="absolute left-4 top-1/2 -translate-y-1/2 opacity-50 text-[#1A1A1A] z-10">{icon}</div>}
        
        {isDate ? (
          <>
            {/* The visible fake input */}
            <input 
              type="text"
              readOnly
              placeholder="年/月/日"
              value={dateVal ? String(dateVal).replace(/-/g, '/') : ''}
              className={cn(
                "w-full bg-slate-50 border border-black/5 rounded-2xl p-4 focus:outline-none focus:ring-2 focus:ring-black/5 focus:bg-white transition-all text-sm font-medium",
                icon && "pl-12"
              )}
            />
            {/* The invisible real date input that captures clicks / form submits */}
            <input 
              {...props}
              type="date"
              value={dateVal}
              onChange={handleDateChange}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
              onClick={(e) => {
                try {
                  if ('showPicker' in HTMLInputElement.prototype) {
                    (e.target as HTMLInputElement).showPicker();
                  }
                } catch (err) {}
              }}
            />
          </>
        ) : (
          <input 
            {...props}
            type={props.type || 'text'}
            className={cn(
              "w-full bg-slate-50 border border-black/5 rounded-2xl p-4 focus:outline-none focus:ring-2 focus:ring-black/5 focus:bg-white transition-all text-sm font-medium",
              icon && "pl-12"
            )}
          />
        )}
      </div>
    </div>
  );
}
