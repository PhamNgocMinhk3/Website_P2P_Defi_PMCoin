import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { FiatTransaction } from '../../models/fiat-transaction.model';

export interface PaginatedResponse<T> {
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  data: T[];
}

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  private readonly apiUrl = `${environment.apiUrl}/api/payment`;

  constructor(private http: HttpClient) { }

  getFiatTransactions(page: number, pageSize: number): Observable<PaginatedResponse<FiatTransaction>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('pageSize', pageSize.toString());
      
    return this.http.get<PaginatedResponse<FiatTransaction>>(`${this.apiUrl}/transactions`, { params, withCredentials: true });
  }

  // ADDED: Method to approve a withdrawal
  approveWithdrawal(transactionId: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/transactions/${transactionId}/approve-withdrawal`, {}, { withCredentials: true });
  }

  // ADDED: Method to reject a withdrawal
  rejectWithdrawal(transactionId: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/transactions/${transactionId}/reject-withdrawal`, {}, { withCredentials: true });
  }
}