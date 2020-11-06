export interface MonitoredValidator {
  address: string;
  lastVotingPower?: number;
}

export interface Config {
  rpcUrl: string;
  validators: string[];
  averageIntervalHours: number;
  slackSendMessageEndpoint: string;
}

export interface UnconfirmedTxsResponse {
  result: {
    total: string;
  };
}

export interface Validator {
  address: string;
  voting_power: string;
}

export interface RoundState {
  height: string;
  round: string;
  step: number;
  validators: {
    validators: Validator[];
  };
}

export interface Peer {
  node_addrss: string;
  peer_state: {
    round_state: RoundState;
  };
}

export interface DumpConsensusStateResponse {
  jsonrpc: string;
  id: string;
  result: {
    round_state: RoundState;
    peers: Peer[];
  };
}

export interface Vote {
  type: number;
  height: string;
  round: string;
  block_id: BlockId;
  timestamp: Date;
  validator_address: string;
  validator_index: string;
  signature: string;
}

export interface Evidence {
  type: string;
  value: {
    PubKey: {
      type: string;
      value: string;
    };
    VoteA: Vote;
    VoteB: Vote;
  };
}

export interface Block {
  header: BlockHeader;
  evidence: {
    evidence: Evidence[] | null;
  };
  last_commit: {
    block_id: BlockId;
    precommits: Vote[];
  };
}

export interface BlockId {
  hash: string;
}

export interface BlockHeader {
  version: {
    block: string;
    app: string;
  };
  chain_id: string;
  height: string;
  time: Date;
  num_txs: string;
  total_txs: string;
  last_block_id: BlockId;
  last_commit_hash: string;
  data_hash: string;
  validators_hash: string;
  next_validators_hash: string;
  consensus_hash: string;
  app_hash: string;
  last_results_hash: string;
  evidence_hash: string;
  proposer_address: string;
}

export interface BlockMeta {
  block_id: BlockId;
  header: BlockHeader;
}

export interface BlockResponse {
  jsonrpc: string;
  id: string;
  result: {
    block_meta: BlockMeta;
    block: Block;
  };
}
