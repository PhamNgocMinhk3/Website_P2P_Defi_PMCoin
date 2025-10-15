import { Component, OnDestroy, OnInit, Optional } from '@angular/core';
import { P2POrder, P2PService } from '../../services/p2p.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../shared/services/notification.service';
import { Web3P2PService } from '../../services/web3-p2p.service';
import { SignalRService } from '../../core/services/signalr.service';
import { UserProfileService } from '../../core/services/user-profile.service'; // Import UserProfileService
import { UserSettingsService } from '../../shared/services/user-settings.service'; // FIX: Import UserSettingsService
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ConfirmationModalComponent } from '../../shared/components/confirmation-modal/confirmation-modal.component';
import { OtpModalComponent } from '../../shared/components/otp-modal/otp-modal.component';

interface PriceCalculationResult {
  sellAmount: number;
  buyAmount: number;
  exchangeRate: number;
  sellToken: string;
  buyToken: string;
  sellTokenPrice: number;
  buyTokenPrice: number;
  calculatedAt: string;
}

interface CreateForm {
  sellToken: string;
  buyToken: string;
  sellAmount: number;
  walletAddress: string;
  expiryHours: number;
}

@Component({
  selector: 'app-p2p',
  templateUrl: './p2p.component.html',
  styleUrls: ['./p2p.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    ConfirmationModalComponent,
    OtpModalComponent // Add OtpModalComponent here
  ]
})
export class P2PComponent implements OnInit, OnDestroy {
  activeTab: string = 'marketplace';
  useWeb3Mode: boolean = true;
  isLoading: boolean = false;
  isCreatingOrder: boolean = false;
  isConnectingWallet: boolean = false;
  isLoadingHistory: boolean = false;
  historyLoaded: boolean = false;
  showOrderDetails: boolean = false;
  selectedOrder: P2POrder | null = null;
  isConfirmationVisible: boolean = false;
  confirmationData: any = {
    title: 'Xác nhận',
    message: 'Bạn có chắc chắn muốn thực hiện hành động này?',
    confirmText: 'Xác nhận',
    cancelText: 'Hủy',
    type: 'info'
  };
  confirmationCallback: (() => void) | null = null;
  confirmationCancelCallback: (() => void) | null = null;

  // OTP Modal State
  isOtpModalVisible = false;
  otpPurpose = '';
  private actionToConfirm: (() => void) | null = null;


  lastApiCall: number = 0;
  apiCooldown: number = 2000;

  priceCache: Map<string, { price: number, timestamp: number }> = new Map();
  cacheExpiry: number = 60000; // 1 minute

  autoRefreshInterval: any;
  autoRefreshDelay: number = 15000; // 15 seconds

  walletInfo: { address: string, balance: string, chainId: string, isConnected: boolean } | null = null;
  activeOrders: P2POrder[] = [];
  myOrders: P2POrder[] = [];
  transactionHistory: any[] = [];
  expandedTransactions: Set<string> = new Set();

  tokenPrices: any = {};
  pmCoinPrice: any = null;

  filterSellToken: string = 'all';
  filterBuyToken: string = 'all';

  createForm: CreateForm = {
    sellToken: 'BTC',
    buyToken: 'PM',
    sellAmount: 0,
    walletAddress: '',
    expiryHours: 24
  };

  priceCalculation: PriceCalculationResult | null = null;
  isCalculatingPrice: boolean = false;

  subscriptions: Subscription[] = [];
  availableTokens: string[] = [];

  notification: { type: string, message: string } = { type: '', message: '' };

  constructor(
    private p2pService: P2PService,
    public authService: AuthService,
    private web3P2PService: Web3P2PService,
    private notificationService: NotificationService,
    private signalRService: SignalRService,
    private userProfileService: UserProfileService, // Keep for OTP sending
    private userSettingsService: UserSettingsService // FIX: Inject UserSettingsService for checking settings
  ) {
    this.web3P2PService.setP2PService(this.p2pService);
  }

  ngOnInit(): void {
    this.initializeComponent();
    this.setupSubscriptions();
    this.restoreWalletConnection();
    // Start 5s polling orders from smart contract when entering P2P page
    this.web3P2PService.startOrderPolling();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.autoRefreshInterval) clearInterval(this.autoRefreshInterval);
    this.priceCache.clear();
    if (this.visibilityChangeHandler) {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
    }
    // Stop polling when leaving P2P page to avoid memory leaks/lag
    this.web3P2PService.stopOrderPolling();
  }

  initializeComponent(): void {
    this.availableTokens = this.p2pService.supportedTokens;
    this.loadActiveOrders();
  }

  async restoreWalletConnection(): Promise<void> {
    try {
      if (this.web3P2PService.isConnected$) { // Check if Web3P2PService is connected
        const address = await this.web3P2PService.getWalletAddress();
        if (address) {
          const balance = await this.web3P2PService.getTokenBalance('tCORE', address); // Assuming tCORE is the native token
          this.walletInfo = { address: address, balance: balance, chainId: '0x45b', isConnected: true };
          this.createForm.walletAddress = address;
          this.loadMyOrders();
        }
      }
    } catch (error) {
      console.log('Could not restore wallet connection:', error);
    }
  }

  setupSubscriptions(): void {
    this.subscriptions.push(
      this.web3P2PService.isConnected$.subscribe(isConnected => {
        if (isConnected) {
          this.web3P2PService.getWalletAddress().then(async address => {
            if (address) {
              const balance = await this.web3P2PService.getTokenBalance('tCORE', address);
              this.walletInfo = { address: address, balance: balance, chainId: '0x45b', isConnected: true };
              this.createForm.walletAddress = address;
              this.loadMyOrders();
            }
          });
        } else {
          this.walletInfo = null;
          this.myOrders = [];
        }
      }),
      this.web3P2PService.orders$.subscribe(orders => {
        console.log('✅ Nhận được danh sách orders từ service:', orders);
        this.activeOrders = orders;
        if (this.walletInfo && this.activeTab === 'my-orders') {
          this.loadMyOrders();
        }
      }),
      this.p2pService.tokenPrices$.subscribe(prices => {
        this.tokenPrices = prices;
      }),
      this.p2pService.pmCoinPrice$.subscribe(price => {
        this.pmCoinPrice = price;
      }),
      // SignalR P2P Listeners
      this.signalRService.orderLocked$.subscribe(orderId => {
        this.web3P2PService.setOrderMatchingState(orderId, true);
        this.notificationService.show(`Lệnh ${orderId.substring(0, 8)}... đang được xử lý.`, 'info');
      }),
      this.signalRService.orderUnlocked$.subscribe(orderId => {
        this.web3P2PService.setOrderMatchingState(orderId, false);
        this.notificationService.show(`Lệnh ${orderId.substring(0, 8)}... đã được mở khóa.`, 'info');
      }),
      this.signalRService.orderMatched$.subscribe(orderId => {
        this.notificationService.show(`Lệnh ${orderId.substring(0, 8)}... đã được khớp thành công!`, 'success');
        this.web3P2PService.loadActiveTradesFromContract(); // Force refresh
      })
    );
    this.setupVisibilityListener();
  }

  setupVisibilityListener(): void {
    if (typeof document !== 'undefined') {
      this.visibilityChangeHandler = () => {
        if (!document.hidden && this.authService.isAuthenticated) {
          setTimeout(() => {
            this.restoreWalletConnection();
          }, 500);
        }
      };
      document.addEventListener('visibilitychange', this.visibilityChangeHandler);
    }
  }

  visibilityChangeHandler: (() => void) | null = null;

  ngAfterViewInit(): void {
    this.setupAnimations();
  }

  startAutoRefresh(): void {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
    }
    if (this.authService.isAuthenticated) {
      this.autoRefreshInterval = setInterval(() => {
        if (!document.hidden && this.authService.isAuthenticated) {
          this.loadActiveOrders();
        }
      }, this.autoRefreshDelay);
    }
  }

  stopAutoRefresh(): void {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = undefined;
    }
  }

  manualRefresh(): void {
    this.loadActiveOrders();
  }

  loadActiveOrders(): void {
    const now = Date.now();
    if (now - this.lastApiCall < this.apiCooldown) {
      return;
    }
    this.lastApiCall = now;
    this.isLoading = true;
    this.web3P2PService.loadActiveTradesFromContract().then(() => {
      this.isLoading = false;
    }).catch(error => {
      this.isLoading = false;
      this.notificationService.show("Failed to load orders from blockchain. Please check your wallet connection.", "error");
    });
  }

  loadMyOrders(): void {
    if (!this.walletInfo) {
      this.myOrders = [];
      return;
    }
    this.myOrders = this.activeOrders.filter(order => this.isMyOrder(order));
  }

  loadTransactionHistory(): void {
    if (!this.authService.isAuthenticated) {
      this.transactionHistory = [];
      return;
    }
    this.isLoadingHistory = true;
    this.p2pService.getUserTransactionHistory(1, 50).subscribe({
      next: response => {
        if (response.success && response.data) {
          this.transactionHistory = response.data;
          this.historyLoaded = true;
        }
        this.isLoadingHistory = false;
      },
      error: error => {
        console.error("Error loading transaction history:", error);
        this.isLoadingHistory = false;
      }
    });
  }

  setupAnimations(): void {
    // Implement animations if needed
  }

  async connectWallet(): Promise<void> {
    this.isConnectingWallet = true;
    try {
      const address = await this.web3P2PService.connectWallet();
      const balance = await this.web3P2PService.getTokenBalance('tCORE', address); // Assuming tCORE is the native token
      this.walletInfo = { address: address, balance: balance, chainId: '0x45b', isConnected: true };
      this.notificationService.show(`Wallet connected: ${address.substring(0, 6)}...${address.substring(address.length - 4)}`, 'success');
    } catch (error: any) {
      console.error("Wallet connection error:", error);
      this.notificationService.show(`Failed to connect wallet: ${error.message}`, 'error');
    } finally {
      this.isConnectingWallet = false;
    }
  }

  disconnectWallet(): void {
    // Web3P2PService does not have a direct disconnect method.
    // We simulate disconnect by clearing local wallet info.
    this.walletInfo = null;
    this.myOrders = [];
    this.createForm.walletAddress = '';
    this.notificationService.show('Ví đã được ngắt kết nối', 'success');
  }

  setActiveTab(tab: string): void {
    this.activeTab = tab;
    if (tab === 'my-orders' && this.walletInfo) {
      this.loadMyOrders();
    } else if (tab === 'history' && !this.historyLoaded && !this.isLoadingHistory) {
      this.loadTransactionHistory();
    }
  }

  getFilteredOrders(): P2POrder[] {
    return this.activeOrders.filter(order => {
      const sellTokenMatch = this.filterSellToken === 'all' || order.sellToken === this.filterSellToken;
      const buyTokenMatch = this.filterBuyToken === 'all' || order.buyToken === this.filterBuyToken;
      const isActive = order.status === 'active';
      return sellTokenMatch && buyTokenMatch && isActive;
    });
  }

  onFilterChange(): void {
    this.loadActiveOrders();
  }

  async calculatePrice(): Promise<void> {
    if (!this.createForm.sellAmount || !this.createForm.sellToken || !this.createForm.buyToken) {
      this.priceCalculation = null;
      return;
    }
    if (this.createForm.sellToken === this.createForm.buyToken) {
      this.notificationService.show("Token bán và token mua không thể giống nhau", "error");
      return;
    }

    const cacheKey = `${this.createForm.sellToken}-${this.createForm.buyToken}`;
    const cached = this.priceCache.get(cacheKey);
    const now = Date.now();

    if (cached && now - cached.timestamp < this.cacheExpiry) {
      this.priceCalculation = {
        sellAmount: this.createForm.sellAmount,
        buyAmount: this.createForm.sellAmount * cached.price,
        exchangeRate: cached.price,
        sellToken: this.createForm.sellToken,
        buyToken: this.createForm.buyToken,
        sellTokenPrice: 1,
        buyTokenPrice: cached.price,
        calculatedAt: new Date().toISOString()
      };
      return;
    }

    if (now - this.lastApiCall < this.apiCooldown) {
      return;
    }
    this.lastApiCall = now;

    this.isCalculatingPrice = true;
    this.p2pService.calculateExchange(
      this.createForm.sellToken,
      this.createForm.buyToken,
      this.createForm.sellAmount
    ).subscribe({
      next: response => {
        this.isCalculatingPrice = false;
        if (response.success && response.data) {
          this.priceCalculation = response.data;
          this.priceCache.set(cacheKey, { price: response.data.exchangeRate, timestamp: Date.now() });
        }
      },
      error: error => {
        this.isCalculatingPrice = false;
        console.error("Error calculating price:", error);
        this.notificationService.show("Không thể tính toán giá", "error");
      }
    });
  }

  debounceTimer: any;
  onSellAmountChange(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.calculatePrice();
    }, 1000);
  }

  onTokenChange(): void {
    this.calculatePrice();
  }

  onViewDetails(order: P2POrder): void {
    this.selectedOrder = order;
    this.showOrderDetails = true;
  }

  closeOrderDetails(): void {
    this.showOrderDetails = false;
    this.selectedOrder = null;
  }

  showConfirmation(data: any, onConfirm: () => void, onCancel?: () => void): void {
    this.confirmationData = { ...data };
    this.confirmationCallback = onConfirm;
    this.confirmationCancelCallback = onCancel || null;
    this.isConfirmationVisible = true;
  }

  onConfirmationConfirmed(): void {
    this.isConfirmationVisible = false;
    if (this.confirmationCallback) {
      this.confirmationCallback();
      this.confirmationCallback = null;
    }
  }

  onConfirmationCancelled(): void {
    this.isConfirmationVisible = false;
    if (this.confirmationCancelCallback) {
      this.confirmationCancelCallback();
      this.confirmationCancelCallback = null;
    }
    this.confirmationCallback = null; // Clear callback even if cancelled
  }

  // --- OTP MODAL METHODS ---
  private async executeActionWith2FA(purpose: string, action: () => void): Promise<void> {
    // FIX: Get settings from the correct service (UserSettingsService)
    const settings = this.userSettingsService.getCurrentSettings();
    if (settings && settings.twoFactorEnabled) {
      this.notificationService.show('Đang gửi mã OTP đến email của bạn...', 'info');
      this.userProfileService.sendOtp(purpose).subscribe({
        next: () => {
          this.otpPurpose = purpose;
          this.actionToConfirm = action;
          this.isOtpModalVisible = true;
        },
        error: (err: any) => {
          this.notificationService.show(err.error?.message || 'Không thể gửi OTP.', 'error');
        }
      });
    } else {
      // If 2FA is not enabled, execute the action directly.
      action();
    }
  }

  onOtpConfirm(otp: string): void {
    if (!this.otpPurpose || !this.actionToConfirm) return;

    this.userProfileService.verifyOtp(otp, this.otpPurpose).subscribe({
      next: (response: any) => {
        if (response.success) {
          this.notificationService.show('Xác thực OTP thành công!', 'success');
          this.isOtpModalVisible = false;
          this.actionToConfirm?.(); // Execute the original action
          this.actionToConfirm = null;
          this.otpPurpose = '';
        } else {
          this.notificationService.show(response.message || 'OTP không chính xác.', 'error');
        }
      },
      error: (err: any) => {
        this.notificationService.show(err.error?.message || 'Lỗi xác thực OTP.', 'error');
      }
    });
  }

  onOtpCancel(): void {
    this.isOtpModalVisible = false;
    this.actionToConfirm = null;
    this.otpPurpose = '';
  }

  getSellToken(order: P2POrder): string {
    return order.sellToken;
  }

  getBuyToken(order: P2POrder): string {
    return order.buyToken;
  }

  getSellAmount(order: P2POrder): number {
    const amount = order.sellAmount;
    return typeof amount === 'string' ? parseFloat(amount) : amount;
  }

  getBuyAmount(order: P2POrder): number {
    const amount = order.buyAmount;
    return typeof amount === 'string' ? parseFloat(amount) : amount;
  }

  getTrader(order: P2POrder): string {
    return order.seller;
  }

  getTimestamp(order: P2POrder): Date {
    const timestamp = order.createdAt;
    return typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  }

  getStatus(order: P2POrder): string {
    return order.status;
  }

  isActiveOrder(order: P2POrder): boolean {
    const status = this.getStatus(order);
    return status === 'active' || status === 'ACTIVE';
  }

  isMyOrder(order: P2POrder): boolean {
    if (!this.walletInfo) {
      return false;
    }
    return order.seller.toLowerCase() === this.walletInfo.address.toLowerCase();
  }

  canMatchOrder(order: P2POrder): boolean {
    return this.isActiveOrder(order) && !this.isMyOrder(order) && (order.isMatching === false || order.isMatching == null);
  }

  canCancelOrder(order: P2POrder): boolean {
    return this.isActiveOrder(order) && this.isMyOrder(order);
  }

  async onCreateOrder(): Promise<void> {
    if (!this.walletInfo) {
      this.notificationService.show("Vui lòng kết nối ví trước", "error");
      return;
    }
    if (!this.createForm.sellAmount || this.createForm.sellAmount <= 0) {
      this.notificationService.show("Số lượng bán phải lớn hơn 0", "error");
      return;
    }
    if (!this.priceCalculation) {
      this.notificationService.show("Vui lòng tính toán giá trước", "error");
      return;
    }

    const { sellToken, buyToken } = this.createForm;
    const { buyAmount } = this.priceCalculation;

    // Wrap the core logic in a function to be called after 2FA
    const createOrderAction = () => {
      this.showCreateOrderConfirmation(confirmationMessage, buyAmount);
    };

    const confirmationMessage = `
      <div style="margin-bottom: 16px;"><strong>Bạn có chắc muốn tạo lệnh này?</strong></div>
      <div style="background: #f3f4f6; padding: 12px; border-radius: 8px; margin: 12px 0;">
        <div style="color: #dc2626; font-weight: 600; margin-bottom: 6px;">✨ Bạn sẽ bán: ${this.formatNumber(this.createForm.sellAmount)} ${sellToken}</div>
        <div style="color: #059669; font-weight: 600;">✨ Bạn sẽ nhận: ${this.formatNumber(buyAmount)} ${buyToken}</div>
      </div>
      <div style="color: #6b7280; font-size: 14px; margin-top: 12px;">💡 <strong>Lưu ý:</strong> Lệnh của bạn sẽ được đăng lên thị trường P2P và yêu cầu ký giao dịch trên ví.</div>
    `;

    // Execute with 2FA check
    this.executeActionWith2FA('P2P_CREATE_ORDER', createOrderAction);
  }

  private showCreateOrderConfirmation(confirmationMessage: string, buyAmount: number): void {
    // This method now contains the logic that was previously inside onCreateOrder
    // It's called by executeActionWith2FA either directly or after OTP verification.
    // (Assuming priceCalculation and createForm are still valid in the component's state)
    this.showConfirmation({
      title: "Xác nhận tạo lệnh",
      message: confirmationMessage,
      confirmText: "Xác nhận & Tạo Lệnh",
      cancelText: "Hủy",
      type: "info"
    }, async () => {
      this.isCreatingOrder = true;
      try {
        // 1) Ensure allowance is sufficient for sell token with correct decimals (6)
        const needsApprove = await this.web3P2PService.checkTokenApproval(
          this.createForm.sellToken,
          this.walletInfo!.address,
          this.createForm.sellAmount.toString()
        );
        if (needsApprove) {
          this.notificationService.show(`Đang approve ${this.createForm.sellToken}...`, 'info');
          await this.web3P2PService.approveToken(
            this.createForm.sellToken,
            this.createForm.sellAmount.toString()
          );
        }

        const newOrder = await this.web3P2PService.createOrder({
          sellToken: this.createForm.sellToken,
          buyToken: this.createForm.buyToken,
          sellAmount: this.createForm.sellAmount.toString(),
          buyAmount: buyAmount.toString(),
          expiryHours: this.createForm.expiryHours
        });
        this.notificationService.show("Lệnh tạo thành công!", "success");
        this.createForm.sellAmount = 0;
        this.priceCalculation = null;
        this.activeTab = 'marketplace'; // Switch to marketplace to see the new order
      } catch (error: any) {
        console.error("Error creating order:", error);
        this.notificationService.show(`Tạo lệnh thất bại: ${error.message}`, "error");
      } finally {
        this.isCreatingOrder = false;
      }
    });
  }

  async onMatchOrder(order: P2POrder): Promise<void> {
    if (!this.walletInfo) {
      this.notificationService.show("Vui lòng kết nối ví trước", "error");
      return;
    }

    const matchOrderAction = () => {
      this.showMatchOrderConfirmation(order, confirmationMessage);
    };

    const sellToken = this.getSellToken(order);
    const buyToken = this.getBuyToken(order);
    const sellAmount = this.getSellAmount(order);
    const buyAmount = this.getBuyAmount(order).toString();
    const confirmationMessage = `<div style="margin-bottom: 16px;"><strong>Bạn có chắc muốn khớp lệnh này?</strong></div><div style="background: #f3f4f6; padding: 12px; border-radius: 8px; margin: 12px 0;"><div style="color: #dc2626; font-weight: 600; margin-bottom: 6px;">✨ Bạn sẽ trả: ${buyAmount} ${buyToken}</div><div style="color: #059669; font-weight: 600;">✨ Bạn sẽ nhận: ${sellAmount} ${sellToken}</div></div><div style="color: #6b7280; font-size: 14px; margin-top: 12px;">💡 <strong>Lưu ý:</strong> Bạn cần approve ${buyAmount} ${buyToken} trước khi giao dịch.</div>`;

    this.executeActionWith2FA('P2P_MATCH_ORDER', matchOrderAction);
  }

  private showMatchOrderConfirmation(order: P2POrder, confirmationMessage: string): void {
    const buyToken = this.getBuyToken(order);
    const buyAmount = this.getBuyAmount(order).toString();
    this.showConfirmation({
      title: "Xác nhận khớp lệnh",
      message: confirmationMessage,
      confirmText: "Khớp Lệnh",
      cancelText: "Hủy",
      type: "warning"
    }, async () => {
      this.isLoading = true; // Global loading for component
      try {
        const needsApprove = await this.web3P2PService.checkTokenApproval(
        buyToken,
        this.walletInfo!.address,
        buyAmount
      );
      // 2. Nếu cần, yêu cầu người dùng approve
      if (needsApprove) {
        this.notificationService.show(`Đang yêu cầu approve ${buyToken}...`, 'info');
        await this.web3P2PService.approveToken(
          buyToken,
          buyAmount
        );
        this.notificationService.show(`Approve ${buyToken} thành công!`, 'success');
      }
        await this.web3P2PService.matchOrder(order.id.toString(), this.walletInfo!.address);
        this.notificationService.show("Lệnh đã được khớp thành công!", "success");
      } catch (error: any) {
        console.error("Error matching order:", error);
        this.notificationService.show(`Khớp lệnh thất bại: ${error.message}`, "error");
      } finally {
        this.isLoading = false;
      }
    }, () => {
      // On cancel, if the order was locked by this user, unlock it
      this.web3P2PService.setOrderMatchingState(order.id, false);
      this.signalRService.unlockOrder(order.id);
    });    
  }

  async onCancelOrder(order: P2POrder): Promise<void> {
    if (!this.walletInfo) {
      this.notificationService.show("Vui lòng kết nối ví trước", "error");
      return;
    }

    this.showConfirmation({
      title: "Xác nhận hủy lệnh",
      message: `Bạn có chắc chắn muốn hủy lệnh ${order.id.substring(0, 8)}...?`, 
      confirmText: "Hủy Lệnh",
      cancelText: "Không",
      type: "danger"
    }, async () => {
      this.isLoading = true;
      try {
        await this.web3P2PService.cancelOrder(order.id.toString());
        this.notificationService.show("Lệnh đã được hủy thành công!", "success");
      } catch (error: any) {
        console.error("Error canceling order:", error);
        this.notificationService.show(`Hủy lệnh thất bại: ${error.message}`, "error");
      } finally {
        this.isLoading = false;
      }
    });
  }

  // Helper functions for formatting and display
  formatAddress(address: string): string {
    return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : '';
  }

  formatNumber(value: number | string): string {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(num);
  }

  formatBalance(balance: number | string): string {
    const num = typeof balance === 'string' ? parseFloat(balance) : balance;
    if (num === 0) return '0';
    if (num < 0.001) return '< 0.001';
    if (num < 1) return num.toFixed(6);
    if (num < 1000) return num.toFixed(3);
    return (num / 1000).toFixed(1) + 'K';
  }

  formatCurrency(amount: number, currency: string): string {
    return `${this.formatNumber(amount)} ${currency}`;
  }

  formatExchangeRate(sellToken: string, buyToken: string, rate: number): string {
    return `1 ${sellToken} = ${this.formatNumber(rate)} ${buyToken}`;
  }

  getTokenIcon(token: string): string {
    const icons: { [key: string]: string } = {
      BTC: '₿',
      ETH: 'Ξ',
      PM: '💎',
      VND: '₫',
      USDT: '₮',
      USDC: ' USDC',
      BNB: ' BNB',
      ADA: ' ADA',
      DOT: ' DOT',
      LINK: ' LINK',
      DOGE: '🐶',
    };
    return icons[token] || '🌐';
  }

  getStatusText(status: string): string {
    switch (status.toLowerCase()) {
      case 'active':
        return 'Đang Hoạt Động';
      case 'matched':
        return 'Đã Khớp';
      case 'completed':
        return 'Hoàn Thành';
      case 'cancelled':
        return 'Đã Hủy';
      case 'pending':
        return 'Đang Chờ';
      default:
        return status;
    }
  }

  getOrderAmount(order: P2POrder, type: 'sell' | 'buy'): number {
    return type === 'sell' ? this.getSellAmount(order) : this.getBuyAmount(order);
  }

  getOrderPrice(order: P2POrder): number {
    return parseFloat(order.price);
  }

  getOrderTxHash(order: P2POrder): string | undefined {
    return order.txHash;
  }

  getOrderUserName(order: P2POrder): string {
    // Placeholder for user name logic
    return 'Trader';
  }

  trackByOrderId(index: number, order: P2POrder): string {
    return order.id;
  }

  trackByTransactionId(index: number, transaction: any): string {
    return transaction.id;
  }

  getCompletedTransactionsCount(): number {
    // FIX: A transaction is considered completed if it has both a seller and a buyer.
    return this.transactionHistory.filter(tx => tx.sellerAddress && tx.buyerAddress).length;
  }

  getTransactionStatusText(status: string): string {
    switch (status.toLowerCase()) {
      case 'completed':
        return 'Thành công';
      case 'pending':
        return 'Đang chờ';
      case 'failed':
        return 'Thất bại';
      default:
        return status;
    }
  }

  getTransactionTypeText(type: string): string {
    switch (type.toLowerCase()) {
      case 'create_order':
        return 'Tạo lệnh';
      case 'match_order':
        return 'Khớp lệnh';
      case 'cancel_order':
        return 'Hủy lệnh';
      default:
        return type;
    }
  }

  getBlockExplorerUrl(txHash: string): string {
    return `https://scan.coredao.org/tx/${txHash}`;
  }

  showError(message: string): void {
    this.notification.type = 'error';
    this.notification.message = message;
    setTimeout(() => this.clearNotification(), 5000);
  }

  showSuccess(message: string): void {
    this.notification.type = 'success';
    this.notification.message = message;
    setTimeout(() => this.clearNotification(), 5000);
  }

  clearNotification(): void {
    this.notification.type = '';
    this.notification.message = '';
  }

  getContractStatus(): { configured: boolean } {
    // Placeholder for contract status logic
    return { configured: true }; 
  }

  goToLogin(): void {
    console.log('Navigating to login...');
    // In a real application, you would use Angular Router here:
    // this.router.navigate(['/login']);
  }

  getOrderWalletAddress(order: P2POrder): string {
    return order.seller; // Assuming order.seller is the wallet address
  }

  formatTxHash(txHash: string): string {
    return this.formatAddress(txHash);
  }
}
