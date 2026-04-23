export interface PreSaleContract {
  id: number;
  contract_no: string;
  vendor: string;
  item_name: string;
  total_quantity: number;
  total_amount?: number;
  total_type?: 'weight' | 'amount';
  unit_price: number;
  specification: string;
  purchase_date: string;
  expected_arrival_date: string;
  received_quantity: number;
  received_amount?: number;
  created_at: string;
}

export interface ProcurementRecord {
  id: number;
  contract_id: number | null;
  contract_no?: string;
  vendor?: string;
  delivery_date: string;
  receiver: string;
  item_name: string;
  specification: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  order_type: 'standard' | 'pre_sale_delivery';
  created_at: string;
}
