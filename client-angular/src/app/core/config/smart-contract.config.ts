export const SMART_CONTRACT_CONFIG = {
  // Contract addresses - Updated with actual deployed addresses from contract_address.md
  CENTRAL_HUB_GAME_ADDRESS: '0x89f4505f08216d7c8d9a66c14db1e1795cef0e1f', // CentralHubGameV2 from contract_address.md
  PM_TOKEN_ADDRESS: '0x19aEEB185e306b1Bef2548434a45ab2eDcaE8eaD', // PM coin address

  // Network configuration - Core Chain Testnet
  CHAIN_ID: 1115, // Core Chain Testnet
  NETWORK_NAME: 'Core Chain Testnet',
  RPC_URL: 'https://rpc.test.btcs.network', // Core Chain Testnet RPC
  
  // Contract deployment info
  DEPLOYMENT_BLOCK: 18000000, // Block number when contract was deployed
  
  // Gas settings
  DEFAULT_GAS_LIMIT: 300000,
  DEFAULT_GAS_PRICE: '20000000000', // 20 gwei
  
  // PM Token decimals
  PM_TOKEN_DECIMALS: 6,
  
  // Contract verification
  ETHERSCAN_URL: 'https://scan.test.btcs.network', // Core Chain Testnet Explorer

  // Development settings
  IS_TESTNET: true, // Core Chain Testnet
  DEBUG_MODE: true, // Enable debug logging
};
