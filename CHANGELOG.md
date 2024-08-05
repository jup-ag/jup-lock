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
