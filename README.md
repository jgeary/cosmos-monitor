# Cosmos monitor slackbot

## Goals
- quickly report any potentially concerning happenings on the cosmos network
- specifically check on any number of validators we specify
- integrate with Slack
- set it and forget it 
    - easy to configure and deploy
    - reliable and resilient
    - won't fail silently
- don't be annoying / too noisy

## Things to look for
- one of our validators is not signing blocks
- one of our validators has double signed a block
- our node is unresponsive, is responsive but not receiving any new blocks, or is behind
- significant changes in voting power for one of our validators
- significant change in number of peers for our node

## Implementation

### Global state
- last block height successfully checked
- last successful "interval check" (less frequent check)
- validators we care about, address and `lastVotingPower` for each
- blocks[] we have yet to check

### `GET /block`
- ensure successful response received. **alert slack in case of error**
- if same as last block seen, **alert and return**
- calculate number of blocks between last block seen and current. individually query each one, then do the following for each, in chron order:
    - **report any evidence** (depending on config option, only report if evidence involves our validators)
    - **report if any of our validators in last_commit.precommits appear 0 or >1 times**

### `GET /dump_consensus_state`
- **alert if any of our validators not in result.round_state.validators.validators**
- **alert** if round >= 2
- **alert** if substantial increase or decrease in number of peers (ideally don't check this every minute - maybe make separate route and cron job)
- **alert** if substantial increase decrease in voting power - check both against previous block and yesterday (if exists)
- **alert** if consensus is in round 2 or greater

### `Get /num_unconfirmed_txs`
- alert if >= 100 (100 might be the max possible or possible to report)

### `Get /status`
- **alert if result.sync_info.catching_up = true**

## What I would do next
- Unit test, because I always like to. Between TypeScript and my manual testing, I feel confident that there is no major flaw. Slack should be alerted of any errors that come up.

- monitor block-by-block - GCP cloud scheduler can only do every minute (~8 blocks)
- Watch and decode all individual transactions to watch for specific things - i.e. AddrA sent 1234 tokens to AddrB.
- Specifically detect slashing events. Everything that causes slashing (for our validators) should be reported, but would be ideal to know exactly when and how much someone gets slashed.
- E2E test. Would be cool to actually run a testnet node and periodically spin up a test monitor, programmatically simulate all the situations we can, and assert that the monitor attempts to notify slack in the right ways.
- Subscribe to Tendermint security mailing list and forward those emails to slack - ideally no code (new gmail acct -> subscribe to mailing list and connect with slack -> set up native forwarding integration)
- Maybe monitor governance events
- Figure out a solid and cheap enough persistent websocket client
- See what monitoring is / should be done locally on our node and integrate it with slack as well.
- GUI for tweaking parameters, visualizing status, etc.
- Terraform
- Check on multiple trustworthy nodes to compare info
- Pagerduty. I did already set up GCP to email me of any failures.
- general module for parsing json results into correct TS interfaces (auto-detect and cast things like numbers, dates, etc, map json property names to TS property names)
