/**
 * Softcap — data structures for the Elden Ring build optimizer.
 *
 * Design notes:
 *  - The raw fanapis dumps use `[{ name, amount }]` arrays and stringified numbers.
 *    Those are hostile to an optimizer (O(n) lookups, no type safety). Everything
 *    here is a keyed numeric record so damage/requirement/scaling math is a direct index.
 *  - Every entity extends `GameEntity`, so a build slot can hold an `EntityRef` uniformly.
 *  - Talisman/spell effects are modeled as structured `StatModifier`s rather than prose,
 *    so the optimizer can actually evaluate them.
 */

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

export type Attribute =
  | 'vigor' | 'mind' | 'endurance'
  | 'strength' | 'dexterity' | 'intelligence' | 'faith' | 'arcane';

/** The five attributes that gate equipment and drive weapon scaling. */
export type ScalingAttribute = 'strength' | 'dexterity' | 'intelligence' | 'faith' | 'arcane';

export type DamageType = 'physical' | 'magic' | 'fire' | 'lightning' | 'holy';

/** Physical sub-types matter for armor negation and weapon-vs-armor matchups. */
export type PhysicalDamageType = 'standard' | 'strike' | 'slash' | 'pierce';

export type StatusEffect =
  | 'bleed' | 'frostbite' | 'poison' | 'scarletRot' | 'madness' | 'sleep' | 'deathBlight';

export type Resistance = 'immunity' | 'robustness' | 'focus' | 'vitality';

export type ScalingGrade = 'S' | 'A' | 'B' | 'C' | 'D' | 'E';

/** Full 8-attribute vector. Used for character stats and stat deltas. */
export type AttributeSet = Record<Attribute, number>;

/** Requirements only ever involve the five scaling attributes. */
export type ScalingAttributeSet = Record<ScalingAttribute, number>;

export type DamageSet = Record<DamageType, number>;

/** Sparse maps — an absent key means 0. Keeps seed data readable. */
export type PartialAttributeSet = Partial<Record<Attribute, number>>;
export type StatusBuildup = Partial<Record<StatusEffect, number>>;
export type ResistanceSet = Partial<Record<Resistance, number>>;

/**
 * Display-only scaling grade. The exact numbers behind attack-power maths come
 * from the regulation data — see `src/calculator/`, which has the real
 * per-upgrade-level coefficients straight from the game.
 */
export interface ScalingEntry {
  grade: ScalingGrade;
}

export type ScalingSet = Partial<Record<ScalingAttribute, ScalingEntry>>;

/* ------------------------------------------------------------------ */
/* Shared entity + effect model                                        */
/* ------------------------------------------------------------------ */

export type ItemCategory =
  | 'weapon' | 'shield' | 'armor' | 'talisman' | 'sorcery' | 'incantation' | 'class';

export interface GameEntity {
  /** Stable slug, e.g. "longsword". Preferred over opaque API ids for hand-authored links. */
  id: string;
  name: string;
  category: ItemCategory;
  description?: string;
  imageUrl?: string | null;
  /** Original fanapis id, retained so imports stay idempotent. */
  sourceId?: string;
}

/** A typed pointer into another table. */
export interface EntityRef<C extends ItemCategory = ItemCategory> {
  id: string;
  name: string;
  category: C;
}

/** What a modifier acts on. The optimizer switches on `kind`. */
export type ModifierTarget =
  | { kind: 'attribute'; attribute: Attribute }
  | { kind: 'maxHp' }
  | { kind: 'maxFp' }
  | { kind: 'maxStamina' }
  | { kind: 'equipLoad' }
  | { kind: 'poise' }
  | { kind: 'attackPower'; damageType?: DamageType }
  | { kind: 'damageNegation'; damageType?: DamageType }
  | { kind: 'statusBuildup'; status: StatusEffect }
  | { kind: 'spellPotency'; school: 'sorcery' | 'incantation' | 'both' }
  | { kind: 'fpCost'; scope: 'spells' | 'skills' }
  | { kind: 'memorySlots' }
  | { kind: 'staminaRecovery' }
  | { kind: 'resistance'; resistance: Resistance };

export type ModifierOp = 'flat' | 'percent' | 'multiplier';

export interface StatModifier {
  target: ModifierTarget;
  op: ModifierOp;
  value: number;
  /** Conditional effects (low HP, successive hits, ...) so the solver can gate them. */
  condition?: string;
  /** False when the effect cannot be modeled numerically (e.g. "conceals wearer"). */
  quantified?: boolean;
}

/* ------------------------------------------------------------------ */
/* Armaments (weapons + shields share a base)                          */
/* ------------------------------------------------------------------ */

export type UpgradePath = 'standard' | 'somber' | 'none';

export interface UpgradeInfo {
  path: UpgradePath;
  /** The level this row's numbers describe. Base rows are 0. */
  level: number;
  /** 25 for standard, 10 for somber, 0 for unupgradeable. */
  maxLevel: number;
}

export type Affinity =
  | 'standard' | 'heavy' | 'keen' | 'quality' | 'fire' | 'flame-art'
  | 'lightning' | 'sacred' | 'magic' | 'cold' | 'poison' | 'blood' | 'occult';

export interface WeaponSkill {
  id: string;
  name: string;
  fpCost: number;
  /** False for unique weapons whose skill cannot be swapped with an Ash of War. */
  swappable: boolean;
}

export interface GuardStats {
  /** Percent damage blocked, per type. */
  negation: DamageSet;
  /** "Boost" — stamina retained while guarding. */
  stability: number;
  canParry: boolean;
  blocksAllPhysical: boolean;
}

export interface ArmamentBase extends GameEntity {
  /** e.g. "Straight Sword", "Katana", "Medium Shield". */
  weaponClass: string;
  weight: number;
  requirements: ScalingAttributeSet;
  scaling: ScalingSet;
  attack: DamageSet;
  /** Critical multiplier as shown in-game (100 = baseline). */
  criticalMultiplier: number;
  statusBuildup: StatusBuildup;
  guard: GuardStats;
  upgrade: UpgradeInfo;
  affinity: Affinity;
  skill: WeaponSkill | null;
  /** Two-handing multiplies effective strength by 1.5 — the solver needs to know if it is legal. */
  twoHandable: boolean;
  /** Set on staffs and sacred seals. */
  catalyst?: {
    school: 'sorcery' | 'incantation';
    /** Spell-scaling stat, e.g. intelligence for staffs. */
    scalingStat: ScalingAttribute;
  };
}

export interface Weapon extends ArmamentBase {
  category: 'weapon';
  physicalDamageTypes: PhysicalDamageType[];
  /** Bows and crossbows only. */
  ammunitionType?: 'arrow' | 'greatarrow' | 'bolt' | 'greatbolt';
  /** Buffable with grease / weapon-buff spells — matters for stacking rules. */
  buffable: boolean;
}

export interface Shield extends ArmamentBase {
  category: 'shield';
  shieldClass: 'Small Shield' | 'Medium Shield' | 'Greatshield';
}

/* ------------------------------------------------------------------ */
/* Armor                                                               */
/* ------------------------------------------------------------------ */

export type ArmorSlot = 'head' | 'chest' | 'hands' | 'legs';

export interface Armor extends GameEntity {
  category: 'armor';
  slot: ArmorSlot;
  /** Set this piece belongs to, for full-set filters. */
  setId?: string;
  weight: number;
  /** Percent negation. Physical is split into its four sub-types. */
  damageNegation: Record<PhysicalDamageType | DamageType, number>;
  resistance: ResistanceSet;
  poise: number;
  effects?: StatModifier[];
  /** Altered/tattered variant weighs less; useful for equip-load solving. */
  alteredVariantId?: string;
}

/* ------------------------------------------------------------------ */
/* Talismans                                                           */
/* ------------------------------------------------------------------ */

export interface Talisman extends GameEntity {
  category: 'talisman';
  weight: number;
  /** Text as printed in-game, kept for the UI. */
  effectText: string;
  /** Machine-readable form the optimizer scores. */
  effects: StatModifier[];
  /** Talismans in the same family (+1/+2/+3) cannot be stacked. */
  conflictGroup?: string;
  tier?: 0 | 1 | 2 | 3;
}

/* ------------------------------------------------------------------ */
/* Spells                                                              */
/* ------------------------------------------------------------------ */

export interface SpellBase extends GameEntity {
  requirements: ScalingAttributeSet;
  fpCost: number;
  /** Charged/held variants cost more. */
  fpCostCharged?: number;
  memorySlots: number;
  effectText: string;
  damageTypes: DamageType[];
  statusBuildup: StatusBuildup;
  /** Seconds, for DPS modeling. */
  castTime?: number;
  effects?: StatModifier[];
}

export interface Sorcery extends SpellBase {
  category: 'sorcery';
  requiredCatalyst: 'glintstone-staff' | 'sacred-seal';
}

export interface Incantation extends SpellBase {
  category: 'incantation';
  requiredCatalyst: 'sacred-seal' | 'glintstone-staff';
  /** Dragon Communion incantations scale off arcane and want the Dragon Communion Seal. */
  isDragonCommunion?: boolean;
}

/* ------------------------------------------------------------------ */
/* Starting Classes                                                    */
/* ------------------------------------------------------------------ */

export interface AmmunitionStack {
  ref: EntityRef<'weapon'>;
  quantity: number;
}

/**
 * Starting gear — the block missing from the raw API dump.
 * Slots mirror the in-game inventory so a build can be initialized directly.
 */
export interface StartingEquipment {
  /** Right-hand armaments, in slot order. The Warrior starts with two Scimitars. */
  rightHand: EntityRef<'weapon'>[];
  /** Left-hand armaments: off-hand weapons, staffs and seals live here too. */
  leftHand: EntityRef<'weapon'>[];
  shields: EntityRef<'shield'>[];
  armor: {
    head: EntityRef<'armor'> | null;
    chest: EntityRef<'armor'> | null;
    hands: EntityRef<'armor'> | null;
    legs: EntityRef<'armor'> | null;
  };
  sorceries: EntityRef<'sorcery'>[];
  incantations: EntityRef<'incantation'>[];
  talismans: EntityRef<'talisman'>[];
  ammunition: AmmunitionStack[];
  /** Keepsake is picked separately at character creation; null = none by default. */
  keepsake?: string | null;
}

export interface StartingClass extends GameEntity {
  category: 'class';
  startingLevel: number;
  stats: AttributeSet;
  /** Sum of the 8 attributes — precomputed because level math uses it constantly. */
  totalAttributePoints: number;
  startingEquipment: StartingEquipment;
  /** True for the ten base classes; guards against junk rows in the raw dump. */
  isBaseClass: boolean;
}

/* ------------------------------------------------------------------ */
/* Database + build model                                              */
/* ------------------------------------------------------------------ */

export interface GameDatabase {
  version: string;
  weapons: Record<string, Weapon>;
  shields: Record<string, Shield>;
  armors: Record<string, Armor>;
  talismans: Record<string, Talisman>;
  sorceries: Record<string, Sorcery>;
  incantations: Record<string, Incantation>;
  classes: Record<string, StartingClass>;
}

export interface CharacterBuild {
  classId: string;
  level: number;
  stats: AttributeSet;
  rightHand: (string | null)[];
  leftHand: (string | null)[];
  armor: Record<ArmorSlot, string | null>;
  /** Max four. */
  talismans: (string | null)[];
  memorizedSpells: (string | null)[];
}
