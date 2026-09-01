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
use switchboard_on_demand::OracleAccountData;

declare_id!("Bpmysmj4VMMo38Pa9NdbgRhmoBjQNWLbseARiPfoUaWm");

/// Domain separation on the Merkle hashing. Without distinct prefixes an inner
/// node can be presented as a leaf. These bytes match `src/lib/snapshot`
/// exactly, and the tests in that directory are the other half of this claim.
const LEAF_PREFIX: [u8; 1] = [0x00];
const NODE_PREFIX: [u8; 1] = [0x01];

/// How stale a snapshot may be when it is committed. The root has to describe
/// roughly the chain state at request time; an old one would let a caller
/// commit a set of holders that has since changed hands.
const MAX_SNAPSHOT_AGE_SLOTS: u64 = 150;

/// Bounded so `initialize` cannot write an account nobody can afford to read.
const MAX_EXCLUDED: usize = 8;
/// A tree of 2^24 leaves is more holders than the chain will ever carry here.
const MAX_PROOF_LEN: usize = 24;

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

        // The randomness account has to already be ours, or `request_issuance`
        // could never sign its commit. Asserted here rather than discovered at
        // the first issuance.
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
        let point = u256_mod(&value, issuance.eligible_supply);
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

        emit!(IssuanceSettled {
            config: config_key,
            hour: issuance.hour,
            piece_index: issuance.piece_index,
            minted: minting,
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
}

impl Config {
    pub const SIZE: usize = 8 + 1 + 32 * 5 + 8 + 8 + 4 * 3 + 4 + 32 * MAX_EXCLUDED;
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
}

impl Issuance {
    pub const SIZE: usize = 8 + 1 + 8 + 4 + 8 + 32 + 32 + 8 + 32 + 8 + 1 + 32 + 8;
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeParams {
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
    /// CHECK: recorded, and its update authority is checked by mpl-core at mint.
    pub collection: UncheckedAccount<'info>,
    /// CHECK: recorded and asserted against the randomness account's own queue.
    pub queue: UncheckedAccount<'info>,
    /// CHECK: parsed as Switchboard randomness and asserted to be ours.
    pub randomness: UncheckedAccount<'info>,
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
    /// CHECK: parsed as Switchboard randomness; asserted equal to the issuance.
    pub randomness: UncheckedAccount<'info>,
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
