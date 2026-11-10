import type { Chapter, Difficulty, Dossier, Line, LogLine, Miss, Prior, Resume, Room, Save, Topic } from "./types";
import { COST, DAY_END, DAY_START, emptySave } from "./types";

export function clockLabel(mins: number): string {
  const clamped = Math.max(0, mins);
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}

const HOUR = 18 * 60;

export function freshRoom(ch: Chapter, difficulty: Difficulty = "rei"): Room {
  return {
    poise: ch.poiseStart,
    rapport: 18,
    minutes: DAY_START,
    heard: [],
    broken: [],
    misses: [],
    follows: [],
    partial: {},
    recalled: [],
    asideUsed: false,
    usedTea: false,
    usedName: false,
    shioriHour: false,
    undoUsed: false,
    prior: null,
    difficulty,
    queue: ch.intro,
    queueAt: 0,
    spoken: 0,
    log: [],
    sheet: null,
    pickTruth: null,
    pickTopic: null,
    pending: null,
    script: true,
    fx: null,
    toast: null,
  };
}

function clamp(n: number, a = 0, b = 100) {
  return Math.max(a, Math.min(b, n));
}

export function syncLog(room: Room): Room {
  if (room.queue.length === 0) return room;
  const upto = Math.min(room.queue.length, room.queueAt + 1);
  if (room.spoken >= upto) return room;
  const add: LogLine[] = room.queue.slice(room.spoken, upto).map((line) => ({
    who: line.who,
    text: line.text,
  }));
  return { ...room, log: [...room.log, ...add], spoken: upto };
}

function withQueue(room: Room, lines: Line[], patch: Partial<Room>): Room {
  return {
    ...room,
    ...patch,
    heard: patch.heard ?? room.heard,
    broken: patch.broken ?? room.broken,
    queue: lines,
    queueAt: 0,
    spoken: 0,
    log: room.log,
    sheet: null,
    pickTruth: null,
    pickTopic: null,
    script: true,
    toast: patch.toast ?? null,
    fx: patch.fx ?? null,
  };
}

function afterAction(room: Room, ch: Chapter, lines: Line[], patch: Partial<Room>): Room {
  let next = withQueue(room, lines, patch);
  if (next.pending === "clear") return next;
  if (next.minutes >= DAY_END) {
    return {
      ...next,
      queue: [...lines, ...ch.fail],
      pending: "fail",
      minutes: DAY_END,
      shioriHour: true,
    };
  }
  if (!next.shioriHour && next.minutes >= HOUR) {
    next = {
      ...next,
      shioriHour: true,
      queue: [
        ...next.queue,
        { who: "shiori", text: "十八時です。御影さん。残りは、針の数だけにしてください。" },
      ],
    };
  }
  return next;
}

function takePrior(room: Room): Prior {
  return {
    poise: room.poise,
    rapport: room.rapport,
    minutes: room.minutes,
    heard: room.heard,
    broken: room.broken,
    misses: room.misses ?? [],
    follows: room.follows ?? [],
    partial: room.partial ?? {},
    recalled: room.recalled ?? [],
    asideUsed: !!room.asideUsed,
    usedTea: !!room.usedTea,
    usedName: !!room.usedName,
    shioriHour: !!room.shioriHour,
  };
}

function arm(room: Room): Room {
  if (room.undoUsed) return room;
  return { ...room, prior: takePrior(room) };
}

export function currentLine(room: Room): Line | null {
  return room.queue[room.queueAt] ?? null;
}

export function advanceLine(room: Room): Room {
  const synced = syncLog(room);
  if (synced.queueAt < synced.queue.length - 1) {
    return { ...synced, queueAt: synced.queueAt + 1 };
  }
  return { ...synced, script: false };
}

export function skipScript(room: Room): Room {
  if (room.queue.length === 0) return { ...room, script: false };
  const atEnd = { ...room, queueAt: room.queue.length - 1 };
  return { ...syncLog(atEnd), script: false };
}

export function missedPair(room: Room, truthId: string, topicId: string): boolean {
  return (room.misses ?? []).some((m) => m.truthId === truthId && m.topicId === topicId);
}

export function parkedRoom(room: Room): Room {
  return { ...room, misses: room.misses ?? [], fx: null, toast: null };
}

const CHAPTER_IDS = new Set([1, 2, 3, 4, 5, 6]);

function numList(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((n): n is number => typeof n === "number" && CHAPTER_IDS.has(n));
}

function strList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is string => typeof s === "string");
}

function isLine(raw: unknown): raw is Line {
  if (!raw || typeof raw !== "object") return false;
  const line = raw as Line;
  return typeof line.who === "string" && typeof line.text === "string";
}

function isLog(raw: unknown): raw is LogLine {
  if (!raw || typeof raw !== "object") return false;
  const line = raw as LogLine;
  return typeof line.who === "string" && typeof line.text === "string";
}

function missList(raw: unknown): Miss[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (m): m is Miss =>
      !!m && typeof m === "object" && typeof m.truthId === "string" && typeof m.topicId === "string",
  );
}

function asDifficulty(raw: unknown): Difficulty {
  return raw === "mugon" || raw === "anshitsu" || raw === "rei" ? raw : "rei";
}

function partialMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "number" && value > 0) out[key] = value;
  }
  return out;
}

function priorOf(raw: unknown): Prior | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Partial<Prior>;
  if (typeof o.poise !== "number" || typeof o.minutes !== "number") return null;
  return {
    poise: o.poise,
    rapport: typeof o.rapport === "number" ? o.rapport : 18,
    minutes: o.minutes,
    heard: strList(o.heard),
    broken: strList(o.broken),
    misses: missList(o.misses),
    follows: strList(o.follows),
    partial: partialMap(o.partial),
    recalled: strList(o.recalled),
    asideUsed: !!o.asideUsed,
    usedTea: !!o.usedTea,
    usedName: !!o.usedName,
    shioriHour: !!o.shioriHour,
  };
}

function dossierOf(raw: unknown): Dossier | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Partial<Dossier>;
  if (typeof o.best !== "number") return null;
  return {
    best: o.best,
    order: strList(o.order),
    tea: !!o.tea,
    name: !!o.name,
    fails: typeof o.fails === "number" ? o.fails : 0,
  };
}

function booksOf(raw: unknown): Record<string, Dossier> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, Dossier> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!CHAPTER_IDS.has(Number(key))) continue;
    const book = dossierOf(value);
    if (book) out[key] = book;
  }
  return out;
}

function clampRoom(room: Room): Room {
  return {
    ...room,
    poise: clamp(room.poise),
    rapport: clamp(room.rapport),
    minutes: Math.max(DAY_START, Math.min(DAY_END, room.minutes)),
    misses: room.misses ?? [],
    follows: room.follows ?? [],
    partial: room.partial ?? {},
    recalled: room.recalled ?? [],
    asideUsed: !!room.asideUsed,
    usedTea: !!room.usedTea,
    usedName: !!room.usedName,
    shioriHour: !!room.shioriHour,
    undoUsed: !!room.undoUsed,
    prior: room.prior ?? null,
    difficulty: asDifficulty(room.difficulty),
    fx: null,
    toast: null,
    sheet: null,
  };
}

export function normalizeSave(raw: unknown): Save {
  const base = emptySave();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const text = o.text === 0 || o.text === 2 ? o.text : 1;
  return {
    v: 3,
    cleared: numList(o.cleared),
    seen: numList(o.seen),
    sound: typeof o.sound === "boolean" ? o.sound : true,
    resume: normalizeResume(o.resume),
    text,
    difficulty: asDifficulty(o.difficulty),
    books: booksOf(o.books),
    after: !!o.after,
  };
}

function normalizeResume(raw: unknown): Resume | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.chapterId !== "number" || !CHAPTER_IDS.has(o.chapterId)) return null;
  const room = normalizeRoom(o.room);
  if (!room) return null;
  return { chapterId: o.chapterId, room };
}

function normalizeRoom(raw: unknown): Room | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Partial<Room>;
  if (typeof o.poise !== "number" || typeof o.minutes !== "number" || !Array.isArray(o.queue)) return null;
  const queue = o.queue.filter(isLine);
  if (queue.length === 0) return null;
  return clampRoom({
    poise: o.poise,
    rapport: typeof o.rapport === "number" ? o.rapport : 18,
    minutes: o.minutes,
    heard: strList(o.heard),
    broken: strList(o.broken),
    misses: missList(o.misses),
    follows: strList(o.follows),
    partial: partialMap(o.partial),
    recalled: strList(o.recalled),
    asideUsed: !!o.asideUsed,
    usedTea: !!o.usedTea,
    usedName: !!o.usedName,
    shioriHour: !!o.shioriHour,
    undoUsed: !!o.undoUsed,
    prior: priorOf(o.prior),
    difficulty: asDifficulty(o.difficulty),
    queue,
    queueAt: typeof o.queueAt === "number" ? Math.max(0, Math.min(queue.length - 1, o.queueAt)) : 0,
    spoken: typeof o.spoken === "number" ? o.spoken : 0,
    log: Array.isArray(o.log) ? o.log.filter(isLog) : [],
    sheet: null,
    pickTruth: typeof o.pickTruth === "string" ? o.pickTruth : null,
    pickTopic: typeof o.pickTopic === "string" ? o.pickTopic : null,
    pending: o.pending === "clear" || o.pending === "fail" ? o.pending : null,
    script: Boolean(o.script),
    fx: null,
    toast: null,
  });
}

export function topicById(ch: Chapter, id: string): Topic | undefined {
  return ch.topics.find((t) => t.id === id);
}

export function truthById(ch: Chapter, id: string) {
  return ch.truths.find((t) => t.id === id);
}

export function hear(room: Room, ch: Chapter, topicId: string): Room {
  const topic = topicById(ch, topicId);
  if (!topic || room.pending) return room;
  const broken = room.broken.includes(topicId);
  const heard = room.heard.includes(topicId);
  const follows = room.follows ?? [];
  const followed = follows.includes(topicId);
  if (!heard) {
    return afterAction(room, ch, [
      { who: "ritsu", text: topic.ask },
      { who: "suspect", text: topic.claim, mood: "calm" },
    ], {
      heard: [...room.heard, topicId],
      minutes: room.minutes + COST.hear,
      rapport: clamp(room.rapport + 4),
      poise: clamp(room.poise - 2),
    });
  }
  if (broken) {
    return afterAction(room, ch, [
      { who: "ritsu", text: topic.ask },
      { who: "suspect", text: topic.admit, mood: "wary" },
    ], {
      minutes: room.minutes + COST.follow,
    });
  }
  if (!followed) {
    return afterAction(room, ch, [
      { who: "ritsu", text: `先の言葉の、角だけ。${topic.short}` },
      { who: "suspect", text: topic.evade, mood: "wary" },
      { who: "mind", text: "角は増えた。糸は、まだ刺さらない。" },
    ], {
      follows: [...follows, topicId],
      minutes: room.minutes + COST.follow,
      rapport: clamp(room.rapport + 2),
    });
  }
  return afterAction(room, ch, [
    { who: "ritsu", text: topic.ask },
    { who: "suspect", text: topic.evade, mood: "wary" },
  ], {
    minutes: room.minutes + COST.follow,
  });
}

function missPoint(room: Room, ch: Chapter, truthLabel: string, topic: Topic, truthId: string, topicId: string): Room {
  const text = topic.lie ? ch.missLine : topic.onTrue;
  return afterAction(room, ch, [
    { who: "ritsu", text: `この件だ。${truthLabel}。` },
    { who: "suspect", text, mood: "wary" },
    { who: "mind", text: "……別の糸だ。余裕を、返してしまった。" },
  ], {
    minutes: room.minutes + COST.point,
    poise: clamp(room.poise + 18),
    rapport: clamp(room.rapport - 10),
    misses: [...(room.misses ?? []), { truthId, topicId }],
    fx: "miss",
  });
}

export function point(room: Room, ch: Chapter, truthId: string, topicId: string): Room {
  const topic = topicById(ch, topicId);
  const truth = truthById(ch, truthId);
  if (!topic || !truth || room.pending) return room;
  if (!room.heard.includes(topicId)) {
    return { ...room, toast: "まだ、その言い分は聴いていない。", sheet: "point" };
  }
  if (room.broken.includes(topicId)) {
    return { ...room, toast: "そこは、もうほどけている。", sheet: "point" };
  }
  if (!truthKnown(room, truthId)) {
    return { ...room, toast: "その糸は、まだ手繰っていない。", sheet: "point" };
  }
  if (missedPair(room, truthId, topicId)) {
    return { ...room, toast: "その突きは、もう外している。", sheet: "point" };
  }

  const armed = arm(room);
  const sequence = !!topic.sequence && topic.brokenBy.length > 1;
  const step = armed.partial?.[topicId] ?? 0;

  if (sequence) {
    const nextId = topic.brokenBy[step];
    if (truthId === nextId && step + 1 < topic.brokenBy.length) {
      return afterAction(armed, ch, [
        { who: "ritsu", text: `半針だ。${truth.label}。まだ、一本足りない。` },
        { who: "suspect", text: "……そこだけは、認めます。続きは、まだです。", mood: "wary" },
        { who: "mind", text: "半分だけ、ほどけた。同じ言い分に、次の糸を。" },
      ], {
        minutes: room.minutes + COST.point,
        poise: clamp(room.poise - 8),
        partial: { ...(armed.partial ?? {}), [topicId]: step + 1 },
        fx: "half",
      });
    }
    if (truthId !== nextId && topic.brokenBy.includes(truthId)) {
      return afterAction(armed, ch, [
        { who: "ritsu", text: `${truth.label}。順番が、先だ。` },
        { who: "suspect", text: "……それは、まだ出す話じゃありません。", mood: "wary" },
        { who: "mind", text: "当たりの糸だ。ただし、後の一本だ。" },
      ], {
        minutes: room.minutes + COST.point,
        poise: clamp(room.poise + 4),
        fx: "miss",
      });
    }
    if (truthId !== nextId) return missPoint(armed, ch, truth.label, topic, truthId, topicId);
  } else if (!(topic.lie && topic.brokenBy.includes(truthId))) {
    return missPoint(armed, ch, truth.label, topic, truthId, topicId);
  }

  return afterAction(armed, ch, [
    { who: "ritsu", text: `一つ、噛み合わない。${truth.label}の話だ。` },
    ...topic.onBreak,
  ], {
    broken: [...room.broken, topicId],
    minutes: room.minutes + COST.point,
    poise: clamp(room.poise - 16),
    rapport: clamp(room.rapport - 4),
    partial: { ...(armed.partial ?? {}), [topicId]: topic.brokenBy.length },
    fx: "hit",
  });
}

export type ShakeKind = "tea" | "silence" | "name" | "finale";

export function shake(room: Room, ch: Chapter, kind: ShakeKind): Room {
  if (room.pending) return room;

  if (kind === "tea") {
    return afterAction(arm(room), ch, ch.tea, {
      minutes: room.minutes + COST.tea,
      poise: clamp(room.poise + 10),
      rapport: clamp(room.rapport + 16),
      usedTea: true,
    });
  }

  if (kind === "silence") {
    const hit = room.rapport >= 25 && room.poise <= 70;
    return afterAction(arm(room), ch, hit ? ch.silenceHit : ch.silenceMiss, {
      minutes: room.minutes + COST.silence,
      poise: clamp(room.poise + (hit ? -18 : 4)),
      rapport: clamp(room.rapport + (hit ? 4 : -2)),
    });
  }

  if (kind === "name") {
    if (room.broken.length < 1) {
      return { ...room, toast: "まだ早い。一つほどいてから、名を出せ。", sheet: "shake" };
    }
    return afterAction(arm(room), ch, ch.named, {
      minutes: room.minutes + COST.name,
      poise: clamp(room.poise - 18),
      rapport: clamp(room.rapport - 6),
      usedName: true,
    });
  }

  if (room.broken.length < ch.needBreaks) {
    return afterAction(arm(room), ch, ch.earlyFinale, {
      minutes: room.minutes + COST.finale,
      poise: clamp(room.poise + 4),
    });
  }
  if (room.poise > ch.poiseGate) {
    return afterAction(arm(room), ch, ch.near, {
      minutes: room.minutes + COST.finale,
      poise: clamp(room.poise - 12),
    });
  }
  return afterAction(arm(room), ch, [...ch.confess, ...ch.epilogue], {
    minutes: Math.min(DAY_END, room.minutes + COST.finale),
    poise: clamp(room.poise - 20),
    pending: "clear",
    fx: "hit",
  });
}

export function coachText(ch: Chapter, room: Room): string | null {
  if (room.pending) return null;
  const misses = room.misses ?? [];
  const half = Object.entries(room.partial ?? {}).some(([id, n]) => n > 0 && !room.broken.includes(id));
  if (room.heard.length === 0) return "まずは聴き取り。言い訳を、一つ残せ。";
  if (room.broken.length === 0 && misses.length > 0) {
    return "外した突きは残っている。同じ組み合わせは、もう刺さらない。";
  }
  if (half) return "半針が残っている。同じ言い分に、次の糸を。";
  if (room.broken.length === 0) return "綻びで、見たことと言い分を重ねる。外すと余裕が戻る。";
  if (room.broken.length < ch.needBreaks) {
    return `ほどいたのは ${room.broken.length}／${ch.needBreaks}。もう少し、糸を選べ。`;
  }
  if (room.poise > ch.poiseGate) return "芯は見えた。余裕が落ちるまで、お茶は逆効果だ。";
  return "もう一つだけ。そこで、完落ちさせろ。";
}

export function truthKnown(room: Room, truthId: string): boolean {
  return room.difficulty !== "anshitsu" || (room.recalled ?? []).includes(truthId);
}

export function sceneOf(ch: Chapter, truthId: string): string {
  return ch.prologue.find((line) => line.reveal === truthId)?.text ?? "";
}

export function shioriNote(room: Room, topicId: string): string | null {
  if (room.broken.length < 1) return null;
  if (room.broken.includes(topicId)) return "言葉が、最初と違います。";
  if ((room.misses ?? []).some((m) => m.topicId === topicId)) return "この一文は、さっきの糸とまだ噛んでいない。";
  if (room.heard.includes(topicId)) return "最初の一文のまま。";
  return null;
}

export function confessionText(ch: Chapter, room: Room): string {
  const mins = Math.max(0, room.minutes - DAY_START);
  const order = room.broken.map((id) => ch.topics.find((t) => t.id === id)?.label ?? id).join("、");
  return [`ほどき・${ch.no} ${ch.title}`, ch.culprit.name, `所要 ${mins} 分`, `ほどいた順：${order || "なし"}`, "完落ち"].join("\n");
}

export function noteResult(save: Save, chapterId: number, room: Room, pending: "clear" | "fail"): Save {
  const key = String(chapterId);
  const prev = save.books[key];
  const elapsed = Math.max(0, room.minutes - DAY_START);
  const next: Dossier =
    pending === "clear"
      ? {
          best: prev && prev.best > 0 ? Math.min(prev.best, elapsed) : elapsed,
          order: room.broken,
          tea: !!room.usedTea,
          name: !!room.usedName,
          fails: prev?.fails ?? 0,
        }
      : {
          best: prev?.best ?? 0,
          order: prev?.order ?? [],
          tea: prev?.tea ?? false,
          name: prev?.name ?? false,
          fails: (prev?.fails ?? 0) + 1,
        };
  return { ...save, books: { ...save.books, [key]: next } };
}

export function recall(room: Room, ch: Chapter, truthId: string): Room {
  if (room.pending) return room;
  const truth = truthById(ch, truthId);
  if (!truth) return room;
  if (room.difficulty !== "anshitsu") return room;
  if ((room.recalled ?? []).includes(truthId)) {
    return { ...room, toast: "その糸は、もう手繰ってある。", sheet: "memory" };
  }
  return afterAction(room, ch, [{ who: "mind", text: `${truth.label}。もう一度、手繰った。` }], {
    minutes: room.minutes + COST.recall,
    recalled: [...(room.recalled ?? []), truthId],
  });
}

export function aside(room: Room, ch: Chapter): Room {
  if (room.pending) return room;
  if (room.asideUsed) return { ...room, toast: "別室は、もう閉じた。", sheet: "shake" };
  return afterAction(arm(room), ch, ch.aside, {
    minutes: room.minutes + COST.aside,
    asideUsed: true,
  });
}

export function glance(room: Room, ch: Chapter): Room {
  if (room.pending) return room;
  const left = Math.max(0, DAY_END - room.minutes);
  const need = Math.max(0, ch.needBreaks - room.broken.length);
  return afterAction(room, ch, [
    { who: "shiori", text: `いま ${clockLabel(room.minutes)}。ほどけていない芯は ${need}。十九時まで ${left} 分。` },
    { who: "mind", text: "針は、動いていない。見ただけだ。" },
  ], room.minutes >= HOUR ? { shioriHour: true } : {});
}

export function undo(room: Room): Room {
  if (room.pending || room.script) return room;
  if (room.undoUsed || !room.prior) {
    return {
      ...room,
      toast: room.undoUsed ? "取り消せるのは、一針だけだ。" : "戻す問いは、まだない。",
      sheet: "shake",
    };
  }
  const prior = room.prior;
  return withQueue({ ...room, ...prior, prior: null, undoUsed: true }, [
    { who: "ritsu", text: "失礼。先の問いは、取り消す。" },
    { who: "suspect", text: "……ええ。なかったことに、しますか。", mood: "wary" },
    { who: "mind", text: "一針、戻した。次は、ない。" },
  ], { minutes: prior.minutes });
}
