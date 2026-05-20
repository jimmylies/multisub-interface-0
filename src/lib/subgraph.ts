import { GraphQLClient } from 'graphql-request'
import { gql } from 'graphql-request'
import { selectedChain } from './chains'
import { getDeployment } from './deployments'

// Client configuration
export const createSubgraphClient = () => {
  const url =
    getDeployment(selectedChain.id).subgraphUrl ||
    'https://api.studio.thegraph.com/query/1749819/test-multiclaw/v0.0.1'
  const token = import.meta.env.VITE_SUBGRAPH_AUTH_TOKEN

  return new GraphQLClient(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
}

// Subgraph response types
export interface AcquiredBalanceUpdated {
  id: string
  subAccount: string
  token: string
  newBalance: string
  blockTimestamp: string
}

// Token data with timestamp for countdown
export interface AcquiredTokenWithTimestamp {
  token: string
  balance: bigint
  timestamp: number // Unix timestamp in seconds (oldest active batch)
  lastBalance: bigint // Track previous balance to detect changes
}

// Protocol execution event data
export interface ProtocolExecution {
  id: string
  subAccount: string
  target: string
  opType: number // 0=UNKNOWN, 1=SWAP, 2=DEPOSIT, 3=WITHDRAW, 4=CLAIM, 5=APPROVE
  tokensIn: string[]
  amountsIn: string[]
  tokensOut: string[]
  amountsOut: string[]
  spendingCost: string
  blockNumber: string
  blockTimestamp: string
  transactionHash: string
}

// Transfer executed event data
export interface TransferExecuted {
  id: string
  subAccount: string
  token: string
  recipient: string
  amount: string
  spendingCost: string
  blockNumber: string
  blockTimestamp: string
  transactionHash: string
}

// Query definition
export const ACQUIRED_BALANCES_QUERY = gql`
  query GetAcquiredBalances($subAccount: Bytes!) {
    acquiredBalanceUpdateds(
      where: { subAccount: $subAccount }
      orderBy: blockTimestamp
      orderDirection: asc
      first: 1000
    ) {
      id
      subAccount
      token
      newBalance
      blockTimestamp
    }
  }
`

export const PROTOCOL_EXECUTION_QUERY = gql`
  query GetProtocolExecutions($subAccount: Bytes!, $fromTimestamp: BigInt!) {
    protocolExecutions(
      where: { subAccount: $subAccount, blockTimestamp_gte: $fromTimestamp }
      orderBy: blockTimestamp
      orderDirection: asc
      first: 1000
    ) {
      id
      subAccount
      target
      opType
      tokensIn
      amountsIn
      tokensOut
      amountsOut
      spendingCost
      blockNumber
      blockTimestamp
      transactionHash
    }
  }
`

export const TRANSFER_EXECUTED_QUERY = gql`
  query GetTransferExecuted($subAccount: Bytes!, $fromTimestamp: BigInt!) {
    transferExecuteds(
      where: { subAccount: $subAccount, blockTimestamp_gte: $fromTimestamp }
      orderBy: blockTimestamp
      orderDirection: asc
      first: 1000
    ) {
      id
      subAccount
      token
      recipient
      amount
      spendingCost
      blockNumber
      blockTimestamp
      transactionHash
    }
  }
`

export interface AgentVaultCreatedEvent {
  id: string
  safe: string
  agentAddress: string
  module: string
  presetId: string
}

export const AGENT_VAULT_CREATED_QUERY = gql`
  query GetAgentVaultsForEOA($agentAddress: Bytes!) {
    agentVaultCreateds(
      where: { agentAddress: $agentAddress }
      orderBy: blockTimestamp
      orderDirection: desc
      first: 100
    ) {
      id
      safe
      agentAddress
      module
      presetId
    }
  }
`

// AllowedRecipientsSet event (recipient whitelist mutations). Each entry sets
// a batch of recipient addresses to allowed=true or allowed=false; the current
// set is the running union/difference of these in chronological order.
export interface AllowedRecipientsSetEvent {
  id: string
  subAccount: string
  recipients: string[]
  allowed: boolean
  blockNumber: string
  blockTimestamp: string
}

export const ALLOWED_RECIPIENTS_HISTORY_QUERY = gql`
  query GetAllowedRecipientsHistory($subAccount: Bytes!) {
    allowedRecipientsSets(
      where: { subAccount: $subAccount }
      orderBy: blockNumber
      orderDirection: asc
      first: 1000
    ) {
      id
      subAccount
      recipients
      allowed
      blockNumber
      blockTimestamp
    }
  }
`

// Aggregate entities (added with the oracleless mainnet schema). The Account
// entity is a single mutable row per sub-account with cumulative counters; the
// AcquiredBalance entity is a single row per (subAccount, token) with the
// current amount. Reading these replaces N-row event scans with one query.
export interface AccountAggregate {
  id: string
  module: string
  cumulativeSpentIndexed: string
  totalTxs: number
  firstActivityAt: string
  lastActivityAt: string
  recipientWhitelistEnabled: boolean
}

export interface AcquiredBalanceAggregate {
  id: string
  subAccount: string
  token: string
  amount: string
  updatedAt: string
  updatedAtBlock: string
}

export const ACCOUNT_AGGREGATE_QUERY = gql`
  query GetAccount($id: ID!) {
    account(id: $id) {
      id
      module
      cumulativeSpentIndexed
      totalTxs
      firstActivityAt
      lastActivityAt
      recipientWhitelistEnabled
    }
  }
`

export const ACQUIRED_BALANCES_AGGREGATE_QUERY = gql`
  query GetAcquiredBalancesAggregate($subAccount: Bytes!) {
    acquiredBalances(where: { subAccount: $subAccount }, first: 1000) {
      id
      subAccount
      token
      amount
      updatedAt
      updatedAtBlock
    }
  }
`
