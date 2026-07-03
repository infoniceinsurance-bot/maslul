/* מסלול · UI + audio */

const screenEl = document.getElementById('screen');
const state = Engine.load();

/* ─── audio: speech + soft tones ─── */
const Audio2 = {
  ctx: null, voices: [],
  init() {
    const grab = () => { this.voices = speechSynthesis.getVoices(); };
    if ('speechSynthesis' in window) { grab(); speechSynthesis.onvoiceschanged = grab; }
  },
  pickVoice(lang) {
    const pref = lang === 'he' ? ['he-IL', 'he'] : ['en-US', 'en-GB', 'en'];
    for (const p of pref) {
      const google = this.voices.find(v => v.lang.startsWith(p) && /google/i.test(v.name));
      if (google) return google;
      const any = this.voices.find(v => v.lang.startsWith(p));
      if (any) return any;
    }
    return null;
  },
  say(text, lang, btn) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'he' ? 'he-IL' : 'en-US';
    const v = this.pickVoice(lang);
    if (v) u.voice = v;
    u.rate = lang === 'he' ? 0.88 : 0.82;
    if (btn) {
      btn.classList.add('playing');
      u.onend = u.onerror = () => btn.classList.remove('playing');
    }
    speechSynthesis.speak(u);
  },
  tone(kind) {
    if (!state.sound) return;
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const t = this.ctx.currentTime;
      const play = (freq, start, dur, gain = 0.08, type = 'sine') => {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = type; o.frequency.value = freq;
        g.gain.setValueAtTime(0, t + start);
        g.gain.linearRampToValueAtTime(gain, t + start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
        o.connect(g).connect(this.ctx.destination);
        o.start(t + start); o.stop(t + start + dur + 0.05);
      };
      if (kind === 'good') { play(660, 0, 0.16); play(880, 0.09, 0.22); }
      else if (kind === 'bad') { play(220, 0, 0.25, 0.05, 'triangle'); }
      else if (kind === 'levelup') { play(523, 0, 0.18); play(659, 0.12, 0.18); play(784, 0.24, 0.34); }
      else if (kind === 'done') { play(523, 0, 0.2); play(784, 0.14, 0.3); }
    } catch (e) { /* no audio */ }
  }
};
Audio2.init();

/* ─── shared ─── */
function setScreen(html, cls = 'screen-enter') {
  speechSynthesis && speechSynthesis.cancel();
  screenEl.innerHTML = html;
  screenEl.className = cls;
}
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
function updateTopbar() {
  const chip = document.getElementById('streakChip');
  const n = Engine.streakAlive();
  chip.classList.toggle('on', n > 0);
  if (n > 0) chip.innerHTML = `רצף · <b>${n === 1 ? 'יום אחד' : n + ' ימים'}</b>`;
}
const SPEAKER_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9.5 9.5 0 0 1 0 13"/></svg>`;

/* ─── home ─── */
function renderHome() {
  const h = new Date().getHours();
  const greetWord = h < 12 ? 'בוקר טוב' : h < 17 ? 'צהריים טובים' : 'ערב טוב';
  const greet = state.name ? `${greetWord}, ${esc(state.name)}.` : `${greetWord}.`;
  const dateStr = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  const cards = Object.entries(MODULES).map(([key, def]) => {
    const m = state.mod[key];
    const pct = Math.min(m.prog, 100);
    const C = 2 * Math.PI * 26;
    return `
    <button class="module-card" style="--mc:${def.color}" data-mod="${key}">
      <div class="m-info">
        <div class="m-name">${def.title}</div>
        <div class="m-level">רמה <b>${m.lvl}</b> · ${esc(Engine.levelName(key, m.lvl))}</div>
      </div>
      <div class="ring"><svg viewBox="0 0 60 60">
        <circle class="bg" cx="30" cy="30" r="26"/>
        <circle class="fg" cx="30" cy="30" r="26" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct / 100)}"/>
        <text class="ring-label" x="30" y="30">${m.lvl}</text>
      </svg></div>
    </button>`;
  }).join('');

  const namePrompt = state.name ? '' : `
    <div class="field" style="margin-top:18px; max-width:340px">
      <label for="nameInput">איך קוראים לך? (פעם אחת בלבד)</label>
      <input type="text" id="nameInput" placeholder="השם שלך" maxlength="20">
    </div>`;

  setScreen(`
    <div class="stagger">
      <div class="home-hero">
        <div class="home-date">${dateStr}</div>
        <h1 class="home-greet">${greet}</h1>
        <div class="home-sub">במה מתאמנים היום?</div>
        ${namePrompt}
      </div>
      <div class="module-list">${cards}</div>
    </div>`);

  screenEl.querySelectorAll('.module-card').forEach(b =>
    b.addEventListener('click', () => renderModule(b.dataset.mod)));

  const ni = document.getElementById('nameInput');
  if (ni) ni.addEventListener('change', () => {
    state.name = ni.value.trim(); Engine.save(); renderHome();
  });
  updateTopbar();
}

/* ─── module screen: level path ─── */
function renderModule(mod) {
  const def = MODULES[mod];
  const m = state.mod[mod];
  const items = def.levels.map((lv, i) => {
    const n = i + 1;
    const cls = n < m.lvl ? 'done' : n === m.lvl ? 'now' : '';
    return `<div class="lp-item ${cls}"><span class="dot"></span><span>רמה ${n} · ${esc(lv.name)}</span></div>`;
  }).join('');

  setScreen(`
    <div class="level-intro" style="--mc:${def.color}">
      <div class="li-kicker">${def.title}</div>
      <h2 class="li-title">רמה ${m.lvl} · ${esc(Engine.levelName(mod, m.lvl))}</h2>
      <div class="li-sub">אימון קצר של 10 שאלות. עובדים בקצב שלך.</div>
      <div class="level-path" id="lvlPath">${items}</div>
      <div class="btn-row">
        <button class="btn-primary" id="startBtn">מתחילים</button>
        <button class="btn-ghost" id="backBtn">חזרה</button>
      </div>
    </div>`);

  const now = screenEl.querySelector('.lp-item.now');
  if (now) now.scrollIntoView({ block: 'center' });
  document.getElementById('startBtn').addEventListener('click', () => startSession(mod));
  document.getElementById('backBtn').addEventListener('click', renderHome);
}

/* ─── session ─── */
let S = null;

function startSession(mod) {
  S = {
    mod, qs: Engine.buildSession(mod), i: 0,
    good: 0, total: 0, t0: Date.now()
  };
  nextQuestion();
}

function sessionTopHtml() {
  const def = MODULES[S.mod];
  return `
  <div class="session-top" style="--mc:${def.color}">
    <button class="quit-btn" id="quitBtn" aria-label="יציאה">×</button>
    <div class="bar"><i style="width:${(S.i / S.qs.length) * 100}%"></i></div>
    <div class="count">${S.i + 1} / ${S.qs.length}</div>
  </div>`;
}

function nextQuestion() {
  if (S.i >= S.qs.length) return renderSummary();
  const q = S.qs[S.i];
  if (q.type === 'passage') renderPassage(q);
  else renderQuestion(q);
}

function bindQuit() {
  document.getElementById('quitBtn').addEventListener('click', () => { Engine.save(); renderHome(); });
}

function renderQuestion(q) {
  const def = MODULES[S.mod];
  const tag = q.kind === 'review' ? 'חוזרים על שאלה מהפעם הקודמת' :
              q.kind === 'easy' ? 'חימום' : `רמה ${q.lvl}`;

  let body = '';
  if (q.prompt) body += `<div class="q-prompt ${q.promptClass || ''}">${esc(q.prompt)}</div>`;
  if (q.sub) body += `<div class="q-sub">${esc(q.sub)}</div>`;
  if (q.listen) body += `<button class="listen-btn" id="listenBtn">${SPEAKER_SVG}<span>השמעה</span></button>`;

  if (q.type === 'keypad') {
    body += `
      <div class="answer-line" id="ansLine">&nbsp;</div>
      <div class="keypad" id="keypad">
        ${[1,2,3,4,5,6,7,8,9].map(n => `<button class="key" data-k="${n}">${n}</button>`).join('')}
        <button class="key action" data-k="del">מחיקה</button>
        <button class="key" data-k="0">0</button>
        <button class="key go" data-k="go">בדיקה</button>
      </div>`;
  } else {
    const cols = q.letterGrid ? 'letters' : q.singleCol ? 'single-col' : '';
    body += `<div class="opts ${cols}" id="opts">
      ${q.options.map(o => `<button class="opt ${q.optClass || ''}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}
    </div>`;
  }
  body += `<div class="feedback-note" id="fbNote"></div>`;

  setScreen(`${sessionTopHtml()}<div class="q-wrap" style="--mc:${def.color}">
    <div class="q-tag">${tag}</div>${body}</div>`, '');
  bindQuit();

  const listenBtn = document.getElementById('listenBtn');
  if (listenBtn) {
    const play = () => Audio2.say(q.listen.text, q.listen.lang, listenBtn);
    listenBtn.addEventListener('click', play);
    if (q.autoListen) setTimeout(play, 450);
  }

  let attempts = 0;

  if (q.type === 'keypad') {
    const line = document.getElementById('ansLine');
    let val = '';
    document.getElementById('keypad').addEventListener('click', e => {
      const k = e.target.dataset && e.target.dataset.k;
      if (!k) return;
      if (k === 'del') val = val.slice(0, -1);
      else if (k === 'go') {
        if (!val) return;
        attempts++;
        if (val === q.answer) {
          line.classList.add('ok');
          finishQ(q, attempts === 1, `נכון. ${q.prompt} ${q.answer}`);
        } else if (attempts === 1) {
          line.classList.add('no');
          note('fix', 'לא מדויק — נסי שוב, יש לך עוד ניסיון.');
          Audio2.tone('bad');
          setTimeout(() => { line.classList.remove('no'); val = ''; line.innerHTML = '&nbsp;'; }, 700);
          return;
        } else {
          line.textContent = q.answer;
          line.classList.add('ok');
          finishQ(q, false, `התשובה היא ${q.answer}. נתרגל אותה שוב בהמשך.`);
        }
        return;
      }
      else if (val.length < 4) val += k;
      line.textContent = val || ' ';
    });
  } else {
    document.getElementById('opts').addEventListener('click', e => {
      const btn = e.target.closest('.opt');
      if (!btn || btn.disabled) return;
      attempts++;
      const v = btn.dataset.v;
      if (v === q.answer) {
        btn.classList.add('correct');
        lockOpts();
        finishQ(q, attempts === 1, 'נכון.');
      } else if (attempts === 1) {
        btn.classList.add('wrong'); btn.disabled = true;
        note('fix', 'לא זה — נסי שוב.');
        Audio2.tone('bad');
      } else {
        btn.classList.add('wrong');
        lockOpts();
        const right = [...document.querySelectorAll('.opt')].find(b => b.dataset.v === q.answer);
        if (right) right.classList.add('correct');
        finishQ(q, false, 'התשובה הנכונה מסומנת. נחזור אליה בהמשך.');
      }
    });
  }

  function lockOpts() { document.querySelectorAll('.opt').forEach(b => b.disabled = true); }
  function note(cls, txt) { const n = document.getElementById('fbNote'); n.className = 'feedback-note ' + cls; n.textContent = txt; }
  function finishQ(q, correct, msg) {
    S.total++;
    if (correct) { S.good++; Audio2.tone('good'); }
    Engine.recordAnswer(S.mod, q, correct);
    note(correct ? 'good' : 'fix', msg);
    setTimeout(() => { S.i++; nextQuestion(); }, correct ? 950 : 1900);
  }
}

/* ─── passage: listen → timed read → timed re-read → question ─── */
function renderPassage(q) {
  const def = MODULES[S.mod];
  const p = q.passage;
  let step = 0; /* 0 listen, 1 read1, 2 read2, 3 question */
  let t1 = null, t2 = null, timerStart = null, timerInt = null;

  function fmt(sec) { return sec.toFixed(1) + ' שנ׳'; }

  function draw() {
    const steps = [0, 1, 2, 3].map(i => `<div class="pstep ${i < step ? 'done' : ''}"></div>`).join('');
    let controls = '';
    if (step === 0) {
      controls = `
        <button class="listen-btn" id="pListen">${SPEAKER_SVG}<span>קודם מקשיבים לקטע</span></button>
        <div class="btn-row"><button class="btn-primary" id="pNext" disabled style="opacity:.4">הקשבתי, ממשיכים</button></div>`;
    } else if (step === 1 || step === 2) {
      const label = step === 1 ? 'עכשיו קראי בקול רם. לחצי כשאת מתחילה.' : 'קוראים שוב — נסי לקרוא קצת יותר חלק.';
      controls = `
        <div class="q-sub">${label}</div>
        <div class="timer-line"><div class="timer-num" id="pTimer">0.0</div>
        ${step === 2 && t1 ? `<div class="timer-hint">בקריאה הראשונה: ${fmt(t1)}</div>` : ''}</div>
        <div class="btn-row">
          <button class="btn-primary" id="pStart">מתחילה לקרוא</button>
          <button class="btn-ghost" id="pReplay">השמעה חוזרת</button>
        </div>`;
    } else {
      const improved = t1 && t2 && t2 < t1;
      controls = `
        ${improved ? `<div class="q-sub"><span class="improve-tag">הקריאה השנייה הייתה מהירה ב־${fmt(t1 - t2)}</span></div>` : ''}
        <div class="q-sub" style="font-weight:700">${esc(p.q.prompt)}</div>
        <div class="opts single-col" id="pOpts">
          ${shuffle([...p.q.options]).map(o => `<button class="opt hebrew-word" data-v="${esc(o)}">${esc(o)}</button>`).join('')}
        </div>
        <div class="feedback-note" id="fbNote"></div>`;
    }

    setScreen(`${sessionTopHtml()}<div class="q-wrap" style="--mc:${def.color}">
      <div class="q-tag">קריאה שוטפת</div>
      <div class="passage-steps">${steps}</div>
      <div class="passage-card"><div class="passage-text">${esc(p.show).replace(/\n/g, '<br>')}</div></div>
      ${controls}</div>`, '');
    bindQuit();
    wire();
  }

  function wire() {
    if (step === 0) {
      const lb = document.getElementById('pListen'), nb = document.getElementById('pNext');
      lb.addEventListener('click', () => {
        Audio2.say(p.say, 'he', lb);
        nb.disabled = false; nb.style.opacity = 1;
      });
      nb.addEventListener('click', () => { step = 1; draw(); });
    } else if (step === 1 || step === 2) {
      const sb = document.getElementById('pStart');
      document.getElementById('pReplay').addEventListener('click', e => Audio2.say(p.say, 'he', e.currentTarget));
      sb.addEventListener('click', () => {
        if (!timerStart) {
          timerStart = Date.now();
          sb.textContent = 'סיימתי לקרוא';
          timerInt = setInterval(() => {
            document.getElementById('pTimer').textContent = ((Date.now() - timerStart) / 1000).toFixed(1);
          }, 100);
        } else {
          clearInterval(timerInt);
          const sec = (Date.now() - timerStart) / 1000;
          timerStart = null;
          if (step === 1) t1 = sec; else t2 = sec;
          step++; draw();
        }
      });
    } else {
      let attempts = 0;
      document.getElementById('pOpts').addEventListener('click', e => {
        const btn = e.target.closest('.opt');
        if (!btn || btn.disabled) return;
        attempts++;
        if (btn.dataset.v === p.q.correct) {
          btn.classList.add('correct');
          document.querySelectorAll('.opt').forEach(b => b.disabled = true);
          S.total++; S.good++;
          Audio2.tone('good');
          Engine.recordAnswer(S.mod, q, true);
          setTimeout(() => { S.i++; nextQuestion(); }, 1000);
        } else if (attempts === 1) {
          btn.classList.add('wrong'); btn.disabled = true;
          Audio2.tone('bad');
          const n = document.getElementById('fbNote'); n.className = 'feedback-note fix';
          n.textContent = 'אפשר להציץ שוב בקטע — התשובה שם.';
        } else {
          btn.classList.add('wrong');
          document.querySelectorAll('.opt').forEach(b => b.disabled = true);
          const right = [...document.querySelectorAll('.opt')].find(b => b.dataset.v === p.q.correct);
          if (right) right.classList.add('correct');
          S.total++;
          Engine.recordAnswer(S.mod, q, false);
          setTimeout(() => { S.i++; nextQuestion(); }, 1900);
        }
      });
    }
  }
  draw();
}

/* ─── summary ─── */
function renderSummary() {
  const leveledUp = Engine.finishSession(S.mod);
  const def = MODULES[S.mod];
  const m = state.mod[S.mod];
  const acc = S.total ? Math.round((S.good / S.total) * 100) : 0;
  const mins = Math.max(1, Math.round((Date.now() - S.t0) / 60000));
  const streak = Engine.streakAlive();

  Audio2.tone(leveledUp ? 'levelup' : 'done');

  setScreen(`
    <div class="summary-wrap" style="--mc:${def.color}">
      <div class="summary-kicker">האימון הושלם</div>
      <div class="gold-line"></div>
      <h2 class="summary-title">${def.title} · רמה ${m.lvl}</h2>
      ${leveledUp ? `<div><span class="levelup-note">עלית לרמה ${m.lvl} — ${esc(Engine.levelName(S.mod, m.lvl))}</span></div>` : ''}
      <div class="summary-stats">
        <div class="stat-box"><div class="v">${S.good}/${S.total}</div><div class="k">תשובות נכונות</div></div>
        <div class="stat-box"><div class="v">${acc}%</div><div class="k">דיוק</div></div>
        ${streak ? `<div class="stat-box"><div class="v">${streak}</div><div class="k">ימים ברצף</div></div>` : ''}
      </div>
      <div class="btn-row" style="justify-content:center">
        <button class="btn-primary" id="againBtn">אימון נוסף</button>
        <button class="btn-ghost" id="homeBtn">מסך הבית</button>
      </div>
    </div>`);
  document.getElementById('againBtn').addEventListener('click', () => startSession(S.mod));
  document.getElementById('homeBtn').addEventListener('click', renderHome);
  updateTopbar();
}

/* ─── settings ─── */
function renderSettings() {
  setScreen(`
    <div class="settings-wrap stagger">
      <h2 class="settings-title">הגדרות</h2>
      <div class="field">
        <label for="setName">שם</label>
        <input type="text" id="setName" value="${esc(state.name)}" maxlength="20">
      </div>
      <div class="toggle-row">
        <span>צלילים</span>
        <label class="switch"><input type="checkbox" id="setSound" ${state.sound ? 'checked' : ''}><span class="track"></span><span class="knob"></span></label>
      </div>
      <div class="btn-row">
        <button class="btn-primary" id="setSave">שמירה</button>
        <button class="btn-ghost" id="setBack">חזרה</button>
      </div>
      <button class="danger-link" id="setReset">איפוס כל ההתקדמות</button>
    </div>`);
  document.getElementById('setSave').addEventListener('click', () => {
    state.name = document.getElementById('setName').value.trim();
    state.sound = document.getElementById('setSound').checked;
    Engine.save(); renderHome();
  });
  document.getElementById('setBack').addEventListener('click', renderHome);
  document.getElementById('setReset').addEventListener('click', () => {
    if (confirm('לאפס את כל ההתקדמות? אי אפשר לבטל את זה.')) { Engine.reset(); location.reload(); }
  });
}

/* ─── boot ─── */
document.getElementById('brandHome').addEventListener('click', renderHome);
document.getElementById('settingsBtn').addEventListener('click', renderSettings);
renderHome();
