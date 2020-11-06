// import {BlockMeta} from '@cosmjs/tendermint-rpc';
import fetch from 'node-fetch';
import {
  BlockResponse,
  DumpConsensusStateResponse,
  UnconfirmedTxsResponse,
  MonitoredValidator,
  Config,
} from './types';
import fs from 'fs';
import YAML from 'yaml';

const configFile = fs.readFileSync('./monitorConfig.yml', 'utf-8');
const config: Config = YAML.parse(configFile);

export class CosmosMonitor {
  lastIntervalCheck?: Date;
  lastNumPeers?: number;
  validators: MonitoredValidator[];
  lastBlockHeight?: number;
  blocks: BlockResponse[];

  constructor() {
    this.blocks = [];
    this.validators = [];
    for (const validator of config.validators) {
      this.validators.push({address: validator});
    }
  }

  async getBlock(height?: number): Promise<BlockResponse | undefined> {
    const url: string = height
      ? `${config.rpcUrl}/block?height=${height}`
      : `${config.rpcUrl}/block`;

    const response = await fetch(url);
    if (!response.ok) {
      const responseText = await response.text();
      const errorDescription: string = height
        ? `There was an error fetching block ${height}`
        : 'There was an error fetching the most recent block';
      this.sendToSlack(`${errorDescription}: ${responseText}`);
      throw new Error('error');
    }
    const block: BlockResponse = await response.json();
    return block;
  }

  public async getBlocks(): Promise<number | undefined> {
    const newBlock = await this.getBlock();
    if (!newBlock) {
      return;
    }

    const newBlockHeight: number = +newBlock.result.block_meta.header.height;

    if (!this.lastBlockHeight || this.lastBlockHeight + 1 === newBlockHeight) {
      this.lastBlockHeight = newBlockHeight;
      this.blocks.push(newBlock);
      return newBlockHeight;
    }

    if (this.lastBlockHeight && this.lastBlockHeight === newBlockHeight) {
      this.sendToSlack(`The node might be stuck on block ${newBlockHeight}.`);
      return newBlockHeight;
    }

    for (let i = this.lastBlockHeight + 1; i < newBlockHeight; i++) {
      const interimBlock = await this.getBlock(i);
      if (!interimBlock) {
        continue;
      }
      this.blocks.push(interimBlock);
    }
    this.blocks.push(newBlock);
    return newBlockHeight;
  }

  public validatorOfInterest(address: string): boolean {
    const found = this.validators.find(element => element.address === address);
    return !!found;
  }

  async checkEvidence(block: BlockResponse) {
    if (block.result.block.evidence.evidence) {
      for (const evidence of block.result.block.evidence.evidence) {
        const addressA = evidence.value.VoteA.validator_address;
        const addressB = evidence.value.VoteB.validator_address;
        const validatorsInvolvedMessage = ` The validators involved are: ${addressA}${
          addressB !== addressA ? ', ' + addressB : ''
        }.`;
        const interestMessageA = ` ${
          this.validatorOfInterest(addressA)
            ? addressA + ' is of interest.'
            : ''
        }`;
        const interestMessageB = ` ${
          this.validatorOfInterest(addressB)
            ? addressB + ' is of interest.'
            : ''
        }`;
        const message =
          `Evidence found in block ${block.result.block_meta.header.height} of type ${evidence.type}.` +
          +`${validatorsInvolvedMessage}${interestMessageA}${interestMessageB}`;
        await this.sendToSlack(message);
      }
    }
  }

  async checkPrecommits(block: BlockResponse) {
    for (const validator of this.validators) {
      const found = block.result.block.last_commit.precommits.filter(
        value => value && value.validator_address === validator.address
      );
      if (found.length === 0) {
        this.sendToSlack(
          `Validator ${validator} not found in block ${block.result.block_meta.header.height} last_commit.precommits.`
        );
      } else if (found.length > 1) {
        this.sendToSlack(
          `Validator ${validator} was found more than once in block ${block.result.block_meta.header.height} last_commit.precommits.`
        );
      }
    }
  }

  public async processBlocks() {
    for (const block of this.blocks) {
      this.checkEvidence(block);
      this.checkPrecommits(block);
    }
  }

  public async checkConsensusStateDump() {
    const url = `${config.rpcUrl}/dump_consensus_state`;
    const response = await fetch(url);
    if (!response.ok) {
      const responseText = await response.text();
      const errorDescription = 'There was an error fetching consensus state';
      this.sendToSlack(`${errorDescription}: ${responseText}`);
      throw new Error('error');
    }
    const data: DumpConsensusStateResponse = await response.json();

    for (const validator of this.validators) {
      const found = data.result.round_state.validators.validators.filter(
        value => value && value.address === validator.address
      );
      if (found.length === 0) {
        this.sendToSlack(
          `Validator ${validator.address} not found in consensus state dump round_state.validators at block ${data.result.round_state.height}`
        );
      }
    }

    if (+data.result.round_state.round >= 2) {
      this.sendToSlack(
        `Warning: consensus for block ${
          data.result.round_state.height
        } is in round ${+data.result.round_state.round}`
      );
    }

    const currentTime = new Date();
    if (!this.lastIntervalCheck) {
      this.lastIntervalCheck = currentTime;
    } else if (
      currentTime.getTime() - this.lastIntervalCheck.getTime() >
      60 * 60 * config.averageIntervalHours
    ) {
      if (
        this.lastNumPeers &&
        Math.abs(data.result.peers.length - this.lastNumPeers) /
          this.lastNumPeers >
          0.2
      ) {
        this.sendToSlack(
          `The node's number of peers changed more than 20% in the last 6 hours (from ${this.lastNumPeers} to ${data.result.peers.length})`
        );
      }
      this.lastNumPeers = data.result.peers.length;

      for (const validator of this.validators) {
        const validatorFromDump = data.result.round_state.validators.validators.find(
          element => element.address === validator.address
        );
        if (!validatorFromDump) {
          continue;
        }
        const newVotingPower = +validatorFromDump.voting_power;
        if (
          validator.lastVotingPower &&
          Math.abs(validator.lastVotingPower - newVotingPower) /
            newVotingPower >
            0.1
        ) {
          this.sendToSlack(
            `Validator ${validator.address}'s voting power has changed more than 10% in the last 6 hours (from ${validator.lastVotingPower} to ${newVotingPower})`
          );
        }
        validator.lastVotingPower = newVotingPower;
      }

      this.lastIntervalCheck = currentTime;
    }
  }

  public async checkUnconfirmedTxs() {
    const url = `${config.rpcUrl}/dump_consensus_state`;
    const response = await fetch(url);
    if (!response.ok) {
      const responseText = await response.text();
      const errorDescription = 'There was an error fetching unconfirmed txs';
      this.sendToSlack(`${errorDescription}: ${responseText}`);
      throw new Error('error');
    }
    const data: UnconfirmedTxsResponse = await response.json();
    const numUnconfirmedTxs = +data.result.total;
    if (numUnconfirmedTxs >= 100) {
      this.sendToSlack('There are >= 100 unconfirmed transactions.');
    }
  }

  public async checkStatus() {
    const url = `${config.rpcUrl}/status`;
    const response = await fetch(url);
    if (!response.ok) {
      const responseText = await response.text();
      const errorDescription = 'There was an error fetching node status';
      this.sendToSlack(`${errorDescription}: ${responseText}`);
      throw new Error('error');
    }
    const data: {
      result: {
        sync_info: {
          catching_up: boolean;
        };
      };
    } = await response.json();
    if (data.result.sync_info.catching_up) {
      this.sendToSlack('The node is currently out of sync and catching up.');
    }
  }

  public async sendToSlack(message: string) {
    const response = await fetch(config.slackSendMessageEndpoint, {
      method: 'POST',
      body: JSON.stringify({text: message}),
    });
    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(responseText);
    }
  }
}
