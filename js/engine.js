/* מסלול · engine: state, adaptive progression, question generation */

const STORE_KEY = 'maslul_v1';

const Engine = {
  state: null,

  load() {
    try { this.state = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { this.state = null; }
    if (!this.state || this.state.v !== 1) {
      this.state = {
        v: 1, name: '', sound: true,
        streak: { count: 0, last: null },
        sessions: 0,
        mod: {
          math:    { lvl: 1, prog: 0 },
          hebrew:  { lvl: 1, prog: 0 },
          english: { lvl: 1, prog: 0 }
        },
        review: { math: [], hebrew: [], english: [] }
      };
    }
    return this.state;
  },

  save() { localStorage.setItem(STORE_KEY, JSON.stringify(this.state)); },

  reset() { localStorage.removeItem(STORE_KEY); this.load(); },

  maxLevel(mod) { return MODULES[mod].levels.length; },

  levelName(mod, lvl) {
    const L = MODULES[mod].levels;
    return L[Math.min(lvl, L.length) - 1].name;
  },

  /* streak: update once per calendar day with a completed session */
  touchStreak() {
    const today = new Date().toISOString().slice(0, 10);
    const s = this.state.streak;
    if (s.last === today) return;
    const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    s.count = (s.last === yest) ? s.count + 1 : 1;
    s.last = today;
  },

  streakAlive() {
    const s = this.state.streak;
    if (!s.last) return 0;
    const today = new Date().toISOString().slice(0, 10);
    const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    return (s.last === today || s.last === yest) ? s.count : 0;
  },

  /* ─── session building ───
     10 questions: up to 2 review items, 2 confidence builders (easier), rest at level.
     A wrong answer stores the question seed in the review queue. */
  buildSession(mod) {
    const m = this.state.mod[mod];
    const qs = [];
    const review = this.state.review[mod];

    const due = review.splice(0, 2);
    due.forEach(seed => qs.push(this.makeQuestion(mod, seed.lvl, seed, 'review')));

    /* ברמות קריאת קטע: קטע אחד במרכז האימון + שאלות מילים מרמות קודמות */
    const isPassageLvl = mod === 'hebrew' && HE_LEVELS[Math.min(m.lvl, HE_LEVELS.length) - 1].type === 'passage';
    if (isPassageLvl) {
      const passage = this.makeQuestion(mod, m.lvl, null, 'main');
      passage.weight = 3;
      while (qs.length < 6) {
        const backLvl = rnd(Math.max(1, m.lvl - 4), 6);
        qs.push(this.makeQuestion(mod, backLvl, null, 'easy'));
      }
      qs.splice(Math.min(2, qs.length), 0, passage);
      return qs;
    }

    const easyLvl = Math.max(1, m.lvl - 1);
    const nEasy = m.lvl > 1 ? 2 : 0;
    for (let i = 0; i < nEasy; i++) qs.push(this.makeQuestion(mod, easyLvl, null, 'easy'));

    while (qs.length < 10) qs.push(this.makeQuestion(mod, m.lvl, null, 'main'));

    /* keep first question a confidence builder, shuffle the rest */
    const head = qs.filter(q => q.kind === 'easy').slice(0, 1);
    const rest = shuffle(qs.filter(q => !head.includes(q)));
    return head.concat(rest);
  },

  recordAnswer(mod, q, correct) {
    const m = this.state.mod[mod];
    if (correct) {
      m.prog += ((q.kind === 'main') ? 15 : 8) * (q.weight || 1);
    } else if (q.seed) {
      const queue = this.state.review[mod];
      if (queue.length < 20 && !queue.some(s => s.sig === q.seed.sig)) queue.push(q.seed);
    }
  },

  finishSession(mod) {
    const m = this.state.mod[mod];
    let leveledUp = false;
    if (m.prog >= 100 && m.lvl < this.maxLevel(mod)) {
      m.lvl += 1; m.prog = 0; leveledUp = true;
    } else if (m.prog >= 100) {
      m.prog = 100; /* רמה אחרונה — הטבעת נשארת מלאה */
    }
    this.state.sessions += 1;
    this.touchStreak();
    this.save();
    return leveledUp;
  },

  /* ─── question factory ─── */
  makeQuestion(mod, lvl, seed, kind) {
    let q;
    if (mod === 'math') q = this.mathQuestion(lvl, seed);
    else if (mod === 'hebrew') q = this.hebrewQuestion(lvl, seed);
    else q = this.englishQuestion(lvl, seed);
    q.kind = kind; q.lvl = lvl;
    return q;
  },

  /* math: seed = {a, b, op, lvl, sig} */
  mathQuestion(lvl, seed) {
    let a, b, op;
    if (seed) { a = seed.a; b = seed.b; op = seed.op; }
    else {
      [a, b, op] = this.mathDraw(lvl);
    }
    const ans = op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : a / b;
    const s = { a, b, op, lvl, sig: `m${op}${a}_${b}` };
    const text = `${a} ${op} ${b} =`;
    const useKeypad = lvl >= 6;
    const q = {
      module: 'math', type: useKeypad ? 'keypad' : 'choice',
      prompt: text, promptClass: 'big-math', answer: String(ans), seed: s,
      say: null
    };
    if (!useKeypad) {
      q.options = shuffle(uniq([ans, ...mathDistractors(ans, op)]).slice(0, 4).map(String));
      if (!q.options.includes(String(ans))) { q.options[0] = String(ans); q.options = shuffle(q.options); }
    }
    return q;
  },

  mathDraw(lvl) {
    const R = rnd;
    switch (lvl) {
      case 1: { const a = R(1, 9), b = R(1, 10 - a); return [a, b, '+']; }
      case 2: { const a = R(2, 10), b = R(1, a - 1); return [a, b, '−']; }
      case 3: { const a = R(3, 15), b = R(2, Math.min(19 - a + 1, 9) + 3); return [a, Math.min(b, 20 - a), '+']; }
      case 4: { const a = R(8, 20), b = R(2, a - 1); return [a, b, '−']; }
      case 5: { /* השלמה: a + ? = 10/20 מוצג כחיסור הפוך → נשתמש בצורת ?: 10 − a */
                const t = Math.random() < .5 ? 10 : 20; const a = R(1, t - 1); return [t, a, '−']; }
      case 6: { const a = R(1, 9) * 10, b = R(1, 9) * 10; return Math.random() < .5 ? [a, b, '+'] : [Math.max(a,b), Math.min(a,b), '−']; }
      case 7: { /* דו־ספרתי בלי המרה */
                const a1 = R(1, 8), a2 = R(0, 8), b1 = R(1, 9 - a1), b2 = R(0, 9 - a2);
                return [a1 * 10 + a2, b1 * 10 + b2, '+']; }
      case 8: { /* חיסור בלי פריטה */
                const a1 = R(2, 9), a2 = R(1, 9), b1 = R(1, a1 - 1), b2 = R(0, a2);
                return [a1 * 10 + a2, b1 * 10 + b2, '−']; }
      case 9: { /* חיבור עם המרה */
                const a2 = R(4, 9), b2 = R(10 - a2, 9), a1 = R(1, 7), b1 = R(1, 8 - a1);
                return [a1 * 10 + a2, b1 * 10 + b2, '+']; }
      case 10: { /* חיסור עם פריטה */
                const a2 = R(0, 5), b2 = R(a2 + 1, 9), a1 = R(2, 9), b1 = R(1, a1 - 1);
                return [a1 * 10 + a2, b1 * 10 + b2, '−']; }
      case 11: { const t = [2, 5, 10][R(0, 2)]; return Math.random() < .5 ? [t, R(1, 10), '×'] : [R(1, 10), t, '×']; }
      case 12: { const t = [3, 4, 6][R(0, 2)]; return Math.random() < .5 ? [t, R(1, 10), '×'] : [R(1, 10), t, '×']; }
      case 13: { const t = [7, 8, 9][R(0, 2)]; return Math.random() < .5 ? [t, R(1, 10), '×'] : [R(1, 10), t, '×']; }
      case 14: { const b = R(2, 9), c = R(2, 9); return [b * c, b, '÷']; }
      default: { /* מעורב */
                const sub = R(9, 14); return this.mathDraw(sub); }
    }
  },

  /* hebrew: seed = {itemIdx, lvl, sig} */
  hebrewQuestion(lvl, seed) {
    const def = HE_LEVELS[Math.min(lvl, HE_LEVELS.length) - 1];
    const pools = { L1: HE_WORDS_L1, L2: HE_WORDS_L2, L3: HE_SIMILAR_L3, L4: HE_PHRASES_L4, L5: HE_SENT_L5, L6: HE_CLOZE_L6 };

    if (def.type === 'passage') {
      const cand = HE_PASSAGES.filter(p => p.minLvl === def.pool);
      const p = cand[rnd(0, cand.length - 1)];
      return { module: 'hebrew', type: 'passage', passage: p, seed: null };
    }

    const pool = pools[def.pool];
    const idx = seed ? seed.itemIdx : rnd(0, pool.length - 1);
    const item = pool[idx % pool.length];
    const s = { itemIdx: idx, lvl, sig: `h${lvl}_${idx}` };

    if (def.type === 'cloze') {
      return {
        module: 'hebrew', type: 'choice', optClass: 'hebrew-word',
        prompt: item.show, sub: 'איזו מילה משלימה את המשפט?',
        say: item.say, answer: item.correct, options: shuffle([...item.options]), seed: s
      };
    }
    /* word / similar / sentence: hear → choose written form */
    let foils;
    if (item.foils) foils = [...item.foils];
    else {
      foils = shuffle(pool.filter(w => w !== item)).slice(0, 3).map(w => w.show);
    }
    return {
      module: 'hebrew', type: 'choice', optClass: 'hebrew-word',
      prompt: null, sub: 'הקשיבי ובחרי את מה ששמעת',
      listen: { text: item.say, lang: 'he' }, autoListen: true,
      answer: item.show, options: shuffle([item.show, ...foils]), seed: s,
      singleCol: def.type === 'sentence'
    };
  },

  /* english: seed = {key, lvl, sig} */
  englishQuestion(lvl, seed) {
    const def = EN_LEVELS[Math.min(lvl, EN_LEVELS.length) - 1];
    const pools = { cvc: EN_CVC, sight: EN_SIGHT };

    if (def.type === 'letter' || def.type === 'lettercase') {
      const letters = def.letters.split('');
      const target = seed ? seed.key : letters[rnd(0, letters.length - 1)];
      const s = { key: target, lvl, sig: `e${lvl}_${target}` };
      const foils = shuffle(letters.filter(l => l !== target)).slice(0, 3);
      if (def.type === 'letter') {
        return {
          module: 'english', type: 'choice', optClass: 'en-glyph', letterGrid: true,
          prompt: null, sub: 'הקשיבי ולחצי על האות ששמעת',
          listen: { text: target, lang: 'en' }, autoListen: true,
          answer: target, options: shuffle([target, ...foils]), seed: s
        };
      }
      /* lettercase: show uppercase, pick the matching lowercase */
      return {
        module: 'english', type: 'choice', optClass: 'en-glyph', letterGrid: true,
        prompt: target.toUpperCase(), promptClass: 'en',
        sub: 'איזו אות קטנה מתאימה לאות הגדולה?',
        listen: { text: target, lang: 'en' },
        answer: target, options: shuffle([target, ...foils]), seed: s
      };
    }

    const pool = pools[def.pool];
    const item = seed ? pool.find(x => x.w === seed.key) || pool[0] : pool[rnd(0, pool.length - 1)];
    const s = { key: item.w, lvl, sig: `e${lvl}_${item.w}` };

    if (def.type === 'firstletter') {
      const first = item.w[0].toUpperCase();
      const foils = shuffle('ABCDEFGHILMNOPRSTW'.split('').filter(l => l !== first)).slice(0, 3);
      return {
        module: 'english', type: 'choice', optClass: 'en-glyph', letterGrid: true,
        prompt: null, sub: 'באיזו אות מתחילה המילה ששמעת?',
        listen: { text: item.w, lang: 'en' }, autoListen: true,
        answer: first, options: shuffle([first, ...foils]), seed: s
      };
    }
    if (def.type === 'hearword') {
      const foils = shuffle(pool.filter(x => x.w !== item.w)).slice(0, 3).map(x => x.w);
      return {
        module: 'english', type: 'choice', optClass: 'en-glyph',
        prompt: null, sub: 'הקשיבי ובחרי את המילה ששמעת',
        listen: { text: item.w, lang: 'en' }, autoListen: true,
        answer: item.w, options: shuffle([item.w, ...foils]), seed: s
      };
    }
    /* meaning */
    const foils = shuffle(pool.filter(x => x.w !== item.w)).slice(0, 3).map(x => x.he);
    return {
      module: 'english', type: 'choice', optClass: 'hebrew-word',
      prompt: item.w, promptClass: 'en',
      sub: 'מה פירוש המילה?',
      listen: { text: item.w, lang: 'en' }, autoListen: true,
      answer: item.he, options: shuffle([item.he, ...foils]), seed: s
    };
  }
};

/* ─── helpers ─── */
function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function uniq(arr) { return [...new Set(arr)]; }
function mathDistractors(ans, op) {
  const c = new Set();
  const tries = [ans + 1, ans - 1, ans + 10, ans - 10, ans + 2, ans - 2];
  for (const t of tries) { if (t >= 0 && t !== ans) c.add(t); if (c.size >= 3) break; }
  return [...c];
}
