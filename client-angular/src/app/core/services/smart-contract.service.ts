import { Injectable } from '@angular/core';
import { ethers, Contract, BrowserProvider, Signer, Log } from 'ethers';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { NotificationService } from '../../shared/services/notification.service';
import { MetaMaskService } from '../../services/metamask.service';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { UserProfileService } from './user-profile.service';

// Interfaces
export interface ContractStats {
  gameMachineBalance: string;
  treasuryBalance: string;
  totalGameVolume: string;
  totalGameProfit: string;
  dailyProfitTarget: string;
  currentDailyProfit: string;
  isProfitTargetMet: boolean;
}

// Interfaces
export interface PlaceBetResult {
  transactionHash: string;
  betId: number;
}

export interface UserBalance {
  walletBalance: string;
  internalBalance: string;
}

@Injectable({
  providedIn: 'root'
})
export class SmartContractService {
  private provider: BrowserProvider | null = null;
  private signer: Signer | null = null;
  private gameContract: Contract | null = null;
  private tokenContract: Contract | null = null;
  private vndTreasuryContract: Contract | null = null;
  private vndTokenContract: Contract | null = null;

  // Subject to notify other services when ethers and contracts are initialized
  private isInitialized = new BehaviorSubject<boolean>(false);
  public isInitialized$ = this.isInitialized.asObservable();

  private readonly GAME_CONTRACT_ADDRESS = environment.GAME_CONTRACT_ADDRESS;
  private readonly TOKEN_CONTRACT_ADDRESS = environment.PM_TOKEN_ADDRESS;
  private readonly VND_TREASURY_ADDRESS = environment.VND_TREASURY_ADDRESS;
  private readonly VND_TOKEN_ADDRESS = environment.VND_TOKEN_ADDRESS;

  // Minimal ABI based on the smart_contract.md file
  // This ABI is simplified to only include functions directly called by the frontend service.
  private readonly GAME_CONTRACT_ABI = [
    "event GameBetPlaced(uint256 indexed betId, address indexed player, uint256 amount, bool isUp)",
    "function placeBet(uint256 amount, bool isUp) external",
    "function depositForTreasury(uint256 amount) external", // Added for direct deposit
    "function owner() view returns (address)"
  ];

  // ABI for the PM Token contract (ERC20 standard)
  private readonly TOKEN_CONTRACT_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)"
  ];

  // ABI for the VND Token contract
  private readonly VND_TOKEN_CONTRACT_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)",
    "function allowance(address owner, address spender) external view returns (uint256)"
  ];

  // ABI for the VND Treasury contract
  private readonly VND_TREASURY_CONTRACT_ABI = [
    // FIX: Update ABI to include the new tokenAddress parameter
    "function depositToTreasury(address tokenAddress, uint256 amount) external"
  ];

  public connectedAccount = new BehaviorSubject<string | null>(null);
  public isOwner = new BehaviorSubject<boolean>(false);

  constructor(
    private notificationService: NotificationService,
    private metaMaskService: MetaMaskService,
    private http: HttpClient,
    private authService: AuthService,
    private userProfileService: UserProfileService
  ) {
    this.metaMaskService.walletInfo$.subscribe(walletInfo => {
      if (walletInfo && walletInfo.address) {
        this.initializeEthers(walletInfo.address);
      } else {
        this.signer = null;
        this.gameContract = null;
        this.tokenContract = null;
      this.vndTreasuryContract = null;
      this.vndTokenContract = null;
        this.connectedAccount.next(null);
        this.isOwner.next(false);
        this.isInitialized.next(false);
      }
    });
  }

  private async initializeEthers(account: string): Promise<void> {
    if (typeof window.ethereum !== 'undefined') {
      this.provider = new ethers.BrowserProvider(window.ethereum);
      this.signer = await this.provider.getSigner();
      this.gameContract = new Contract(this.GAME_CONTRACT_ADDRESS, this.GAME_CONTRACT_ABI, this.signer);
      this.tokenContract = new Contract(this.TOKEN_CONTRACT_ADDRESS, this.TOKEN_CONTRACT_ABI, this.signer);
      this.vndTreasuryContract = new Contract(this.VND_TREASURY_ADDRESS, this.VND_TREASURY_CONTRACT_ABI, this.signer);
      this.vndTokenContract = new Contract(this.VND_TOKEN_ADDRESS, this.VND_TOKEN_CONTRACT_ABI, this.signer);
      this.connectedAccount.next(account);
      this.isInitialized.next(true); // Notify that initialization is complete
      this.checkOwnership();
    } else {
      this.notificationService.show('MetaMask is not installed!', 'error');
      this.isInitialized.next(false);
    }
  }

  async connectWallet(): Promise<void> {
    await this.metaMaskService.connectWallet();
  }

  private async checkOwnership(): Promise<void> {
    if (!this.gameContract || !this.signer) {
      this.isOwner.next(false);
      return;
    }
    try {
      // FIX: Call owner() and compare addresses for ownership check
      const contractOwner = await this.gameContract['owner']();
      const connectedAddress = await this.signer.getAddress();
      const isOwnerResult = contractOwner.toLowerCase() === connectedAddress.toLowerCase();

      if (isOwnerResult) {
        // If the user is the on-chain owner, try to log them into the backend.
        // This sets the session cookie required for authorized API calls.
        await this.loginWithWallet(connectedAddress);
      }

      this.isOwner.next(isOwnerResult);
    } catch (error) {
      console.error("Error checking ownership. The contract might not be deployed or the ABI is incorrect.", error);
      this.isOwner.next(false);
    }
  }

  private async loginWithWallet(walletAddress: string): Promise<void> {
    try {
      const request$ = this.http.post<any>(
        `${environment.apiUrl}/api/auth/login-wallet`,
        { walletAddress },
        { withCredentials: true }
      );
      await firstValueFrom(request$);
      console.log('✅ Successfully authenticated with backend via wallet.');
    } catch (error: any) {
      // It's okay if this fails (e.g., user not in DB), the UI will just show "Access Denied"
      // because the backend calls will fail with 401/403.
      const errorMessage = error?.error?.message || error.message || 'Unknown error';
      const errorDetail = error?.error?.detail || 'Check server logs for more information.';
      console.warn(`Backend wallet login failed: ${errorMessage}. ${errorDetail}`);

      // UX IMPROVEMENT: If login fails because wallet isn't linked, and user is already logged in via email/pass, link it automatically.
      if (error.status === 404 && this.authService.isAuthenticated) {
        console.log('Attempting to auto-link owner wallet to the current logged-in user profile...');
        try {
          await firstValueFrom(this.userProfileService.updateProfile({ walletCode: walletAddress }));
          this.notificationService.show('Admin wallet linked to your profile automatically.', 'success');
          
          // Retry login after successful linking
          console.log('Retrying wallet login after linking...');
          const retryRequest$ = this.http.post<any>(
            `${environment.apiUrl}/api/auth/login-wallet`,
            { walletAddress },
            { withCredentials: true }
          );
          await firstValueFrom(retryRequest$);
          console.log('✅ Successfully authenticated with backend on retry.');
          // Refresh the user state in AuthService to reflect any changes from the new session
          this.authService.checkAuthStatus();
        } catch (linkError: any) {
          console.error('Failed to auto-link wallet:', linkError);
          this.notificationService.show('Could not auto-link wallet. Please update your profile manually.', 'error');
        }
      }
    }
  }

  async getPMTokenBalance(userAddress: string): Promise<string> {
    if (!this.tokenContract) throw new Error('PM Token contract not initialized');
    const balance = await this.tokenContract['balanceOf'](userAddress);
    return ethers.formatUnits(balance, environment.PM_TOKEN_DECIMALS);
  }

  async approvePMTokens(amount: string): Promise<string> {
    if (!this.tokenContract) throw new Error('PM Token contract not initialized');
    const amountInSmallestUnit = ethers.parseUnits(amount, environment.PM_TOKEN_DECIMALS);
    const tx = await this.tokenContract['approve'](this.GAME_CONTRACT_ADDRESS, amountInSmallestUnit);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  async getVndtBalance(address: string): Promise<string> {
    if (!this.vndTokenContract) throw new Error('VND Token contract not initialized');
    const balance = await this.vndTokenContract['balanceOf'](address);
    return ethers.formatUnits(balance, environment.VND_TOKEN_DECIMALS);
  }

  async getVndtTreasuryBalance(): Promise<string> {
    if (!this.vndTokenContract) throw new Error('VND Token contract not initialized');
    // The treasury balance is the VNDT balance of the Treasury Contract
    const balance = await this.vndTokenContract['balanceOf'](this.VND_TREASURY_ADDRESS);
    return ethers.formatUnits(balance, environment.VND_TOKEN_DECIMALS);
  }

  async approveVndt(amount: string): Promise<string> {
    if (!this.vndTokenContract) throw new Error('VND Token contract not initialized');
    if (!this.signer) throw new Error('Signer not initialized');

    const ownerAddress = await this.signer.getAddress();
    const amountInSmallestUnit = ethers.parseUnits(amount, environment.VND_TOKEN_DECIMALS);

    console.log('%c[DEBUG] approveVndt:', 'color: cyan; font-weight: bold;', {
      '1. Caller (Admin Wallet)': ownerAddress,
      '2. Approving on (Token Contract)': this.VND_TOKEN_ADDRESS,
      '3. Spender (Treasury Contract)': this.VND_TREASURY_ADDRESS,
      '4. Amount (raw)': amount,
      '5. Amount (wei)': amountInSmallestUnit.toString()
    });

    const tx = await this.vndTokenContract['approve'](this.VND_TREASURY_ADDRESS, amountInSmallestUnit);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  async depositVndtToTreasury(amount: string): Promise<string> {
    if (!this.vndTreasuryContract) throw new Error('VND Treasury contract not initialized');
    if (!this.signer) throw new Error('Signer not initialized');

    const ownerAddress = await this.signer.getAddress();
    const amountInSmallestUnit = ethers.parseUnits(amount, environment.VND_TOKEN_DECIMALS);

    console.log('%c[DEBUG] depositVndtToTreasury:', 'color: orange; font-weight: bold;', {
      '1. Caller (Admin Wallet)': ownerAddress,
      '2. Calling on (Treasury Contract)': this.VND_TREASURY_ADDRESS,
      '3. Function': 'depositToTreasury',
      '4. Amount (wei)': amountInSmallestUnit.toString()
    });

    // FIX: Call the updated function with the VND_TOKEN_ADDRESS as the first parameter
    const tx = await this.vndTreasuryContract['depositToTreasury'](this.VND_TOKEN_ADDRESS, amountInSmallestUnit);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  async getVndtAllowance(ownerAddress: string): Promise<string> {
    if (!this.vndTokenContract) throw new Error('VND Token contract not initialized');
    const erc20ABI = [
      "function allowance(address owner, address spender) external view returns (uint256)"
    ];
    const tokenContract = new Contract(this.VND_TOKEN_ADDRESS, erc20ABI, this.provider);
    const allowanceWei = await tokenContract['allowance'](ownerAddress, this.VND_TREASURY_ADDRESS);
    return ethers.formatUnits(allowanceWei, environment.VND_TOKEN_DECIMALS);
  }

  async placeBet(amount: string, isUp: boolean): Promise<PlaceBetResult> {
    if (!this.gameContract || !this.signer) {
      throw new Error('Wallet not connected or contract not initialized');
    }
    const amountInSmallestUnit = ethers.parseUnits(amount, environment.PM_TOKEN_DECIMALS);
    const tx = await this.gameContract['placeBet'](amountInSmallestUnit, isUp);
    this.notificationService.show('Giao dịch đang chờ xác nhận...', 'info');
    const receipt = await tx.wait(1);
    if (!receipt) {
      throw new Error("Transaction failed: no receipt returned.");
    }
    const eventFragment = this.gameContract.interface.getEvent('GameBetPlaced');
    if (!eventFragment) throw new Error('GameBetPlaced event not found in contract ABI');
    const eventLog = receipt.logs?.find((log: Log) => log.topics[0] === eventFragment.topicHash);
    if (!eventLog) throw new Error('GameBetPlaced event log not found in transaction receipt');
    const parsedLog = this.gameContract.interface.parseLog(eventLog);
    if (!parsedLog) {
      throw new Error('Could not parse GameBetPlaced event log');
    }
    const betId = parsedLog.args['betId'];
    return { transactionHash: receipt.hash, betId: Number(betId) };
  }

  async depositPMToTreasury(amount: string): Promise<string> {
    if (!this.gameContract) {
      throw new Error('Game contract not initialized');
    }
    const amountInSmallestUnit = ethers.parseUnits(amount, environment.PM_TOKEN_DECIMALS);
    const tx = await this.gameContract['depositForTreasury'](amountInSmallestUnit);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  async depositToTreasury(amount: string): Promise<string> {
    if (!this.gameContract || !this.tokenContract || !this.signer) {
      throw new Error('Wallet not connected or contracts not initialized');
    }

    try {
      this.notificationService.show('Requesting approval to spend PM tokens...', 'info');

      // Step 1: Approve the Game Contract to spend tokens on behalf of the owner
      const amountInSmallestUnit = ethers.parseUnits(amount, environment.PM_TOKEN_DECIMALS);
      const approveTx = await this.tokenContract['approve'](this.GAME_CONTRACT_ADDRESS, amountInSmallestUnit);
      await approveTx.wait(1); // Wait for 1 confirmation

      this.notificationService.show('Approval successful! Depositing to treasury...', 'info');

      // Step 2: Call the backend API which handles the deposit transaction
      const request$ = this.http.post<any>(`${environment.apiUrl}/api/smartcontract/deposit-treasury`, { amount: parseFloat(amount) }, { withCredentials: true });
      const response = await firstValueFrom(request$);
      return response.transactionHash;
    } catch (error: any) {
      console.error('Error during treasury deposit process:', error);
      const errorMessage = error.reason || error.message || 'An unknown error occurred during the deposit process.';
      this.notificationService.show(`Deposit failed: ${errorMessage}`, 'error');
      throw error; // Re-throw the error so the component can handle it
    }
  }

  async withdrawFromTreasury(amount: string): Promise<string> {
    // This function now correctly reflects the smart contract: it withdraws to the owner's address.
    if (!this.gameContract || !this.signer) throw new Error('Game contract not initialized');

    const request$ = this.http.post<any>(
      `${environment.apiUrl}/api/smartcontract/withdraw-treasury`, 
      { amount: parseFloat(amount) },
      { withCredentials: true }
    );
    const response = await firstValueFrom(request$);
    return response.transactionHash;
  }

  async emergencyPayout(amount: string, recipient: string): Promise<string> {
    // This is the correct function to call for sending funds to a specific player.
    // It calls the backend, which should be updated to use the `emergencyPayout` function on the contract.
    const request$ = this.http.post<any>(`${environment.apiUrl}/api/smartcontract/emergency-payout`, { amount: parseFloat(amount), playerAddress: recipient }, { withCredentials: true });
    const response = await firstValueFrom(request$);
    return response.transactionHash;
  }

  async setDailyProfitTarget(target: string): Promise<string> {
    if (!this.gameContract) throw new Error('Game contract not initialized');
    // This now calls the backend API which handles the transaction and logging
    const request$ = this.http.post<any>(`${environment.apiUrl}/api/smartcontract/set-daily-target`, { target: parseFloat(target) }, { withCredentials: true });
    const response = await firstValueFrom(request$);
    return response.transactionHash;
  }

  async getContractStats(): Promise<ContractStats> {
    try {
      // FIX: The backend route is prefixed with /api
      const response = await fetch(`${environment.apiUrl}/api/smartcontract/contract-stats`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('❌ Failed to fetch contract stats from backend', error);
      throw new Error('Could not load contract data from the server.');
    }
  }
}