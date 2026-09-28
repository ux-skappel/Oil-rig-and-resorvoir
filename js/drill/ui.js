// Borekonsoll og brønnpanel: kobler knapper og visninger til simulatoren.
import { nf, clockText } from '../util/format.js';
import { PUMP, SECTIONS, SCENARIOS, PIPE, SEABED, poreEMW, prognosisPoreEMW, fracEMW, BAR_PER_M_SG, TD_PLAN } from './config.js';
import { drawWellSchematic, drawPressureWindow, drawDepthLog, drawTrends, drawKillChart, drawSpark } from './panels.js';
import { PARTS } from '../glossary.js';

const $ = (id) => document.getElementById(id);

const GAUGES = [
  { id: 'hookload', label: 'Krokvekt', unit: 't', d: 1, get: (s) => s.hookload, spark: 'hookload' },
  { id: 'wob', label: 'WOB', unit: 't', d: 1, get: (s) => s.wob, spark: 'wob', state: (s) => (s.wob > s.section.bit.wobMax ? 'warning' : '') },
  { id: 'rpm', label: 'Rotasjon', unit: 'o/min', d: 0, get: (s) => s.rpm, spark: 'rpm' },
  { id: 'torque', label: 'Dreiemoment', unit: 'kN·m', d: 1, get: (s) => s.torque, spark: 'torque', state: (s) => (s.stickSlip > 0.3 || s.torque > 55 ? 'warning' : '') },
  { id: 'spp', label: 'Pumpetrykk (SPP)', unit: 'bar', d: 0, get: (s) => s.spp, spark: 'spp', state: (s) => (s.spp > 330 ? 'warning' : '') },
  { id: 'rop', label: 'ROP', unit: 'm/h', d: 1, get: (s) => s.rop, spark: 'rop' },
  { id: 'flowin', label: 'Rate inn', unit: 'L/min', d: 0, get: (s) => s.flowInLpm, spark: 'flowIn' },
  { id: 'flowout', label: 'Retur', unit: 'L/min', d: 0, get: (s) => (s.flowOut === null ? null : s.flowOut * 60000), spark: 'flowOut', alt: (s) => (s.flowOut === null ? 'til sjø' : null), state: (s) => (s.flowOut !== null && ((s.Q > 0 && s.flowOut > s.Q * 1.1 + 0.002) || (s.Q === 0 && s.flowOut > 0.0015 && !s.bopClosed)) ? 'critical' : '') },
  { id: 'pit', label: 'Tank', unit: 'm³', d: 1, get: (s) => s.pitVolume, spark: 'pitGain', sub: (s) => `${s.pitGain >= 0 ? '+' : ''}${nf(s.pitGain, 2)}`, state: (s) => (s.pitGain > 1 ? 'critical' : s.pitGain > 0.5 ? 'warning' : '') },
  { id: 'ecd', label: 'ECD', unit: 'sg', d: 3, get: (s) => s.ecdBit, spark: 'ecd', sub: (s) => `MW ${nf(s.pitSg, 2)}`, state: (s) => (s.ecdShoe > s.lotEMW - 0.02 ? 'warning' : '') },
  { id: 'gas', label: 'Gass', unit: '%', d: 2, get: (s) => s.gasUnits, spark: 'gas', state: (s) => (s.gasUnits > 20 ? 'critical' : s.gasUnits > 5 ? 'warning' : '') },
  { id: 'choke', label: 'Choke', unit: 'bar', d: 1, get: (s) => (s.bopClosed ? s.chokeP : null), alt: (s) => (!s.bopInstalled ? 'ingen BOP' : s.bopClosed ? null : 'åpen'), spark: 'chokeP', state: (s) => (s.bopClosed && s.chokeP > s.maasp * 0.9 ? 'critical' : '') },
];

export function createDrillUI(sim, scene3d, { onRestart } = {}) {
  // ---------- Instrumentfelt ----------
  const gaugeEls = {};
  const gWrap = $('gauges');
  for (const g of GAUGES) {
    const el = document.createElement('div');
    el.className = 'gauge';
    el.innerHTML = `<div class="eyebrow"><span></span><span class="gsub num"></span></div><div><span class="v"></span><span class="u"></span></div><canvas aria-hidden="true"></canvas>`;
    el.querySelector('.eyebrow span').textContent = g.label;
    el.querySelector('.u').textContent = g.unit;
    gWrap.appendChild(el);
    gaugeEls[g.id] = { el, v: el.querySelector('.v'), sub: el.querySelector('.gsub'), u: el.querySelector('.u'), cv: el.querySelector('canvas') };
  }

  // ---------- Kontroller ----------
  const spm = $('spm'), rpm = $('rpm'), wob = $('wob'), hs = $('hs');
  const syncInputs = () => {
    spm.value = sim.spmSet; $('spm-v').textContent = nf(sim.spmSet, 0);
    rpm.value = sim.rpmSet; $('rpm-v').textContent = nf(sim.rpmSet, 0);
    wob.value = sim.wobSet; $('wob-v').textContent = nf(sim.wobSet, 1);
    hs.value = sim.heaveHs; $('hs-v').textContent = nf(sim.heaveHs, 1);
    $('heavecomp').checked = sim.heaveComp;
    $('pump1').checked = sim.pumpOn[0]; $('pump2').checked = sim.pumpOn[1]; $('pump3').checked = sim.pumpOn[2];
    $('mw-target').value = sim.pitTargetSg.toFixed(2);
  };
  syncInputs();
  spm.addEventListener('input', () => { sim.setSpm(+spm.value); $('spm-v').textContent = nf(+spm.value, 0); });
  rpm.addEventListener('input', () => { sim.setRpm(+rpm.value); $('rpm-v').textContent = nf(+rpm.value, 0); });
  wob.addEventListener('input', () => { sim.setWob(+wob.value); $('wob-v').textContent = nf(+wob.value, 1); });
  hs.addEventListener('input', () => { sim.setHeave(+hs.value, 7 + +hs.value * 0.8); $('hs-v').textContent = nf(+hs.value, 1); });
  $('heavecomp').addEventListener('change', (e) => sim.setHeaveComp(e.target.checked));
  [1, 2, 3].forEach((i) => $(`pump${i}`).addEventListener('change', (e) => sim.setPumpOn(i - 1, e.target.checked)));
  $('btn-pumps').addEventListener('click', () => sim.setPumps(!sim.pumpsRunning));
  $('btn-rot').addEventListener('click', () => sim.setRotation(!sim.rotOn));
  $('btn-auto').addEventListener('click', () => sim.setAutoDrill(!sim.autoDrill));
  const hold = (btn, v) => {
    const start = (e) => { e.preventDefault(); sim.setBlockVelocity(v); };
    const stop = () => sim.setBlockVelocity(0);
    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('pointercancel', stop);
  };
  hold($('btn-up'), 0.6);
  hold($('btn-down'), -0.4);
  window.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, select, textarea')) return;
    if (e.key === 'ArrowUp') { sim.setBlockVelocity(0.6); e.preventDefault(); }
    if (e.key === 'ArrowDown') { sim.setBlockVelocity(-0.4); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') sim.setBlockVelocity(0); });
  $('btn-conn').addEventListener('click', () => sim.startConnection());
  $('btn-flowcheck').addEventListener('click', () => sim.startFlowCheck());
  $('btn-bop').addEventListener('click', () => (sim.bopClosed ? sim.openBOP() : sim.closeBOP()));
  $('btn-trip').addEventListener('click', () => sim.tripForBit());
  $('btn-casing').addEventListener('click', () => sim.runCasing());
  $('btn-mix').addEventListener('click', () => sim.weightUp(parseFloat(String($('mw-target').value).replace(',', '.'))));
  $('mw-target').addEventListener('input', updateMixHint);
  for (const b of $('speed').querySelectorAll('button')) {
    b.addEventListener('click', () => {
      const v = +b.dataset.s;
      if (v === 0) sim.paused = !sim.paused; else { sim.paused = false; sim.setTimeScale(v); }
    });
  }
  $('btn-restart').addEventListener('click', () => onRestart && onRestart());

  // Brønnkontroll
  $('btn-kmw').addEventListener('click', () => { const ks = sim.kill ? sim.kill.sheet : sim.killSheet(); sim.weightUp(ks.kmwRound); });
  $('btn-kill-ww').addEventListener('click', () => sim.startKill('ww'));
  $('btn-kill-dm').addEventListener('click', () => sim.startKill('drillers'));
  $('btn-dm2').addEventListener('click', () => sim.continueDrillersStage2());
  $('btn-openbop').addEventListener('click', () => sim.openBOP());
  for (const b of $('choke-mode').querySelectorAll('button')) {
    b.addEventListener('click', () => {
      sim.setChokeMode(b.dataset.m);
      $('choke').value = Math.round((sim.chokeOpening || 0) * 100);
    });
  }
  $('choke').addEventListener('input', (e) => sim.setChokeOpening(+e.target.value / 100));

  // Paneltabs
  let pane = 'well';
  for (const b of $('ptabs').querySelectorAll('button')) {
    b.addEventListener('click', () => {
      pane = b.dataset.p;
      for (const x of $('ptabs').querySelectorAll('button')) x.setAttribute('aria-selected', x === b ? 'true' : 'false');
      for (const p of document.querySelectorAll('.pane')) p.hidden = p.dataset.pane !== pane;
      drawPanels(true);
    });
  }
  let wellZoom = false;
  for (const b of $('well-zoom').querySelectorAll('button')) {
    b.addEventListener('click', () => {
      wellZoom = b.dataset.z === '1';
      for (const x of $('well-zoom').querySelectorAll('button')) x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
      drawPanels(true);
    });
  }
  $('truth').addEventListener('change', () => drawPanels(true));

  // Kamera og deler (kobles på når 3D-scenen er lastet)
  const camWrap = $('cams');
  function attachScene(sc) {
    scene3d = sc;
    camWrap.innerHTML = '';
    for (const [key, c] of Object.entries(sc.cameras)) {
      const b = document.createElement('button');
      b.className = 'btn sm';
      b.textContent = c.label;
      b.dataset.cam = key;
      b.addEventListener('click', () => sc.setCamera(key));
      camWrap.appendChild(b);
    }
    camWrap.hidden = false;
    $('labels-toggle').onchange = (e) => sc.setPartLabels(e.target.checked);
  }
  if (scene3d) attachScene(scene3d);
  let currentPart = null;
  function showPart(key) {
    const p = PARTS[key];
    if (!p) return;
    currentPart = key;
    $('pc-name').textContent = p.no;
    $('pc-en').textContent = p.en;
    $('pc-text').textContent = p.text;
    $('partcard').hidden = false;
  }
  $('pc-close').addEventListener('click', () => { $('partcard').hidden = true; });
  $('pc-focus').addEventListener('click', () => { if (currentPart && scene3d) scene3d.focusPart(currentPart); });
  function hoverPart(key, ev) {
    const tip = $('tip3d');
    if (!key || !PARTS[key]) { tip.hidden = true; return; }
    tip.innerHTML = '';
    const b = document.createElement('b'); b.textContent = PARTS[key].no;
    const s = document.createElement('span'); s.textContent = PARTS[key].en;
    tip.append(b, s);
    tip.hidden = false;
    const r = $('viewport').getBoundingClientRect();
    const x = Math.min(ev.clientX - r.left + 14, r.width - tip.offsetWidth - 6);
    tip.style.left = `${x}px`;
    tip.style.top = `${Math.max(4, ev.clientY - r.top - tip.offsetHeight - 10)}px`;
  }
  $('guide-close').addEventListener('click', () => { $('guide').hidden = true; });
  $('go-restart').addEventListener('click', () => onRestart && onRestart());

  // ---------- Oppdatering ----------
  function updateMixHint() {
    const t = parseFloat(String($('mw-target').value).replace(',', '.'));
    if (!Number.isFinite(t) || sim.section.riserless) { $('mix-hint').textContent = sim.section.riserless ? 'Uten stigerør bores det med sjøvann og bentonittpiller.' : ''; return; }
    if (t > sim.pitSg + 0.001) {
      const barite = sim.pitVolume * 4.2 * (t - sim.pitSg) / (4.2 - t);
      $('mix-hint').textContent = `Krever ca. ${nf(barite, 1)} tonn barytt (40 t/h ≈ ${nf(barite / 40 * 60, 0)} min). Sirkuler deretter en full runde.`;
    } else if (t < sim.pitSg - 0.001) {
      $('mix-hint').textContent = `Fortynnes med ${sim.mud.type === 'OBM' ? 'baseolje' : 'vann'}. Lavere vekt gir mindre overbalanse.`;
    } else $('mix-hint').textContent = 'Samme vekt som i tankene nå.';
  }

  function stateBtn(el, on, onText, offText) {
    el.textContent = on ? onText : offText;
    el.setAttribute('aria-pressed', on ? 'true' : 'false');
    el.classList.toggle('on', on);
  }

  function guideText() {
    const s = sim;
    const gainAlarm = s.alarms.some((a) => a.id === 'pitgain' || a.id === 'flowing' || a.id === 'flowout');
    if (s.gameOver) return ['Simuleringen stoppet', s.gameOver.reason];
    if (s.wellComplete) return ['Brønnen er ferdig', `Gratulerer! Brønnen ble boret på ${nf(s.elapsedDays, 1)} døgn for ${nf(s.cost, 0)} MNOK med ${s.kickCount} brønnspark. Start et nytt scenario for å prøve igjen.`];
    if (s.kill && s.kill.done) return ['Brønnen er drept', 'Trykket er null. Åpne BOP i Brønnkontroll-fanen, legg til tripmargin på slamvekten (+0,03 sg) og fortsett å bore.'];
    if (s.kill && s.kill.method === 'drillers' && s.kill.stage === 2 && s.Q === 0) return ['Borerens metode: 2. sirkulasjon', 'Gassen er ute. Bland drepeslam og trykk «Start 2. sirkulasjon».'];
    if (s.kill) return ['Dreping pågår', 'Auto-choken følger borerørstrykket fra drepeskjemaet. Chokettrykket stiger mens gassen ekspanderer og topper seg når gassen når overflaten. Se Brønnkontroll-fanen.'];
    if (s.bopClosed && s.shutIn && !s.shutIn.stable) return ['Brønnen er stengt', 'Vent noen minutter til trykkene stabiliserer seg. Følg SIDPP og SICP i Brønnkontroll-fanen.'];
    if (s.bopClosed) {
      const ks = s.killSheet();
      if (s.pitSg < ks.kmwRound - 0.004) return ['Bland drepeslam', `Drepeslammet må være ${nf(ks.kmwRound, 2)} sg (KMW = OMW + SIDPP / 0,0981 · TVD). Trykk «Bland drepeslam» i Brønnkontroll-fanen.`];
      return ['Klar til å drepe brønnen', 'Drepeslammet er klart. Trykk «Drep: vent og vekt».'];
    }
    if (gainAlarm && s.bopInstalled) return ['Brønnspark!', 'Tankene øker og brønnen flyter. Stopp boringen og trykk «Steng BOP». Pumper og rotasjon stoppes, og krona løftes av bunnen automatisk.'];
    if (s.op) return ['Operasjon pågår', s.opProgress ? s.opProgress.step : ''];
    if (s.flowCheck) return ['Strømningssjekk', 'Pumpene står. Øker tankvolumet, flyter brønnen, og da må den stenges.'];
    if (!s.pumpsRunning) return ['Start slampumpene', `Trykk «Start pumper». Anbefalt rate i denne seksjonen er ca. ${nf(s.section.flow, 0)} L/min (to pumper på ${nf(s.section.flow / 2 / PUMP.litersPerStroke, 0)} slag/min).`];
    if (!s.rotOn) return ['Start rotasjonen', `Trykk «Start rotasjon». Anbefalt er rundt ${s.section.rpm} RPM med ${s.section.wob} tonn på krona.`];
    if (!s.autoDrill && !s.onBottom) return ['Senk krona til bunnen', 'Slå på autodrilleren, eller hold inne «▼ Senk» til vekten på krona bygger seg opp.'];
    if (s.canConnect() === null && s.onBottom && s.rop < 0.1) return ['Ta en kobling', 'Toppdrevet er nede ved boredekket. Trykk «Kobling» for å skru på et nytt stativ på 28,5 m.'];
    if (s.canRunCasing() === null) return ['Planlagt dybde nådd', `Sett ${s.section.casing.name}: trykk «Kjør foringsrør». Operasjonen tar noen døgn og spoles fort fram.`];
    if (s.bitWear > 0.85) return ['Krona er slitt', 'Borehastigheten faller. Trykk «Bytt krone» for en rundtur.'];
    if (s.sectionIndex === SECTIONS.length - 1 && s.holeDepth < 2885 && s.pitSg < 1.45) return ['Reservoaret nærmer seg', 'Brent-sandsteinen begynner rundt 2885 m. Se etter tegn på overtrykk før du borer inn: bakgrunnsgass og koblingsgass som stiger, og dc-eksponent som faller. Vurder å vekte opp slammet.'];
    if (s.stickSlip > 0.3) return ['Stick-slip', 'Dreiemomentet svinger. Øk RPM eller reduser vekten på krona.'];
    return ['Boringen går', 'Følg med på tankvolum, gass og pumpetrykk. Øk simuleringstiden til 120× for å bore raskere.'];
  }

  function updateFast() {
    const s = sim;
    $('st-clock').textContent = clockText(s.t);
    $('st-cost').textContent = nf(s.cost, 1);
    $('st-speed').textContent = s.paused ? 'pause' : `${nf(Math.round(s.effectiveTimeScale()), 0)}×`;
    for (const g of GAUGES) {
      const ge = gaugeEls[g.id];
      const v = g.get(s);
      const alt = g.alt ? g.alt(s) : null;
      if (alt) { ge.v.textContent = '–'; ge.sub.textContent = alt; } else {
        ge.v.textContent = v === null ? '–' : nf(v, g.d);
        ge.sub.textContent = g.sub ? g.sub(s) : '';
      }
      const st = g.state ? g.state(s) : '';
      ge.el.classList.toggle('state-warning', st === 'warning');
      ge.el.classList.toggle('state-critical', st === 'critical');
    }
    $('d-hole').textContent = `${nf(s.holeDepth, 1)} m`;
    $('d-bit').textContent = `${nf(s.bitDepth, 1)} m`;
    $('d-block').textContent = `${nf(s.blockPos, 1)} m`;
    const f = s.formation;
    $('formation-now').innerHTML = '';
    if (f) {
      const b = document.createElement('b'); b.textContent = f.name;
      $('formation-now').append(b, document.createTextNode(` · ${f.lith} · ${f.age}`));
    } else $('formation-now').textContent = 'Krona er over havbunnen.';
    $('pump-flow').textContent = `${nf(s.flowInLpm, 0)} L/min`;
    stateBtn($('btn-pumps'), s.pumpsRunning, 'Stopp pumper', 'Start pumper');
    stateBtn($('btn-rot'), s.rotOn, 'Stopp rotasjon', 'Start rotasjon');
    stateBtn($('btn-auto'), s.autoDrill, 'Autodriller på', 'Autodriller av');
    if (+spm.value !== Math.round(s.spmSet) && document.activeElement !== spm) { spm.value = s.spmSet; $('spm-v').textContent = nf(s.spmSet, 0); }
    if (+rpm.value !== s.rpmSet && document.activeElement !== rpm) { rpm.value = s.rpmSet; $('rpm-v').textContent = nf(s.rpmSet, 0); }
    if (+wob.value !== s.wobSet && document.activeElement !== wob) { wob.value = s.wobSet; $('wob-v').textContent = nf(s.wobSet, 1); }
    for (let i = 0; i < 3; i++) $(`pump${i + 1}`).checked = s.pumpOn[i];
    const busy = !!s.op || !!s.gameOver;
    const conn = s.canConnect();
    $('btn-conn').disabled = !!conn || busy;
    $('btn-flowcheck').disabled = busy || s.bopClosed || !!s.flowCheck;
    $('btn-bop').disabled = !s.bopInstalled || !!s.gameOver;
    $('btn-bop').textContent = s.bopClosed ? 'Åpne BOP' : 'Steng BOP';
    $('btn-bop').classList.toggle('danger', !s.bopClosed);
    $('btn-trip').disabled = busy || s.bopClosed;
    $('btn-casing').disabled = busy || s.bopClosed || !!s.canRunCasing();
    $('btn-casing').textContent = s.wellComplete ? 'Brønnen er ferdig' : `Kjør ${s.section.casing.name.split(' (')[0]}`;
    let hint = '';
    if (s.op) hint = `Pågår: ${s.op.name}.`;
    else if (s.bopClosed) hint = 'Brønnen er stengt. Bruk Brønnkontroll-fanen.';
    else if (conn && s.onBottom) hint = conn;
    else if (s.canRunCasing()) hint = `${s.canRunCasing()}`;
    $('op-hint').textContent = hint;
    $('mud-info').textContent = `${nf(s.pitSg, 2)} sg ${s.mud.type}`;
    for (const b of $('speed').querySelectorAll('button')) {
      const v = +b.dataset.s;
      b.classList.toggle('on', v === 0 ? s.paused : !s.paused && v === s.timeScale);
    }
    // Alarmer
    const al = $('alarms');
    const crit = s.alarms.filter((a) => a.level !== 'info').slice(0, 3);
    const sig = crit.map((a) => a.id + a.text).join('|');
    if (al.dataset.sig !== sig) {
      al.dataset.sig = sig;
      al.innerHTML = '';
      for (const a of crit) {
        const d = document.createElement('div');
        d.className = `alarm ${a.level}`;
        const ic = document.createElement('span');
        ic.className = 'ic';
        ic.textContent = a.level === 'critical' ? '!' : a.level === 'serious' ? '!' : 'i';
        d.append(ic, document.createTextNode(a.text));
        al.appendChild(d);
      }
    }
    // Operasjon
    const op = s.opProgress;
    $('opbar').hidden = !op;
    if (op) {
      $('op-name').textContent = op.name;
      $('op-step').textContent = op.step;
      $('op-pct').textContent = `${Math.round(op.frac * 100)} %`;
      $('op-fill').style.width = `${op.frac * 100}%`;
    }
    const [gt, gx] = guideText();
    $('guide-title').textContent = gt;
    $('guide-text').textContent = gx;
    const gi = $('guide-inline');
    if (gi) { gi.firstElementChild.textContent = gt; gi.lastElementChild.textContent = gx; }
    // Sparklines
    const ser = s.series.slice(-60);
    const colors = { hookload: '--s7', wob: '--s1', rpm: '--s3', torque: '--s4', spp: '--s4', rop: '--s1', flowIn: '--s3', flowOut: '--s2', pitGain: '--s1', ecd: '--s3', gas: '--s8', chokeP: '--s8' };
    const cs = getComputedStyle(document.documentElement);
    for (const g of GAUGES) {
      if (!g.spark) continue;
      drawSpark(gaugeEls[g.id].cv, ser.map((p) => p[g.spark]), cs.getPropertyValue(colors[g.spark] || '--s1').trim());
    }
    // Game over
    $('gameover').hidden = !s.gameOver;
    if (s.gameOver) $('go-text').textContent = s.gameOver.reason;
    // Brønnkontroll-fane: markering
    const wcTab = $('ptabs').querySelector('[data-p="wc"]');
    const needWc = s.bopClosed || s.alarms.some((a) => a.id === 'pitgain');
    if (wcTab.dataset.alert !== String(needWc)) {
      wcTab.dataset.alert = String(needWc);
      wcTab.innerHTML = needWc ? 'Brønnkontroll<span class="dot"></span>' : 'Brønnkontroll';
    }
  }

  function kv(el, rows) {
    el.innerHTML = '';
    for (const [k, v] of rows) {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      el.append(dt, dd);
    }
  }

  let lastEvents = null;
  function drawPanels(force) {
    const s = sim;
    $('sec-title').textContent = s.section.title;
    if (pane === 'well') {
      drawWellSchematic($('cv-well'), s, wellZoom);
      const bha = s.section.bha.map((c) => c.name).join(' + ');
      kv($('well-kv'), [
        ['Krone', `${s.section.bit.name}`],
        ['Slitasje / meter / timer', `${Math.round(s.bitWear * 100)} % · ${nf(s.bitMeters, 0)} m · ${nf(s.bitHours, 1)} h`],
        ['BHA', bha],
        ['Stativ i hullet', `${s.standsInHole}`],
        ['Siste sko og FIT', `${nf(s.lastShoe, 0)} m · ${nf(s.lotEMW, 2)} sg`],
        ['Trykktap krone / streng', `${nf(s.dpBit, 0)} / ${nf(s.dpString, 0)} bar`],
        ['Jetkraft / HHP på krona', `${nf(s.jetForce * 4.448, 0)} N · ${nf(s.hhpBit, 0)} hk`],
        ['Ringromshastighet (åpent hull)', `${nf(s.annVelocity || 0, 2)} m/s`],
        ['Bunnen opp (lag time)', Number.isFinite(s.lagTime) ? `${nf(s.lagTime / 60, 0)} min` : '–'],
        ['Oppdriftsfaktor', nf(s.buoyancyFactor, 3)],
      ]);
    }
    if (pane === 'press') {
      drawPressureWindow($('cv-press'), s, $('truth').checked);
      const z = s.bitDepth;
      kv($('press-kv'), [
        ['Bunnhullstrykk', `${nf(s.bottomPressure, 1)} bar`],
        ['Slamvekt i tankene', `${nf(s.pitSg, 2)} sg`],
        ['ECD ved krona / skoen', `${nf(s.ecdBit, 3)} / ${nf(s.ecdShoe, 3)} sg`],
        ['Statisk (ESD) ved krona', `${nf(s.esdBit, 3)} sg`],
        ['Poretrykk (prognose) ved krona', z > SEABED ? `${nf(prognosisPoreEMW(z), 2)} sg` : '–'],
        ['FIT ved skoen', `${nf(s.lotEMW, 2)} sg`],
        ['MAASP', `${nf(s.maasp, 0)} bar`],
      ]);
    }
    if (pane === 'log') {
      drawDepthLog($('cv-log'), s);
      drawTrends($('cv-trend'), s);
    }
    if (pane === 'wc') {
      drawKillChart($('cv-kill'), s);
      const ks = s.kill ? s.kill.sheet : s.killSheet();
      let status, cls = '';
      if (!s.bopInstalled) status = 'BOP er ikke installert. Uten stigerør bores topphullet med returer til havbunnen.';
      else if (s.kill && s.kill.done) status = 'Brønnen er drept. Åpne BOP og fortsett.';
      else if (s.kill) { status = `Dreping pågår (${s.kill.method === 'ww' ? 'vent og vekt' : `borerens metode, ${s.kill.stage}. sirkulasjon`}). ${nf(s.strokes - s.kill.strokes0, 0)} slag pumpet.`; cls = 'warn'; }
      else if (s.bopClosed && s.shutIn && !s.shutIn.stable) { status = 'Brønnen er stengt. Trykkene stabiliseres…'; cls = 'warn'; }
      else if (s.bopClosed) { status = 'Brønnen er stengt og trykkene er stabile. Bland drepeslam og start dreping.'; cls = 'warn'; }
      else if (s.alarms.some((a) => a.id === 'pitgain')) { status = 'Tegn på brønnspark! Steng BOP.'; cls = 'crit'; }
      else status = 'Brønnen er åpen og stabil.';
      $('wc-status').className = `callout ${cls}`;
      $('wc-status').textContent = status;
      kv($('wc-kv'), [
        ['SIDPP (stengt borerørstrykk)', s.bopClosed ? `${nf(s.shutIn && s.shutIn.stable && !s.kill ? s.shutIn.sidpp : s.sidpp, 1)} bar` : '–'],
        ['SICP (stengt chokettrykk)', s.bopClosed ? `${nf(s.shutIn && s.shutIn.stable && !s.kill ? s.shutIn.sicp : s.chokeP, 1)} bar` : '–'],
        ['Tankøkning', `${nf(s.pitGain, 2)} m³`],
        ['Opprinnelig slamvekt (OMW)', `${nf(ks.omw, 2)} sg`],
        ['Drepeslam (KMW)', s.bopClosed || s.kill ? `${nf(ks.kmw, 3)} → ${nf(ks.kmwRound, 2)} sg` : '–'],
        ['SCR ved 30 slag/min', `${nf(ks.scr, 1)} bar`],
        ['ICP / FCP', s.bopClosed || s.kill ? `${nf(ks.icp, 1)} / ${nf(ks.fcp, 1)} bar` : '–'],
        ['Slag overflate → krone', nf(ks.stb, 0)],
        ['Slag krone → overflate', nf(ks.bts, 0)],
        ['MAASP', `${nf(ks.maasp, 0)} bar`],
        ['Chokeåpning', `${nf((s.chokeMode === 'manual' ? s.chokeOpening : s.chokeOpeningShown) * 100, 0)} %`],
      ]);
      const closed = s.bopClosed;
      $('btn-kmw').disabled = !closed || !(s.shutIn && s.shutIn.stable) || (s.kill && s.kill.done);
      $('btn-kill-ww').disabled = !closed || !!s.kill || !(s.shutIn && s.shutIn.stable);
      $('btn-kill-dm').disabled = !closed || !!s.kill || !(s.shutIn && s.shutIn.stable);
      $('btn-dm2').hidden = !(s.kill && s.kill.method === 'drillers' && s.kill.stage === 2 && s.Q === 0);
      $('btn-openbop').disabled = !closed;
      for (const b of $('choke-mode').querySelectorAll('button')) b.setAttribute('aria-pressed', b.dataset.m === s.chokeMode ? 'true' : 'false');
      $('choke').disabled = s.chokeMode !== 'manual' || !closed;
      $('choke-v').textContent = `${nf((s.chokeMode === 'manual' ? s.chokeOpening : s.chokeOpeningShown) * 100, 0)} %`;
      if (s.chokeMode !== 'manual') $('choke').value = Math.round((s.chokeOpeningShown || 0) * 100);
    }
    if (pane === 'ev' || force) {
      if (lastEvents !== s.events[0] || force) {
        lastEvents = s.events[0];
        const ul = $('events');
        ul.innerHTML = '';
        for (const e of s.events.slice(0, 120)) {
          const li = document.createElement('li');
          li.className = e.level === 'alarm' ? 'alarm-l' : e.level === 'warn' ? 'warn-l' : e.level === 'op' ? 'op-l' : '';
          const t = document.createElement('time'); t.textContent = clockText(e.t);
          const p = document.createElement('span'); p.textContent = e.text;
          li.append(t, p);
          ul.appendChild(li);
        }
      }
    }
  }

  let tFast = 0, tSlow = 0;
  function tick(dt) {
    tFast += dt; tSlow += dt;
    if (tFast > 0.12) { tFast = 0; updateFast(); }
    if (tSlow > 0.33) { tSlow = 0; drawPanels(false); }
  }
  updateFast();
  drawPanels(true);
  updateMixHint();

  return {
    tick,
    showPart,
    hoverPart,
    attachScene,
    resync() { syncInputs(); updateMixHint(); drawPanels(true); updateFast(); },
  };
}

export function scenarioCards(container, onPick) {
  container.innerHTML = '';
  for (const sc of SCENARIOS) {
    const b = document.createElement('button');
    if (sc.recommended) b.classList.add('rec');
    const em = document.createElement('em'); em.textContent = sc.recommended ? 'Anbefalt start' : sc.id === 'res' ? 'Brønnkontroll' : 'Hele brønnen';
    const t = document.createElement('b'); t.textContent = sc.title;
    const p = document.createElement('span'); p.textContent = sc.text;
    b.append(em, t, p);
    b.addEventListener('click', () => onPick(sc.id));
    container.appendChild(b);
  }
}
