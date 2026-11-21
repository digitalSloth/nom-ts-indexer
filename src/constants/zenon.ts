import {
  EMPTY_ADDRESS,
  PLASMA_ADDRESS,
  PILLAR_ADDRESS,
  TOKEN_ADDRESS,
  SENTINEL_ADDRESS,
  SWAP_ADDRESS,
  STAKE_ADDRESS,
  LIQUIDITY_ADDRESS,
  SPORK_ADDRESS,
  ACCELERATOR_ADDRESS,
  BRIDGE_ADDRESS,
  HTLC_ADDRESS,
  ZNN_ZTS,
  QSR_ZTS,
  EmbeddedContract,
  AcceleratorContract,
  BridgeContract,
  CommonContract,
  HtlcContract,
  LiquidityContract,
  PillarContract,
  PlasmaContract,
  SentinelContract,
  SporkContract,
  StakeContract,
  SwapContract,
  TokenContract,
} from 'znn-typescript-sdk';
import { PTLC_ADDRESS, PtlcContract } from './ptlc-contract.js';

/**
 * Zenon Network Constants
 * Embedded contracts, special addresses, and token standards
 */

export interface EmbeddedContractEntry {
  address: string | null;
  name: string;
  contractClass: typeof EmbeddedContract;
}

export const EMBEDDED_CONTRACTS: EmbeddedContractEntry[] = [
  { address: PLASMA_ADDRESS.toString(), name: 'Plasma Contract', contractClass: PlasmaContract },
  { address: PILLAR_ADDRESS.toString(), name: 'Pillar Contract', contractClass: PillarContract },
  { address: TOKEN_ADDRESS.toString(), name: 'Token Contract', contractClass: TokenContract },
  {
    address: SENTINEL_ADDRESS.toString(),
    name: 'Sentinel Contract',
    contractClass: SentinelContract,
  },
  { address: SWAP_ADDRESS.toString(), name: 'Swap Contract', contractClass: SwapContract },
  { address: STAKE_ADDRESS.toString(), name: 'Stake Contract', contractClass: StakeContract },
  { address: SPORK_ADDRESS.toString(), name: 'Spork Contract', contractClass: SporkContract },
  {
    address: ACCELERATOR_ADDRESS.toString(),
    name: 'Accelerator Contract',
    contractClass: AcceleratorContract,
  },
  {
    address: LIQUIDITY_ADDRESS.toString(),
    name: 'Liquidity Contract',
    contractClass: LiquidityContract,
  },
  { address: BRIDGE_ADDRESS.toString(), name: 'Bridge Contract', contractClass: BridgeContract },
  { address: HTLC_ADDRESS.toString(), name: 'HTLC Contract', contractClass: HtlcContract },
  { address: PTLC_ADDRESS, name: 'PTLC Contract', contractClass: PtlcContract },
  { address: null, name: 'Common', contractClass: CommonContract },
];

export function getEmbeddedContractByName(name: string): EmbeddedContractEntry | undefined {
  return EMBEDDED_CONTRACTS.find((entry) => entry.name === name);
}

// Special addresses
export const BURN_ADDRESS = EMPTY_ADDRESS.toString();
// The bridge and liquidity contracts' starting administrator (go-zenon
// constants.InitialBridgeAdministrator)
export const INITIAL_ADMINISTRATOR_ADDRESS = 'z1qr9vtwsfr2n0nsxl2nfh6l5esqjh2wfj85cfq9';
// Mainnet liquidity program: QSR sent from this address are rewards.
export const LIQUIDITY_PROGRAM_DISTRIBUTOR_ADDRESS = 'z1qqw8f3qxx9zg92xgckqdpfws3dw07d26afsj74';

// Token standards
export const ZNN_TOKEN_STANDARD = ZNN_ZTS.toString();
export const QSR_TOKEN_STANDARD = QSR_ZTS.toString();

// Decimals
export const DECIMALS = 100000000; // 10^8

// Accelerator
export const ACCELERATOR_PROJECT_VOTING_PERIOD = 14 * 24 * 60 * 60; // 14 days in seconds
export const ACCELERATOR_PROJECT_CREATION_AMOUNT = 1n * BigInt(DECIMALS);
export const ACCELERATOR_VOTE_ACCEPTANCE_THRESHOLD = 33;

// Bridge
export const BRIDGE_SOFT_DELAY = 8640; // MomentumsPerEpoch (360 * 24)
export const BRIDGE_ADMINISTRATOR_DELAY = 17280; // 2 * MomentumsPerEpoch

// Plasma
// go-zenon FuseExpiration (vm/constants/embedded.go): MomentumsPerHour * 10
export const FUSE_EXPIRATION_MOMENTUMS = 3600n;

// Pillar
export const PILLAR_QSR_STAKE_BASE_AMOUNT = 150_000n * 100_000_000n;
export const PILLAR_QSR_STAKE_INCREASE_AMOUNT = 10_000n * 100_000_000n;
