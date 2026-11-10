import { useEffect, useReducer, useState } from "react";
import { chapters, chapterById, afterScript } from "@/game/chapters";
import {
  advanceLine,
  aside,
  clockLabel,
  coachText,
  confessionText,
  currentLine,
  freshRoom,
  glance,
  hear,
  missedPair,
  normalizeSave,
  noteResult,
  parkedRoom,
  point,
  recall,
  sceneOf,
  shake,
  shioriNote,
  skipScript,
  syncLog,
  truthById,
  truthKnown,
  undo,
  type ShakeKind,
} from "@/game/logic";
import { playFx, setSoundEnabled, unlockAudio } from "@/game/audio";
import type { Chapter, Difficulty, Line, Pending, Phase, Room, Save, Sheet, Speaker } from "@/game/types";
import { COST, SAVE_KEY, emptySave } from "@/game/types";

type State = {
  booted: boolean;
  phase: Phase;
  chapterId: number;
  proI: number;
  save: Save;
  room: Room | null;
  result: Pending;
};

type Action =
  | { type: "boot"; save: Save }
  | { type: "phase"; phase: Phase }
  | { type: "start"; id: number }
  | { type: "skip-pro" }
  | { type: "pro-next" }
  | { type: "enter" }
  | { type: "advance" }
  | { type: "skip" }
  | { type: "sync" }
  | { type: "sheet"; sheet: Sheet }
  | { type: "pick-truth"; id: string }
  | { type: "pick-topic"; id: string }
  | { type: "hear"; id: string }
  | { type: "point" }
  | { type: "shake"; kind: ShakeKind }
  | { type: "recall"; id: string }
  | { type: "aside" }
  | { type: "glance" }
  | { type: "undo" }
  | { type: "text" }
  | { type: "difficulty"; difficulty: Difficulty }
  | { type: "after" }
  | { type: "after-next" }
  | { type: "after-done" }
  | { type: "park" }
  | { type: "resume" }
  | { type: "restart"; id: number }
  | { type: "clear-fx" }
  | { type: "clear-toast" }
  | { type: "result" }
  | { type: "sound" };

const initial: State = {
  booted: true,
  phase: "title",
  chapterId: 1,
  proI: 0,
  save: emptySave(),
  room: null,
  result: null,
};

function persist(save: Save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* private mode */
  }
}

function withSeen(save: Save, id: number): Save {
  if (save.seen.includes(id)) return save;
  return { ...save, seen: [...save.seen, id] };
}

function withClear(save: Save, id: number): Save {
  if (save.cleared.includes(id)) return save;
  return { ...save, cleared: [...save.cleared, id] };
}

function reduce(state: State, action: Action): State {
  const ch = chapterById(state.chapterId);
  switch (action.type) {
    case "boot":
      return { ...state, booted: true, save: normalizeSave(action.save) };
    case "phase":
      return { ...state, phase: action.phase };
    case "start":
      return { ...state, phase: "prologue", chapterId: action.id, proI: 0, room: null, result: null };
    case "restart": {
      const save =
        state.save.resume?.chapterId === action.id ? { ...state.save, resume: null } : state.save;
      persist(save);
      return { ...state, save, phase: "prologue", chapterId: action.id, proI: 0, room: null, result: null };
    }
    case "resume": {
      const resume = state.save.resume;
      if (!resume) return state;
      return {
        ...state,
        phase: "room",
        chapterId: resume.chapterId,
        proI: 0,
        room: parkedRoom(resume.room),
        result: null,
      };
    }
    case "park": {
      if (state.phase !== "room" || !state.room) return state;
      const room = parkedRoom(state.room);
      const prev = state.save.resume;
      if (prev && prev.chapterId === state.chapterId && JSON.stringify(prev.room) === JSON.stringify(room)) {
        return state;
      }
      const save = { ...state.save, resume: { chapterId: state.chapterId, room } };
      persist(save);
      return { ...state, save };
    }
    case "skip-pro": {
      const room = freshRoom(chapterById(state.chapterId), state.save.difficulty);
      const save = {
        ...withSeen(state.save, state.chapterId),
        resume: { chapterId: state.chapterId, room },
      };
      persist(save);
      return { ...state, save, phase: "room", room, result: null };
    }
    case "pro-next": {
      const len = ch.prologue.length;
      if (state.proI < len - 1) return { ...state, proI: state.proI + 1 };
      return state;
    }
    case "enter": {
      const room = freshRoom(ch, state.save.difficulty);
      const save = { ...withSeen(state.save, state.chapterId), resume: { chapterId: state.chapterId, room } };
      persist(save);
      return { ...state, save, phase: "room", room };
    }
    case "advance": {
      if (!state.room) return state;
      return { ...state, room: advanceLine(state.room) };
    }
    case "skip": {
      if (!state.room) return state;
      return { ...state, room: skipScript(state.room) };
    }
    case "sync": {
      if (!state.room) return state;
      const room = syncLog(state.room);
      if (room === state.room) return state;
      return { ...state, room };
    }
    case "sheet":
      if (!state.room || state.room.script) return state;
      return {
        ...state,
        room: {
          ...state.room,
          sheet: state.room.sheet === action.sheet ? null : action.sheet,
          toast: null,
          pickTruth: null,
          pickTopic: null,
        },
      };
    case "pick-truth":
      if (!state.room) return state;
      return { ...state, room: { ...state.room, pickTruth: action.id, toast: null } };
    case "pick-topic":
      if (!state.room) return state;
      return { ...state, room: { ...state.room, pickTopic: action.id, toast: null } };
    case "hear":
      if (!state.room) return state;
      return { ...state, room: hear(state.room, ch, action.id) };
    case "point": {
      if (!state.room?.pickTruth || !state.room.pickTopic) return state;
      return { ...state, room: point(state.room, ch, state.room.pickTruth, state.room.pickTopic) };
    }
    case "shake":
      if (!state.room) return state;
      return { ...state, room: shake(state.room, ch, action.kind) };
    case "recall":
      if (!state.room) return state;
      return { ...state, room: recall(state.room, ch, action.id) };
    case "aside":
      if (!state.room) return state;
      return { ...state, room: aside(state.room, ch) };
    case "glance":
      if (!state.room) return state;
      return { ...state, room: glance(state.room, ch) };
    case "undo":
      if (!state.room) return state;
      return { ...state, room: undo(state.room) };
    case "text": {
      const text = ((state.save.text + 1) % 3) as 0 | 1 | 2;
      const save = { ...state.save, text };
      persist(save);
      return { ...state, save };
    }
    case "difficulty": {
      const save = { ...state.save, difficulty: action.difficulty };
      persist(save);
      return { ...state, save };
    }
    case "after":
      return { ...state, phase: "after", proI: 0, room: null, result: null };
    case "after-next":
      if (state.proI < afterScript.length - 1) return { ...state, proI: state.proI + 1 };
      return state;
    case "after-done": {
      const save = { ...state.save, after: true };
      persist(save);
      return { ...state, save, phase: "select" };
    }
    case "clear-fx":
      if (!state.room?.fx) return state;
      return { ...state, room: { ...state.room, fx: null } };
    case "clear-toast":
      if (!state.room?.toast) return state;
      return { ...state, room: { ...state.room, toast: null } };
    case "result": {
      if (!state.room?.pending) return state;
      const pending = state.room.pending;
      let save = pending === "clear" ? withClear(state.save, state.chapterId) : state.save;
      save = noteResult(save, state.chapterId, state.room, pending);
      if (save.resume?.chapterId === state.chapterId) save = { ...save, resume: null };
      persist(save);
      return { ...state, save, phase: "result", result: pending };
    }
    case "sound": {
      const save = { ...state.save, sound: !state.save.sound };
      persist(save);
      return { ...state, save };
    }
    default:
      return state;
  }
}

const SLIDES = chapters.flatMap((c) => [c.culprit.img, c.accomplice.img]);

function whoLabel(who: Speaker, ch: Chapter): string {
  switch (who) {
    case "n":
      return "叙述";
    case "ritsu":
      return "御影 律";
    case "mind":
      return "律の胸中";
    case "suspect":
      return ch.culprit.name;
    case "shiori":
      return "尺田 栞";
    case "accomplice":
      return ch.accomplice.name;
  }
}

function lineFace(line: Line | null, ch: Chapter, room: Room) {
  const face = line?.face ?? "culprit";
  return face === "accomplice" ? ch.accomplice : ch.culprit;
}

function baseMood(ch: Chapter, room: Room): Line["mood"] {
  if (room.pending === "clear" || room.poise <= 18) return "break";
  if (room.poise <= ch.poiseGate) return "shaken";
  if (room.broken.length > 0) return "wary";
  return "calm";
}

export function HodokiApp() {
  const [state, dispatch] = useReducer(reduce, initial);
  const [slide, setSlide] = useState(0);
  const [typed, setTyped] = useState(0);
  const [copied, setCopied] = useState(false);
  const ch = chapterById(state.chapterId);
  const sized = `text-size-${state.save.text}`;

  useEffect(() => {
    let save = emptySave();
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) save = normalizeSave(JSON.parse(raw));
    } catch {
      save = emptySave();
    }
    setSoundEnabled(save.sound);
    dispatch({ type: "boot", save });
  }, []);

  useEffect(() => {
    setSoundEnabled(state.save.sound);
  }, [state.save.sound]);

  useEffect(() => {
    if (state.phase !== "room" || !state.room) return;
    const room = parkedRoom(state.room);
    const prev = state.save.resume;
    if (prev && prev.chapterId === state.chapterId && JSON.stringify(prev.room) === JSON.stringify(room)) return;
    dispatch({ type: "park" });
  }, [state.phase, state.room, state.chapterId, state.save.resume]);

  useEffect(() => {
    if (state.phase !== "title") return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;
    const id = window.setInterval(() => setSlide((n) => (n + 1) % SLIDES.length), 2800);
    return () => window.clearInterval(id);
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== "room" || !state.room) return;
    dispatch({ type: "sync" });
  }, [state.phase, state.room?.queueAt, state.room?.spoken, state.room?.queue]);

  useEffect(() => {
    if (!state.room?.fx) return;
    const fx = state.room.fx;
    playFx(fx === "hit" ? "hit" : fx === "half" ? "half" : "miss");
    if (state.room.pending === "clear") playFx("clear");
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(fx === "miss" ? 40 : fx === "half" ? [10, 30, 10] : [16, 40, 20]);
    }
    const id = window.setTimeout(() => dispatch({ type: "clear-fx" }), 1200);
    return () => window.clearTimeout(id);
  }, [state.room?.fx]);

  useEffect(() => {
    if (!state.room?.toast) return;
    const id = window.setTimeout(() => dispatch({ type: "clear-toast" }), 2400);
    return () => window.clearTimeout(id);
  }, [state.room?.toast]);

  const line = state.room ? currentLine(state.room) : null;
  const lineText = line?.text ?? "";

  useEffect(() => {
    setTyped(0);
    if (!lineText) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setTyped(lineText.length);
      return;
    }
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setTyped(i);
      if (i >= lineText.length) window.clearInterval(id);
    }, 24);
    return () => window.clearInterval(id);
  }, [lineText, state.room?.queueAt, state.phase]);

  function tapUnlock() {
    unlockAudio();
  }

  function onDialogue() {
    tapUnlock();
    if (!state.room || !line) return;
    if (typed < lineText.length) {
      setTyped(lineText.length);
      return;
    }
    if (state.room.script) {
      dispatch({ type: "advance" });
      return;
    }
    if (state.room.pending) dispatch({ type: "result" });
  }

  if (state.phase === "title") {
    return (
      <main className={`title-wrap ${sized}`} onPointerDown={tapUnlock}>
        <div className="title-slides" aria-hidden="true">
          {SLIDES.map((src, i) => (
            <img key={src} src={src} alt="" className={i === slide ? "on" : ""} />
          ))}
        </div>
        <div className="title-shade" />
        <div className="title-copy">
          <p className="kicker">白珠警察署・取調室二号</p>
          <h1 className="wordmark">
            ほどき
            <small>隠蔽のあとで・全六章</small>
          </h1>
          <p className="lede">
            犯行は、もう終わっている。隠蔽も、あなたは見た。あとは取調室で、礼儀正しく、一針ずつ。
          </p>
        </div>
        <div className="title-actions">
          <button className="btn btn-primary" type="button" onClick={() => dispatch({ type: "phase", phase: "select" })}>
            事件簿を開く
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => dispatch({ type: "phase", phase: "help" })}>
            手引き
          </button>
        </div>
      </main>
    );
  }

  if (state.phase === "help") {
    return (
      <main className={`screen ${sized}`}>
        <div className="screen-inner help-block">
          <div className="top-row">
            <h1>手引き</h1>
            <button className="btn btn-ghost" type="button" onClick={() => dispatch({ type: "phase", phase: "title" })}>
              戻る
            </button>
          </div>
          <ol>
            <li>
              <b>一</b>
              <span>隠蔽を見る。犯人が隠し終えるまで、あなたはそこにいる。真実の糸が残る。</span>
            </li>
            <li>
              <b>二</b>
              <span>聴き取りで言い分を記録する。嘘も本当も、まずは聴く。十分かかる。</span>
            </li>
            <li>
              <b>三</b>
              <span>綻びで、糸を一つ、言い分へ突きつける。噛み合えば供述が剥がれる。外すと、相手は余裕を取り戻す。</span>
            </li>
            <li>
              <b>四</b>
              <span>揺さぶり。お茶は安心させ、沈黙と共犯の名は余裕を削る。お茶のあとに黙ると、効きやすい。</span>
            </li>
            <li>
              <b>五</b>
              <span>もう一つだけ。核心がほどけ、余裕が落ちたときだけ、完落ちする。</span>
            </li>
            <li>
              <b>六</b>
              <span>十九時までに落ちなければ、彼女は礼をして帰る。隠した順に、もう一度。</span>
            </li>
          </ol>
          <p>
            怒鳴らなくていい。御影 律は、礼儀のほうを武器にする。取調の途中は事件簿に残る。外した突きは、二度刺さらない。二度目の聴き取りは六分。四章からは、二本揃わないとほどけない嘘がある。別室は一度。暗室では、記憶で糸を手繰る。取り消せるのは、一針だけ。
          </p>
        </div>
      </main>
    );
  }

  if (state.phase === "select") {
    return (
      <main className={`screen ${sized}`}>
        <div className="screen-inner">
          <div className="top-row">
            <h1>事件簿</h1>
            <button className="btn btn-ghost" type="button" onClick={() => dispatch({ type: "phase", phase: "title" })}>
              戻る
            </button>
          </div>
          <div className="diff-row" role="group" aria-label="礼法">
            {(
              [
                ["rei", "礼"],
                ["mugon", "無言"],
                ["anshitsu", "暗室"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={state.save.difficulty === id ? "btn on" : "btn btn-ghost"}
                type="button"
                onClick={() => dispatch({ type: "difficulty", difficulty: id })}
              >
                {label}
              </button>
            ))}
            <p>礼は胸中あり。無言は胸中なし。暗室は糸の名を、手繰るまで隠す。次の取調から。</p>
          </div>
          <div className="chapter-grid">
            {chapters.map((c) => {
              const parked = state.save.resume?.chapterId === c.id ? state.save.resume : null;
              return (
                <article key={c.id} className="chapter-card">
                  <img src={c.culprit.img} alt="" />
                  <div>
                    <button
                      className="chapter-open"
                      type="button"
                      onClick={() => dispatch(parked ? { type: "resume" } : { type: "start", id: c.id })}
                    >
                      <span className="no">{c.no}</span>
                      <h2>{c.title}</h2>
                      <p>{c.blurb}</p>
                      {state.save.cleared.includes(c.id) ? <span className="cleared-tag">完落ち</span> : null}
                      {state.save.books[String(c.id)]?.best ? (
                        <span className="resume-tag">最短 {state.save.books[String(c.id)].best}分</span>
                      ) : null}
                      {parked ? (
                        <span className="resume-tag">取調の途中 · {clockLabel(parked.room.minutes)}</span>
                      ) : null}
                      <span className="open-label">{parked ? "取調に戻る" : "隠蔽から"}</span>
                    </button>
                    {parked ? (
                      <button className="btn btn-ghost card-redo" type="button" onClick={() => dispatch({ type: "restart", id: c.id })}>
                        やり直す
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
          {state.save.cleared.length >= chapters.length ? (
            <button className="btn btn-primary btn-block" type="button" onClick={() => dispatch({ type: "after" })}>
              白珠のあと{state.save.after ? "・もう一度" : ""}
            </button>
          ) : null}
        </div>
      </main>
    );
  }

  if (state.phase === "after") {
    const beat = afterScript[state.proI];
    const last = state.proI >= afterScript.length - 1;
    return (
      <main className={`screen ${sized}`}>
        <div className="screen-inner help-block">
          <div className="top-row">
            <h1>白珠のあと</h1>
            <button className="btn btn-ghost" type="button" onClick={() => dispatch({ type: "phase", phase: "select" })}>
              事件簿
            </button>
          </div>
          <button className="dialogue after-line" type="button" onClick={() => dispatch({ type: "after-next" })}>
            <span className={`who ${beat?.who ?? "n"}`}>{beat ? whoLabel(beat.who, ch) : ""}</span>
            <p className="txt">{beat?.text}</p>
          </button>
          {last ? (
            <button className="btn btn-primary btn-block" type="button" onClick={() => dispatch({ type: "after-done" })}>
              灯を落とす
            </button>
          ) : null}
        </div>
      </main>
    );
  }

  if (state.phase === "prologue") {
    const beat = ch.prologue[state.proI];
    const last = state.proI >= ch.prologue.length - 1;
    const seen = state.save.seen.includes(ch.id);
    const truth = beat?.reveal ? truthById(ch, beat.reveal) : undefined;
    const face = beat?.face === "accomplice" ? ch.accomplice : ch.culprit;
    return (
      <main className={`pro-stage ${sized}`} onPointerDown={tapUnlock}>
        <img src={face.img} alt="" />
        <div className="stage-vignette" />
        <div className="pro-top">
          <button className="icon-btn" type="button" onClick={() => dispatch({ type: "phase", phase: "select" })}>
            事件簿
          </button>
          <span className="chap-name">
            {ch.no} {ch.title}
          </span>
          {seen ? (
            <button className="icon-btn" type="button" onClick={() => dispatch({ type: "skip-pro" })}>
              取調へ
            </button>
          ) : (
            <span className="icon-btn">
              {state.proI + 1}/{ch.prologue.length}
            </span>
          )}
        </div>
        <div className="pro-dialogue">
          <button className="dialogue" type="button" onClick={() => dispatch({ type: "pro-next" })}>
            <span className={`who ${beat?.who ?? "n"}`}>{beat ? whoLabel(beat.who, ch) : ""}</span>
            <p className="txt">{beat?.text}</p>
            {truth ? <p className="thread-pop">糸を手繰った・{truth.label}</p> : null}
            {!last ? <span className="nxt">つづき</span> : null}
          </button>
          {last ? (
            <button className="btn btn-primary btn-block" type="button" onClick={() => dispatch({ type: "enter" })}>
              取調室へ
            </button>
          ) : null}
        </div>
      </main>
    );
  }

  if (state.phase === "result") {
    const cleared = state.result === "clear";
    const mins = state.room ? state.room.minutes - 14 * 60 : 0;
    return (
      <main className={`screen ${sized}`}>
        <div className={`result ${cleared ? "" : "fail"}`}>
          <p className="kicker">{ch.no}</p>
          <p className="seal-word">{cleared ? "完落ち" : "不起訴方向"}</p>
          <h2>{ch.title}</h2>
          <p className="lede">
            {cleared
              ? `${ch.culprit.name}は、隠した順に話し終えた。所要 ${mins} 分。`
              : "十九時。糸は残ったまま、彼女は礼をして出ていった。"}
          </p>
          {cleared && state.room ? (
            <div className="dossier">
              <h3>供述の骨</h3>
              <ul>
                {ch.topics
                  .filter((t) => state.room?.broken.includes(t.id))
                  .map((t) => (
                    <li key={t.id}>
                      {t.label} — {t.admitShort}
                    </li>
                  ))}
              </ul>
              <pre className="card-copy">{confessionText(ch, state.room)}</pre>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  const text = confessionText(ch, state.room!);
                  void navigator.clipboard?.writeText(text).then(
                    () => setCopied(true),
                    () => setCopied(false),
                  );
                }}
              >
                {copied ? "写した" : "供述を写す"}
              </button>
            </div>
          ) : null}
          <div className="title-actions">
            <button className="btn btn-primary" type="button" onClick={() => dispatch({ type: "phase", phase: "select" })}>
              事件簿へ
            </button>
            <button className="btn" type="button" onClick={() => dispatch({ type: "start", id: ch.id })}>
              隠蔽から
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!state.room) return <main className={`screen ${sized}`} />;

  const room = state.room;
  const shown = lineText.slice(0, typed);
  const typedDone = typed >= lineText.length;
  const person = lineFace(line, ch, room);
  const mood = line?.mood ?? baseMood(ch, room);
  const tip =
    !room.script && room.difficulty === "rei" && !state.save.cleared.includes(state.chapterId)
      ? coachText(ch, room)
      : null;
  const urgent = room.minutes >= 18 * 60;

  return (
    <main className={room.sheet ? `room has-sheet ${sized}` : `room ${sized}`} onPointerDown={tapUnlock}>
      <header className="room-head">
        <button className="icon-btn" type="button" onClick={() => dispatch({ type: "phase", phase: "select" })}>
          戻る
        </button>
        <span className="chap-name">{ch.title}</span>
        <span className="case-name">{ch.caseName}</span>
        <span className={urgent ? "clock urgent" : "clock"}>{clockLabel(room.minutes)}</span>
        <button
          className="icon-btn"
          type="button"
          onClick={() => dispatch({ type: "text" })}
          aria-label="文字の大きさ"
        >
          {state.save.text === 0 ? "文小" : state.save.text === 2 ? "文大" : "文"}
        </button>
        <button
          className="icon-btn"
          type="button"
          onClick={() => dispatch({ type: "sound" })}
          aria-label={state.save.sound ? "音を切る" : "音を入れる"}
        >
          {state.save.sound ? "音" : "静"}
        </button>
      </header>
      <div className="meters" aria-label="被疑者の状態">
        <div className="meter">
          <span>余裕</span>
          <div className="track">
            <span style={{ width: `${room.poise}%` }} />
          </div>
          <b>{room.poise}</b>
        </div>
        <div className="meter">
          <span>聞き耳</span>
          <div className="track thread">
            <span style={{ width: `${room.rapport}%` }} />
          </div>
          <b>{room.rapport}</b>
        </div>
      </div>
      <section className={`stage mood-${mood ?? "calm"}`} aria-label={person.name}>
        <img src={person.img} alt="" />
        <div className="stage-vignette" />
        <div className={room.poise <= ch.poiseGate ? "lamp on" : "lamp"} />
        <div className="nameplate">
          <b>{person.name}</b>
          <small>
            {person.ruby} ・ {person.role}
            {person === ch.accomplice ? " ・ 別室の名" : ""}
          </small>
        </div>
        {room.fx === "hit" ? <div className="stamp stamp-hit">綻び</div> : null}
        {room.fx === "half" ? <div className="stamp stamp-half">半針</div> : null}
        {room.fx === "miss" ? <div className="stamp stamp-miss">綻びず</div> : null}
      </section>
      <div
        className="dialogue"
        role="button"
        tabIndex={0}
        onClick={onDialogue}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onDialogue();
          }
        }}
      >
        <span className={`who ${line?.who ?? "n"}`}>{line ? whoLabel(line.who, ch) : ""}</span>
        <p className="txt">{shown}</p>
        {room.script && typedDone ? <span className="nxt">つづき</span> : null}
        {room.script ? (
          <button
            className="skip"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              dispatch({ type: "skip" });
            }}
          >
            送る
          </button>
        ) : null}
      </div>
      {tip && !room.script ? <p className="coach">{tip}</p> : null}
      <nav className="commands" aria-label="取調">
        <button className="cmd" type="button" disabled={room.script} onClick={() => dispatch({ type: "sheet", sheet: "hear" })}>
          <b>聴き取り</b>
          <small>{COST.hear}分</small>
        </button>
        <button
          className={room.sheet === "point" ? "cmd on" : "cmd"}
          type="button"
          disabled={room.script}
          onClick={() => dispatch({ type: "sheet", sheet: "point" })}
        >
          <b>綻び</b>
          <small>
            {room.broken.length}/{ch.needBreaks} ・ {COST.point}分
          </small>
        </button>
        <button className="cmd" type="button" disabled={room.script} onClick={() => dispatch({ type: "sheet", sheet: "shake" })}>
          <b>揺さぶり</b>
          <small>茶・沈黙・名</small>
        </button>
        <button className="cmd finale" type="button" disabled={room.script} onClick={() => dispatch({ type: "shake", kind: "finale" })}>
          <b>もう一つだけ</b>
          <small>
            余裕{ch.poiseGate}以下 ・ ほどき{ch.needBreaks}
          </small>
        </button>
      </nav>
      {room.sheet ? (
        <>
          <button className="sheet-back" type="button" aria-label="閉じる" onClick={() => dispatch({ type: "sheet", sheet: room.sheet })} />
          <aside className="sheet">
            <header>
              <h2>
                {room.sheet === "hear"
                  ? "聴き取り"
                  : room.sheet === "point"
                    ? "綻び"
                    : room.sheet === "shake"
                      ? "揺さぶり"
                      : room.sheet === "record"
                        ? "調書"
                        : room.sheet === "memory"
                          ? "隠蔽の記憶"
                          : "履歴"}
              </h2>
              <button className="icon-btn" type="button" onClick={() => dispatch({ type: "sheet", sheet: "memory" })}>
                記憶
              </button>
              <button className="icon-btn" type="button" onClick={() => dispatch({ type: "sheet", sheet: "record" })}>
                調書
              </button>
              <button className="icon-btn" type="button" onClick={() => dispatch({ type: "sheet", sheet: "log" })}>
                履歴
              </button>
              <button className="icon-btn" type="button" onClick={() => dispatch({ type: "sheet", sheet: room.sheet })}>
                閉じる
              </button>
            </header>
            <div className="sheet-body">
              {room.sheet === "hear" ? (
                ch.topics.map((t) => {
                  const followed = (room.follows ?? []).includes(t.id);
                  return (
                    <button key={t.id} className="row" type="button" onClick={() => dispatch({ type: "hear", id: t.id })}>
                      <span className="lbl">
                        {t.label}
                        {room.broken.includes(t.id) ? <span className="broken-mark">ほどけた</span> : null}
                        {!room.broken.includes(t.id) && room.heard.includes(t.id) ? (
                          <span className="kind">{followed ? `再 ${COST.follow}分` : `追い ${COST.follow}分`}</span>
                        ) : null}
                      </span>
                      <span className="sub">
                        {room.broken.includes(t.id) ? t.admitShort : room.heard.includes(t.id) ? t.short : "まだ聴いていない"}
                      </span>
                    </button>
                  );
                })
              ) : null}
              {room.sheet === "point" ? (
                <>
                  <p className="sheet-note">糸を一つ選び、聴いた言い分へ突きつける。</p>
                  {ch.truths.map((t) => {
                    const known = truthKnown(room, t.id);
                    const used = known && room.pickTopic !== null && missedPair(room, t.id, room.pickTopic);
                    return (
                      <button
                        key={t.id}
                        className={room.pickTruth === t.id ? "row on" : "row"}
                        type="button"
                        disabled={!known}
                        onClick={() => dispatch({ type: "pick-truth", id: t.id })}
                      >
                        <span className="lbl">
                          {known ? t.label : "未想起の糸"}
                          <span className="kind">{known ? t.kind : "暗室"}</span>
                          {used ? <span className="kind">外した</span> : null}
                        </span>
                        <span className="sub">{known ? t.text : "隠蔽の記憶で、手繰る。"}</span>
                      </button>
                    );
                  })}
                  <p className="sheet-note">突きつける言い分</p>
                  {ch.topics.map((t) => {
                    const used = room.pickTruth !== null && missedPair(room, room.pickTruth, t.id);
                    const step = room.partial?.[t.id] ?? 0;
                    return (
                      <button
                        key={t.id}
                        className={room.pickTopic === t.id ? "row on" : "row"}
                        type="button"
                        disabled={!room.heard.includes(t.id) || room.broken.includes(t.id)}
                        onClick={() => dispatch({ type: "pick-topic", id: t.id })}
                      >
                        <span className="lbl">
                          {t.label}
                          {room.broken.includes(t.id) ? <span className="broken-mark">済</span> : null}
                          {t.sequence && !room.broken.includes(t.id) ? (
                            <span className="kind">{step > 0 ? `半針 ${step}/${t.brokenBy.length}` : "二本"}</span>
                          ) : null}
                          {used ? <span className="kind">外した</span> : null}
                        </span>
                        <span className="sub">{room.heard.includes(t.id) ? t.short : "未聴取"}</span>
                      </button>
                    );
                  })}
                  {(room.misses ?? []).length > 0 ? (
                    <>
                      <p className="sheet-note">外した突き。同じ組み合わせは、もう刺さらない。</p>
                      <ul className="miss-list">
                        {(room.misses ?? []).map((m) => (
                          <li key={`${m.truthId}-${m.topicId}`}>
                            {truthById(ch, m.truthId)?.label} × {ch.topics.find((t) => t.id === m.topicId)?.label}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {room.pickTruth && room.pickTopic ? (
                    <div className="confirm">
                      <p>
                        「{truthById(ch, room.pickTruth)?.label}」を、「{ch.topics.find((t) => t.id === room.pickTopic)?.label}」へ。
                      </p>
                      {missedPair(room, room.pickTruth, room.pickTopic) ? (
                        <p className="sheet-note">その突きは、もう外している。別の糸を選べ。</p>
                      ) : (
                        <button className="btn btn-primary" type="button" onClick={() => dispatch({ type: "point" })}>
                          突きつける
                        </button>
                      )}
                    </div>
                  ) : null}
                </>
              ) : null}
              {room.sheet === "shake" ? (
                <>
                  <button className="row" type="button" onClick={() => dispatch({ type: "shake", kind: "tea" })}>
                    <span className="lbl">
                      お茶を置く<span className="kind">{COST.tea}分</span>
                    </span>
                    <span className="sub">安心させる。余裕は戻り、聞き耳が上がる。沈黙の下ごしらえ。</span>
                  </button>
                  <button className="row" type="button" onClick={() => dispatch({ type: "shake", kind: "silence" })}>
                    <span className="lbl">
                      沈黙する<span className="kind">{COST.silence}分</span>
                    </span>
                    <span className="sub">聞き耳が25以上、余裕が70以下なら効く。そうでなければ微笑まれる。</span>
                  </button>
                  <button className="row" type="button" onClick={() => dispatch({ type: "shake", kind: "name" })}>
                    <span className="lbl">
                      {ch.accomplice.name}の名を出す<span className="kind">{COST.name}分</span>
                    </span>
                    <span className="sub">{ch.accompliceHook} 一つほどいたあとで。</span>
                  </button>
                  <button className="row" type="button" disabled={room.asideUsed} onClick={() => dispatch({ type: "aside" })}>
                    <span className="lbl">
                      別室・{ch.accomplice.name}
                      <span className="kind">{room.asideUsed ? "閉じた" : `${COST.aside}分`}</span>
                    </span>
                    <span className="sub">一度だけ。答えは言わない。居場所と、手の形だけ。</span>
                  </button>
                  <button className="row" type="button" onClick={() => dispatch({ type: "glance" })}>
                    <span className="lbl">
                      時計を見る<span className="kind">無料</span>
                    </span>
                    <span className="sub">残りの芯と、十九時までの分。針は進まない。</span>
                  </button>
                  <button className="row" type="button" disabled={room.undoUsed || !room.prior} onClick={() => dispatch({ type: "undo" })}>
                    <span className="lbl">
                      先の問いを取り消す<span className="kind">{room.undoUsed ? "済" : "一針"}</span>
                    </span>
                    <span className="sub">綻びか揺さぶりの、直前へ戻す。この取調で一度だけ。</span>
                  </button>
                </>
              ) : null}
              {room.sheet === "record" ? (
                <div className="dossier">
                  <h3>
                    {ch.culprit.name} ・ {ch.caseName}
                  </h3>
                  <ul>
                    {ch.topics.map((t) => {
                      const note = shioriNote(room, t.id);
                      return (
                        <li key={t.id}>
                          {t.label}：
                          {room.broken.includes(t.id) ? t.admitShort : room.heard.includes(t.id) ? t.short : "（未聴取）"}
                          {note ? <span className="kind"> {note}</span> : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
              {room.sheet === "memory"
                ? ch.truths.map((t) => {
                    const known = truthKnown(room, t.id);
                    const scene = known ? sceneOf(ch, t.id) || t.text : "まだ、手繰っていない。";
                    if (room.difficulty === "anshitsu" && !known) {
                      return (
                        <button key={t.id} className="row" type="button" onClick={() => dispatch({ type: "recall", id: t.id })}>
                          <span className="lbl">
                            未想起の糸<span className="kind">手繰る · {COST.recall}分</span>
                          </span>
                          <span className="sub">{scene}</span>
                        </button>
                      );
                    }
                    return (
                      <div className="row" key={t.id}>
                        <span className="lbl">{t.label}</span>
                        <span className="sub">{scene}</span>
                      </div>
                    );
                  })
                : null}
              {room.sheet === "log"
                ? room.log.map((entry, i) => (
                    <div className="log-line" key={`${i}-${entry.text.slice(0, 12)}`}>
                      <b>{whoLabel(entry.who, ch)}</b>
                      {entry.text}
                    </div>
                  ))
                : null}
            </div>
          </aside>
        </>
      ) : null}
      {room.toast ? <div className="toast">{room.toast}</div> : null}
    </main>
  );
}
