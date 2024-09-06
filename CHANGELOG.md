# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Deprecated

### Removed

### Fixed

### Security

### Breaking Changes

## Program [0.3.0] [PR #5](https://github.com/jup-ag/jup-lock/pull/5) [PR #15](https://github.com/jup-ag/jup-lock/pull/15)

### Breaking Changes

- Endpoint `create_vesting_escrow` add `cancel_mode` to indicates who can cancel the escrow.

### Added

- escrow state add `token_program_flag` to indicates the token program used within the escrow.
- escrow state add `cancelled_at` to indicates the timestamp of the cancellation.
- Add new instruction `cancel_vesting_escrow`, which will cancel the escrow and close the `escrow_token` token account. The claimable amount will be transferred to recipient and the remaining amount will be transferred to creator. The instruction supports both `splToken` and `token2022`.
- Add new v2 instructions to support `token2022` extensions, including: `TransferFeeConfig`, `TokenMetadata`, `MetadataPointer`, `ConfidentialTransferMint`, `ConfidentialTransferFeeConfig`, `PermanentDelegate`, `TransferHook`, `MintCloseAuthority`, `DefaultAccountState` for Token Mint and `MemoTransfer` for Token Account extensions
  - `create_vesting_escrow_v2` to create the escrow relevant accounts.
  - `claim_v2` to claim from the escrow.

## Program [0.2.2] [PR #8](https://github.com/jup-ag/jup-lock/pull/8)

### Breaking Changes

- Rename `cliff_amount` to `initial_unlock_amount`

## Program [0.2.1] [PR #4](https://github.com/jup-ag/jup-lock/pull/4)

### Fixed

- Add check `recipient_token` in claim instruction
- Update `emit_cpi` in `claim` and `create_vesting_escrow` instruction

### Breaking Changes

- Endpoint `update vesting_escrow_recipient` allow signer to update `recipient_email` in `escrow_metadata`

## Program [0.2.0] [PR #3](https://github.com/jup-ag/jup-lock/pull/3)

### Changed

- Rename account `escrow` to `vesting_escrow`, `escrow_metadata` to `vesting_escrow_metadata`
- Rename endpoint `create_vesting_plan` to `create_vesting_escrow`
- Rename endpoint `create_escrow_metadata` to `create_vesting_escrow_metadata`
- Rename endpoint `update_recipient` to `update_vesting_escrow_recipient`

### Breaking Changes

- escrow state remove field `escrow_token` and add field `token_mint`
