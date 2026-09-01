//! Phase 1 — issuance only. **This program holds no value**, which is the
//! entire reason it is allowed to run before an audit (`docs/decisions.md` D8).
//!
//! There is no `redeem` here, no reserve PDA, no `claim_fees`, and no token
//! transfer of any kind. Those are Phase 2, in a separate audited deployment.
//! The worst an undiscovered bug in this binary can do is issue a piece to the
//! wrong address: bad, public, and not a loss of anybody's money.
//!
//! Three instructions, two of them permissionless:
//!
//! | # | Instruction | Signer |
//! |---|---|---|
//! | 1 | `initialize` | deployer, once |
//! | 2 | `request_issuance` | **permissionless** |
//! | 3 | `settle_issuance` | **permissionless**, and only behind a reveal |
//!
//! `settle_issuance` only works in the same transaction as the Switchboard
//! reveal that precedes it. `RandomnessAccountData::get_value(clock_slot)`
//! returns the value **only when `clock_slot == reveal_slot`** — verified from
//! switchboard-on-demand 0.13.0 on 2026-09-01, see `docs/references.md`. There
//! is no fulfilled-then-poll state to wait for.

use anchor_lang::prelude::*;
use solana_program::hash::hashv;
use mpl_core::instructions::CreateV2CpiBuilder;
use switchboard_on_demand::on_demand::accounts::queue::QueueAccountData;
use switchboard_on_demand::on_demand::accounts::randomness::RandomnessAccountData;
use switchboard_on_demand::on_demand::instructions::randomness_commit::RandomnessCommit;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::invoke_signed;
use switchboard_on_demand::OracleAccountData;

declare_id!("7qHEeK3Q5UW5jKykXqWeShqpWCypm4hey2EzYGotkTUs");

/// Domain separation on the Merkle hashing. Without distinct prefixes an inner
/// node can be presented as a leaf. These bytes match `src/lib/snapshot`
/// exactly, and the tests in that directory are the other half of this claim.
const LEAF_PREFIX: [u8; 1] = [0x00];
const NODE_PREFIX: [u8; 1] = [0x01];

/// Domain separation on the two derivations taken from one revealed value.
/// Without distinct prefixes, "which piece" and "to whom" are functions of each
/// other and one number is answering two questions.
const PIECE_DOMAIN: u8 = 0x03;
const HOLDER_DOMAIN: u8 = 0x04;

/// A rejection has probability about 2^-244, so eight rounds is 2^-1952.
const MAX_SAMPLE_ROUNDS: u8 = 8;

/// How stale a snapshot may be when it is committed. The root has to describe
/// roughly the chain state at request time; an old one would let a caller
/// commit a set of holders that has since changed hands.
const MAX_SNAPSHOT_AGE_SLOTS: u64 = 150;

/// Bounded so `initialize` cannot write an account nobody can afford to read.
const MAX_EXCLUDED: usize = 8;
/// A tree of 2^24 leaves is more holders than the chain will ever carry here.
const MAX_PROOF_LEN: usize = 24;

/// `sha256("global:randomness_reveal")[..8]`, checked against the IDL the
/// Switchboard program publishes on devnet on 2026-09-01. Both agree.
const RANDOMNESS_REVEAL_DISCRIMINATOR: [u8; 8] = [197, 181, 187, 10, 30, 58, 20, 73];

/// `sha256("global:randomness_init")[..8]`, checked against the devnet IDL on
/// 2026-09-01. Both agree. Params are a single `recent_slot: u64`.
const RANDOMNESS_INIT_DISCRIMINATOR: [u8; 8] = [9, 9, 204, 33, 50, 116, 113, 15];

const ASSOCIATED_TOKEN_ID: Pubkey =
    solana_program::pubkey!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const ADDRESS_LOOKUP_TABLE_ID: Pubkey =
    solana_program::pubkey!("AddressLookupTab1e1111111111111111111111111");

/// Checked by address on the settle accounts. Written as literals so the guard
/// is an absolute assertion against a known value (CLAUDE.md).
const SPL_TOKEN_ID: Pubkey = solana_program::pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const WRAPPED_SOL_MINT: Pubkey =
    solana_program::pubkey!("So11111111111111111111111111111111111111112");

#[program]
pub mod issuance {
    use super::*;

    /// Writes the config and closes the door behind it. Fails if the config
    /// account already exists, so it cannot run twice.
    ///
    /// Everything here is immutable afterwards. There is no setter for any of
    /// it anywhere in this program.
    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        require!(params.period_seconds > 0, IssuanceError::InvalidPeriod);
        require!(params.collection_size > 0, IssuanceError::InvalidCollectionSize);
        require!(
            params.excluded.len() <= MAX_EXCLUDED,
            IssuanceError::TooManyExcluded
        );

        let config = &mut ctx.accounts.config;
        config.bump = ctx.bumps.config;
        config.weight_mint = params.weight_mint;
        config.collection = ctx.accounts.collection.key();
        config.switchboard_program = ctx.accounts.switchboard_program.key();
        config.queue = ctx.accounts.queue.key();
        config.randomness = ctx.accounts.randomness.key();
        config.genesis_unix = params.genesis_unix;
        config.period_seconds = params.period_seconds;
        config.collection_size = params.collection_size;
        config.issued_count = 0;
        config.live_supply = 0;
        config.excluded = params.excluded;
        config.manifest_hash = params.manifest_hash;

        {
            let mut survivors = ctx.accounts.survivors.load_init()?;
            survivors.bump = ctx.bumps.survivors;
            survivors.remaining = params.collection_size as u16;
            // `slots` stays zeroed on purpose: zero is the identity.
        }

        // **This instruction creates the randomness account**, and it has to.
        // Switchboard's `randomness_init` requires its `authority` to sign, and
        // the authority must be this config PDA or `request_issuance` could
        // never commit without a privileged signer (T13). A PDA cannot sign a
        // top-level instruction, so the account cannot be created from outside
        // the program at all.
        let config_key = config.key();
        let bump = config.bump;
        let seeds: &[&[u8]] = &[CONFIG_SEED, &[bump]];
        let init = Instruction {
            program_id: ctx.accounts.switchboard_program.key(),
            accounts: vec![
                AccountMeta::new(ctx.accounts.randomness.key(), true),
                AccountMeta::new(ctx.accounts.reward_escrow.key(), false),
                AccountMeta::new_readonly(config_key, true),
                AccountMeta::new(ctx.accounts.queue.key(), false),
                AccountMeta::new(ctx.accounts.deployer.key(), true),
                AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
                AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
                AccountMeta::new_readonly(ctx.accounts.associated_token_program.key(), false),
                AccountMeta::new_readonly(ctx.accounts.wrapped_sol_mint.key(), false),
                AccountMeta::new_readonly(ctx.accounts.switchboard_state.key(), false),
                AccountMeta::new_readonly(ctx.accounts.lut_signer.key(), false),
                AccountMeta::new(ctx.accounts.lut.key(), false),
                AccountMeta::new_readonly(ctx.accounts.address_lookup_table_program.key(), false),
            ],
            data: {
                let mut d = Vec::with_capacity(16);
                d.extend_from_slice(&RANDOMNESS_INIT_DISCRIMINATOR);
                d.extend_from_slice(&params.recent_slot.to_le_bytes());
                d
            },
        };
        invoke_signed(
            &init,
            &[
                ctx.accounts.randomness.to_account_info(),
                ctx.accounts.reward_escrow.to_account_info(),
                config.to_account_info(),
                ctx.accounts.queue.to_account_info(),
                ctx.accounts.deployer.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.associated_token_program.to_account_info(),
                ctx.accounts.wrapped_sol_mint.to_account_info(),
                ctx.accounts.switchboard_state.to_account_info(),
                ctx.accounts.lut_signer.to_account_info(),
                ctx.accounts.lut.to_account_info(),
                ctx.accounts.address_lookup_table_program.to_account_info(),
                ctx.accounts.switchboard_program.to_account_info(),
            ],
            &[seeds],
        )
        .map_err(|_| error!(IssuanceError::RandomnessInitFailed))?;

        // Read it back rather than assume the CPI did what was asked. This is
        // the difference between "we sent the instruction" and "the account is
        // ours" (CLAUDE.md, money verdicts are read off the chain).
        let randomness = RandomnessAccountData::parse(ctx.accounts.randomness.data.borrow())
            .map_err(|_| error!(IssuanceError::RandomnessUnreadable))?;
        require_keys_eq!(
            randomness.authority,
            config.key(),
            IssuanceError::RandomnessNotOurs
        );
        require_keys_eq!(randomness.queue, config.queue, IssuanceError::QueueMismatch);
        Ok(())
    }

    /// Permissionless. Freezes the snapshot for this hour and asks Switchboard
    /// for randomness. The outcome does not exist yet: the root is committed
    /// before the value is seeded, so nobody — including us — can know who is
    /// about to be issued a piece.
    ///
    /// **One request per hour, ever.** That is not a check, it is the account:
    /// the issuance PDA is seeded with the hour, so a second request for the
    /// same hour fails because the account already exists. There is no
    /// re-request and therefore no way to re-roll an hour whose outcome a
    /// caller has already fetched from the gateway and disliked (T11).
    pub fn request_issuance(ctx: Context<RequestIssuance>, params: RequestParams) -> Result<()> {
        let clock = Clock::get()?;
        let config = &ctx.accounts.config;
        let hour = current_hour(config, clock.unix_timestamp)?;
        require!(params.hour == hour, IssuanceError::WrongHour);

        require!(params.eligible_supply > 0, IssuanceError::NoEligibleSupply);
        require!(
            clock.slot >= params.snapshot_slot
                && clock.slot - params.snapshot_slot <= MAX_SNAPSHOT_AGE_SLOTS,
            IssuanceError::SnapshotTooOld
        );
        require_keys_eq!(
            ctx.accounts.randomness.key(),
            config.randomness,
            IssuanceError::RandomnessMismatch
        );

        // T12. The oracle is an argument to Switchboard's commit, so whoever
        // lands here first picks who serves this hour. These four assertions
        // reduce that from "any account" to "one the queue itself currently
        // says is live", and they cost no authority and no privilege to anyone.
        require_keys_eq!(ctx.accounts.queue.key(), config.queue, IssuanceError::QueueMismatch);
        // **Scoped deliberately.** `QueueAccountData::new` and its oracle
        // counterpart each hand back a `Ref` into the account's data, and a CPI
        // refuses to run while any account it is passed is still borrowed. Both
        // borrows have to be dropped before `randomness_commit` below, or every
        // request fails with `AccountBorrowFailed` — which is what happened on
        // the first devnet run, and is not reachable by any unit test.
        {
            let queue_info = ctx.accounts.queue.to_account_info();
            let oracle_info = ctx.accounts.oracle.to_account_info();
            let queue = QueueAccountData::new(&queue_info)
                .map_err(|_| error!(IssuanceError::QueueUnreadable))?;
            let oracle = OracleAccountData::new(&oracle_info)
                .map_err(|_| error!(IssuanceError::OracleUnreadable))?;
            require!(
                queue.idx_of_oracle(&ctx.accounts.oracle.key()).is_some(),
                IssuanceError::OracleNotOnQueue
            );
            require_keys_eq!(oracle.queue, config.queue, IssuanceError::OracleNotOnQueue);
            require!(oracle.is_on_queue == 1, IssuanceError::OracleNotOnQueue);
            require!(
                clock.unix_timestamp.saturating_sub(oracle.last_heartbeat) <= queue.node_timeout,
                IssuanceError::OracleStale
            );
        }

        let issuance = &mut ctx.accounts.issuance;
        issuance.bump = ctx.bumps.issuance;
        issuance.hour = hour;
        issuance.piece_index = config.issued_count;
        issuance.snapshot_slot = params.snapshot_slot;
        issuance.root = params.root;
        issuance.commitment = params.commitment;
        issuance.eligible_supply = params.eligible_supply;
        issuance.randomness = ctx.accounts.randomness.key();
        issuance.requested_at = clock.unix_timestamp;
        issuance.settled = false;
        issuance.recipient = Pubkey::default();
        issuance.point = 0;

        // The commit is signed by the config PDA, not by the caller. That is
        // what keeps this instruction permissionless: the caller pays the fee
        // and gains nothing else.
        let seeds: &[&[u8]] = &[CONFIG_SEED, &[config.bump]];
        RandomnessCommit::invoke(
            ctx.accounts.switchboard_program.to_account_info(),
            ctx.accounts.randomness.to_account_info(),
            ctx.accounts.queue.to_account_info(),
            ctx.accounts.oracle.to_account_info(),
            config.to_account_info(),
            ctx.accounts.recent_slothashes.to_account_info(),
            &[seeds],
        )?;

        emit!(IssuanceRequested {
            hour,
            piece_index: issuance.piece_index,
            snapshot_slot: params.snapshot_slot,
            root: params.root,
            commitment: params.commitment,
            eligible_supply: params.eligible_supply,
            randomness: issuance.randomness,
        });
        Ok(())
    }

    /// Permissionless, and it only ever succeeds **immediately behind the
    /// Switchboard reveal, in the same transaction**. See the module note.
    ///
    /// Refuses on four independent conditions, each with its own error, because
    /// an instruction that fails four ways and says one thing is not debuggable
    /// in public.
    pub fn settle_issuance(ctx: Context<SettleIssuance>, params: SettleParams) -> Result<()> {
        let clock = Clock::get()?;
        let config_key = ctx.accounts.config.key();
        let issuance = &ctx.accounts.issuance;

        require!(!issuance.settled, IssuanceError::AlreadySettled);
        // The hour has to be the current one. Without this a stale hour could
        // settle later and mint out of order; the reveal window is only a few
        // minutes wide in practice, but "in practice" is not a guard.
        require!(
            issuance.hour == current_hour(&ctx.accounts.config, clock.unix_timestamp)?,
            IssuanceError::IssuanceExpired
        );
        require_keys_eq!(
            ctx.accounts.randomness.key(),
            issuance.randomness,
            IssuanceError::RandomnessMismatch
        );
        require!(params.proof.len() <= MAX_PROOF_LEN, IssuanceError::ProofTooLong);

        // **This program performs the reveal; it does not sit behind one.**
        //
        // Switchboard's `randomness_reveal` requires its `authority` to SIGN
        // (verified against the on-chain IDL, 2026-09-01, `references.md`).
        // Our randomness account's authority is this config PDA, because that
        // is what lets `request_issuance` commit without a privileged signer.
        // A PDA cannot sign a top-level instruction, so a reveal sent beside
        // this one could never be authorised — the reveal has to be a CPI from
        // here, and the caller supplies the oracle's signed response as
        // arguments, exactly as they would have put it in that instruction.
        //
        // Nothing about this makes settling permissioned: anybody can fetch the
        // gateway response and call this.
        let reveal = Instruction {
            program_id: ctx.accounts.switchboard_program.key(),
            accounts: vec![
                AccountMeta::new(ctx.accounts.randomness.key(), false),
                AccountMeta::new_readonly(ctx.accounts.oracle.key(), false),
                AccountMeta::new_readonly(ctx.accounts.queue.key(), false),
                AccountMeta::new(ctx.accounts.oracle_stats.key(), false),
                AccountMeta::new_readonly(ctx.accounts.config.key(), true),
                AccountMeta::new(ctx.accounts.payer.key(), true),
                AccountMeta::new_readonly(ctx.accounts.recent_slothashes.key(), false),
                AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
                AccountMeta::new(ctx.accounts.reward_escrow.key(), false),
                AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
                AccountMeta::new_readonly(ctx.accounts.wrapped_sol_mint.key(), false),
                AccountMeta::new_readonly(ctx.accounts.switchboard_state.key(), false),
            ],
            data: {
                let mut data = Vec::with_capacity(8 + 64 + 1 + 32);
                data.extend_from_slice(&RANDOMNESS_REVEAL_DISCRIMINATOR);
                data.extend_from_slice(&params.signature);
                data.push(params.recovery_id);
                data.extend_from_slice(&params.value);
                data
            },
        };
        let config_seeds: &[&[u8]] = &[CONFIG_SEED, &[ctx.accounts.config.bump]];
        invoke_signed(
            &reveal,
            &[
                ctx.accounts.randomness.to_account_info(),
                ctx.accounts.oracle.to_account_info(),
                ctx.accounts.queue.to_account_info(),
                ctx.accounts.oracle_stats.to_account_info(),
                ctx.accounts.config.to_account_info(),
                ctx.accounts.payer.to_account_info(),
                ctx.accounts.recent_slothashes.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
                ctx.accounts.reward_escrow.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.wrapped_sol_mint.to_account_info(),
                ctx.accounts.switchboard_state.to_account_info(),
                ctx.accounts.switchboard_program.to_account_info(),
            ],
            &[config_seeds],
        )
        .map_err(|_| error!(IssuanceError::RevealFailed))?;

        // Read it back from the account rather than trusting the argument. The
        // caller handed us a value and a signature; only Switchboard's own
        // verification decides what the randomness actually is, and this is the
        // line that makes the difference.
        let value = {
            let data = ctx.accounts.randomness.data.borrow();
            let account = RandomnessAccountData::parse(data)
                .map_err(|_| error!(IssuanceError::RandomnessUnreadable))?;
            account
                .get_value(clock.slot)
                .map_err(|_| error!(IssuanceError::RandomnessNotReadable))?
        };

        // The full 256-bit value modulo the eligible supply, byte by byte so it
        // needs no wide-integer type. The modulo bias is present at roughly
        // 2^-224 and is documented rather than rejection-sampled, because the
        // verify page's instructions have to be followable by a person with a
        // hash tool.
        let point = uniform_index(&value, issuance.eligible_supply, HOLDER_DOMAIN)?;
        require!(
            point >= params.range_start && point < params.range_end,
            IssuanceError::PointOutsideRange
        );
        require!(
            params.range_end.saturating_sub(params.range_start) == params.balance,
            IssuanceError::RangeWidthMismatch
        );
        require!(
            verify_proof(&params, &issuance.root),
            IssuanceError::ProofDidNotVerify
        );

        let minting = ctx.accounts.config.issued_count < ctx.accounts.config.collection_size;

        // Which piece, from the same value, under the other domain. Scoped so
        // the zero-copy borrow is released before the mint CPI -- the same
        // shape of mistake that made every `request_issuance` fail on the first
        // devnet run.
        let piece_id: u16 = if minting {
            let mut survivors = ctx.accounts.survivors.load_mut()?;
            let piece_point =
                uniform_index(&value, survivors.remaining as u64, PIECE_DOMAIN)?;
            survivors.take(piece_point)?
        } else {
            u16::MAX
        };

        if minting {
            require_keys_eq!(
                ctx.accounts.recipient.key(),
                params.owner,
                IssuanceError::RecipientMismatch
            );
            let seeds: &[&[u8]] = &[CONFIG_SEED, &[ctx.accounts.config.bump]];
            CreateV2CpiBuilder::new(&ctx.accounts.mpl_core_program)
                .asset(&ctx.accounts.asset)
                .collection(Some(&ctx.accounts.collection))
                .authority(Some(&ctx.accounts.config.to_account_info()))
                .payer(&ctx.accounts.payer)
                .owner(Some(&ctx.accounts.recipient))
                .system_program(&ctx.accounts.system_program)
                .name(params.name.clone())
                .uri(params.uri.clone())
                .invoke_signed(&[seeds])?;
        }

        let config = &mut ctx.accounts.config;
        if minting {
            config.issued_count = config
                .issued_count
                .checked_add(1)
                .ok_or(IssuanceError::CounterOverflow)?;
            // Phase 1 has no burn, so live supply only ever rises here. Phase 2
            // is the only thing that can lower it.
            config.live_supply = config
                .live_supply
                .checked_add(1)
                .ok_or(IssuanceError::CounterOverflow)?;
        }

        let issuance = &mut ctx.accounts.issuance;
        issuance.settled = true;
        issuance.recipient = params.owner;
        issuance.point = point;
        issuance.piece_id = piece_id;

        emit!(IssuanceSettled {
            config: config_key,
            hour: issuance.hour,
            piece_index: issuance.piece_index,
            minted: minting,
            piece_id,
            snapshot_slot: issuance.snapshot_slot,
            root: issuance.root,
            randomness: issuance.randomness,
            randomness_value: value,
            reveal_slot: clock.slot,
            eligible_supply: issuance.eligible_supply,
            point,
            recipient: params.owner,
            balance: params.balance,
        });
        Ok(())
    }
}

// ---------------------------------------------------------------- derivation

/// `hour(now) = (now - genesis) / period`, floor, and never negative.
///
/// Anchored to an instant computed from the genesis and the period, never to
/// when the previous issuance settled, so a late one cannot push the schedule
/// (`DESIGN.md` §2).
fn current_hour(config: &Config, now: i64) -> Result<u64> {
    require!(now >= config.genesis_unix, IssuanceError::BeforeGenesis);
    Ok(((now - config.genesis_unix) / config.period_seconds) as u64)
}

/// The full 256-bit big-endian value modulo `m`, with a u128 accumulator:
/// `acc < 2^64` and `acc * 256 + byte < 2^72`, so nothing here can overflow.
fn u256_mod(value: &[u8; 32], m: u64) -> u64 {
    let mut acc: u128 = 0;
    for byte in value.iter() {
        acc = (acc * 256 + *byte as u128) % m as u128;
    }
    acc as u64
}

/// `2^256 mod m`, by 256 doublings. Everything stays inside u128.
fn pow2_256_mod(m: u64) -> u64 {
    let mut acc: u128 = 1;
    for _ in 0..256 {
        acc = (acc * 2) % m as u128;
    }
    acc as u64
}

/// Whether a 256-bit big-endian value is at or above `2^256 - rem`.
///
/// Comparing against that threshold directly would need a 256-bit constant, so
/// it is done as an addition instead: `h >= 2^256 - rem` exactly when `h + rem`
/// carries out of 256 bits.
fn at_or_above_limit(h: &[u8; 32], rem: u64) -> bool {
    let mut carry = rem as u128;
    for i in (0..32).rev() {
        let sum = h[i] as u128 + (carry & 0xff);
        carry = (carry >> 8) + (sum >> 8);
        if carry == 0 {
            return false;
        }
    }
    carry != 0
}

/// A uniform value in `[0, modulus)` — exactly uniform, with no modulo bias at
/// all rather than bias too small to measure. A sample at or above the largest
/// multiple of `modulus` that fits in 256 bits is discarded and the hash is
/// taken again with the round counter appended.
///
/// The first round has always succeeded. The loop exists so the verify page can
/// say "uniform" without a footnote.
fn uniform_index(value: &[u8; 32], modulus: u64, domain: u8) -> Result<u64> {
    require!(modulus > 0, IssuanceError::EmptyRange);
    let rem = pow2_256_mod(modulus);
    for round in 0..MAX_SAMPLE_ROUNDS {
        let h = hashv(&[&[domain], value, &[round]]).to_bytes();
        if rem == 0 || !at_or_above_limit(&h, rem) {
            return Ok(u256_mod(&h, modulus));
        }
    }
    err!(IssuanceError::SamplingDidNotTerminate)
}

fn verify_proof(params: &SettleParams, root: &[u8; 32]) -> bool {
    let mut node = hashv(&[
        &LEAF_PREFIX,
        params.owner.as_ref(),
        &params.balance.to_le_bytes(),
        &params.range_start.to_le_bytes(),
        &params.range_end.to_le_bytes(),
    ])
    .to_bytes();
    for sibling in params.proof.iter() {
        // Sorted-pair hashing, so a proof carries siblings and no direction
        // bits and cannot be replayed against a mirrored tree.
        node = if node <= *sibling {
            hashv(&[&NODE_PREFIX, &node, sibling]).to_bytes()
        } else {
            hashv(&[&NODE_PREFIX, sibling, &node]).to_bytes()
        };
    }
    node == *root
}

// ------------------------------------------------------------------ accounts

pub const CONFIG_SEED: &[u8] = b"config";
pub const SURVIVORS_SEED: &[u8] = b"survivors";

/// The unissued pieces, as a Fisher-Yates array with swap-with-last (D19).
///
/// **Stored one-based so a zeroed account is the identity permutation**: slot
/// `i` holding `0` means "never written, so this slot still holds piece `i`".
/// That removes a 4,000-iteration write from `initialize` and it is the same
/// convention `src/lib/protocol/survivors.ts` uses, so the two replay
/// identically.
///
/// Zero-copy because 8 KB does not want deserialising once an hour forever.
#[account(zero_copy)]
#[repr(C)]
pub struct Survivors {
    pub remaining: u16,
    pub bump: u8,
    pub _pad: [u8; 5],
    pub slots: [u16; 4000],
}

impl Survivors {
    pub const SIZE: usize = 8 + 8 + 2 * 4000;

    fn read(&self, i: usize) -> u16 {
        let v = self.slots[i];
        if v == 0 {
            i as u16
        } else {
            v - 1
        }
    }

    /// Takes the survivor at `point` and closes the gap with the last one.
    fn take(&mut self, point: u64) -> Result<u16> {
        require!(self.remaining > 0, IssuanceError::NoSurvivorsLeft);
        let j = point as usize;
        require!(j < self.remaining as usize, IssuanceError::PointOutsideRange);
        let picked = self.read(j);
        let last = self.read(self.remaining as usize - 1);
        self.slots[j] = last + 1;
        self.remaining -= 1;
        Ok(picked)
    }
}
pub const ISSUANCE_SEED: &[u8] = b"issuance";

#[account]
pub struct Config {
    pub bump: u8,
    /// The fungible token whose balances weight issuance (D2).
    pub weight_mint: Pubkey,
    pub collection: Pubkey,
    pub switchboard_program: Pubkey,
    pub queue: Pubkey,
    pub randomness: Pubkey,
    pub genesis_unix: i64,
    /// 3,600 on mainnet, short on a rehearsal cluster. Written once (D15), and
    /// asserted against the literal 3600 at the mainnet deploy checklist.
    pub period_seconds: i64,
    pub collection_size: u32,
    pub issued_count: u32,
    pub live_supply: u32,
    /// Recorded for the verify page. The exclusion itself is applied when the
    /// snapshot is built off-chain: this program never sees a token account, so
    /// it cannot enforce the set, and pretending otherwise would be worse than
    /// saying so.
    pub excluded: Vec<Pubkey>,
    /// Commits the full piece-by-piece manifest before issuance 1 (D19).
    pub manifest_hash: [u8; 32],
}

impl Config {
    pub const SIZE: usize = 8 + 1 + 32 * 5 + 8 + 8 + 4 * 3 + 4 + 32 * MAX_EXCLUDED + 32;
}

#[account]
pub struct Issuance {
    pub bump: u8,
    /// The schedule slot this belongs to. The PDA seed, and therefore the
    /// reason one hour can be requested exactly once.
    pub hour: u64,
    /// Which piece this hour would mint. It does not advance on a skipped hour.
    pub piece_index: u32,
    pub snapshot_slot: u64,
    pub root: [u8; 32],
    pub commitment: [u8; 32],
    pub eligible_supply: u64,
    pub randomness: Pubkey,
    pub requested_at: i64,
    pub settled: bool,
    pub recipient: Pubkey,
    pub point: u64,
    pub piece_id: u16,
}

impl Issuance {
    pub const SIZE: usize = 8 + 1 + 8 + 4 + 8 + 32 + 32 + 8 + 32 + 8 + 1 + 32 + 8 + 2;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeParams {
    /// Required by Switchboard's `randomness_init`, which derives the address
    /// lookup table from it. Computed off-chain by the deployer and forwarded.
    pub recent_slot: u64,
    /// Commits the piece-by-piece manifest -- id, tier, traits, URI -- for all
    /// 4,000, fixed and public before issuance 1 (D19). The program never reads
    /// a tier; this is what makes rarity checkable in advance.
    pub manifest_hash: [u8; 32],
    pub weight_mint: Pubkey,
    pub genesis_unix: i64,
    pub period_seconds: i64,
    pub collection_size: u32,
    pub excluded: Vec<Pubkey>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RequestParams {
    /// The schedule slot being requested. It seeds the issuance PDA, so it has
    /// to be an argument — and the handler asserts it equals the hour derived
    /// from the clock, so it is validated, never trusted. The machine decides
    /// the hour; the caller only names which account it is opening.
    pub hour: u64,
    pub snapshot_slot: u64,
    pub root: [u8; 32],
    pub commitment: [u8; 32],
    pub eligible_supply: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SettleParams {
    /// The oracle's signed reveal, fetched from its gateway off chain by
    /// whoever is settling. Verified by Switchboard, never by us.
    pub signature: [u8; 64],
    pub recovery_id: u8,
    pub value: [u8; 32],
    pub owner: Pubkey,
    pub balance: u64,
    pub range_start: u64,
    pub range_end: u64,
    pub proof: Vec<[u8; 32]>,
    pub name: String,
    pub uri: String,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub deployer: Signer<'info>,
    #[account(
        init,
        payer = deployer,
        space = Config::SIZE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = deployer,
        space = Survivors::SIZE,
        seeds = [SURVIVORS_SEED],
        bump
    )]
    pub survivors: AccountLoader<'info, Survivors>,
    /// CHECK: recorded, and its update authority is checked by mpl-core at mint.
    pub collection: UncheckedAccount<'info>,
    /// CHECK: recorded and asserted against the randomness account's own queue.
    #[account(mut)]
    pub queue: UncheckedAccount<'info>,
    /// CHECK: created by the CPI below, then parsed and asserted to be ours.
    #[account(mut)]
    pub randomness: Signer<'info>,
    /// CHECK: Switchboard's reward escrow for the randomness account.
    #[account(mut)]
    pub reward_escrow: UncheckedAccount<'info>,
    /// CHECK: Switchboard's program state.
    pub switchboard_state: UncheckedAccount<'info>,
    /// CHECK: Switchboard derives and checks its own lookup-table signer.
    pub lut_signer: UncheckedAccount<'info>,
    /// CHECK: the lookup table Switchboard creates from `recent_slot`.
    #[account(mut)]
    pub lut: UncheckedAccount<'info>,
    /// CHECK: checked by address.
    #[account(address = ADDRESS_LOOKUP_TABLE_ID)]
    pub address_lookup_table_program: UncheckedAccount<'info>,
    /// CHECK: checked by address.
    #[account(address = SPL_TOKEN_ID)]
    pub token_program: UncheckedAccount<'info>,
    /// CHECK: checked by address.
    #[account(address = ASSOCIATED_TOKEN_ID)]
    pub associated_token_program: UncheckedAccount<'info>,
    /// CHECK: checked by address.
    #[account(address = WRAPPED_SOL_MINT)]
    pub wrapped_sol_mint: UncheckedAccount<'info>,
    /// CHECK: recorded; the cluster's published id is asserted off-chain at the
    /// deploy checklist, because devnet and mainnet differ.
    pub switchboard_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(params: RequestParams)]
pub struct RequestIssuance<'info> {
    /// Anybody. Pays rent and fees and gains nothing else.
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = payer,
        space = Issuance::SIZE,
        seeds = [ISSUANCE_SEED, &params.hour.to_le_bytes()],
        bump
    )]
    pub issuance: Account<'info, Issuance>,
    /// CHECK: parsed as Switchboard randomness; asserted equal to config.
    #[account(mut)]
    pub randomness: UncheckedAccount<'info>,
    /// CHECK: parsed as a Switchboard queue; asserted equal to config.
    pub queue: UncheckedAccount<'info>,
    /// CHECK: parsed as a Switchboard oracle and checked against the queue (T12).
    #[account(mut)]
    pub oracle: UncheckedAccount<'info>,
    /// CHECK: asserted equal to the id recorded at initialize.
    #[account(address = config.switchboard_program)]
    pub switchboard_program: UncheckedAccount<'info>,
    /// CHECK: the SlotHashes sysvar, checked by address.
    #[account(address = solana_program::sysvar::slot_hashes::ID)]
    pub recent_slothashes: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleIssuance<'info> {
    /// Anybody, again. Pays the asset's rent.
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [ISSUANCE_SEED, &issuance.hour.to_le_bytes()], bump = issuance.bump)]
    pub issuance: Account<'info, Issuance>,
    #[account(mut, seeds = [SURVIVORS_SEED], bump = survivors.load()?.bump)]
    pub survivors: AccountLoader<'info, Survivors>,
    /// CHECK: parsed as Switchboard randomness; asserted equal to the issuance.
    #[account(mut)]
    pub randomness: UncheckedAccount<'info>,
    /// CHECK: asserted equal to the queue recorded at initialize.
    #[account(address = config.queue)]
    pub queue: UncheckedAccount<'info>,
    /// CHECK: the oracle that served this hour; Switchboard checks it against
    /// the randomness account it committed to.
    pub oracle: UncheckedAccount<'info>,
    /// CHECK: Switchboard's own per-oracle stats PDA. Switchboard derives and
    /// checks it; we only forward it.
    #[account(mut)]
    pub oracle_stats: UncheckedAccount<'info>,
    /// CHECK: Switchboard's reward escrow for this randomness account.
    #[account(mut)]
    pub reward_escrow: UncheckedAccount<'info>,
    /// CHECK: Switchboard's program state.
    pub switchboard_state: UncheckedAccount<'info>,
    /// CHECK: asserted equal to the id recorded at initialize.
    #[account(address = config.switchboard_program)]
    pub switchboard_program: UncheckedAccount<'info>,
    /// CHECK: the SlotHashes sysvar, checked by address.
    #[account(address = solana_program::sysvar::slot_hashes::ID)]
    pub recent_slothashes: UncheckedAccount<'info>,
    /// CHECK: SPL Token, checked by address.
    #[account(address = SPL_TOKEN_ID)]
    pub token_program: UncheckedAccount<'info>,
    /// CHECK: wrapped SOL, checked by address.
    #[account(address = WRAPPED_SOL_MINT)]
    pub wrapped_sol_mint: UncheckedAccount<'info>,
    /// CHECK: the new asset, a fresh signer keypair supplied by the caller.
    #[account(mut)]
    pub asset: Signer<'info>,
    /// CHECK: asserted equal to the collection recorded at initialize.
    #[account(mut, address = config.collection)]
    pub collection: UncheckedAccount<'info>,
    /// CHECK: the address the proof resolves to. Asserted equal to the leaf's
    /// owner, so it is derived from the snapshot and never taken from a caller.
    pub recipient: UncheckedAccount<'info>,
    /// CHECK: mpl-core, checked by address.
    #[account(address = mpl_core::ID)]
    pub mpl_core_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

// -------------------------------------------------------------------- events

#[event]
pub struct IssuanceRequested {
    pub hour: u64,
    pub piece_index: u32,
    pub snapshot_slot: u64,
    pub root: [u8; 32],
    pub commitment: [u8; 32],
    pub eligible_supply: u64,
    pub randomness: Pubkey,
}

/// Everything a stranger needs to recompute the result, and nothing they have
/// to take on trust.
#[event]
pub struct IssuanceSettled {
    pub config: Pubkey,
    pub hour: u64,
    pub piece_index: u32,
    pub minted: bool,
    /// Which of the 4,000 went out. `u16::MAX` when nothing was minted.
    pub piece_id: u16,
    pub snapshot_slot: u64,
    pub root: [u8; 32],
    pub randomness: Pubkey,
    pub randomness_value: [u8; 32],
    pub reveal_slot: u64,
    pub eligible_supply: u64,
    pub point: u64,
    pub recipient: Pubkey,
    pub balance: u64,
}

// -------------------------------------------------------------------- errors

#[error_code]
pub enum IssuanceError {
    #[msg("period_seconds must be positive")]
    InvalidPeriod,
    #[msg("collection_size must be positive")]
    InvalidCollectionSize,
    #[msg("too many excluded addresses")]
    TooManyExcluded,
    #[msg("the current time is before genesis")]
    BeforeGenesis,
    #[msg("the hour argument is not the hour the clock derives")]
    WrongHour,
    #[msg("eligible supply is zero, so no piece is issued and the index does not advance")]
    NoEligibleSupply,
    #[msg("the snapshot slot is too far behind the current slot")]
    SnapshotTooOld,
    #[msg("the randomness account is not the one recorded at initialize")]
    RandomnessMismatch,
    #[msg("the randomness account could not be parsed")]
    RandomnessUnreadable,
    #[msg("the randomness account's authority is not this program's config")]
    RandomnessNotOurs,
    #[msg("randomness is not readable in this slot: settle must follow the reveal in the same transaction")]
    RandomnessNotReadable,
    #[msg("the queue is not the one recorded at initialize")]
    QueueMismatch,
    #[msg("the queue account could not be parsed")]
    QueueUnreadable,
    #[msg("the oracle account could not be parsed")]
    OracleUnreadable,
    #[msg("the oracle is not on the configured queue")]
    OracleNotOnQueue,
    #[msg("the oracle has not heartbeated inside the queue's node_timeout")]
    OracleStale,
    #[msg("this hour has already settled")]
    AlreadySettled,
    #[msg("this hour has passed and can no longer settle")]
    IssuanceExpired,
    #[msg("the resolved point is outside the range in the proof")]
    PointOutsideRange,
    #[msg("the range width does not equal the balance")]
    RangeWidthMismatch,
    #[msg("the merkle proof did not verify against the committed root")]
    ProofDidNotVerify,
    #[msg("the proof is longer than any tree this program can have")]
    ProofTooLong,
    #[msg("the recipient account is not the owner the proof resolves to")]
    RecipientMismatch,
    #[msg("counter overflow")]
    CounterOverflow,
    #[msg("the switchboard reveal CPI failed")]
    RevealFailed,
    #[msg("the switchboard randomness_init CPI failed")]
    RandomnessInitFailed,
    #[msg("no survivors left to issue")]
    NoSurvivorsLeft,
    #[msg("modulus must be positive")]
    EmptyRange,
    #[msg("uniform sampling did not terminate")]
    SamplingDidNotTerminate,
}

// --------------------------------------------------------------------- tests

/// The vectors below were produced by the TypeScript implementation in
/// `src/lib/snapshot`, which is what the cranker and the published verify
/// command run. **They are the only thing standing between two implementations
/// of the same hash quietly disagreeing** — and a disagreement here means a
/// proof the program refuses forever, or worse, one it accepts that the public
/// verifier does not.
///
/// Regenerate with the script in the runbook; a change to either side that does
/// not change the other makes this go red, which is the point.
#[cfg(test)]
mod tests {
    use super::*;

    fn hex32(s: &str) -> [u8; 32] {
        let mut out = [0u8; 32];
        for (i, byte) in out.iter_mut().enumerate() {
            *byte = u8::from_str_radix(&s[i * 2..i * 2 + 2], 16).unwrap();
        }
        out
    }

    const ELIGIBLE_SUPPLY: u64 = 10_001;
    const ROOT: &str = "c6189cb083b9eb3ac05a940df3c403028eb5e7bf366bc31eab6f352cd971bc8c";
    const RANDOMNESS: &str = "0b30557a9fc4e90e33587da2c7ec11365b80a5caef14395e83a8cdf2173c6186";
    const OWNER: &str = "7c838a91989fa6adb4bbc2c9d0d7dee5ecf3fa01080f161d242b323940474e55";
    const PROOF: [&str; 3] = [
        "2669b057ae595009194fd749d3c2cdc2cd38c7c1d2fc3825c8d1d8490a902665",
        "4e5caa19ce5ce77cf5e601b781138ede033de5fc9c8dc2977725c704ea4bfe57",
        "ec602638831ed9ee849b031c8a6d3617dc5718dbfb04e64da9de103fac99173f",
    ];

    fn params() -> SettleParams {
        SettleParams {
            signature: [0u8; 64],
            recovery_id: 0,
            value: [0u8; 32],
            owner: Pubkey::new_from_array(hex32(OWNER)),
            balance: 6_000,
            range_start: 4_000,
            range_end: 10_000,
            proof: PROOF.iter().map(|p| hex32(p)).collect(),
            name: String::new(),
            uri: String::new(),
        }
    }

    #[test]
    fn resolves_the_same_point_as_the_published_verifier() {
        assert_eq!(u256_mod(&hex32(RANDOMNESS), ELIGIBLE_SUPPLY), 5_952);
    }

    #[test]
    fn verifies_a_proof_the_typescript_builder_produced() {
        assert!(verify_proof(&params(), &hex32(ROOT)));
    }

    #[test]
    fn refuses_a_proof_whose_balance_was_altered() {
        let mut p = params();
        p.balance = 6_001;
        assert!(!verify_proof(&p, &hex32(ROOT)));
    }

    #[test]
    fn refuses_a_proof_whose_range_was_altered() {
        let mut p = params();
        p.range_start = 3_999;
        assert!(!verify_proof(&p, &hex32(ROOT)));
    }

    #[test]
    fn refuses_a_proof_with_a_sibling_removed() {
        let mut p = params();
        p.proof.pop();
        assert!(!verify_proof(&p, &hex32(ROOT)));
    }

    #[test]
    fn refuses_a_proof_for_a_different_owner() {
        let mut p = params();
        p.owner = Pubkey::default();
        assert!(!verify_proof(&p, &hex32(ROOT)));
    }

    /// The modulo is over the full 256-bit value, so the top bytes have to
    /// matter. If an implementation ever truncated to u64 this goes red.
    #[test]
    fn the_whole_256_bit_value_participates() {
        let mut high = [0u8; 32];
        high[0] = 1;
        assert_ne!(u256_mod(&high, ELIGIBLE_SUPPLY), 0);
        assert_eq!(u256_mod(&[0u8; 32], ELIGIBLE_SUPPLY), 0);
        assert_eq!(u256_mod(&[0xff; 32], 1), 0);
    }

    /// Vectors from `src/lib/protocol/survivors.ts`. Both domains, and moduli
    /// chosen to exercise a power of two, a prime, an enormous supply and 1.
    #[test]
    fn both_derivations_match_the_published_verifier() {
        let cases: [(&str, u64, u64, u64); 6] = [
            ("0000000000000000000000000000000000000000000000000000000000000000", 4000, 2887, 1369),
            ("0000000000000000000000000000000000000000000000000000000000000001", 4000, 2661, 3065),
            ("8000000000000000000000000000000000000000000000000000000000003039", 4000, 203, 106),
            ("00000000000000000000000000000000000000000000000000000000deadbeef", 10750001000000, 6249465603117, 5792342451978),
            ("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", 7, 1, 1),
            ("000000000000000000000000000000000000000000000000000000000000002a", 1, 0, 0),
        ];
        for (hex, m, piece, holder) in cases {
            let v = hex32(hex);
            assert_eq!(uniform_index(&v, m, PIECE_DOMAIN).unwrap(), piece, "piece {hex}");
            assert_eq!(uniform_index(&v, m, HOLDER_DOMAIN).unwrap(), holder, "holder {hex}");
        }
    }

    /// The two domains must not agree, or one number is answering both
    /// questions and the piece is a function of the recipient.
    #[test]
    fn the_domains_are_separated() {
        for i in 0u64..64 {
            let mut v = [0u8; 32];
            v[24..32].copy_from_slice(&(i * 104_729).to_be_bytes());
            assert_ne!(
                uniform_index(&v, 4000, PIECE_DOMAIN).unwrap(),
                uniform_index(&v, 4000, HOLDER_DOMAIN).unwrap()
            );
        }
    }

    /// The survivor array replays to the same permutation as the TypeScript,
    /// which is what the published verify command replays from the events.
    #[test]
    fn the_survivor_replay_matches_the_published_verifier() {
        let expected: [u16; 16] = [7, 10, 9, 15, 6, 1, 13, 3, 2, 4, 14, 12, 0, 8, 5, 11];
        let mut s = Survivors { remaining: 16, bump: 0, _pad: [0; 5], slots: [0u16; 4000] };
        for (i, want) in expected.iter().enumerate() {
            let mut v = [0u8; 32];
            v[24..32].copy_from_slice(&((i as u64) * 7919).to_be_bytes());
            let point = uniform_index(&v, s.remaining as u64, PIECE_DOMAIN).unwrap();
            assert_eq!(s.take(point).unwrap(), *want, "issuance {i}");
        }
        assert_eq!(s.remaining, 0);
        assert!(s.take(0).is_err());
    }

    /// Every piece exactly once, and the order is not the identity -- a
    /// "random survivor" that issues 0,1,2,... is sequential issuance in a hat.
    #[test]
    fn the_survivor_set_is_a_permutation() {
        let n: u16 = 1000;
        let mut s = Survivors { remaining: n, bump: 0, _pad: [0; 5], slots: [0u16; 4000] };
        let mut seen = vec![false; n as usize];
        let mut identity = 0;
        for i in 0..n as u64 {
            let mut v = [0u8; 32];
            v[24..32].copy_from_slice(&(i * 31).to_be_bytes());
            let point = uniform_index(&v, s.remaining as u64, PIECE_DOMAIN).unwrap();
            let id = s.take(point).unwrap();
            assert!(!seen[id as usize], "piece {id} issued twice");
            seen[id as usize] = true;
            if id as u64 == i {
                identity += 1;
            }
        }
        assert!(seen.iter().all(|x| *x));
        assert!(identity < 50, "issuance order looks sequential: {identity} fixed points");
    }

    /// `at_or_above_limit` is the only hand-rolled 256-bit arithmetic here.
    #[test]
    fn the_rejection_threshold_is_arithmetic_not_a_guess() {
        // 2^256 - 1 is above every threshold with a non-zero remainder.
        assert!(at_or_above_limit(&[0xff; 32], 1));
        // 0 is below every threshold.
        assert!(!at_or_above_limit(&[0u8; 32], 1));
        // A modulus that divides 2^256 leaves no remainder and never rejects.
        assert_eq!(pow2_256_mod(2), 0);
        assert_eq!(pow2_256_mod(1 << 16), 0);
        // And a modulus that does not.
        assert_ne!(pow2_256_mod(4000), 0);
    }

    /// The schedule is computed from the index and the period, never from the
    /// previous settlement, so a late hour cannot push the next one.
    #[test]
    fn the_hour_is_derived_from_the_clock_and_does_not_drift() {
        let config = Config {
            bump: 0,
            weight_mint: Pubkey::default(),
            collection: Pubkey::default(),
            switchboard_program: Pubkey::default(),
            queue: Pubkey::default(),
            randomness: Pubkey::default(),
            genesis_unix: 1_000_000,
            period_seconds: 3_600,
            collection_size: 4_000,
            issued_count: 0,
            live_supply: 0,
            excluded: vec![],
            manifest_hash: [0u8; 32],
        };
        assert_eq!(current_hour(&config, 1_000_000).unwrap(), 0);
        assert_eq!(current_hour(&config, 1_000_000 + 3_599).unwrap(), 0);
        assert_eq!(current_hour(&config, 1_000_000 + 3_600).unwrap(), 1);
        // An hour that settles 59 minutes late does not move the next one.
        assert_eq!(current_hour(&config, 1_000_000 + 7_140).unwrap(), 1);
        assert_eq!(current_hour(&config, 1_000_000 + 7_200).unwrap(), 2);
        assert!(current_hour(&config, 999_999).is_err());
    }
}
