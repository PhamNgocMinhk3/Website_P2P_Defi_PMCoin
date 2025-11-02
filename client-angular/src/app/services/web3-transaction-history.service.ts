import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { ethers } from 'ethers';

export interface Web3Transaction {
  id: string;
  type: 'CREATE_TRADE' | 'FILL_TRADE' | 'CANCEL_TRADE' | 'DEPOSIT' | 'WITHDRAW';
  status: 'PENDING' | 'CONFIRMED' | 'FAILED';
  txHash: string;
  blockNumber?: number;
  timestamp: Date;
  from: string;
  to?: string;
  amount?: string;
  token?: string;
  tradeId?: string;
  gasUsed?: string;
  gasPrice?: string;
  details: any;
}

@Injectable({
  providedIn: 'root'
})
export class Web3TransactionHistoryService {
  private transactionsSubject = new BehaviorSubject<Web3Transaction[]>([]);
  private provider: ethers.JsonRpcProvider | null = null;
  private contractAddress: string = '';

  constructor() {
    this.loadStoredTransactions();
  }

  // ===== INITIALIZATION =====
  
  initialize(provider: ethers.JsonRpcProvider, contractAddress: string): void {
    this.provider = provider;
    this.contractAddress = contractAddress;
    console.log('📊 Web3 Transaction History Service initialized');
  }

  // ===== TRANSACTION TRACKING =====

  addTransaction(tx: Partial<Web3Transaction>): void {
    const transaction: Web3Transaction = {
      id: tx.id || Date.now().toString(),
      type: tx.type || 'CREATE_TRADE',
      status: tx.status || 'PENDING',
      txHash: tx.txHash || '',
      timestamp: tx.timestamp || new Date(),
      from: tx.from || '',
      to: tx.to,
      amount: tx.amount,
      token: tx.token,
      tradeId: tx.tradeId,
      gasUsed: tx.gasUsed,
      gasPrice: tx.gasPrice,
      details: tx.details || {}
    };

    const currentTransactions = this.transactionsSubject.value;
    const updatedTransactions = [transaction, ...currentTransactions];
    
    this.transactionsSubject.next(updatedTransactions);
    this.saveTransactions(updatedTransactions);
    
    console.log('📝 Transaction added to history:', transaction);
  }

  updateTransactionStatus(txHash: string, status: 'CONFIRMED' | 'FAILED', details?: any): void {
    const currentTransactions = this.transactionsSubject.value;
    const updatedTransactions = currentTransactions.map(tx => {
      if (tx.txHash === txHash) {
        return {
          ...tx,
          status,
          details: { ...tx.details, ...details }
        };
      }
      return tx;
    });

    this.transactionsSubject.next(updatedTransactions);
    this.saveTransactions(updatedTransactions);
    
    console.log(`📊 Transaction ${txHash} status updated to ${status}`);
  }

  // ===== BLOCKCHAIN EVENT LISTENING =====

  async startEventListening(userAddress: string): Promise<void> {
    if (!this.provider || !this.contractAddress) {
      console.warn('⚠️ Provider or contract address not set');
      return;
    }

    try {
      // Listen for TradeCreated events
      const contract = new ethers.Contract(
        this.contractAddress,
        [
          'event TradeCreated(uint256 id, address creator, address tokenToSell, uint256 amountToSell, address tokenToReceive, uint256 amountToReceive)',
          'event TradeFilled(uint256 id, address taker)',
          'event TradeCancelled(uint256 id)'
        ],
        this.provider
      );

      // Listen for TradeCreated events where user is creator
      contract.on('TradeCreated', (id, creator, tokenToSell, amountToSell, tokenToReceive, amountToReceive, event) => {
        if (creator.toLowerCase() === userAddress.toLowerCase()) {
          this.addTransaction({
            type: 'CREATE_TRADE',
            status: 'CONFIRMED',
            txHash: event.transactionHash,
            blockNumber: event.blockNumber,
            from: creator,
            tradeId: id.toString(),
            details: {
              tokenToSell,
              amountToSell: amountToSell.toString(),
              tokenToReceive,
              amountToReceive: amountToReceive.toString()
            }
          });
        }
      });

      // Listen for TradeFilled events where user is taker
      contract.on('TradeFilled', (id, taker, event) => {
        if (taker.toLowerCase() === userAddress.toLowerCase()) {
          this.addTransaction({
            type: 'FILL_TRADE',
            status: 'CONFIRMED',
            txHash: event.transactionHash,
            blockNumber: event.blockNumber,
            from: taker,
            tradeId: id.toString(),
            details: { tradeId: id.toString() }
          });
        }
      });

      // Listen for TradeCancelled events
      contract.on('TradeCancelled', (id, event) => {
        // We'll need to check if this trade belongs to the user
        this.addTransaction({
          type: 'CANCEL_TRADE',
          status: 'CONFIRMED',
          txHash: event.transactionHash,
          blockNumber: event.blockNumber,
          from: userAddress, // Assuming user cancelled their own trade
          tradeId: id.toString(),
          details: { tradeId: id.toString() }
        });
      });

      console.log('🎧 Started listening for blockchain events');
    } catch (error) {
      console.error('❌ Failed to start event listening:', error);
    }
  }

  stopEventListening(): void {
    // Remove all listeners
    if (this.provider && this.contractAddress) {
      try {
        const contract = new ethers.Contract(this.contractAddress, [], this.provider);
        contract.removeAllListeners();
        console.log('🔇 Stopped listening for blockchain events');
      } catch (error) {
        console.error('❌ Error stopping event listeners:', error);
      }
    }
  }

  // ===== DATA ACCESS =====

  getTransactions(): Observable<Web3Transaction[]> {
    return this.transactionsSubject.asObservable();
  }

  getUserTransactions(userAddress: string): Observable<Web3Transaction[]> {
    return new Observable(observer => {
      this.transactionsSubject.subscribe(transactions => {
        const userTransactions = transactions.filter(tx => 
          tx.from.toLowerCase() === userAddress.toLowerCase() ||
          tx.to?.toLowerCase() === userAddress.toLowerCase()
        );
        observer.next(userTransactions);
      });
    });
  }

  clearTransactions(): void {
    this.transactionsSubject.next([]);
    this.saveTransactions([]);
    console.log('🗑️ Transaction history cleared');
  }

  // ===== PERSISTENCE =====

  private saveTransactions(transactions: Web3Transaction[]): void {
    try {
      localStorage.setItem('web3_transaction_history', JSON.stringify(transactions));
    } catch (error) {
      console.error('❌ Failed to save transactions to localStorage:', error);
    }
  }

  private loadStoredTransactions(): void {
    try {
      const stored = localStorage.getItem('web3_transaction_history');
      if (stored) {
        const transactions = JSON.parse(stored).map((tx: any) => ({
          ...tx,
          timestamp: new Date(tx.timestamp)
        }));
        this.transactionsSubject.next(transactions);
        console.log('📂 Loaded', transactions.length, 'stored transactions');
      }
    } catch (error) {
      console.error('❌ Failed to load stored transactions:', error);
    }
  }

  // ===== UTILITY METHODS =====

  getTransactionTypeText(type: string): string {
    const typeTexts: { [key: string]: string } = {
      'CREATE_TRADE': 'Tạo lệnh',
      'FILL_TRADE': 'Khớp lệnh',
      'CANCEL_TRADE': 'Hủy lệnh',
      'DEPOSIT': 'Nạp tiền',
      'WITHDRAW': 'Rút tiền'
    };
    return typeTexts[type] || type;
  }

  getStatusText(status: string): string {
    const statusTexts: { [key: string]: string } = {
      'PENDING': 'Đang xử lý',
      'CONFIRMED': 'Đã xác nhận',
      'FAILED': 'Thất bại'
    };
    return statusTexts[status] || status;
  }

  formatAmount(amount: string, decimals: number = 6): string {
    try {
      const value = parseFloat(amount) / Math.pow(10, decimals);
      return value.toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 6 
      });
    } catch {
      return amount;
    }
  }
}
