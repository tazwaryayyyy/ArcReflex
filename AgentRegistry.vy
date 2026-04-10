# @version ^0.3.10
# @title ArcReflex Agent Registry
# @notice ERC-8004 compliant agent identity and reputation registry
# @author ArcReflex — The Autonomous Economic Nervous System
# @dev Reputation tracks agent quality over time. Cannot be reset.
#      Quality enforcement is off-chain (Orchestrator withholds EIP-3009 signing).
#      This contract handles identity + reputation only — gas-free quality control.

# ─── Events ───────────────────────────────────────────────────────────────────

event AgentRegistered:
    agent: indexed(address)
    agent_type: String[32]
    reputation: uint256

event ReputationUpdated:
    agent: indexed(address)
    old_rep: uint256
    new_rep: uint256
    task_id: bytes32

event AgentSlashed:
    agent: indexed(address)
    slash_amount: uint256
    reason: String[64]

event OracleVerified:
    oracle: indexed(address)
    verifier: indexed(address)

event AgentDeactivated:
    agent: indexed(address)

# ─── Structs ──────────────────────────────────────────────────────────────────

struct Agent:
    identity: bytes32          # keccak256(pubkey) — unique, permanent
    reputation: uint256        # 0–10000 (display as /100)
    tasks_completed: uint256
    tasks_failed: uint256
    wallet: address            # Circle Wallet address
    agent_type: String[32]     # "search" | "filter" | "oracle"
    is_active: bool
    stake: uint256             # USDC staked (6 decimal places, e.g. 1_000_000 = $1)
    registered_at: uint256     # block.timestamp

# ─── Storage ──────────────────────────────────────────────────────────────────

owner: public(address)
agents: public(HashMap[address, Agent])
verified_oracles: public(HashMap[address, bool])
min_stake: public(HashMap[String[32], uint256])
min_reputation: public(HashMap[String[32], uint256])
total_agents: public(uint256)

# ─── Constants ────────────────────────────────────────────────────────────────

MAX_REPUTATION: constant(uint256) = 10000
MIN_REPUTATION: constant(uint256) = 100
STARTING_REPUTATION: constant(uint256) = 5000
SLASH_PERCENT: constant(uint256) = 10        # 10% stake slashed per quality failure
REPUTATION_PENALTY: constant(uint256) = 1500 # -15 reputation points on slash

# ─── Constructor ──────────────────────────────────────────────────────────────

@deploy
def __init__():
    self.owner = msg.sender

    # Minimum stakes per agent type (in USDC micro-units, 6 decimals)
    self.min_stake["search"]   = 1_000_000    # $1.00 USDC
    self.min_stake["filter"]   = 1_000_000    # $1.00 USDC
    self.min_stake["analysis"] = 5_000_000    # $5.00 USDC
    self.min_stake["oracle"]   = 10_000_000   # $10.00 USDC

    # Minimum reputation gates for high-trust roles
    # New agents start at 5000 (50.00) — below analysis/oracle gate
    # They must earn reputation through search/filter work first
    self.min_reputation["analysis"] = 7500   # 75.00 to register as Analysis agent
    self.min_reputation["oracle"]   = 8000   # 80.00 to become Quality Oracle

    self.total_agents = 0

# ─── Internal Helpers ─────────────────────────────────────────────────────────

@view
@internal
def _is_verified_oracle(addr: address) -> bool:
    return self.verified_oracles[addr]

@view
@internal
def _get_minimum_stake(agent_type: String[32]) -> uint256:
    s: uint256 = self.min_stake[agent_type]
    if s == 0:
        return 1_000_000  # Default $1.00 USDC
    return s

@view
@internal
def _meets_reputation_gate(agent_type: String[32], reputation: uint256) -> bool:
    gate: uint256 = self.min_reputation[agent_type]
    if gate == 0:
        return True  # No gate for this type
    return reputation >= gate

# ─── External Functions ───────────────────────────────────────────────────────

@external
def register(agent_type: String[32], identity: bytes32, stake: uint256):
    """
    @notice Register a new agent. Stake is held as a quality bond.
    @dev For demo: called once per agent at startup via deploy script.
         stake parameter is informational — actual USDC held in Circle Wallet.
    """
    assert not self.agents[msg.sender].is_active, "Already registered"
    assert stake >= self._get_minimum_stake(agent_type), "Insufficient stake"
    assert self._meets_reputation_gate(agent_type, STARTING_REPUTATION), "Reputation gate not met"

    self.agents[msg.sender] = Agent({
        identity: identity,
        reputation: STARTING_REPUTATION,
        tasks_completed: 0,
        tasks_failed: 0,
        wallet: msg.sender,
        agent_type: agent_type,
        is_active: True,
        stake: stake,
        registered_at: block.timestamp
    })

    self.total_agents += 1
    log AgentRegistered(msg.sender, agent_type, STARTING_REPUTATION)

@external
def update_reputation(agent: address, quality_score: uint256, task_id: bytes32):
    """
    @notice Update agent reputation after task completion. Only verified oracles.
    @dev quality_score: 0–10000 (maps to 0.00–100.00)
         Uses exponential moving average: new = (old * 80% + score * 20%)
         Recent performance matters more than historical average.
    """
    assert self._is_verified_oracle(msg.sender), "Not a verified oracle"
    assert self.agents[agent].is_active, "Agent not active"
    assert quality_score <= MAX_REPUTATION, "Score out of range"

    old_rep: uint256 = self.agents[agent].reputation
    new_rep: uint256 = (old_rep * 80 + quality_score * 20) / 100

    if new_rep > MAX_REPUTATION:
        new_rep = MAX_REPUTATION
    if new_rep < MIN_REPUTATION:
        new_rep = MIN_REPUTATION

    self.agents[agent].reputation = new_rep
    self.agents[agent].tasks_completed += 1

    log ReputationUpdated(agent, old_rep, new_rep, task_id)

@external
def slash_agent(agent: address, reason: String[64]):
    """
    @notice Slash a portion of an agent's stake for quality failure.
    @dev Called by Orchestrator (via verified oracle) when quality withheld.
         Slash amount: 10% of current stake.
         Reputation penalty: -15 points.
    """
    assert self._is_verified_oracle(msg.sender), "Not a verified oracle"
    assert self.agents[agent].is_active, "Agent not active"
    assert self.agents[agent].stake > 0, "No stake to slash"

    slash_amount: uint256 = (self.agents[agent].stake * SLASH_PERCENT) / 100
    self.agents[agent].stake -= slash_amount
    self.agents[agent].tasks_failed += 1

    old_rep: uint256 = self.agents[agent].reputation
    if old_rep > REPUTATION_PENALTY:
        self.agents[agent].reputation = old_rep - REPUTATION_PENALTY
    else:
        self.agents[agent].reputation = MIN_REPUTATION

    log AgentSlashed(agent, slash_amount, reason)

@external
def verify_oracle(oracle: address):
    """
    @notice Owner grants oracle status to a trusted agent.
    @dev In production: multi-sig or DAO vote. For demo: owner call.
    """
    assert msg.sender == self.owner, "Only owner"
    assert self.agents[oracle].is_active, "Agent not registered"
    self.verified_oracles[oracle] = True
    log OracleVerified(oracle, msg.sender)

@external
def deactivate():
    """@notice Agent removes itself from the network."""
    assert self.agents[msg.sender].is_active, "Not active"
    self.agents[msg.sender].is_active = False
    self.total_agents -= 1
    log AgentDeactivated(msg.sender)

# ─── View Functions ───────────────────────────────────────────────────────────

@view
@external
def get_auction_score(agent: address, offered_price_micros: uint256) -> uint256:
    """
    @notice Reputation-weighted auction score used by Orchestrator.
    @dev Formula: (reputation * 100) / offered_price_micros
         offered_price in micro-USDC (e.g., $0.0001 = 100 micros)
         
         Example:
           rep=72 agent at 200 micros → (7200 * 100) / 200 = 3600
           rep=65 agent at 220 micros → (6500 * 100) / 220 = 2954
           → rep=72 agent wins despite higher price

         Higher-reputation agents win even at higher prices.
         This prevents race-to-the-bottom pricing dynamics.
    """
    assert offered_price_micros > 0, "Price cannot be zero"
    rep: uint256 = self.agents[agent].reputation
    return (rep * 100) / offered_price_micros

@view
@external
def is_eligible(agent: address) -> bool:
    """@notice Check if agent is active and meets reputation gate for its type."""
    a: Agent = self.agents[agent]
    if not a.is_active:
        return False
    return self._meets_reputation_gate(a.agent_type, a.reputation)

@view
@external
def get_agent(agent: address) -> Agent:
    """@notice Return full agent struct."""
    return self.agents[agent]

@view
@external
def get_reputation_display(agent: address) -> uint256:
    """@notice Return reputation as 0–100 integer for display."""
    return self.agents[agent].reputation / 100
