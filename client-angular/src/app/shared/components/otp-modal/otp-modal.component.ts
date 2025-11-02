import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-otp-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-overlay" *ngIf="isVisible">
      <div class="modal-content">
        <h3 class="modal-title">{{ title }}</h3>
        <p class="modal-message">{{ message }}</p>
        <div class="otp-inputs">
          <input #otpInput *ngFor="let i of [0,1,2,3,4,5]; let idx = index"
                 type="text"
                 pattern="\\d*"
                 maxlength="1"
                 [(ngModel)]="otp[idx]"
                 (keyup)="onKeyUp($event, idx)"
                 (paste)="onPaste($event)"
                 class="otp-input"
                 [attr.data-index]="idx"
                 autocomplete="off">
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" (click)="onCancelClick()">{{ cancelText }}</button>
          <button class="btn-primary" [disabled]="isConfirmDisabled()" (click)="onConfirmClick()">{{ confirmText }}</button>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./otp-modal.component.scss']
})
export class OtpModalComponent {
  @Input() isVisible = false;
  @Input() title = 'Enter OTP';
  @Input() message = 'An OTP has been sent to your email.';
  @Input() confirmText = 'Confirm';
  @Input() cancelText = 'Cancel';
  @Output() confirm = new EventEmitter<string>();
  @Output() cancel = new EventEmitter<void>();

  otp: string[] = Array(6).fill('');

  onKeyUp(event: KeyboardEvent, index: number): void {
    const input = event.target as HTMLInputElement;
    if (input.value && /^\d$/.test(input.value) && index < 5) {
      (input.nextElementSibling as HTMLInputElement)?.focus();
    } else if (event.key === 'Backspace' && index > 0) {
      (input.previousElementSibling as HTMLInputElement)?.focus();
    }
  }

  onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pasteData = event.clipboardData?.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasteData) {
      for (let i = 0; i < pasteData.length; i++) {
        this.otp[i] = pasteData[i];
      }
      const inputs = (event.target as HTMLElement).parentElement?.querySelectorAll('input');
      if (inputs) {
        const focusIndex = Math.min(pasteData.length, 5);
        inputs[focusIndex].focus();
      }
    }
  }

  onConfirmClick(): void {
    if (this.isConfirmDisabled()) return;
    this.confirm.emit(this.otp.join(''));
  }

  onCancelClick(): void {
    this.cancel.emit();
  }

  isConfirmDisabled(): boolean {
    return this.otp.join('').length !== 6;
  }
}