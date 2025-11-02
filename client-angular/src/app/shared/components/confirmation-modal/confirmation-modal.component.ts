import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ConfirmationData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'info' | 'warning' | 'danger' | 'success';
}

@Component({
  selector: 'app-confirmation-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirmation-modal.component.html',
  styleUrls: ['./confirmation-modal.component.scss']
})
export class ConfirmationModalComponent {
  @Input() isVisible: boolean = false;
  @Input() data: ConfirmationData = {
    title: 'Xác nhận',
    message: 'Bạn có chắc chắn muốn thực hiện hành động này?',
    confirmText: 'Xác nhận',
    cancelText: 'Hủy',
    type: 'info'
  };

  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  onConfirm(): void {
    this.confirmed.emit();
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  onBackdropClick(event: Event): void {
    if (event.target === event.currentTarget) {
      this.onCancel();
    }
  }

  getIconClass(): string {
    switch (this.data.type) {
      case 'warning':
        return 'fas fa-exclamation-triangle text-yellow-500';
      case 'danger':
        return 'fas fa-exclamation-circle text-red-500';
      case 'success':
        return 'fas fa-check-circle text-green-500';
      default:
        return 'fas fa-info-circle text-blue-500';
    }
  }

  getHeaderClass(): string {
    switch (this.data.type) {
      case 'warning':
        return 'bg-gradient-to-r from-yellow-400 to-orange-500';
      case 'danger':
        return 'bg-gradient-to-r from-red-400 to-red-600';
      case 'success':
        return 'bg-gradient-to-r from-green-400 to-green-600';
      default:
        return 'bg-gradient-to-r from-blue-500 to-purple-600';
    }
  }

  getConfirmButtonClass(): string {
    switch (this.data.type) {
      case 'warning':
        return 'bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700';
      case 'danger':
        return 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700';
      case 'success':
        return 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700';
      default:
        return 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700';
    }
  }
}
