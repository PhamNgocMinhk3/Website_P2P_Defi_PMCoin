import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Transaction } from '../../../../core/services/wallet.service';

@Component({
  selector: 'app-transaction-history',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './transaction-history.component.html',
  styleUrls: ['./transaction-history.component.scss'],
})
export class TransactionHistoryComponent implements OnInit {
  @Input() transactions?: Transaction[];

  constructor() {}

  ngOnInit(): void {
    // Component initialization
  }

  getTransactionIcon(type: string): string {
    const icons = {
      receive: '↓',
      send: '↑',
      buy: '+',
      sell: '-',
    };
    return icons[type as keyof typeof icons] || '•';
  }

  getTransactionClass(type: string): string {
    const classes = {
      receive: 'transaction-receive',
      send: 'transaction-send',
      buy: 'transaction-buy',
      sell: 'transaction-sell',
    };
    return classes[type as keyof typeof classes] || '';
  }

  getStatusClass(status: string): string {
    const classes = {
      completed: 'status-completed',
      pending: 'status-pending',
      failed: 'status-failed',
    };
    return classes[status as keyof typeof classes] || '';
  }

  getTransactionTypeText(type: string): string {
    const texts = {
      receive: 'Nhận',
      send: 'Gửi',
      buy: 'Mua',
      sell: 'Bán',
    };
    return texts[type as keyof typeof texts] || type;
  }

  getStatusText(status: string): string {
    const texts = {
      completed: 'Thành công',
      pending: 'Đang chờ',
      failed: 'Thất bại',
    };
    return texts[status as keyof typeof texts] || status;
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  }

  formatNumber(value: number): string {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    }).format(value);
  }

  formatAddress(address: string): string {
    if (address.length <= 20) {
      return address;
    }
    return `${address.substring(0, 6)}...${address.substring(
      address.length - 4
    )}`;
  }

  onViewAllTransactions(): void {
    // Navigate to full transaction history page
    // Navigate to full transaction history
  }

  onTransactionClick(transaction: Transaction): void {
    // Show transaction details modal or navigate to detail page
    // Show transaction details
  }

  trackByTransactionId(index: number, transaction: Transaction): string {
    return transaction.id;
  }
}
