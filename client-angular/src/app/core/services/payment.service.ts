import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CreateVnpayUrlRequest } from '../models/payment.model';

interface CreatePaymentResponse {
  paymentUrl: string;
}

// ADDED: Define the shape of the withdrawal request payload
export interface RequestWithdrawalPayload {
  amount: number | null;
  bankName: string;
  accountNumber: string;
  accountName: string;
  transactionHash: string;
}
@Injectable({
  providedIn: 'root'
})
export class PaymentService {
  private readonly apiUrl = `${environment.apiUrl}/api/payment`;

  constructor(private http: HttpClient) { }

  createVnpayUrl(request: CreateVnpayUrlRequest): Observable<CreatePaymentResponse> {
    return this.http.post<CreatePaymentResponse>(`${this.apiUrl}/create-vnpay-url`, { amount: request.amount }, { withCredentials: true });
  }

  // ADDED: Method to send withdrawal request to the backend
  requestWithdrawal(payload: RequestWithdrawalPayload): Observable<any> {
    return this.http.post(`${this.apiUrl}/request-withdrawal`, payload, { withCredentials: true });
  }
}