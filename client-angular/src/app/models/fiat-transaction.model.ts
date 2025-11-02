export interface FiatTransaction {
  id: string;
  userId: string;
  amount: number;
  type: 'DEPOSIT' | 'WITHDRAW';
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'FAILED_NO_WALLET';
  createdAt: Date;
  updatedAt?: Date;
}