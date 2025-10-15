import { Injectable, OnDestroy, Optional } from '@angular/core';
import { BehaviorSubject, Observable, from, Subject, throwError } from 'rxjs';
import { map } from 'rxjs/operators';
import { ethers } from 'ethers';
import { AuthService } from '../core/services/auth.service';
import { TransactionHistory, P2PService, SaveTransactionHistoryRequest } from './p2p.service';
import { P2P_EXCHANGE_ABI } from '../contracts/abi-p2p';
import { P2P_EXCHANGE_ADDRESS } from '../contracts/contract-address-p2p';
import { SignalRService } from '../core/services/signalr.service';

export interface P2POrder {
  id: string;
  seller: string;
  buyer?: string;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  price: string;
  status: 'active' | 'matched' | 'completed' | 'cancelled';
  createdAt: Date;
  expiresAt: Date;
  txHash?: string;
  isMatching?: boolean;
}

export interface CreateOrderParams {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  buyAmount: string;
  expiryHours: number;
}

@Injectable({
  providedIn: 'root'
})
export class Web3P2PService implements OnDestroy {
  private provider: ethers.BrowserProvider | ethers.JsonRpcProvider | null = null;
  private signer: ethers.JsonRpcSigner | null = null;
  private ordersSubject = new BehaviorSubject<P2POrder[]>([]);
  private isConnectedSubject = new BehaviorSubject<boolean>(false);
  private transactionStatusSubject = new Subject<{type: string, message: string}>();

  private pollingInterval: any | null = null;
  private readonly POLLING_RATE_MS = 5000; // Poll every 5 seconds as requested

  private contractAddress: string = P2P_EXCHANGE_ADDRESS;
  private contractABI: any[] = P2P_EXCHANGE_ABI;

  private tokenAddresses = {
    'BTC': '0xD0D23e174DE928Ff8D0E08B4437EB74B0aF93563',
    'ETH': '0x8A974476a492231Fe57d894Ff5AF5EedcA925498',
    'VND': '0xb21f7eC916d6B70Dba7b0c5C4638A8E62E4B2A15',
    'PM': '0x19aEEB185e306b1Bef2548434a45ab2eDcaE8eaD'
  };

  private tokenDecimals: Record<string, number> = {
    'BTC': 6,
    'ETH': 6,
    'VND': 6,
    'PM': 6
  };

  private networkConfig = {
    chainId: 1115,
    name: 'Core Blockchain Testnet',
    rpcUrl: 'https://rpc.test.btcs.network',
    blockExplorer: 'https://scan.test.btcs.network',
    nativeCurrency: {
      name: 'tCORE',
      symbol: 'tCORE',
      decimals: 18
    }
  };

  private contractInstance: ethers.Contract | null = null;

  public orders$ = this.ordersSubject.asObservable();
  public isConnected$ = this.isConnectedSubject.asObservable();

  private p2pService: P2PService | null = null;

  constructor(
    @Optional() private authService: AuthService,
    private signalRService: SignalRService
  ) {
    this.initializeProvider();
  }

  ngOnDestroy(): void {
    this.stopOrderPolling(); // Ensure polling is stopped when the service is destroyed
    this.removeContractEventListeners(); // Ensure event listeners are removed
  }

  setP2PService(p2pService: P2PService): void {
    this.p2pService = p2pService;
  }

  private setupContractEventListeners(): void {
    if (!this.contractInstance) {
      console.warn('⚠️ Contract instance not available for event listener setup.');
      return;
    }

    const refreshOrders = () => {
      console.log('🔄 Smart contract event detected. Refreshing P2P orders...');
      this.loadActiveTradesFromContract().catch(err => console.error('Error refreshing orders from event:', err));
    };

    // Listen for TradeCreated event
    this.contractInstance.on('TradeCreated', refreshOrders);
    console.log('✅ Listening for TradeCreated events.');

    // Listen for TradeFilled event (or TradeMatched, depending on your ABI)
    this.contractInstance.on('TradeFilled', refreshOrders);
    console.log('✅ Listening for TradeFilled events.');

    // Listen for TradeCancelled event
    this.contractInstance.on('TradeCancelled', refreshOrders);
    console.log('✅ Listening for TradeCancelled events.');
  }

  private removeContractEventListeners(): void {
    if (this.contractInstance) {
      this.contractInstance.removeAllListeners(); // Remove all listeners to prevent memory leaks
      console.log('🗑️ Removed all smart contract event listeners.');
    }
  }

  // Method to be called by components when they need to start polling for orders.
  public startOrderPolling(): void {
    if (this.pollingInterval) {
      return; // Polling is already active
    }
    
    // Immediately load data once, then start the interval
    this.loadActiveTradesFromContract().catch(err => console.error('Initial load error:', err));

    this.pollingInterval = setInterval(() => {
      if (this.isContractConfigured() && this.contractInstance) {
        this.loadActiveTradesFromContract().catch(err => console.error('Polling error:', err));
      }
    }, this.POLLING_RATE_MS);
    console.log('P2P order polling started.');
  }

  // Method to be called by components when they are destroyed or no longer need order updates.
  public stopOrderPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      console.log('P2P order polling stopped.');
    }
  }

  private async initializeProvider(): Promise<void> {
    try {
      if (typeof window !== 'undefined') {
        await new Promise(resolve => setTimeout(resolve, 100));

        if ((window as any).ethereum?.isMetaMask) {
          this.provider = new ethers.BrowserProvider((window as any).ethereum);
          console.log('✅ MetaMask detected and initialized');
          // await this.addCoreBlockchainNetwork(); // Removed for now, can be re-added if needed
        } else if ((window as any).ethereum) {
          this.provider = new ethers.BrowserProvider((window as any).ethereum);
          console.log('✅ Web3 wallet detected and initialized');
        } else {
          // Fallback to read-only RPC so other browsers without wallet can still read orders
          this.provider = new ethers.JsonRpcProvider(this.networkConfig.rpcUrl);
          console.log('ℹ️ No wallet detected. Using read-only RPC provider');
        }

        if (this.provider) {
          this.isConnectedSubject.next(true);
          this.initializeContract();
        }
      }
    } catch (error) {
      console.error('Failed to initialize Web3 provider:', error);
    }
  }

  isContractConfigured(): boolean {
    return this.contractAddress !== '' && this.contractABI.length > 0;
  }

  private async saveTransactionHistoryToBackend(order: P2POrder, status: string): Promise<void> {
    try {
      if (!this.p2pService) {
        console.log('📝 P2PService not available, skipping transaction history save');
        return;
      }

      if (!this.authService) {
        console.log('📝 AuthService not available, skipping transaction history save');
        return;
      }

      if (!this.authService.isAuthenticated) {
        console.log('📝 User not authenticated, skipping transaction history save for Web3 mode');
        return;
      }

      const transactionData: SaveTransactionHistoryRequest = {
        txHash: order.txHash || '',
        sellToken: order.sellToken,
        buyToken: order.buyToken,
        sellAmount: parseFloat(order.sellAmount),
        buyAmount: parseFloat(order.buyAmount),
        sellerAddress: order.seller,
        buyerAddress: order.buyer || undefined,
        status: status,
        blockNumber: undefined,
        gasUsed: undefined,
        transactionTime: new Date()
      };

      this.p2pService.saveTransactionHistory(transactionData).subscribe({
        next: (response: any) => {
          if (response.success) {
            console.log('✅ Transaction history saved successfully');
          } else {
            console.warn('⚠️ Failed to save transaction history:', response.message);
          }
        },
        error: (error: any) => {
          console.warn('⚠️ Error saving transaction history:', error);
        }
      });
    } catch (error) {
      console.warn('⚠️ Error in saveTransactionHistoryToBackend:', error);
    }
  }

  private getTokenSymbol(address: string): string {
    const tokens = this.tokenAddresses;
    for (const [symbol, addr] of Object.entries(tokens)) {
      if (addr.toLowerCase() === address.toLowerCase()) {
        return symbol;
      }
    }
    return address;
  }

  private formatTokenAmount(amount: bigint): string {
    return ethers.formatUnits(amount, 6);
  }

  private calculatePrice(buyAmount: bigint, sellAmount: bigint): string {
    const buy = parseFloat(ethers.formatUnits(buyAmount, 6));
    const sell = parseFloat(ethers.formatUnits(sellAmount, 6));
    return sell > 0 ? (buy / sell).toFixed(6) : '0';
  }

  // --- Existing methods from previous versions --- //

  private async addCoreBlockchainNetwork(): Promise<void> {
    try {
      await (window as any).ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: `0x${this.networkConfig.chainId.toString(16)}`,
          chainName: this.networkConfig.name,
          rpcUrls: [this.networkConfig.rpcUrl],
          blockExplorerUrls: [this.networkConfig.blockExplorer],
          nativeCurrency: this.networkConfig.nativeCurrency
        }]
      });
      console.log('✅ Core Blockchain Testnet added to MetaMask');
    } catch (error: any) {
      if (error.code === 4902) {
        console.log('🔄 Core Blockchain Testnet already exists in MetaMask');
      } else {
        console.error('❌ Failed to add Core Blockchain Testnet:', error);
      }
    }
  }

  private initializeContract(): void {
    if (this.provider) {
      try {
        this.contractInstance = new ethers.Contract(
          this.contractAddress,
          this.contractABI,
          this.provider
        );
        console.log('📄 Smart contract initialized:', this.contractAddress);
         console.log('❗ ĐANG ĐỌC TỪ ĐỊA CHỈ CONTRACT:', this.contractAddress); 
      console.log('📄 Smart contract initialized:', this.contractAddress);
        this.checkContractDeployment().catch(console.error);
        this.testContractConnection();
        this.setupContractEventListeners(); // Setup event listeners
      } catch (error) {
        console.error('❌ Failed to initialize contract:', error);
        this.contractInstance = null;
      }
    }
  }

  async checkContractDeployment(): Promise<boolean> {
    try {
      if (!this.provider) {
        console.log('❌ No provider available for deployment check');
        return false;
      }

      const code = await this.provider.getCode(this.contractAddress);
      const isDeployed = code !== '0x';

      console.log(`📄 Contract deployment check: ${isDeployed ? 'DEPLOYED' : 'NOT DEPLOYED'}`);
      if (isDeployed) {
        console.log(`📄 Contract bytecode length: ${code.length}`);
        // await this.debugContractState(); // Removed for brevity, can be re-added
      }

      return isDeployed;
    } catch (error: any) {
      console.error('❌ Failed to check contract deployment:', error.message);
      return false;
    }
  }

  private async debugContractState(): Promise<void> {
    // Implementation for debugContractState
  }

  private async testContractConnection(): Promise<void> {
    try {
      if (this.contractInstance) {
        const result = await this.contractInstance['tradeCounter']();
        const tradeCount = Number(result);
        console.log('✅ Contract connection test successful. Trade counter:', tradeCount);

        if (tradeCount === 0) {
          console.log('ℹ️ Contract is empty (no trades yet). This is normal for a new contract.');
        }
      }
    } catch (error: any) {
      console.warn('⚠️ Contract connection test failed:', error.message);
    }
  }

  async connectWallet(): Promise<string> {
    try {
      if (typeof window === 'undefined') {
        throw new Error('Not running in browser environment');
      }

      await this.waitForMetaMask();

      if (!(window as any).ethereum) {
        throw new Error('MetaMask extension not found');
      }

      let accounts;
      let retries = 2;

      while (retries > 0) {
        try {
          accounts = await (window as any).ethereum.request({
            method: 'eth_requestAccounts',
          });
          break;
        } catch (error: any) {
          retries--;
          if (retries === 0) throw error;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts found. Please create an account in your wallet.');
      }

      this.provider = new ethers.BrowserProvider((window as any).ethereum);
      this.signer = await this.provider.getSigner();
      const signer = this.signer;
      if (!signer) {
        throw new Error('Wallet not connected');
      }
      const address = await signer.getAddress();

      this.isConnectedSubject.next(true);
      return address;
    } catch (error: any) {
      throw new Error(`Failed to connect wallet: ${error.message}`);
    }
  }

  private async waitForMetaMask(timeout = 3000): Promise<void> {
    return new Promise((resolve) => {
      if ((window as any).ethereum?.isMetaMask) {
        resolve();
        return;
      }

      if ((window as any).ethereum) {
        resolve();
        return;
      }

      let attempts = 0;
      const maxAttempts = timeout / 200;

      const checkMetaMask = () => {
        attempts++;
        if ((window as any).ethereum?.isMetaMask) {
          resolve();
        } else if ((window as any).ethereum) {
          resolve();
        } else if (attempts >= maxAttempts) {
          resolve();
        } else {
          setTimeout(checkMetaMask, 200);
        }
      };
      checkMetaMask();
    });
  }

  async getWalletAddress(): Promise<string | null> {
    try {
      if (!this.signer) {
        await this.connectWallet();
      }
      return this.signer ? await this.signer.getAddress() : null;
    } catch (error) {
      return null;
    }
  }

  async createOrder(params: CreateOrderParams): Promise<P2POrder> {
    try {
      // Ensure wallet connection – this will trigger MetaMask prompt if needed
      if (!this.signer) {
        console.log('🔄 No signer detected, requesting wallet connection...');
        const address = await this.connectWallet();
        console.log('✅ Wallet connected for order creation:', address);
      }

      const signer = this.signer;
      if (!signer) {
        throw new Error('Wallet not connected');
      }

      const address = await signer.getAddress();

      const newOrder: P2POrder = {
        id: Date.now().toString(),
        seller: address,
        sellToken: params.sellToken,
        buyToken: params.buyToken,
        sellAmount: params.sellAmount,
        buyAmount: params.buyAmount,
        price: (parseFloat(params.buyAmount) / parseFloat(params.sellAmount)).toString(),
        status: 'active',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + params.expiryHours * 60 * 60 * 1000)
      };

      let txHash: string;
      if (this.isContractConfigured()) {
        // Do not silently simulate on error; surface it so user sees MetaMask / error
        txHash = await this.createOrderOnContract(newOrder);
      } else {
        // Fallback only if contract not configured
        txHash = await this.simulateTransaction();
      }

      newOrder.txHash = txHash;

      this.saveTransactionHistoryToBackend(newOrder, 'CREATED');

      await this.loadActiveTradesFromContract();

      return newOrder;
    } catch (error: any) {
      throw new Error(`Failed to create order: ${error.message}`);
    }
  }

  async checkTokenApproval(tokenSymbol: string, userAddress: string, amount: string): Promise<boolean> {
    try {
      if (!this.provider) {
        throw new Error('Provider not available');
      }

      const tokenAddress = this.tokenAddresses[tokenSymbol as keyof typeof this.tokenAddresses];
      if (!tokenAddress) {
        throw new Error(`Token address not found for ${tokenSymbol}`);
      }

      const erc20ABI = [
        "function allowance(address owner, address spender) external view returns (uint256)"
      ];

      const tokenContract = new ethers.Contract(tokenAddress, erc20ABI, this.provider);
      const decimals = this.tokenDecimals[tokenSymbol] ?? 6;
      const amountWei = ethers.parseUnits(amount, decimals);
      const allowance = await tokenContract['allowance'](userAddress, this.contractAddress);

      return allowance < amountWei;
    } catch (error) {
      return true;
    }
  }

  async approveToken(tokenSymbol: string, amount: string): Promise<string> {
    return this.approveTokenPrivate(tokenSymbol, amount);
  }

  private async approveTokenPrivate(tokenSymbol: string, amount: string): Promise<string> {
    try {
      if (!this.provider || !this.signer) {
        throw new Error('Provider or signer not available');
      }

      const tokenAddress = this.tokenAddresses[tokenSymbol as keyof typeof this.tokenAddresses];
      if (!tokenAddress) {
        throw new Error(`Token address not found for ${tokenSymbol}`);
      }

      const erc20ABI = [
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function allowance(address owner, address spender) external view returns (uint256)"
      ];

      const tokenContract = new ethers.Contract(tokenAddress, erc20ABI, this.signer);

      const decimals = this.tokenDecimals[tokenSymbol] ?? 6;
      const amountWei = ethers.parseUnits(amount, decimals);

      const tx = await tokenContract['approve'](this.contractAddress, amountWei);

      const receipt = await tx.wait();

      return tx.hash;
    } catch (error: any) {
      throw new Error(`Failed to approve token: ${error.message}`);
    }
  }

  private async createOrderOnContract(order: P2POrder): Promise<string> {
    try {
      if (!this.provider || !this.signer) {
        throw new Error('Provider or signer not available');
      }

      const contract = new ethers.Contract(this.contractAddress, this.contractABI, this.signer);

      const sellTokenAddress = this.tokenAddresses[order.sellToken as keyof typeof this.tokenAddresses];
      const buyTokenAddress = this.tokenAddresses[order.buyToken as keyof typeof this.tokenAddresses];

      if (!sellTokenAddress || !buyTokenAddress) {
        throw new Error(`Token not supported: ${order.sellToken} or ${order.buyToken}`);
      }

      const sellAmountFloat = parseFloat(order.sellAmount);
      const buyAmountFloat = parseFloat(order.buyAmount);

      if (isNaN(sellAmountFloat) || isNaN(buyAmountFloat)) {
        throw new Error(`Invalid amounts: sell=${order.sellAmount}, buy=${order.buyAmount}`);
      }

      const sellAmountRounded = Math.round(sellAmountFloat);
      const buyAmountRounded = Math.round(buyAmountFloat);

      const sellAmountWei = ethers.parseUnits(sellAmountRounded.toString(), 6);
      const buyAmountWei = ethers.parseUnits(buyAmountRounded.toString(), 6);

      const tx = await contract['createTrade'](
        sellTokenAddress,
        buyTokenAddress,
        sellAmountWei,
        buyAmountWei
      );

      const receipt = await tx.wait();

      await this.loadActiveTradesFromContract();

      return receipt.hash;
    } catch (error: any) {
      throw new Error(`Contract transaction failed: ${error.message}`);
    }
  }

  async matchOrder(orderId: string, buyerAddress: string): Promise<boolean> {
    if (!this.signer) {
      throw new Error('Wallet not connected');
    }

    const orderToMatch = this.ordersSubject.value.find(o => o.id === orderId);
    if (!orderToMatch) {
      throw new Error('Order not found or already matched');
    }

    if (orderToMatch.isMatching) {
      throw new Error('Order is already being matched by someone else.');
    }

    // Lock the order immediately on the UI and notify others
    this.setOrderMatchingState(orderId, true);
    await this.signalRService.lockOrder(orderId);

    try {
      const contract = new ethers.Contract(this.contractAddress, this.contractABI, this.signer);
      const tx = await contract['fillTrade'](parseInt(orderId));
      
      const receipt = await tx.wait();
      if (receipt.status === 0) {
        throw new Error('Transaction failed on-chain');
      }
      
      // Notify all clients of success for immediate refresh
      await this.signalRService.notifyTradeSuccess(orderId);

      // Force refresh for the current user
      await this.loadActiveTradesFromContract();

      // Save to backend history
      const matchedOrder = { ...orderToMatch, buyer: buyerAddress, txHash: receipt.hash };
      this.saveTransactionHistoryToBackend(matchedOrder, 'MATCHED');

      return true;

    } catch (error: any) {
      // If the user rejected or transaction failed, unlock the order for others
      await this.signalRService.unlockOrder(orderId);
      // Re-throw the error to be caught by the component
      throw new Error(`Failed to fill trade: ${error.message}`);

    } finally {
      // Always unlock the order on the current user's UI after the attempt
      this.setOrderMatchingState(orderId, false);
    }
  }

  public setOrderMatchingState(orderId: string, isMatching: boolean): void {
    const currentOrders = this.ordersSubject.value;
    const orderIndex = currentOrders.findIndex(o => o.id === orderId);

    if (orderIndex > -1) {
      const updatedOrders = [...currentOrders];
      updatedOrders[orderIndex] = { ...updatedOrders[orderIndex], isMatching };
      this.ordersSubject.next(updatedOrders);
    }
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      if (!this.signer) {
        throw new Error('Wallet not connected');
      }

      const contract = new ethers.Contract(this.contractAddress, this.contractABI, this.signer);

      const tx = await contract['cancelTrade'](parseInt(orderId));

      const receipt = await tx.wait();

      await this.loadActiveTradesFromContract();

      const cancelledOrder = this.ordersSubject.value.find(o => o.id === orderId);
      if (cancelledOrder) {
        this.saveTransactionHistoryToBackend(cancelledOrder, 'CANCELLED');
      }

      return true;
    } catch (error: any) {
      throw new Error(`Failed to cancel trade: ${error.message}`);
    }
  }

  getActiveOrders(): Observable<P2POrder[]> {
    return this.ordersSubject.asObservable().pipe(
      map(orders => orders.filter(order => order.status === 'active'))
    );
  }

  getTransactionStatus(): Observable<{type: string, message: string}> {
    return this.transactionStatusSubject.asObservable();
  }

  public async loadActiveTradesFromContract(): Promise<void> {
    try {
      if (!this.contractInstance) {
        return;
      }

      let tradeCounter = 0;
      try {
        tradeCounter = Number(await this.contractInstance['tradeCounter']());
      } catch (error: any) {
        console.warn('⚠️ Failed to get trade counter:', error.message);
        return;
      }

      if (tradeCounter === 0) {
        if (this.ordersSubject.value.length > 0) this.ordersSubject.next([]);
        return;
      }

      const trades: P2POrder[] = [];
      const promises = [];

      for (let i = 1; i <= tradeCounter; i++) {
        promises.push(this.contractInstance['trades'](i));
      }

      const results = await Promise.all(promises);

      const currentLockedOrders = this.ordersSubject.value.filter(o => o.isMatching).map(o => o.id);

      for (const trade of results) {
          const tradeData = {
            id: trade[0].toString(),
            creator: trade[1],
            taker: trade[2],
            tokenSell: trade[3],
            tokenBuy: trade[4],
            amountSell: trade[5],
            amountBuy: trade[6],
            status: Number(trade[7])
          };

          if (tradeData && tradeData.status === 1 && BigInt(tradeData.id) > 0) { // Status 1 is Active
            const order: P2POrder = {
              id: tradeData.id,
              seller: tradeData.creator,
              sellToken: this.getTokenSymbol(tradeData.tokenSell),
              buyToken: this.getTokenSymbol(tradeData.tokenBuy),
              sellAmount: this.formatTokenAmount(tradeData.amountSell),
              buyAmount: this.formatTokenAmount(tradeData.amountBuy),
              price: this.calculatePrice(tradeData.amountBuy, tradeData.amountSell),
              status: 'active',
              createdAt: new Date(), 
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
              isMatching: currentLockedOrders.includes(tradeData.id)
            };
            trades.push(order);
          }
      }

      if (JSON.stringify(this.ordersSubject.value.map(o => ({...o, isMatching: undefined}))) !== JSON.stringify(trades.map(o => ({...o, isMatching: undefined})))) {
        this.ordersSubject.next(trades);
      }

    } catch (error) {
      console.error('❌ Failed to load trades from contract:', error);
    }
  }

  async getTokenBalance(tokenSymbol: string, walletAddress: string): Promise<string> {
    try {
      if (!this.provider) {
        throw new Error('Provider not initialized');
      }

      const tokenAddress = this.tokenAddresses[tokenSymbol as keyof typeof this.tokenAddresses];
      if (!tokenAddress) {
        throw new Error(`Token ${tokenSymbol} not supported`);
      }

      if (tokenSymbol === 'tCORE') {
        const balance = await this.provider.getBalance(walletAddress);
        return ethers.formatEther(balance);
      }

      const tokenABI = [
        'function balanceOf(address owner) view returns (uint256)',
        'function decimals() view returns (uint8)'
      ];

      const tokenContract = new ethers.Contract(tokenAddress, tokenABI, this.provider);
      const balance = await tokenContract['balanceOf'](walletAddress);
      return ethers.formatUnits(balance, 6);
    } catch (error: any) {
      return '0';
    }
  }

  private async simulateTransaction(): Promise<string> {
    return new Promise(resolve => setTimeout(() => resolve('0xsimulated_tx_hash'), 1000));
  }

  calculatePriceFromStrings(sellAmount: string, buyAmount: string): string {
    const sell = parseFloat(sellAmount);
    const buy = parseFloat(buyAmount);
    return sell > 0 ? (buy / sell).toFixed(6) : '0';
  }

  getSupportedTokens(): string[] {
    return ['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'ADA', 'DOT', 'LINK'];
  }

  getUserTransactionHistory(userAddress: string): Observable<TransactionHistory[]> {
    return from([]);
  }
}