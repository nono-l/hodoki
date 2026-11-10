export type Mood = "calm" | "wary" | "shaken" | "break";

export type Speaker = "n" | "ritsu" | "mind" | "suspect" | "shiori" | "accomplice";

export type Line = {
  who: Speaker;
  text: string;
  mood?: Mood;
  face?: "culprit" | "accomplice";
  /** Prologue only: a truth the player just witnessed. */
  reveal?: string;
};

export type Person = {
  name: string;
  ruby: string;
  age: number;
  role: string;
  img: string;
};

export type Topic = {
  id: string;
  label: string;
  ask: string;
  claim: string;
  short: string;
  lie: boolean;
  brokenBy: string[];
  /** When set, brokenBy must be pointed in this order before the lie breaks. */
  sequence?: boolean;
  evade: string;
  admit: string;
  admitShort: string;
  onBreak: Line[];
  onTrue: string;
};

export type Truth = {
  id: string;
  label: string;
  text: string;
  kind: "目撃" | "物証";
};

export type Chapter = {
  id: number;
  no: string;
  title: string;
  caseName: string;
  blurb: string;
  culprit: Person;
  accomplice: Person;
  /** Shown when the accomplice's name is spoken. */
  accompliceHook: string;
  aside: Line[];
  prologue: Line[];
  intro: Line[];
  topics: Topic[];
  truths: Truth[];
  tea: Line[];
  silenceHit: Line[];
  silenceMiss: Line[];
  named: Line[];
  near: Line[];
  earlyFinale: Line[];
  confess: Line[];
  epilogue: Line[];
  fail: Line[];
  missLine: string;
  poiseStart: number;
  needBreaks: number;
  poiseGate: number;
};

export type Sheet = "hear" | "point" | "shake" | "record" | "log" | "memory" | null;

export type Pending = "clear" | "fail" | null;

export type Difficulty = "rei" | "mugon" | "anshitsu";

export type LogLine = { who: Speaker; text: string };

export type Miss = { truthId: string; topicId: string };

export type Prior = {
  poise: number;
  rapport: number;
  minutes: number;
  heard: string[];
  broken: string[];
  misses: Miss[];
  follows: string[];
  partial: Record<string, number>;
  recalled: string[];
  asideUsed: boolean;
  usedTea: boolean;
  usedName: boolean;
  shioriHour: boolean;
};

export type Room = {
  poise: number;
  rapport: number;
  minutes: number;
  heard: string[];
  broken: string[];
  /** Point pairings that already missed. The same pair cannot be tried again. */
  misses: Miss[];
  /** Topics heard a second time. */
  follows: string[];
  /** Sequence lies: how many needles of brokenBy are already in. */
  partial: Record<string, number>;
  /** Truths recalled in 暗室. */
  recalled: string[];
  asideUsed: boolean;
  usedTea: boolean;
  usedName: boolean;
  shioriHour: boolean;
  undoUsed: boolean;
  prior: Prior | null;
  difficulty: Difficulty;
  queue: Line[];
  queueAt: number;
  /** How many lines of the current queue are already copied into log. */
  spoken: number;
  log: LogLine[];
  sheet: Sheet;
  pickTruth: string | null;
  pickTopic: string | null;
  pending: Pending;
  /** True while a line queue is still holding the dialogue. */
  script: boolean;
  fx: "hit" | "miss" | "half" | null;
  toast: string | null;
};

export type Phase = "title" | "select" | "help" | "prologue" | "room" | "result" | "after";

export type Resume = {
  chapterId: number;
  room: Room;
};

export type Dossier = {
  best: number;
  order: string[];
  tea: boolean;
  name: boolean;
  fails: number;
};

export type Save = {
  v: 3;
  cleared: number[];
  seen: number[];
  sound: boolean;
  /** Mid-interrogation snapshot. Null once the chapter reaches a result. */
  resume: Resume | null;
  text: 0 | 1 | 2;
  difficulty: Difficulty;
  books: Record<string, Dossier>;
  after: boolean;
};

export const SAVE_KEY = "hodoki.v1";

export const DAY_START = 14 * 60;
export const DAY_END = 19 * 60;

export const COST = {
  hear: 10,
  follow: 6,
  point: 12,
  tea: 8,
  silence: 16,
  name: 10,
  finale: 6,
  aside: 20,
  recall: 4,
} as const;

export const emptySave = (): Save => ({
  v: 3,
  cleared: [],
  seen: [],
  sound: true,
  resume: null,
  text: 1,
  difficulty: "rei",
  books: {},
  after: false,
});
