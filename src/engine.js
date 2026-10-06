/**
 * Dependency-free combat simulation. Coordinates use a 960 × 420 arena;
 * fighter.x is its horizontal center, and fighter.y is height ABOVE the floor.
 * stepMatch mutates its match and returns it. dt is seconds, capped at 0.05.
 * Input: {left,right,jump,block,punch,kick,special}; jump/attacks use press edges.
 * Public fighter actionTime is the remaining animation/recovery time in seconds.
 * events only describe the most recent step and can drive sound/visual effects.
 */
export const ARENA = Object.freeze({ width: 960, height: 420, groundY: 350, minX: 36, maxX: 924 });

export const ATTACKS = Object.freeze({
  punch: Object.freeze({ damage: 9, range: 108, startup: 0.07, active: 0.10, duration: 0.34, knockback: 22, energy: 0 }),
  kick: Object.freeze({ damage: 14, range: 146, startup: 0.13, active: 0.12, duration: 0.49, knockback: 38, energy: 0 }),
  special: Object.freeze({ damage: 24, range: 272, startup: 0.19, active: 0.16, duration: 0.72, knockback: 64, energy: 35 }),
});

const DIFFICULTIES = {
  easy: { reaction: 0.48, aggression: 0.60, block: 0.14, speed: 170 },
  normal: { reaction: 0.29, aggression: 0.82, block: 0.38, speed: 205 },
  hard: { reaction: 0.17, aggression: 0.98, block: 0.64, speed: 230 },
};
const BUTTONS = ['left', 'right', 'jump', 'block', 'punch', 'kick', 'special'];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const otherSide = side => side === 'player' ? 'opponent' : 'player';

function fighter(id, side, wins = 0) {
  return {
    id, x: side === 'player' ? 285 : 675, y: 0, velocityY: 0,
    health: 100, energy: 100, facing: side === 'player' ? 1 : -1,
    action: 'idle', actionTime: 0, hits: 0, wins, specialCooldown: 0,
    _attack: null, _previousInput: {},
  };
}

/** Create an immediately playable best-of-three match; pass ai:false for tests/local control. */
export function createMatch({ playerId = 'king', opponentId = 'general', difficulty = 'normal', duration = 45, ai = true, random = Math.random } = {}) {
  return {
    status: 'playing', round: 1, timeLeft: Number.isFinite(duration) && duration > 0 ? duration : 45,
    duration: Number.isFinite(duration) && duration > 0 ? duration : 45,
    difficulty: Object.hasOwn(DIFFICULTIES, difficulty) ? difficulty : 'normal',
    ai: Boolean(ai), random: typeof random === 'function' ? random : Math.random,
    paused: false, winner: null, roundWinner: null, events: [],
    fighters: { player: fighter(playerId, 'player'), opponent: fighter(opponentId, 'opponent') },
    _ai: { timer: 0.4, intent: {} },
  };
}

/** Pausing freezes combat, timer, recovery, energy, and AI decisions. */
export function setPaused(match, paused = true) {
  match.paused = Boolean(paused);
  match.events = [];
  return match;
}

/** Only a completed, non-final round can advance. Wins survive, combat state resets. */
export function startNextRound(match) {
  if (match.status !== 'roundOver') return match;
  for (const side of ['player', 'opponent']) {
    const previous = match.fighters[side];
    match.fighters[side] = fighter(previous.id, side, previous.wins);
  }
  match.round += 1;
  match.timeLeft = match.duration;
  match.status = 'playing';
  match.winner = null;
  match.roundWinner = null;
  match.paused = false;
  match.events = [];
  match._ai = { timer: 0.4, intent: {} };
  return match;
}

function normalizedInput(input) {
  return Object.fromEntries(BUTTONS.map(button => [button, Boolean(input?.[button])]));
}

function aiInput(match, dt) {
  const computer = match.fighters.opponent;
  const player = match.fighters.player;
  const settings = DIFFICULTIES[match.difficulty];
  const state = match._ai;
  state.timer -= dt;
  // Movement/guard persists between decisions; attack and jump commands are pulses.
  const input = { ...state.intent, punch: false, kick: false, special: false, jump: false };
  if (state.timer > 0) return input;
  state.timer = settings.reaction + clamp(match.random(), 0, 1) * 0.12;
  const distance = Math.abs(player.x - computer.x);
  const toward = player.x < computer.x ? 'left' : 'right';
  input.left = false;
  input.right = false;
  input.block = false;
  if (distance > 112) input[toward] = true;
  if (player._attack && distance < ATTACKS[player.action].range + 35 && match.random() < settings.block) {
    input.block = true;
    input.left = false;
    input.right = false;
  } else if (computer.actionTime <= 0 && match.random() < settings.aggression) {
    if (distance < 250 && computer.energy >= 35 && computer.specialCooldown <= 0 && match.random() < 0.25) input.special = true;
    else if (distance < 138) input[match.random() < 0.45 ? 'punch' : 'kick'] = true;
  }
  if (!input.block && distance > 145 && match.random() < 0.08) input.jump = true;
  state.intent = { left: input.left, right: input.right, block: input.block };
  return input;
}

function updateFighter(match, side, input, dt) {
  const current = match.fighters[side];
  const target = match.fighters[otherSide(side)];
  const previousInput = current._previousInput;
  const pressed = button => input[button] && !previousInput[button];
  current._previousInput = input;
  current.energy = Math.min(100, current.energy + dt * 9);
  current.specialCooldown = Math.max(0, current.specialCooldown - dt);
  current.actionTime = Math.max(0, current.actionTime - dt);
  if (current.actionTime === 0) current._attack = null;
  if (!current._attack && current.action !== 'hit') current.facing = target.x >= current.x ? 1 : -1;

  if (current.y > 0 || current.velocityY > 0) {
    current.velocityY -= 1450 * dt;
    current.y = Math.max(0, current.y + current.velocityY * dt);
    if (current.y === 0) current.velocityY = 0;
  }

  if (current.actionTime <= 0) {
    current.action = current.y > 0 ? 'jump' : 'idle';
    if (pressed('jump') && current.y === 0) {
      current.velocityY = 590;
      current.y = 1;
      current.action = 'jump';
      match.events.push({ type: 'jump', side });
    }
    if (input.block && current.y === 0) {
      current.action = 'block';
    } else {
      const movement = Number(input.right) - Number(input.left);
      if (movement) {
        const speed = side === 'opponent' && match.ai ? DIFFICULTIES[match.difficulty].speed : 230;
        current.x = clamp(current.x + movement * speed * dt, ARENA.minX, ARENA.maxX);
        if (current.y === 0) current.action = 'walk';
      }
      const attack = ['special', 'kick', 'punch'].find(name => pressed(name) && current.energy >= ATTACKS[name].energy && (name !== 'special' || current.specialCooldown <= 0));
      if (attack) {
        const definition = ATTACKS[attack];
        current.action = attack;
        current.actionTime = definition.duration;
        current.energy -= definition.energy;
        current._attack = { name: attack, elapsed: 0, connected: false, direction: current.facing };
        if (attack === 'special') current.specialCooldown = 1.3;
        match.events.push({ type: attack, side });
      }
    }
  }
  if (current._attack) current._attack.elapsed += dt;
  current.x = clamp(current.x, ARENA.minX, ARENA.maxX);
}

function separateFighters(match) {
  const { player, opponent } = match.fighters;
  if (Math.abs(player.y - opponent.y) >= 85) return;
  const distance = Math.abs(player.x - opponent.x);
  if (distance >= 48) return;
  const direction = opponent.x >= player.x ? 1 : -1;
  const correction = (48 - distance) / 2;
  player.x = clamp(player.x - direction * correction, ARENA.minX, ARENA.maxX);
  opponent.x = clamp(opponent.x + direction * correction, ARENA.minX, ARENA.maxX);
}

function collectHit(match, side) {
  const attacker = match.fighters[side];
  const defender = match.fighters[otherSide(side)];
  const attack = attacker._attack;
  if (!attack || attack.connected) return null;
  const definition = ATTACKS[attack.name];
  if (attack.elapsed < definition.startup || attack.elapsed > definition.startup + definition.active) return null;
  const distance = (defender.x - attacker.x) * attack.direction;
  if (distance < 0 || distance > definition.range || Math.abs(defender.y - attacker.y) > 88) return null;
  attack.connected = true;
  return { side, attacker, defender, attack, definition, blocked: defender.action === 'block' && defender.facing === -attack.direction };
}

function applyHit(match, hit) {
  const { side, attacker, defender, attack, definition, blocked } = hit;
  const damage = blocked ? (attack.name === 'special' ? 5 : 1) : definition.damage;
  defender.health = Math.max(0, defender.health - damage);
  defender.x = clamp(defender.x + attack.direction * definition.knockback * (blocked ? 0.25 : 1), ARENA.minX, ARENA.maxX);
  if (!blocked) {
    attacker.hits += 1;
    attacker.energy = Math.min(100, attacker.energy + 3);
    defender.action = 'hit';
    defender.actionTime = attack.name === 'special' ? 0.32 : 0.21;
    defender._attack = null;
  }
  match.events.push({ type: 'hit', side, target: otherSide(side), attack: attack.name, damage, blocked, x: defender.x, y: defender.y });
}

function finishRound(match) {
  const { player, opponent } = match.fighters;
  const winner = player.health === opponent.health ? 'draw' : player.health > opponent.health ? 'player' : 'opponent';
  match.roundWinner = winner;
  match.winner = winner;
  if (winner !== 'draw') match.fighters[winner].wins += 1;
  match.events.push({ type: 'roundOver', winner, round: match.round });
  if (player.wins >= 2 || opponent.wins >= 2 || match.round >= 3) {
    match.status = 'finished';
    match.winner = player.wins === opponent.wins ? 'draw' : player.wins > opponent.wins ? 'player' : 'opponent';
    match.events.push({ type: 'finished', winner: match.winner });
  } else {
    match.status = 'roundOver';
  }
}

/**
 * Advance one simulation frame. Optional input.opponent supplies local/test controls
 * when ai:false. Set match.paused or use setPaused(); paused/over matches do not tick.
 */
export function stepMatch(match, dt, input = {}) {
  match.events = [];
  const step = Number.isFinite(dt) ? clamp(dt, 0, 0.05) : 0;
  if (match.paused || match.status !== 'playing' || step === 0) return match;
  const opponentInput = match.ai ? aiInput(match, step) : input.opponent;
  updateFighter(match, 'player', normalizedInput(input), step);
  updateFighter(match, 'opponent', normalizedInput(opponentInput), step);
  separateFighters(match);
  // Collect before applying so simultaneous connecting attacks can trade fairly.
  const hits = ['player', 'opponent'].map(side => collectHit(match, side)).filter(Boolean);
  for (const hit of hits) applyHit(match, hit);
  match.timeLeft = Math.max(0, match.timeLeft - step);
  if (match.fighters.player.health <= 0 || match.fighters.opponent.health <= 0 || match.timeLeft <= 1e-8) {
    if (match.timeLeft <= 1e-8) match.timeLeft = 0;
    finishRound(match);
  }
  return match;
}
