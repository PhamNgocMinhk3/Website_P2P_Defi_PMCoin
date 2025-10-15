import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../../environments/environment';

export interface SmartContractLog {
  id: string;
  eventType: string;
  transactionHash: string;
  blockNumber: number;
  fromAddress: string;
  toAddress: string;
  amount: number;
  eventData?: string;
  timestamp: string;
  date: string;
  hour: number;
}

export interface SmartContractLogSummary {
  date: string;
  totalTransactions: number;
  totalVolume: number;
  emergencyPayouts: number;
  totalBets: number;
  totalBetAmount: number;
  totalDeposits: number;
  totalDepositAmount: number;
  totalWithdrawals: number;
  totalWithdrawalAmount: number;
}

@Injectable({
  providedIn: 'root'
})
export class SmartContractLogService {
  private readonly apiUrl = `${environment.apiUrl}/api/SmartContractLog`;

  constructor(private http: HttpClient) {}

  getAllLogs(): Observable<SmartContractLog[]> {
    return this.http.get<SmartContractLog[]>(this.apiUrl);
  }

  getLogsByDateRange(startDate: Date, endDate: Date): Observable<SmartContractLog[]> {
    return this.http.get<SmartContractLog[]>(`${this.apiUrl}/dateRange`, {
      params: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      }
    });
  }

  getLogsByEventType(eventType: string): Observable<SmartContractLog[]> {
    return this.http.get<SmartContractLog[]>(`${this.apiUrl}/eventType/${eventType}`);
  }

  getLogsByAddress(address: string): Observable<SmartContractLog[]> {
    return this.http.get<SmartContractLog[]>(`${this.apiUrl}/address/${address}`);
  }

  getDailySummary(date: Date): Observable<SmartContractLogSummary> {
    return this.http.get<SmartContractLogSummary>(`${this.apiUrl}/dailySummary`, {
      params: {
        date: date.toISOString()
      }
    });
  }
}
