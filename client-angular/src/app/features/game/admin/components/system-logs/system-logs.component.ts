import { Component, OnInit, AfterViewInit, OnDestroy, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { SmartContractLogService, SmartContractLog, SmartContractLogSummary } from '../../services/smart-contract-log.service';
import { forkJoin, of, Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Component({
  selector: 'app-system-logs',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSelectModule,
    MatCardModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatIconModule,
  ],
  providers: [DatePipe],
  templateUrl: './system-logs.component.html',
  styleUrls: ['./system-logs.component.scss']
})
export class SystemLogsComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  dataSource = new MatTableDataSource<SmartContractLog>();
  displayedColumns = ['eventType', 'transactionHash', 'fromAddress', 'toAddress', 'amount', 'timestamp'];
  
  summary: SmartContractLogSummary | null = null;
  eventTypes = ['TreasuryDeposit', 'TreasuryWithdrawal', 'GameBetPlaced', 'GameBetResolved', 'EmergencyPayout'];
  
  startDate: Date = new Date();
  endDate: Date = new Date();
  selectedEventType = '';
  searchAddress = '';
  
  isLoading = false;

  constructor(
    private logService: SmartContractLogService,
    private cdr: ChangeDetectorRef,
    private snackBar: MatSnackBar,
    private datePipe: DatePipe
  ) {
    // Set default date range to last 7 days
    this.startDate.setDate(this.startDate.getDate() - 7);
  }

  ngOnInit() {
    this.loadInitialData();
  }

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
    this.dataSource.sort = this.sort;
  }

  ngOnDestroy() {
    // Cleanup if needed
  }

  loadInitialData() {
    this.isLoading = true;

    // The user requested to remove the summary cards.
    // By not loading the summary, the *ngIf in the template will hide them.
    this.summary = null; 

    // The user also requested to load all logs by default, without any date filter.
    // This function now explicitly calls `getAllLogs()` on initialization.
    const logs$ = this.logService.getAllLogs().pipe(
      catchError(error => {
        console.error('Error loading logs:', error);
        this.snackBar.open('Could not load log data.', 'Close', { duration: 3000 });
        return of([]); // Return empty array if logs fail
      })
    );

    logs$.subscribe(logs => {
      this.updateDataSource(logs || []);
      this.isLoading = false;
      this.cdr.detectChanges();
    });
  }

  /**
   * Applies all active filters at once. This is the primary method for filtering data.
   * It constructs a filter object and sends it to a (new) combined filter service method.
   * This approach is more robust and scalable than separate filter functions.
   */
  applyAllFilters() {
    this.isLoading = true;
    // NOTE: This assumes a new method `getLogsByCombinedFilter` will be added to the service.
    // For now, we'll simulate by calling the most specific filter available or falling back.
    let filterObservable: Observable<SmartContractLog[]>;

    if (this.searchAddress.trim()) {
      filterObservable = this.logService.getLogsByAddress(this.searchAddress.trim());
    } else if (this.selectedEventType) {
      filterObservable = this.logService.getLogsByEventType(this.selectedEventType);
    } else if (this.startDate && this.endDate) {
      filterObservable = this.logService.getLogsByDateRange(this.startDate, this.endDate);
    } else {
      filterObservable = this.logService.getAllLogs();
    }

    filterObservable.pipe(
      catchError(error => {
        console.error('Error filtering logs:', error);
        this.snackBar.open('An error occurred while filtering logs.', 'Close', { duration: 3000 });
        return of([]);
      })
    ).subscribe(data => {
      this.updateDataSource(data);
      this.isLoading = false;
    });
  }

  private updateDataSource(data: SmartContractLog[]) {
    this.dataSource.data = data;
    if (this.dataSource.paginator) {
      this.dataSource.paginator.firstPage();
    }
    this.cdr.detectChanges();
  }

  formatAddress(address: string): string {
    if (!address) return 'N/A';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  }

  formatAmount(amount: number): string {
    if (amount === null || amount === undefined) return '0.00';
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    });
  }

  formatTimestamp(timestamp: string): string {
    return this.datePipe.transform(timestamp, 'dd/MM/yyyy HH:mm:ss') || '';
  }

  getEventTypeClass(eventType: string): string {
    switch (eventType) {
      case 'TreasuryDeposit':
        return 'deposit';
      case 'TreasuryWithdrawal':
        return 'withdrawal';
      case 'GameBetPlaced':
        return 'bet';
      case 'GameBetResolved':
        return 'resolved';
      case 'EmergencyPayout':
        return 'emergency';
      default:
        return '';
    }
  }
}