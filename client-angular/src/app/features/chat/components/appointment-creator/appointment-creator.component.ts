import { Component, EventEmitter, Output, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Appointment, ChatUser } from '../../chat.service';
import { User } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-appointment-creator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './appointment-creator.component.html',
  styleUrls: ['./appointment-creator.component.scss'],
})
export class AppointmentCreatorComponent {
  @Input() isVisible = false;
  @Input() currentUser!: ChatUser;
  @Input() participants: ChatUser[] = [];
  @Output() close = new EventEmitter<void>();
  @Output() appointmentCreated = new EventEmitter<Appointment>();

  title = '';
  description = '';
  selectedDate = '';
  selectedTime = '';

  // Form validation
  titleError = '';
  dateError = '';
  timeError = '';

  ngOnInit(): void {
    this.setDefaultDateTime();
  }

  private setDefaultDateTime(): void {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Set default date to tomorrow
    this.selectedDate = tomorrow.toISOString().split('T')[0];

    // Set default time to next hour
    const nextHour = new Date(now);
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    this.selectedTime = nextHour.toTimeString().slice(0, 5);
  }

  validateForm(): boolean {
    let isValid = true;

    // Reset errors
    this.titleError = '';
    this.dateError = '';
    this.timeError = '';

    // Validate title
    if (!this.title.trim()) {
      this.titleError = 'Tiêu đề là bắt buộc';
      isValid = false;
    } else if (this.title.trim().length < 3) {
      this.titleError = 'Tiêu đề phải có ít nhất 3 ký tự';
      isValid = false;
    }

    // Validate date
    if (!this.selectedDate) {
      this.dateError = 'Ngày là bắt buộc';
      isValid = false;
    } else {
      const selectedDateTime = new Date(
        `${this.selectedDate}T${this.selectedTime}`
      );
      const now = new Date();

      if (selectedDateTime <= now) {
        this.dateError = 'Ngày và giờ phải trong tương lai';
        isValid = false;
      }
    }

    // Validate time
    if (!this.selectedTime) {
      this.timeError = 'Giờ là bắt buộc';
      isValid = false;
    }

    return isValid;
  }

  canCreateAppointment(): boolean {
    return (
      this.title.trim().length > 0 &&
      this.selectedDate.length > 0 &&
      this.selectedTime.length > 0
    );
  }

  createAppointment(): void {
    if (!this.validateForm()) return;

    const dateTime = new Date(`${this.selectedDate}T${this.selectedTime}`);

    // Helper function to convert ChatUser to a User-like object
    const mapChatUserToUser = (chatUser: ChatUser): User => ({
      id: chatUser.id,
      firstName: chatUser.name.split(' ')[0] || '',
      lastName: chatUser.name.split(' ').slice(1).join(' ') || '',
      avatar: chatUser.avatar,
      // Add other required fields from User interface with default/placeholder values
      username: chatUser.name.toLowerCase().replace(' ', ''),
      email: '', // Placeholder
      createdAt: new Date().toISOString(),
    });

    const appointment: Omit<Appointment, 'id'> = {
      title: this.title.trim(),
      description: this.description.trim() || undefined,
      dateTime,
      createdBy: mapChatUserToUser(this.currentUser),
      participants: this.participants.map(mapChatUserToUser),
    };

    this.appointmentCreated.emit(appointment as Appointment);
    this.resetForm();
    this.close.emit();
  }

  onClose(): void {
    this.resetForm();
    this.close.emit();
  }

  private resetForm(): void {
    this.title = '';
    this.description = '';
    this.setDefaultDateTime();
    this.titleError = '';
    this.dateError = '';
    this.timeError = '';
  }

  formatDateTime(): string {
    if (!this.selectedDate || !this.selectedTime) return '';

    const dateTime = new Date(`${this.selectedDate}T${this.selectedTime}`);
    return dateTime.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  getMinDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  getMinTime(): string {
    const today = new Date().toISOString().split('T')[0];
    if (this.selectedDate === today) {
      const now = new Date();
      return now.toTimeString().slice(0, 5);
    }
    return '00:00';
  }
}
