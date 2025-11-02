import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';

declare global {
  interface Window {
    ethereum?: any;
  }
}

export interface WalletInfo {
  address: string;
  balance: string;
  chainId: string;
  isConnected: boolean;
}

export interface TokenBalance {
  token: string;
  balance: string;
  decimals: number;
}

@Injectable({
  providedIn: 'root',
})
export class MetaMaskService {
  private walletInfoSubject = new BehaviorSubject<WalletInfo | null>(null);
  private isConnectingSubject = new BehaviorSubject<boolean>(false);

  public walletInfo$ = this.walletInfoSubject.asObservable();
  public isConnecting$ = this.isConnectingSubject.asObservable();

  // Core Blockchain Testnet - Official config
  private readonly CORE_CHAIN_CONFIG = {
    chainId: '0x45b', // 1115 in hex (Core Testnet)
    chainName: 'Core Blockchain TestNet',
    nativeCurrency: {
      name: 'tCore',
      symbol: 'tCORE',
      decimals: 18,
    },
    rpcUrls: ['https://rpc.test.btcs.network'],
    blockExplorerUrls: ['https://scan.test.btcs.network'],
  };

  // Token contracts on Core Chain Testnet
  private readonly TOKEN_CONTRACTS = {
    BTC: '0xD0D23e174DE928Ff8D0E08B4437EB74B0aF93563', // Mock address
    ETH: '0x8A974476a492231Fe57d894Ff5AF5EedcA925498', // Mock address
    PM: environment.PM_TOKEN_ADDRESS,
    VND: environment.VND_TOKEN_ADDRESS,
  };

  constructor() {
    this.initializeMetaMask();
  }

  private async initializeMetaMask(): Promise<void> {
    if (typeof window !== 'undefined' && window.ethereum) {
      try {
        // Check if already connected
        const accounts = await window.ethereum.request({
          method: 'eth_accounts',
        });
        if (accounts.length > 0) {
          await this.updateWalletInfo();
        }

        // Listen for account changes
        window.ethereum.on('accountsChanged', (accounts: string[]) => {
          if (accounts.length === 0) {
            this.walletInfoSubject.next(null);
          } else {
            this.updateWalletInfo();
          }
        });

        // Listen for chain changes
        window.ethereum.on('chainChanged', () => {
          this.updateWalletInfo();
        });
      } catch (error) {
        console.error('Error initializing MetaMask:', error);
      }
    }
  }

  async connectWallet(): Promise<WalletInfo | null> {
    if (!this.isMetaMaskAvailable()) {
      const errorMsg = 'MetaMask extension not found. Please install MetaMask browser extension and refresh the page.';
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    try {
      this.isConnectingSubject.next(true);

      // Request account access
      await window.ethereum.request({ method: 'eth_requestAccounts' });

      // Switch to Core Blockchain
      await this.switchToCore();

      // Update wallet info
      const walletInfo = await this.updateWalletInfo();

      return walletInfo;
    } catch (error: any) {
      console.error('Error connecting wallet:', error);

      if (error.code === 4001) {
        throw new Error('User rejected the connection request.');
      } else if (error.code === -32002) {
        throw new Error(
          'Connection request is already pending. Please check MetaMask.'
        );
      } else {
        throw new Error('Failed to connect wallet: ' + error.message);
      }
    } finally {
      this.isConnectingSubject.next(false);
    }
  }

  async disconnectWallet(): Promise<void> {
    this.walletInfoSubject.next(null);
  }

  async isWalletConnected(): Promise<boolean> {
    try {
      if (!this.isMetaMaskAvailable()) {
        return false;
      }

      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      return accounts && accounts.length > 0;
    } catch (error) {
      console.error('Error checking wallet connection:', error);
      return false;
    }
  }

  async refreshWalletInfo(): Promise<WalletInfo | null> {
    return await this.updateWalletInfo();
  }

  private async switchToCore(): Promise<void> {
    try {
      // Try to switch to Core Blockchain
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: this.CORE_CHAIN_CONFIG.chainId }],
      });
    } catch (switchError: any) {
      // If the chain is not added, add it
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [this.CORE_CHAIN_CONFIG],
          });
        } catch (addError) {
          throw new Error('Failed to add Core Blockchain to MetaMask');
        }
      } else {
        throw new Error('Failed to switch to Core Blockchain');
      }
    }
  }

  private async updateWalletInfo(): Promise<WalletInfo | null> {
    try {
      const accounts = await window.ethereum.request({
        method: 'eth_accounts',
      });

      if (accounts.length === 0) {
        this.walletInfoSubject.next(null);
        return null;
      }

      const address = accounts[0];
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      const balance = await window.ethereum.request({
        method: 'eth_getBalance',
        params: [address, 'latest'],
      });

      // Convert balance from wei to ether
      const balanceInEther = parseInt(balance, 16) / Math.pow(10, 18);

      const walletInfo: WalletInfo = {
        address,
        balance: balanceInEther.toFixed(6),
        chainId,
        isConnected: true,
      };

      this.walletInfoSubject.next(walletInfo);
      return walletInfo;
    } catch (error) {
      console.error('Error updating wallet info:', error);
      this.walletInfoSubject.next(null);
      return null;
    }
  }

  async getTokenBalance(tokenSymbol: string): Promise<TokenBalance | null> {
    const walletInfo = this.walletInfoSubject.value;
    if (
      !walletInfo ||
      !this.TOKEN_CONTRACTS[tokenSymbol as keyof typeof this.TOKEN_CONTRACTS]
    ) {
      return null;
    }

    try {
      // TODO: Implement real token balance checking
      // For now, return 0 balance to show real data instead of fake numbers
      console.log(`⚠️ Getting token balance for ${tokenSymbol} - using placeholder until real contract integration`);

      return {
        token: tokenSymbol,
        balance: '0',
        decimals: 18,
      };
    } catch (error) {
      console.error(`Error getting ${tokenSymbol} balance:`, error);
      return null;
    }
  }

  async sendTransaction(
    to: string,
    value: string,
    data?: string
  ): Promise<string> {
    const walletInfo = this.walletInfoSubject.value;
    if (!walletInfo) {
      throw new Error('Wallet not connected');
    }

    try {
      const transactionParameters = {
        to,
        from: walletInfo.address,
        value: '0x' + parseInt(value).toString(16),
        data: data || '0x',
      };

      const txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [transactionParameters],
      });

      return txHash;
    } catch (error: any) {
      console.error('Error sending transaction:', error);

      if (error.code === 4001) {
        throw new Error('User rejected the transaction.');
      } else {
        throw new Error('Transaction failed: ' + error.message);
      }
    }
  }

  isMetaMaskAvailable(): boolean {
    if (typeof window === 'undefined') {
      console.warn('Window is undefined - running in SSR mode');
      return false;
    }

    if (!window.ethereum) {
      console.warn('No ethereum provider found');
      return false;
    }

    // Check if it's MetaMask specifically, or allow other compatible wallets
    if (window.ethereum.isMetaMask) {
      return true;
    }

    // Allow other ethereum providers as fallback
    if (window.ethereum.request) {
      console.warn('Non-MetaMask ethereum provider detected, attempting to use as fallback');
      return true;
    }

    console.warn('Ethereum provider found but not compatible');
    return false;
  }

  isConnected(): boolean {
    return this.walletInfoSubject.value?.isConnected || false;
  }

  getCurrentAddress(): string | null {
    return this.walletInfoSubject.value?.address || null;
  }

  isOnCore(): boolean {
    const walletInfo = this.walletInfoSubject.value;
    return walletInfo?.chainId === this.CORE_CHAIN_CONFIG.chainId;
  }

  formatAddress(address: string): string {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  formatBalance(balance: string): string {
    const num = parseFloat(balance);
    if (num === 0) return '0';
    if (num < 0.001) return '< 0.001';
    if (num < 1) return num.toFixed(6);
    if (num < 1000) return num.toFixed(3);
    if (num < 1000000) return (num / 1000).toFixed(1) + 'K';
    return (num / 1000000).toFixed(1) + 'M';
  }

  // Utility method to check if user has enough balance for transaction
  async hasEnoughBalance(
    tokenSymbol: string,
    amount: number
  ): Promise<boolean> {
    if (tokenSymbol === 'tCORE') {
      const walletInfo = this.walletInfoSubject.value;
      return walletInfo ? parseFloat(walletInfo.balance) >= amount : false;
    } else {
      const tokenBalance = await this.getTokenBalance(tokenSymbol);
      return tokenBalance ? parseFloat(tokenBalance.balance) >= amount : false;
    }
  }
}
