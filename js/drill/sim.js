// Boresimulator: fysikkmotor for en halvt nedsenkbar rigg som borer en vertikal letebrønn.
// Tidssteget er eksplisitt (≤ 1 s). Trykk i bar, dybder i m RKB, tetthet i sg, volum i m³.

import {
  RKB, SEABED, SEAWATER_SG, STEEL_SG, BAR_PER_M_SG, STAND_LENGTH, TRAVEL_EQUIP_T, TD_PLAN, PUMP, TOP_DRIVE,
  DAY_RATE_MNOK, PIPE, FORMATIONS, SECTIONS, SCENARIOS, CHOKE_LINE,
  formationAt, porePressure, poreEMW, fracEMW, fracPressure, temperatureAt, prognosisPoreEMW, inch,
} from './config.js';
import {
  pipeLossPsi, annLossPsi, bitLossPsi, jetImpactLbf, bitHHP, PSI_PER_BAR, LPM_PER_GPM, FT_PER_M, PPG_PER_SG,
  chokeFlow, chokeOpeningFor,
} from './hydraulics.js';
import { ropBourgoyneYoung, wearRate, bitTorque, stringTorque, dcExponent, torsionalPeriod } from './rop.js';
import {
  stringSections, annulusPieces, stringVolumes, annDepthAtVolume, stringDepthAtVolume, areaAtDepth,
  totalVol, mergeSegs, removeFromEnd, removeFromStart, areaFromIn,
} from './wellbore.js';
import { zDAK, pseudoCritical } from '../pvt/gas.js';
import { nf } from '../util/format.js';

const E_STEEL = 2.07e11;           // Pa
const R_BAR = 0.0831446;           // bar·m³/(kmol·K)
const GAS_SG = 0.65;
const GAS_M = GAS_SG * 28.9647;
const GAS_PC = pseudoCritical(GAS_SG);
const C_EFF = 1.0e-4;              // effektiv kompressibilitet slam + foringsrør (1/bar)
const V_MIG = 0.06;                // gassmigrasjon i oljebasert slam (m/s)
const J_LOSS = 5e-4;               // tapskoeffisient ved oppsprekking (m³/s per bar)
const BLOCK_MIN = 1.2;
const BLOCK_MAX = 34;
const SCR_SPM = 30;                // drepehastighet (slag/min, én pumpe)
const G = BAR_PER_M_SG;

const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const round2 = (x) => Math.round(x * 100) / 100;

function gasZ(Pbar, Tc) {
  const TR = (Tc + 273.15) * 1.8;
  return zDAK(TR / GAS_PC.Tpc, Math.max(Pbar, 1) * PSI_PER_BAR / GAS_PC.Ppc);
}
function gasDensity(Pbar, Tc) {
  const Z = gasZ(Pbar, Tc);
  return Math.max(Pbar, 1) * GAS_M / (Z * R_BAR * (Tc + 273.15));   // kg/m³
}
function gasMoles(V, Pbar, Tc) {
  return Math.max(Pbar, 1) * V / (gasZ(Pbar, Tc) * R_BAR * (Tc + 273.15));
}
function gasVolume(n, Pbar, Tc) {
  const P = Math.max(Pbar, 1);
  return n * gasZ(P, Tc) * R_BAR * (Tc + 273.15) / P;
}

// LWD-respons per formasjon (gammastråling API og resistivitet ohm·m)
const LWD = {
  nordland: [70, 1.2], hordaland: [95, 1.6], rogaland: [82, 2.2], shetland: [22, 9], cromer: [58, 3],
  draupne: [185, 12], tarbert: [34, 70], ness: [105, 6], etive: [30, 45], dunlin: [96, 2.5],
};

export class DrillSim {
  constructor(scenario = 'mid') {
    this.listeners = new Set();
    this.timeScale = 30;
    this.paused = false;
    this.reset(scenario);
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, payload) { for (const fn of this.listeners) fn(type, payload); }

  // ---------- Oppsett ----------
  reset(scenarioId) {
    const sc = SCENARIOS.find((s) => s.id === scenarioId) || SCENARIOS[0];
    const k = sc.section;
    this.scenario = sc.id;
    this.t = 6 * 3600;
    this.t0 = this.t;
    this.cost = 0;
    this.events = [];
    this.alarms = [];
    this._alarmIds = new Set();
    this.depthLog = [];
    this.series = [];
    this._seriesT = 0;
    this.gasQueue = [];
    this.gasUnits = 0.05;
    this.bitsUsed = 1;
    this.kickCount = 0;
    this.maxPitGain = 0;
    this.wellComplete = false;
    this.gameOver = null;
    this.op = null;
    this.kill = null;
    this.bhpTarget = null;
    this.chokeMode = 'auto';
    this.chokeOpening = 0;
    this.chokeOpeningShown = 0;
    this.chokeP = 0;
    this.compressedVol = 0;
    this.shutIn = null;
    this.strokes = 0;
    this.heaveHs = 2.5;
    this.heaveTp = 9;
    this.heaveComp = true;
    this.heave = 0;
    this.flowCheck = null;
    this.gasVentRate = 0;
    this.gasAtSurface = false;
    this.cuttingsLoad = 0;
    this.stickSlip = 0;
    this.influxTotal = 0;
    this.lossTotal = 0;
    this.qInflux = 0;
    this.qLoss = 0;
    this.pitGainRef = 0;
    this.drillBreak = false;

    this.sectionIndex = k;
    this.section = SECTIONS[k];
    this.casings = [];
    for (let i = 0; i < k; i++) this.casings.push(this._casingFor(i, SECTIONS[i].casing.shoe));
    this.bopInstalled = k >= 2;
    this.bopClosed = false;
    this.lastShoe = k === 0 ? SEABED : SECTIONS[k - 1].casing.shoe;
    this.lotEMW = k === 0 ? 1.04 : round2(fracEMW(this.lastShoe) - 0.01);
    this.holeDepth = k === 0 ? SEABED + 1 : this.lastShoe + 5;
    this.blockPos = 15;
    this.bitDepth = this.holeDepth - (k === 0 ? 0.5 : 2);
    this.stringLen = this.bitDepth + this.blockPos;
    this.onBottom = false;

    const m = this.section.mud;
    this.mud = { name: m.name, type: m.type, pv: m.pv, yp: m.yp };
    this.pitSg = m.sg;
    this.pitTargetSg = m.sg;
    this.pitVolume = m.type === 'SW' ? 400 : 160;
    this.reserveVolume = 600;
    this.bariteUsed = 0;

    this.pumpOn = [true, true, false];
    this.pumpsRunning = false;
    this.spmSet = Math.round(this.section.flow / (2 * PUMP.litersPerStroke));
    this.spm = 0;
    this.Q = 0;
    this.rotOn = false;
    this.rpmSet = this.section.rpm;
    this.rpm = 0;
    this.autoDrill = true;
    this.wobSet = this.section.wob;
    this.blockVelCmd = 0;
    this.wob = 0;
    this.rop = 0;
    this.torque = 0;
    this.bitWear = 0;
    this.bitHours = 0;
    this.bitMeters = 0;
    this.spp = 0;
    this.sppLimited = false;

    this._updateGeometry();
    this.ds = [{ v: this.geom.dsVol, sg: this._inletSg() }];
    this.an = [{ v: this.geom.anVol + this.geom.rathole, sg: this._inletSg() }];
    this.inSlips = false;
    this._updateBlock(0);
    this.returnsRate = 0;
    this.flowOut = 0;
    this._lastFormationId = formationAt(this.holeDepth)?.id;
    this._computePressures();
    this.pitGainRef = this.pitVolume;
    this._synthLog();
    this.logEvent(`Scenario: ${sc.title}. Brønn ${this.section.title.toLowerCase()} – hulldybde ${nf(this.holeDepth, 0)} m.`, 'info');
    if (k > 0) this.logEvent(`Formasjonsstyrketest (FIT) ved ${nf(this.lastShoe, 0)} m sko: ${nf(this.lotEMW, 2)} sg EMW.`, 'info');
    this.emit('reset');
  }

  _casingFor(i, shoe) {
    const c = SECTIONS[i].casing;
    const liner = c.name.includes('liner');
    const top = liner ? Math.max(SEABED, (this.casings[this.casings.length - 1]?.shoe ?? SEABED) - 150) : SEABED;
    return { name: c.name, od: c.od, id: c.id, top, shoe, section: i };
  }

  // ---------- Hovedsløyfe ----------
  effectiveTimeScale() {
    if (this.op) {
      const s = this.op.steps[this.op.i];
      return Math.max(this.timeScale, s.dur / (s.real ?? 2.5));
    }
    return this.timeScale;
  }

  update(dtReal) {
    if (this.paused || this.gameOver) return;
    let simDt = Math.min(dtReal, 0.25) * this.effectiveTimeScale();
    const frozen = this.op && this.op.frozen;
    const risky = this.bopClosed || this.qInflux > 0 || this.an.some((g) => g.gas);
    const maxStep = frozen ? 120 : risky ? 0.5 : 1.0;
    let n = Math.ceil(simDt / maxStep);
    if (n > 600) { n = 600; simDt = n * maxStep; }
    const dt = simDt / Math.max(n, 1);
    for (let i = 0; i < n; i++) {
      this.step(dt);
      if (this.gameOver) break;
    }
    this.emit('tick');
  }

  step(dt) {
    this.t += dt;
    this.cost += DAY_RATE_MNOK * dt / 86400;
    if (this.op) {
      this._opTick(dt);
      if (this.op && this.op.frozen) { this._record(dt); return; }
    }
    this._updatePumps(dt);
    this._updateRotation(dt);
    this._updateHeave();
    this._updateBlock(dt);
    this._updateGeometry();
    this._adjustStringVolume();
    const Vp = this.Q * dt;
    if (Vp > 0) this._pump(Vp);
    this._computePressures();
    this._influxAndLosses(dt);
    this._migrateGas(dt);
    this._outflow(dt);
    this._computePressures();
    this._checkPumpPressure();
    this._drill(dt);
    this._mixMud(dt);
    this._gasLogging(dt);
    this._flowCheckTick(dt);
    this._killTick(dt);
    this._record(dt);
    this._checkAlarms();
  }

  // ---------- Pumper og rotasjon ----------
  get pumpsOnCount() { return this.pumpOn.filter(Boolean).length; }
  get flowInLpm() { return this.Q * 60000; }
  get nominalQ() { return this.section.flow / 60000; }

  _updatePumps(dt) {
    const target = this.pumpsRunning ? this.spmSet : 0;
    this.spm += clamp(target - this.spm, -30 * dt, 15 * dt);
    if (this.spm < 0.05 && target === 0) this.spm = 0;
    const n = this.pumpsOnCount;
    this.Q = n * this.spm / 60 * PUMP.litersPerStroke / 1000;
    this.strokes += n * this.spm / 60 * dt;
  }

  _checkPumpPressure() {
    if (this.Q <= 0) { this.sppLimited = false; return; }
    if (this.spp > PUMP.popOff) {
      this.pumpsRunning = false;
      this.logEvent(`Sikkerhetsventilen (pop-off) løste ut ved ${nf(this.spp, 0)} bar – pumpene stoppet.`, 'alarm');
      return;
    }
    const n = Math.max(this.pumpsOnCount, 1);
    const powerKW = this.spp * 1e5 * this.Q / 1000 / n;
    this.sppLimited = powerKW > PUMP.hydPowerKW || this.spp > PUMP.maxPressure;
    if (this.sppLimited && this.spmSet > 5) this.spmSet = Math.max(5, this.spmSet - 0.5);
  }

  _updateRotation(dt) {
    const target = this.rotOn ? this.rpmSet : 0;
    this.rpm += clamp(target - this.rpm, -40 * dt, 25 * dt);
    if (this.rpm < 0.2 && target === 0) this.rpm = 0;
  }

  _updateHeave() {
    const w = 2 * Math.PI / this.heaveTp;
    const t = this.t;
    const s = 0.62 * Math.sin(w * t) + 0.28 * Math.sin(w * t / 1.27 + 1.3) + 0.1 * Math.sin(w * t / 0.73 + 2.1);
    this.heave = 0.25 * this.heaveHs / 2 * s;
  }

  // ---------- Blokk, vekt på krone og krokvekt ----------
  _updateBlock(dt) {
    const k = this.kString;
    const heaveRes = this.heaveComp ? 0.04 * this.heave : this.heave;
    if (!this.op) {
      const canAuto = this.autoDrill && this.rpm > 5 && this.Q > 0.25 * this.nominalQ && this.blockVelCmd === 0;
      if (canAuto) {
        const targetFree = this.holeDepth + this.wobSet / k;
        const targetBlock = this.stringLen - targetFree;
        this.blockPos += clamp(targetBlock - this.blockPos, -0.35 * dt, 0.5 * dt);
      } else if (this.blockVelCmd !== 0) {
        let v = this.blockVelCmd;
        if (v < 0 && this.onBottom) v = Math.max(v, -0.02);
        this.blockPos += v * dt;
      }
    }
    this.blockPos = clamp(this.blockPos, BLOCK_MIN, BLOCK_MAX);
    if (this.inSlips) {
      this.bitDepth = this.slipsDepth;
      this.onBottom = false;
      this.wob = 0;
      this.hookload = TRAVEL_EQUIP_T;
      return;
    }
    const bitFree = this.stringLen - this.blockPos - heaveRes;
    if (bitFree < this.holeDepth) {
      this.onBottom = false;
      this.bitDepth = bitFree;
      this.wob = 0;
    } else {
      this.onBottom = true;
      this.bitDepth = this.holeDepth;
      this.wob = Math.min(k * (bitFree - this.holeDepth), this.buoyedWeightT * 0.95);
      if (this.wob > 0 && this.wob < 0.05) this.wob = 0;
    }
    const drag = this.blockVelCmd !== 0 && !this.onBottom ? 0.03 * this.buoyedWeightT * Math.sign(this.blockVelCmd) : 0;
    this.hookload = TRAVEL_EQUIP_T + this.buoyedWeightT - this.wob + drag;
  }

  // ---------- Geometri ----------
  _updateGeometry() {
    const secs = stringSections(this.section, this.bitDepth);
    const opts = { bopInstalled: this.bopInstalled, bopClosed: this.bopClosed };
    const pieces = annulusPieces(secs, this.bitDepth, this.casings, this.section.hole, opts);
    const sv = stringVolumes(secs);
    let anVol = 0;
    for (const p of pieces) anVol += p.vol;
    // Strengvekt og aksial stivhet
    let massKg = 0, compl = 0;
    for (const s of secs) {
      const L = s.bot - s.top;
      massKg += s.kgm * L;
      const A = s.kgm / (STEEL_SG * 1000);
      compl += L / (E_STEEL * A);
    }
    const aboveRkb = Math.max(this.stringLen - this.bitDepth, 0);
    massKg += PIPE.dp.kgm * aboveRkb;
    const mwAvg = this.an ? this._avgAnnulusSg() : this.pitSg;
    this.buoyancyFactor = 1 - mwAvg / STEEL_SG;
    this.buoyedWeightT = massKg / 1000 * this.buoyancyFactor;
    this.airWeightT = massKg / 1000;
    this.kString = 1 / compl / 9806.65;                      // tonn per meter
    // Rottehull under krona (mellom krona og hullbunnen) er en del av brønnvolumet
    const rathole = Math.PI / 4 * inch(this.section.hole) ** 2 * Math.max(this.holeDepth - this.bitDepth, 0);
    this.geom = { secs, pieces, dsVol: sv.inner, steelVol: sv.steel, anVol, rathole, opts };
  }

  _avgAnnulusSg() {
    let v = 0, m = 0;
    for (const g of this.an) { if (!g.gas) { v += g.v; m += g.v * g.sg; } }
    return v > 0 ? m / v : this.pitSg;
  }

  // Strengens volum følger geometrien (nye stativ fylles med slam fra tankene)
  _adjustStringVolume() {
    const diff = this.geom.dsVol - totalVol(this.ds);
    if (diff > 1e-9) {
      this.ds.unshift({ v: diff, sg: this._inletSg() });
      if (!this.section.riserless) { this.pitVolume -= diff; this.pitGainRef -= diff; }
    } else if (diff < -1e-9) {
      removeFromStart(this.ds, -diff);
      if (!this.section.riserless) { this.pitVolume += -diff; this.pitGainRef += -diff; }
    }
    this.ds = mergeSegs(this.ds);
  }

  _inletSg() { return this.section.riserless ? SEAWATER_SG : this.pitSg; }

  _pump(Vp) {
    const sgIn = this._inletSg();
    this.ds.unshift({ v: Vp, sg: sgIn });
    if (!this.section.riserless) this.pitVolume -= Vp;
    const moved = [];
    let left = Vp;
    while (left > 1e-12 && this.ds.length) {
      const g = this.ds[this.ds.length - 1];
      const take = Math.min(g.v, left);
      moved.push({ v: take, sg: g.sg });
      g.v -= take;
      left -= take;
      if (g.v <= 1e-12) this.ds.pop();
    }
    for (const m of moved) this.an.unshift(m);
    this.ds = mergeSegs(this.ds);
    this.an = mergeSegs(this.an);
  }

  // ---------- Trykk ----------
  _topPressure() {
    if (!this.bopInstalled) return G * SEAWATER_SG * (SEABED - RKB);
    return this.bopClosed ? this.chokeP : 0;
  }

  _computePressures() {
    const pieces = this.geom.pieces;
    const zTop = this.bopInstalled ? 0 : SEABED;
    const Ptop = this._topPressure();
    // Dybdespenn for hvert ringromssegment
    let acc = -this.geom.rathole, zPrev = this.bitDepth;
    for (const g of this.an) {
      acc += g.v;
      const z = acc <= 0 ? this.bitDepth : Math.max(annDepthAtVolume(pieces, acc), zTop);
      g.zBot = zPrev; g.zTop = z;
      zPrev = z;
      if (g.gas) {
        const zm = 0.5 * (g.zBot + g.zTop);
        const P = this.annKnots ? this.pressureAt(zm) : Ptop + G * this.pitSg * (zm - zTop);
        g.T = temperatureAt(zm);
        g.P = P;
        g.rho = gasDensity(P, g.T);
        g.sg = g.rho / 1000;
      }
    }
    // Friksjonsgradienter (bar/m)
    const qgpm = this.Q * 60000 / LPM_PER_GPM;
    const rhoPpg = this._avgAnnulusSg() * PPG_PER_SG;
    const { pv, yp } = this.mud;
    for (const p of pieces) {
      if (qgpm <= 0) { p.fg = 0; continue; }
      const psiPerFt = p.chokeLine
        ? pipeLossPsi(qgpm, p.D, 1, rhoPpg, pv, yp)
        : annLossPsi(qgpm, p.D, p.od, 1, rhoPpg, pv, yp);
      p.fg = psiPerFt / PSI_PER_BAR * FT_PER_M;
    }
    // Knutepunkter fra topp til krone
    const bset = new Set([zTop, this.bitDepth]);
    for (const p of pieces) { bset.add(p.top); bset.add(p.bot); }
    for (const g of this.an) { bset.add(g.zTop); bset.add(g.zBot); }
    const bounds = [...bset].filter((z) => z >= zTop && z <= this.bitDepth).sort((a, b) => a - b);
    const knots = [{ z: bounds[0], P: Ptop, Ph: 0, Pf: 0 }];
    let P = Ptop, Ph = 0, Pf = 0;
    let si = this.an.length - 1, pi = pieces.length - 1;
    for (let i = 0; i < bounds.length - 1; i++) {
      const a = bounds[i], b = bounds[i + 1];
      if (b - a < 1e-9) continue;
      const mid = 0.5 * (a + b);
      while (si > 0 && this.an[si].zBot < mid) si--;
      while (pi > 0 && pieces[pi].bot < mid) pi--;
      const seg = this.an[si];
      const sg = seg ? seg.sg : this.pitSg;
      const fg = pieces[pi] ? pieces[pi].fg : 0;
      Ph += G * sg * (b - a);
      Pf += fg * (b - a);
      P = Ptop + Ph + Pf;
      knots.push({ z: b, P, Ph, Pf });
    }
    this.annKnots = knots;
    this.bhp = P;
    this.annFriction = Pf;
    this.annHydro = Ph;
    const sgBottom = this.an[0] ? this.an[0].sg : this.pitSg;
    this.sgBottom = sgBottom;
    this.bottomPressure = P + G * sgBottom * Math.max(this.holeDepth - this.bitDepth, 0);
    this.ecdBit = this.bhp / (G * Math.max(this.bitDepth, 1));
    this.esdBit = (this.bhp - Pf) / (G * Math.max(this.bitDepth, 1));
    const shoeZ = Math.min(this.lastShoe, this.bitDepth);
    this.pShoe = this.pressureAt(shoeZ);
    this.ecdShoe = this.pShoe / (G * Math.max(shoeZ, 1));
    this.maasp = Math.max(0, (this.lotEMW - this.pitSg) * G * this.lastShoe);

    // Strengsiden
    const secs = this.geom.secs;
    let accS = 0, zS = 0, hydS = 0;
    for (const g of this.ds) {
      accS += g.v;
      const z = Math.min(stringDepthAtVolume(secs, accS), this.bitDepth);
      hydS += G * g.sg * Math.max(z - zS, 0);
      zS = z;
    }
    if (zS < this.bitDepth) hydS += G * this._inletSg() * (this.bitDepth - zS);
    this.hydString = hydS;
    const rhoIn = this._inletSg() * PPG_PER_SG;
    let fricS = 0;
    for (const s of secs) fricS += pipeLossPsi(qgpm, s.id, (s.bot - s.top) * FT_PER_M, rhoIn, pv, yp);
    fricS += pipeLossPsi(qgpm, 3.826, 500, rhoIn, pv, yp);            // standrør, borehose, toppdrev
    this.dpBit = bitLossPsi(qgpm, rhoIn, this.section.bit.tfa) / PSI_PER_BAR;
    const hasTool = this.section.bha.some((c) => c.tool);
    const qn = this.nominalQ > 0 ? this.Q / this.nominalQ : 0;
    this.dpTools = hasTool ? 22 * qn * qn * this._inletSg() / 1.3 : 0;
    this.dpString = fricS / PSI_PER_BAR;
    this.jetForce = jetImpactLbf(qgpm, rhoIn, this.dpBit * PSI_PER_BAR);
    this.hhpBit = bitHHP(qgpm, this.dpBit * PSI_PER_BAR);
    if (this.Q > 0) {
      this.spp = Math.max(0, this.bhp - this.hydString + this.dpString + this.dpBit + this.dpTools);
    } else {
      this.spp = Math.max(0, this.bhp - this.hydString);
    }
    this.sidpp = Math.max(0, this.bhp - this.hydString);
  }

  pressureAt(z) {
    const k = this.annKnots;
    if (!k || !k.length) return 0;
    if (z >= this.bitDepth) return this.bhp + G * (this.sgBottom ?? this.pitSg) * (z - this.bitDepth);
    if (z <= k[0].z) return k[0].P;
    let lo = 0, hi = k.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (k[mid].z < z) lo = mid; else hi = mid;
    }
    const a = k[lo], b = k[hi];
    const f = b.z > a.z ? (z - a.z) / (b.z - a.z) : 0;
    return a.P + f * (b.P - a.P);
  }

  // ---------- Innstrømning (brønnspark) og tap ----------
  _influxAndLosses(dt) {
    this.qInflux = 0;
    this.influxFluid = null;
    for (const f of FORMATIONS) {
      if (!f.perm) continue;
      const top = Math.max(f.top, this.lastShoe);
      let bot = Math.min(f.base, this.holeDepth);
      if (f.perm.owc) bot = Math.min(bot, f.perm.owc);
      if (bot <= top) continue;
      const L = bot - top;
      const zm = 0.5 * (top + bot);
      const dP = porePressure(zm) - this.pressureAt(zm);
      if (dP <= 0) continue;
      const q = f.perm.J * L * dP;                        // m³/s ved brønnforhold
      this.qInflux += q;
      this.influxFluid = f.perm.fluid;
      const V = q * dt;
      this.influxTotal += V;
      const Pw = this.pressureAt(zm);
      const Tz = temperatureAt(zm);
      if (f.perm.fluid === 'gas') {
        const n = gasMoles(V, Pw, Tz);
        // Slå sammen med en gassboble nær bunnen (innenfor 50 m) for å holde modellen enkel
        let g0 = null;
        for (let i = 0; i < Math.min(this.an.length, 4); i++) {
          const g = this.an[i];
          if (g.gas && (g.zBot ?? this.bitDepth) > this.bitDepth - 50) { g0 = g; break; }
        }
        if (g0) { g0.n += n; g0.v += V; } else {
          const rho = gasDensity(Pw, Tz);
          this.an.unshift({ v: V, gas: true, n, sg: rho / 1000, rho, P: Pw, T: Tz, zTop: this.bitDepth, zBot: this.bitDepth });
        }
      } else {
        const g0 = this.an[0];
        if (g0 && g0.oil) g0.v += V; else this.an.unshift({ v: V, sg: 0.72, oil: true });
      }
    }
    // Tap av slam der trykket overstiger oppsprekkingstrykket (svakeste punkt: skoen og hullbunnen)
    this.qLoss = 0;
    if (this.holeDepth > this.lastShoe + 1) {
      const zs = this.lastShoe + 1;
      const pFracShoe = this.lotEMW * G * zs;
      const over = [this.pressureAt(zs) - pFracShoe, this.pressureAt(this.holeDepth) - fracPressure(this.holeDepth)];
      for (const o of over) if (o > 0) this.qLoss += J_LOSS * o;
    }
    if (this.qLoss > 0) {
      let V = this.qLoss * dt;
      this.lossTotal += V;
      for (let i = 0; i < this.an.length && V > 0; i++) {
        const g = this.an[i];
        if (g.gas) continue;
        const take = Math.min(g.v, V);
        g.v -= take; V -= take;
      }
      this.an = mergeSegs(this.an);
    }
    this.an = mergeSegs(this.an);
  }

  _migrateGas(dt) {
    for (let i = 0; i < this.an.length; i++) {
      const g = this.an[i];
      if (!g.gas || i === this.an.length - 1) continue;
      if (this.qInflux > 0 && (g.zBot ?? 0) > this.bitDepth - 50) continue;
      const above = this.an[i + 1];
      if (above.gas) continue;
      const zm = 0.5 * ((g.zTop ?? 0) + (g.zBot ?? 0));
      const dV = Math.min(V_MIG * areaAtDepth(this.geom.pieces, zm) * dt, above.v);
      if (dV <= 0) continue;
      above.v -= dV;
      const below = this.an[i - 1];
      if (below && !below.gas && Math.abs(below.sg - above.sg) < 1e-4) below.v += dV;
      else { this.an.splice(i, 0, { v: dV, sg: above.sg, oil: above.oil }); i++; }
    }
    this.an = mergeSegs(this.an);
  }

  // ---------- Utstrømning, choke og tanker ----------
  _outflow(dt) {
    const Vgeom = this.geom.anVol + this.geom.rathole;
    let Vliq = 0;
    const gasSegs = [];
    for (const g of this.an) {
      if (g.gas) gasSegs.push(g); else Vliq += g.v;
    }
    const gasVolAt = (dP) => {
      let v = 0;
      for (const g of gasSegs) v += gasVolume(g.n, (g.P ?? 100) + dP, g.T ?? 60);
      return v;
    };
    const E = (dP) => Vliq + gasVolAt(dP) - Vgeom;
    const setGas = (dP) => { for (const g of gasSegs) g.v = gasVolume(g.n, (g.P ?? 100) + dP, g.T ?? 60); };
    let removed = null;
    this.gasVentRate = 0;

    if (!this.bopInstalled || !this.bopClosed) {
      setGas(0);
      const ex = E(0);
      if (ex > 0) removed = removeFromEnd(this.an, ex);
      else if (ex < 0) {
        this.an.push({ v: -ex, sg: this._inletSg() });
        if (!this.section.riserless) this.pitVolume += ex;
      }
      this.compressedVol = 0;
      if (this.bopInstalled) this.chokeP = 0;
      this.chokeOpeningShown = this.bopClosed ? this.chokeOpeningShown : 1;
    } else {
      const Cw = C_EFF * (this.geom.dsVol + Vgeom);
      const Pc0 = this.chokeP;
      const top = this.an[this.an.length - 1];
      const rhoTop = top ? (top.gas ? top.rho : top.sg * 1000) : this.pitSg * 1000;
      const solve = (qOutFn) => {
        const f = (Pc) => E(Pc - Pc0) - Cw * Pc - qOutFn(Pc) * dt;
        if (f(0) <= 0) return 0;
        let lo = 0, hi = 50;
        while (f(hi) > 0 && hi < 5000) hi *= 2;
        for (let i = 0; i < 60; i++) {
          const mid = 0.5 * (lo + hi);
          if (f(mid) > 0) lo = mid; else hi = mid;
        }
        return 0.5 * (lo + hi);
      };
      let Pc;
      if (this.chokeMode === 'manual') {
        Pc = solve((p) => chokeFlow(p, rhoTop, this.chokeOpening));
        this.chokeOpeningShown = this.chokeOpening;
      } else {
        const closed = solve(() => 0);
        let Pctrl = null;
        const k = this.kill;
        if (k && !k.done && this.Q > 0) {
          // Automatisk choke: følg borerørstrykket etter drepeskjemaet (drill pipe pressure method)
          const pumped = this.strokes - k.strokes0;
          const target = this.killTargetDpp(pumped);
          if (target === null) {
            if (k.cpHold === undefined) k.cpHold = Pc0;
            Pctrl = k.cpHold;
          } else {
            Pctrl = Math.max(0, Pc0 + (target - this.spp));
          }
        } else if (this.bhpTarget !== null) {
          Pctrl = Math.max(0, this.bhpTarget - (this.bhp - Pc0));
        }
        Pc = Pctrl === null ? closed : Math.min(closed, Pctrl);
        const outV = Math.max(0, E(Pc - Pc0) - Cw * Pc);
        this.chokeOpeningShown = outV > 1e-9 ? chokeOpeningFor(Pc, outV / dt, rhoTop) : 0;
      }
      setGas(Pc - Pc0);
      const out = E(Pc - Pc0) - Cw * Pc;
      if (out > 1e-12) removed = removeFromEnd(this.an, out);
      else if (out < -1e-12 && Pc <= 0) {
        this.an.push({ v: -out, sg: this._inletSg() });
        this.pitVolume += out;
      }
      this.chokeP = Pc;
      this.compressedVol = Cw * Pc;
    }

    this.returnsRate = 0;
    if (removed) {
      if (!this.section.riserless) {
        if (removed.liq > 0) {
          const sgRet = removed.liqMass / removed.liq;
          this.pitSg = (this.pitSg * this.pitVolume + sgRet * removed.liq) / (this.pitVolume + removed.liq);
          this.pitVolume += removed.liq;
        }
      }
      this.returnsRate = removed.liq / dt;
      if (removed.gasV > 0) {
        this.gasVentRate = removed.gasN * R_BAR * 288.15 / 1.01325 / dt;   // Sm³/s
        if (!this.gasAtSurface) {
          this.gasAtSurface = true;
          this.logEvent(this.bopClosed ? 'Gass ved overflaten – sirkuleres ut gjennom choke og slamgasseparator.' : 'GASS VED OVERFLATEN med åpen brønn!', this.bopClosed ? 'warn' : 'alarm');
        }
        if (!this.bopClosed && this.bopInstalled) this._blowoutCheck(removed.gasN);
      }
    }
    if (!this.an.some((g) => g.gas)) this.gasAtSurface = false;
    this.an = mergeSegs(this.an);
    this.flowOut = this.section.riserless ? null : this.returnsRate;
  }

  _blowoutCheck(nOut) {
    this._openGasOut = (this._openGasOut || 0) + nOut * R_BAR * 288.15 / 1.01325;
    if (this._openGasOut > 150) {
      this.gameOver = { reason: 'Utblåsning: gass strømmet ukontrollert til riggen fordi brønnen ikke ble stengt i tide.' };
      this.logEvent(this.gameOver.reason, 'alarm');
      this.emit('gameover', this.gameOver);
    }
  }

  // ---------- Boring ----------
  _drill(dt) {
    const bit = this.section.bit;
    const f = formationAt(this.holeDepth) || FORMATIONS[0];
    // Dreiemoment og stick-slip
    let T = 0;
    this.stickSlip = 0;
    if (this.rpm > 0.5) {
      T = stringTorque(this.stringLen, this.rpm, this.pitSg, this.cuttingsLoad);
      if (this.onBottom) {
        const Tb = bitTorque(this.wob, bit.size, bit.type);
        T += Tb;
        if (bit.type === 'PDC') {
          this.stickSlip = clamp((0.62 - this.rpm / 140) * (this.wob / bit.wobMax) * 2.4, 0, 1);
        }
      }
      if (this.stickSlip > 0.05) {
        const per = torsionalPeriod(this.stringLen);
        T *= 1 + 0.45 * this.stickSlip * Math.sin(2 * Math.PI * this.t / per);
      }
      if (T > TOP_DRIVE.stallTorque) {
        this.rotOn = false;
        this.rpm = 0;
        this.logEvent(`Toppdrevet stanset: dreiemomentet (${nf(T, 0)} kN·m) passerte grensen.`, 'alarm');
        T = 0;
      }
    }
    this.torque = T;

    // Hullrensk: ringromshastighet i åpent hull rundt borerør
    const avOH = this.Q / (Math.PI / 4 * (inch(this.section.hole) ** 2 - inch(PIPE.dp.od) ** 2));
    const vCrit = this.section.riserless ? 0.25 : 0.42 * Math.sqrt(1.2 / this.pitSg);
    const gen = this.rop / 60;                              // m/min
    if (this.Q > 0 && avOH > vCrit) this.cuttingsLoad = Math.max(0, this.cuttingsLoad - dt / 1800 * (avOH / vCrit));
    if (gen > 0 && avOH < vCrit) this.cuttingsLoad = Math.min(1, this.cuttingsLoad + dt / 3600 * gen * 2 * (1 - avOH / vCrit + 0.2));
    this.annVelocity = avOH;

    this.rop = 0;
    this.ropTerms = null;
    if (!this.onBottom || this.rpm < 1 || this.wob < 0.2) return;
    const res = ropBourgoyneYoung({
      a1: f.a1 + bit.factor,
      Dft: this.holeDepth * FT_PER_M,
      gp: poreEMW(this.holeDepth) * PPG_PER_SG,
      ecd: (this.bottomPressure / (G * this.holeDepth)) * PPG_PER_SG,
      wd: this.wob * 2.20462 / bit.size,
      N: this.rpm,
      h: this.bitWear,
      Fj: this.jetForce,
    });
    let rop = res.rop * 0.3048;
    this.ropTerms = res.terms;
    if (this.Q < 0.3 * this.nominalQ) rop *= 0.12;
    if (this.bitWear >= 1) rop *= 0.05;
    rop *= 1 - 0.35 * this.cuttingsLoad;
    this.rop = rop;
    const dz = rop / 3600 * dt;
    const prev = this.holeDepth;
    this.holeDepth += dz;
    if (!this.section.riserless) {
      // Forventet volum til nytt hull i ringrommet (strengens indre volum føres i _adjustStringVolume)
      const aHole = Math.PI / 4 * inch(bit.size) ** 2;
      const aDp = Math.PI / 4 * inch(PIPE.dp.od) ** 2;
      this.pitGainRef -= (aHole - aDp) * dz;
    }
    this.bitMeters += dz;
    this.bitHours += dt / 3600;
    const w = wearRate({ N: this.rpm, wd: this.wob * 2.20462 / bit.size, h: this.bitWear, abras: f.abras, type: bit.type });
    this.bitWear = Math.min(1, this.bitWear + w * dt / 3600 * (1 + 2 * this.stickSlip));
    // Gass fra borekaks
    const holeArea = Math.PI / 4 * inch(bit.size) ** 2;
    const cutRate = rop * holeArea;                         // m³ bergart per time
    this._drillGas = f.gas * cutRate / 1.2;
    // Dybdelogg per meter
    if (Math.floor(this.holeDepth) > Math.floor(prev)) this._logDepth(f);
    // Formasjonstopper
    if (f.id !== this._lastFormationId) {
      this._lastFormationId = f.id;
      this.logEvent(`Ny formasjon på ${nf(f.top, 0)} m: ${f.name} – ${f.lith.toLowerCase()} (${f.age}).`, f.perm ? 'warn' : 'info');
      this.emit('formation', f);
    }
    if (this.holeDepth >= this.section.casing.shoe - 0.5 && !this._tdNotified) {
      this._tdNotified = true;
      this.logEvent(`Seksjonens planlagte dybde (${this.section.casing.shoe} m) er nådd. Sirkuler rent og kjør foringsrør.`, 'info');
    }
  }

  _logDepth(f) {
    const [gr0, rt0] = LWD[f.id] || [80, 2];
    const n1 = Math.sin(this.holeDepth * 0.37) * 0.5 + Math.sin(this.holeDepth * 1.91) * 0.5;
    let rt = rt0;
    if (f.perm && f.perm.owc && this.holeDepth > f.perm.owc) rt = 0.8;
    const dc = dcExponent(this.rop, this.rpm, this.wob, this.section.bit.size, this.ecdBit);
    this.depthLog.push({
      z: Math.floor(this.holeDepth),
      rop: this.rop,
      wob: this.wob,
      rpm: this.rpm,
      torque: this.torque,
      spp: this.spp,
      ecd: this.ecdBit,
      mw: this.pitSg,
      dc,
      gas: this.gasUnits,
      gr: Math.max(5, gr0 * (1 + 0.12 * n1)),
      rt: Math.max(0.2, rt * (1 + 0.15 * n1)),
      fid: f.id,
      pore: poreEMW(this.holeDepth),
    });
    if (this.depthLog.length > 6000) this.depthLog.shift();
  }

  // Borelogg for intervallet som allerede er boret når man starter midt i brønnen
  _synthLog() {
    const zEnd = Math.floor(this.holeDepth) - 1;
    for (let z = Math.ceil(SEABED) + 2; z < zEnd; z += 2) {
      const j = SECTIONS.findIndex((sec) => z <= sec.casing.shoe);
      const sec = SECTIONS[Math.max(j, 0)];
      const f = formationAt(z) || FORMATIONS[0];
      const mw = sec.mud.sg;
      const ecd = mw + (sec.riserless ? 0.01 : 0.03);
      const noise = Math.sin(z * 0.37) * 0.5 + Math.sin(z * 1.91) * 0.5;
      const res = ropBourgoyneYoung({
        a1: f.a1 + sec.bit.factor, Dft: z * FT_PER_M, gp: poreEMW(z) * PPG_PER_SG, ecd: ecd * PPG_PER_SG,
        wd: sec.wob * 2.20462 / sec.bit.size, N: sec.rpm, h: 0.3, Fj: 1200,
      });
      const rop = res.rop * 0.3048 * (1 + 0.12 * noise);
      const [gr0, rt0] = LWD[f.id] || [80, 2];
      let rt = rt0;
      if (f.perm && f.perm.owc && z > f.perm.owc) rt = 0.8;
      const ob = (mw - poreEMW(z)) * G * z;
      this.depthLog.push({
        z, rop, wob: sec.wob, rpm: sec.rpm, torque: null, spp: null, ecd, mw,
        dc: dcExponent(rop, sec.rpm, sec.wob, sec.bit.size, ecd),
        gas: 0.04 + f.gas * 0.05 * Math.exp(-Math.max(ob, 0) / 15) + f.gas * rop * Math.PI / 4 * inch(sec.bit.size) ** 2 * 0.75,
        gr: Math.max(5, gr0 * (1 + 0.12 * noise)), rt: Math.max(0.2, rt * (1 + 0.15 * noise)), fid: f.id, pore: poreEMW(z),
      });
    }
  }

  // ---------- Slamblanding ----------
  _mixMud(dt) {
    if (this.section.riserless) return;
    // Slamanlegget bygger volum: overfører ferdigblandet slam fra reservetankene
    if (this.pitVolume < 135 && this.reserveVolume > 0 && !this.bopClosed) {
      const dv = Math.min(30 / 3600 * dt, 150 - this.pitVolume, this.reserveVolume);
      this.pitVolume += dv;
      this.pitGainRef += dv;
      this.reserveVolume -= dv;
      if (this.reserveVolume <= 0) this.logEvent('Reservetankene er tomme. Blander nytt slam (ca. 200 m³).', 'info');
      if (this.reserveVolume <= 0) this.reserveVolume = 200;
    }
    const d = this.pitTargetSg - this.pitSg;
    if (Math.abs(d) < 1e-4) return;
    const V = Math.max(this.pitVolume, 20);
    if (d > 0) {
      const rate = 40 / 3600;                                  // tonn barytt per sekund
      const dm = rate * dt;
      const dsg = dm * (4.2 - this.pitSg) / (V * 4.2);
      const step = Math.min(dsg, d);
      const mass = step * V * 4.2 / (4.2 - this.pitSg);
      this.bariteUsed += mass;
      this.pitVolume += mass / 4.2;
      this.pitGainRef += mass / 4.2;
      this.pitSg += step;
    } else {
      const baseSg = this.mud.type === 'OBM' ? 0.82 : 1.0;
      const dvMax = 25 / 3600 * dt;                            // m³ baseolje/vann per sekund
      const dvNeed = V * (this.pitSg - this.pitTargetSg) / Math.max(this.pitTargetSg - baseSg, 0.01);
      const dv = Math.min(dvMax, dvNeed);
      this.pitSg = (this.pitSg * V + baseSg * dv) / (V + dv);
      this.pitVolume += dv;
      this.pitGainRef += dv;
    }
    if (Math.abs(this.pitTargetSg - this.pitSg) < 1e-4) {
      this.pitSg = this.pitTargetSg;
      if (this._mixing) {
        this._mixing = false;
        this.logEvent(`Slamtankene er blandet til ${nf(this.pitSg, 2)} sg.`, 'info');
      }
    }
  }

  // ---------- Gasslogging med forsinkelse (lag time) ----------
  get lagTime() {
    return this.Q > 0 ? this.geom.anVol / this.Q : Infinity;
  }

  _gasLogging(dt) {
    const staticOB = (this.bhp - this.annFriction) - porePressure(this.bitDepth);
    const f = formationAt(this.holeDepth) || FORMATIONS[0];
    let g = 0.04 + f.gas * 0.05 * Math.exp(-Math.max(staticOB, 0) / 15);
    if (this._drillGas) g += this._drillGas * 0.9;
    this._drillGas = 0;
    // Koblingsgass: registreres når pumpene startes etter stopp
    if (this.Q <= 0) this._pumpsOffTime = (this._pumpsOffTime || 0) + dt;
    else if (this._pumpsOffTime > 60) {
      const staticNow = this.esdBit * G * this.bitDepth - porePressure(this.bitDepth);
      const peak = f.gas * 2.5 * Math.exp(-Math.max(staticNow, 0) / 6) * Math.min(this._pumpsOffTime / 300, 2);
      if (peak > 0.05) this.gasQueue.push({ t: this.t + this.lagTime, v: peak, conn: true });
      this._pumpsOffTime = 0;
    } else this._pumpsOffTime = 0;
    if (this.Q > 0 && Number.isFinite(this.lagTime)) this.gasQueue.push({ t: this.t + this.lagTime, v: g });
    let latest = null;
    while (this.gasQueue.length && this.gasQueue[0].t <= this.t) latest = this.gasQueue.shift();
    if (this.gasQueue.length > 4000) this.gasQueue.splice(0, this.gasQueue.length - 4000);
    const target = latest ? latest.v : (this.Q > 0 ? this.gasUnits : 0.03);
    this.gasUnits += (target - this.gasUnits) * Math.min(1, dt / (this.Q > 0 ? 20 : 240));
    if (latest && latest.conn) this.gasUnits = Math.max(this.gasUnits, latest.v);
    if (this.gasVentRate > 0 || this.gasAtSurface) this.gasUnits = Math.min(100, Math.max(this.gasUnits, 20 + this.gasVentRate * 50));
  }

  // ---------- Registrering og alarmer ----------
  get pitGain() { return this.pitVolume - this.pitGainRef; }

  _record(dt) {
    this._seriesT += dt;
    if (this._seriesT < 10) return;
    this._seriesT = 0;
    this.series.push({
      t: this.t, hookload: this.hookload, wob: this.wob, rpm: this.rpm, torque: this.torque, spp: this.spp,
      flowIn: this.flowInLpm, flowOut: this.flowOut === null ? null : this.flowOut * 60000,
      pit: this.pitVolume, pitGain: this.pitGain, rop: this.rop, gas: this.gasUnits, chokeP: this.chokeP,
      bhp: this.bhp, ecd: this.ecdBit, depth: this.holeDepth, bitDepth: this.bitDepth,
    });
    if (this.series.length > 1200) this.series.shift();
  }

  _checkAlarms() {
    const list = [];
    const add = (id, level, text) => list.push({ id, level, text });
    const riser = !this.section.riserless;
    if (riser) {
      const gain = this.pitGain;
      if (gain > 1.0) add('pitgain', 'critical', `Tankøkning ${nf(gain, 1)} m³ – mulig brønnspark`);
      else if (gain < -3) add('pitloss', 'warning', `Tanktap ${nf((-gain), 1)} m³ – mulige tap til formasjon`);
      if (!this.bopClosed && this.Q > 0 && this.flowOut !== null && this.flowOut > this.Q * 1.1 + 0.002) add('flowout', 'critical', 'Retur større enn pumperate');
      if (this.Q === 0 && !this.bopClosed && this.flowOut > 0.0015) add('flowing', 'critical', 'Brønnen flyter med pumpene stoppet');
      if (this.qLoss > 0.0005) add('losses', 'serious', `Tap til formasjon ${nf((this.qLoss * 60000), 0)} L/min`);
    }
    if (this.gasUnits > 5) add('gas', this.gasUnits > 20 ? 'critical' : 'warning', `Høy gass i returen: ${nf(this.gasUnits, 1)} %`);
    if (this.ecdShoe > this.lotEMW - 0.02 && this.Q > 0) add('ecd', 'serious', `ECD ved skoen ${nf(this.ecdShoe, 2)} sg nær FIT ${nf(this.lotEMW, 2)} sg`);
    if (this.bopClosed && this.chokeP > this.maasp * 0.9 && this.maasp > 0) add('maasp', 'critical', `Chokettrykk nær MAASP (${nf(this.maasp, 0)} bar)`);
    if (this.stickSlip > 0.3) add('stickslip', 'warning', 'Stick-slip: øk rotasjonen eller reduser vekt på krona');
    if (this.cuttingsLoad > 0.4) add('cleaning', 'warning', 'Dårlig hullrensk: øk pumperaten');
    if (this.bitWear > 0.85) add('bit', 'warning', `Krona er ${Math.round(this.bitWear * 100)} % slitt`);
    if (this.sppLimited) add('pump', 'warning', 'Pumpetrykk eller -effekt på grensen');
    if (!this.heaveComp && this.onBottom) add('heave', 'warning', 'Hivkompensatoren er av: vekten på krona svinger med riggen');
    if (this.blockPos <= BLOCK_MIN + 0.05 && this.onBottom && !this.op) add('kellydown', 'info', 'Toppdrevet er nede ved boredekket: ta en kobling');
    const ids = new Set(list.map((a) => a.id));
    this._alarmLog = this._alarmLog || {};
    for (const a of list) {
      if (!this._alarmIds.has(a.id)) {
        if (a.id === 'pitgain' && !this._kickFlag) { this._kickFlag = true; this.kickCount++; }
        const last = this._alarmLog[a.id] ?? -Infinity;
        if (a.level !== 'info' && this.t - last > 300) this.logEvent(a.text, a.level === 'critical' ? 'alarm' : 'warn');
        this._alarmLog[a.id] = this.t;
      }
    }
    if (!ids.has('pitgain') && this.pitGain < 0.3) this._kickFlag = false;
    this.maxPitGain = Math.max(this.maxPitGain, this.pitGain);
    if (riser && this.pitGain > 32) {
      this.gameOver = { reason: 'Brønnkontrollen ble tapt: tankøkningen passerte 32 m³ før brønnen ble stengt og drept.' };
      this.logEvent(this.gameOver.reason, 'alarm');
      this.emit('gameover', this.gameOver);
    }
    this._alarmIds = ids;
    this.alarms = list;
  }

  logEvent(text, level = 'info') {
    this.events.unshift({ t: this.t, text, level });
    if (this.events.length > 300) this.events.pop();
    this.emit('event', { text, level });
  }

  // ---------- Kommandoer fra borekonsollen ----------
  setPumps(running) {
    if (this.op) return;
    if (running && this.bopClosed && this.chokeMode === 'manual' && this.chokeOpening <= 0) {
      this.logEvent('Pumper mot stengt choke gir raskt trykkøkning.', 'warn');
    }
    this.pumpsRunning = running;
  }
  setSpm(v) { this.spmSet = clamp(v, 0, PUMP.maxSpm); }
  setPumpOn(i, on) { this.pumpOn[i] = on; }
  setRotation(on) { if (!this.op) this.rotOn = on; }
  setRpm(v) { this.rpmSet = clamp(v, 0, TOP_DRIVE.maxRpm); }
  setAutoDrill(on) { this.autoDrill = on; }
  setWob(v) { this.wobSet = clamp(v, 0, 40); }
  setBlockVelocity(v) { this.blockVelCmd = v; }
  setHeave(hs, tp) { this.heaveHs = hs; this.heaveTp = tp; }
  setHeaveComp(on) { this.heaveComp = on; }
  setTimeScale(x) { this.timeScale = x; }
  setChokeMode(m) { this.chokeMode = m; if (m === 'manual') this.chokeOpening = this.chokeOpeningShown || 0; }
  setChokeOpening(x) { this.chokeOpening = clamp(x, 0, 1); }

  weightUp(sg) {
    if (this.section.riserless) { this.logEvent('Uten stigerør pumpes sjøvann – slamvekten kan ikke endres.', 'warn'); return; }
    const target = clamp(round2(sg), 1.0, 2.1);
    const barite = target > this.pitSg ? this.pitVolume * 4.2 * (target - this.pitSg) / (4.2 - target) : 0;
    this.pitTargetSg = target;
    this._mixing = true;
    this.logEvent(target >= this.pitSg
      ? `Vekter opp slamtankene til ${nf(target, 2)} sg (ca. ${nf(barite, 0)} tonn barytt).`
      : `Fortynner slammet til ${nf(target, 2)} sg med ${this.mud.type === 'OBM' ? 'baseolje' : 'vann'}.`, 'info');
  }

  closeBOP() {
    if (!this.bopInstalled) { this.logEvent('BOP er ikke installert ennå. Uten stigerør styres brønnen fra havbunnen.', 'warn'); return; }
    if (this.bopClosed) return;
    if (this.op && !this.op.allowBop) this._abortOp('Operasjonen ble avbrutt for å stenge brønnen.');
    const warn = [];
    if (this.Q > 0) warn.push('pumpene gikk');
    if (this.rpm > 0) warn.push('strengen roterte');
    this.pumpsRunning = false; this.spm = 0; this.Q = 0;
    this.rotOn = false; this.rpm = 0;
    this.autoDrill = false;
    this.blockVelCmd = 0;
    this._pickUp(2);
    // Ringromsvolumet over BOP-en byttes fra stigerør til chokelinje
    this._switchRiserSection(true);
    this.bopClosed = true;
    this.chokeP = 0;
    this.compressedVol = 0;
    this.bhpTarget = null;
    this.chokeMode = 'auto';
    this.shutIn = { t: this.t, pitGain: this.pitGain, stable: false, sidpp: null, sicp: null };
    this.logEvent(`BOP stengt (ringromssikring, hard shut-in) på ${nf(this.bitDepth, 0)} m.${warn.length ? ' Advarsel: ' + warn.join(' og ') + '.' : ''}`, 'warn');
    this.emit('bop', true);
  }

  openBOP() {
    if (!this.bopClosed) return;
    if (this.chokeP > 1.0 || this.sidpp > 1.0) {
      this.logEvent(`BOP kan ikke åpnes: det er ${nf(Math.max(this.chokeP, this.sidpp), 1)} bar trykk i brønnen. Drep brønnen først.`, 'warn');
      return false;
    }
    if (this.an.some((g) => g.gas)) {
      this.logEvent('BOP kan ikke åpnes: det er fortsatt gass i ringrommet.', 'warn');
      return false;
    }
    this._switchRiserSection(false);
    this.bopClosed = false;
    this.bhpTarget = null;
    this.kill = null;
    this.shutIn = null;
    this.compressedVol = 0;
    this.chokeP = 0;
    this.pitGainRef = this.pitVolume;
    this.logEvent('BOP åpnet. Brønnen er stabil.', 'info');
    this.emit('bop', false);
    return true;
  }

  _switchRiserSection(toChokeLine) {
    const beforeGeom = this.geom;
    const oldTopVol = beforeGeom.pieces.filter((p) => p.top < SEABED).reduce((s, p) => s + p.vol, 0);
    this.bopClosed = toChokeLine;
    this._updateGeometry();
    const newTopVol = this.geom.pieces.filter((p) => p.top < SEABED).reduce((s, p) => s + p.vol, 0);
    // Skaler volumene av segmentene som ligger over havbunnen
    let accTop = 0;
    const scale = oldTopVol > 0 ? newTopVol / oldTopVol : 1;
    for (let i = this.an.length - 1; i >= 0 && accTop < oldTopVol; i--) {
      const g = this.an[i];
      const part = Math.min(g.v, oldTopVol - accTop);
      accTop += part;
      g.v = g.v - part + part * scale;
    }
    this.an = mergeSegs(this.an);
    this._computePressures();
  }

  // Kill-ark (IWCF-metodikk)
  killSheet() {
    const si = this.shutIn;
    const tvd = this.bitDepth;
    const omw = this.pitSgAtShutIn ?? this._avgAnnulusSg();
    const sidpp = si && si.sidpp !== null ? si.sidpp : this.sidpp;
    const sicp = si && si.sicp !== null ? si.sicp : this.chokeP;
    const kmw = omw + sidpp / (G * tvd);
    const kmwRound = Math.ceil(kmw * 100) / 100;
    const qScr = SCR_SPM / 60 * PUMP.litersPerStroke / 1000;
    const scr = this._frictionAt(qScr, omw);
    const icp = sidpp + scr;
    const fcp = scr * kmwRound / omw;
    const stb = this.geom.dsVol / (PUMP.litersPerStroke / 1000);
    const bts = this.geom.anVol / (PUMP.litersPerStroke / 1000);
    const pForm = sidpp + this.hydString;
    return {
      tvd, omw, sidpp, sicp, kmw, kmwRound, scrSpm: SCR_SPM, scr, icp, fcp, stb, bts,
      maasp: Math.max(0, (this.lotEMW - omw) * G * this.lastShoe),
      pForm, gain: si ? this.pitGain : 0,
      influxHeight: null,
    };
  }

  // Friksjonstap ved sakte sirkulasjon (SCR) gjennom stigerøret, slik det måles før et brønnspark
  _frictionAt(q, sg) {
    const qg = q * 60000 / LPM_PER_GPM;
    const rho = sg * PPG_PER_SG;
    const { pv, yp } = this.mud;
    let f = 0;
    for (const s of this.geom.secs) f += pipeLossPsi(qg, s.id, (s.bot - s.top) * FT_PER_M, rho, pv, yp);
    f += bitLossPsi(qg, rho, this.section.bit.tfa);
    f += pipeLossPsi(qg, 3.826, 500, rho, pv, yp);
    const pieces = annulusPieces(this.geom.secs, this.bitDepth, this.casings, this.section.hole, { bopInstalled: this.bopInstalled, bopClosed: false });
    for (const p of pieces) f += annLossPsi(qg, p.D, p.od, p.len * FT_PER_M, rho, pv, yp);
    const hasTool = this.section.bha.some((c) => c.tool);
    const qn = q / this.nominalQ;
    return f / PSI_PER_BAR + (hasTool ? 22 * qn * qn * sg / 1.3 : 0);
  }

  startKill(method = 'ww') {
    if (!this.bopClosed) { this.logEvent('Brønnen må være stengt før drepeoperasjonen starter.', 'warn'); return false; }
    const ks = this.killSheet();
    if (method === 'ww' && this.pitSg < ks.kmwRound - 0.004) {
      this.logEvent(`Vent-og-vekt krever drepeslam i tankene: bland til ${nf(ks.kmwRound, 2)} sg først.`, 'warn');
      return false;
    }
    this.kill = {
      method, stage: 1, sheet: ks, strokes0: this.strokes, startT: this.t,
      trace: [], done: false, kmw: ks.kmwRound,
    };
    this.bhpTarget = ks.pForm + 5;
    this.chokeMode = this.chokeMode || 'auto';
    this.pumpOn = [true, false, false];
    this.spmSet = SCR_SPM;
    this.pumpsRunning = true;
    this.logEvent(method === 'ww'
      ? `Starter dreping med vent-og-vekt-metoden: ${nf(ks.kmwRound, 2)} sg drepeslam ved ${SCR_SPM} slag/min. ICP ${nf(ks.icp, 0)} bar → FCP ${nf(ks.fcp, 0)} bar.`
      : `Starter borerens metode (1. sirkulasjon med gammelt slam): hold borerørstrykket på ICP ${nf(ks.icp, 0)} bar.`, 'info');
    return true;
  }

  _killTick(dt) {
    // Stabilisering etter stengning
    if (this.bopClosed && this.shutIn && !this.shutIn.stable) {
      if (this.t - this.shutIn.t > 240 && this.qInflux < 1e-6) {
        this.shutIn.stable = true;
        this.shutIn.sidpp = this.sidpp;
        this.shutIn.sicp = this.chokeP;
        this.pitSgAtShutIn = this._avgStringSg();
        this.shutIn.pitGain = this.pitGain;
        if (this.chokeMode === 'auto' && this.bhpTarget === null && (this.sidpp > 0.5 || this.chokeP > 0.5)) {
          this.bhpTarget = this.bhp + 3;
        }
        this.logEvent(`Stengte trykk stabilisert: SIDPP ${nf(this.sidpp, 1)} bar, SICP ${nf(this.chokeP, 1)} bar, tankøkning ${nf(this.pitGain, 1)} m³.`, 'warn');
        this.emit('shutin', this.shutIn);
      }
    }
    const k = this.kill;
    if (!k || k.done) return;
    const pumped = this.strokes - k.strokes0;
    if (this.Q > 0 && (!k.trace.length || pumped - k.trace[k.trace.length - 1].s > 20)) {
      k.trace.push({ s: pumped, dpp: this.spp, cp: this.chokeP, t: this.t });
    }
    const anyGas = this.an.some((g) => g.gas);
    const topSg = this.an[this.an.length - 1]?.sg ?? 0;
    const minAnSg = Math.min(...this.an.map((g) => (g.gas ? 0 : g.sg)));
    if (k.method === 'drillers' && k.stage === 1 && !anyGas && pumped > k.sheet.bts * 1.05) {
      k.stage = 2;
      k.strokes0 = this.strokes;
      k.trace = [];
      this.logEvent('1. sirkulasjon ferdig: gassen er ute. Bland drepeslam og start 2. sirkulasjon.', 'info');
      this.pumpsRunning = false;
      return;
    }
    const killDone = !anyGas && minAnSg >= k.kmw - 0.006 && topSg >= k.kmw - 0.006 && pumped > k.sheet.stb;
    if (killDone && (k.method === 'ww' || k.stage === 2)) {
      k.done = true;
      this.pumpsRunning = false;
      this.spm = 0;
      this.Q = 0;
      this.bhpTarget = null;
      this._bleedTrapped();
      this.logEvent(`Brønnen er drept med ${nf(k.kmw, 2)} sg slam. SIDPP og SICP er 0 bar. Gjør strømningssjekk og åpne BOP. Tips: legg til tripmargin (+0,03 sg).`, 'info');
      this.emit('killed');
    }
  }

  // Løft krona av bunnen (og ut av kilene) før strømningssjekk og stenging
  _pickUp(m) {
    if (this.inSlips) return;
    if (this.onBottom || this.bitDepth > this.holeDepth - m) {
      const room = BLOCK_MAX - this.blockPos;
      const lift = Math.min(room, m + (this.onBottom ? this.wob / this.kString : 0));
      this.blockPos += lift;
      this._updateBlock(0);
    }
  }

  _bleedTrapped() {
    const ex = totalVol(this.an) - this.geom.anVol - this.geom.rathole;
    if (ex > 0) {
      const r = removeFromEnd(this.an, ex);
      this.pitVolume += r.liq;
    }
    this.compressedVol = 0;
    this.chokeP = 0;
    this._computePressures();
  }

  continueDrillersStage2() {
    const k = this.kill;
    if (!k || k.method !== 'drillers' || k.stage !== 2) return false;
    if (this.pitSg < k.kmw - 0.004) {
      this.logEvent(`Bland drepeslam til ${nf(k.kmw, 2)} sg før 2. sirkulasjon.`, 'warn');
      return false;
    }
    k.strokes0 = this.strokes;
    k.cpHold = undefined;
    this.pumpOn = [true, false, false];
    this.spmSet = SCR_SPM;
    this.pumpsRunning = true;
    this.logEvent('2. sirkulasjon: pumper drepeslam. Chokettrykket holdes konstant til drepeslammet er ved krona.', 'info');
    return true;
  }

  _avgStringSg() {
    let v = 0, m = 0;
    for (const g of this.ds) { v += g.v; m += g.v * g.sg; }
    return v > 0 ? m / v : this.pitSg;
  }

  // Planlagt borerørstrykk som funksjon av pumpede slag. null = hold chokettrykket konstant.
  killTargetDpp(pumped) {
    const k = this.kill;
    if (!k) return null;
    const ks = k.sheet;
    if (this.spm < SCR_SPM - 1 && pumped < 80) return null;   // pumpene kjøres opp med konstant chokettrykk
    if (k.method === 'ww') {
      if (pumped >= ks.stb) return ks.fcp;
      return ks.icp + (ks.fcp - ks.icp) * pumped / ks.stb;
    }
    if (k.stage === 1) return ks.icp;
    return pumped >= ks.stb ? ks.fcp : null;
  }

  killSchedule() {
    const k = this.kill;
    const ks = k ? k.sheet : this.killSheet();
    const pts = [];
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const s = ks.stb * i / n;
      pts.push({ s, p: ks.icp + (ks.fcp - ks.icp) * i / n });
    }
    pts.push({ s: ks.stb + ks.bts, p: ks.fcp });
    return pts;
  }

  // ---------- Operasjoner (skriptede sekvenser) ----------
  _startOp(name, steps, opts = {}) {
    this.op = { name, steps, i: 0, stepT: 0, frozen: !!opts.frozen, onDone: opts.onDone, allowBop: !!opts.allowBop };
    this._beginStep();
    this.emit('op', this.op);
  }

  _beginStep() {
    const s = this.op.steps[this.op.i];
    this.op.stepT = 0;
    s.start?.();
    if (s.log !== false) this.logEvent(s.label, 'op');
  }

  _opTick(dt) {
    const op = this.op;
    const s = op.steps[op.i];
    op.stepT += dt;
    const f = Math.min(1, op.stepT / s.dur);
    s.update?.(f, dt);
    if (f >= 1) {
      s.end?.();
      if (this.op !== op) return;
      op.i++;
      if (op.i >= op.steps.length) {
        this.op = null;
        op.onDone?.();
        this.emit('op', null);
      } else this._beginStep();
    }
  }

  _abortOp(msg) {
    if (!this.op) return;
    if (this.inSlips) {
      this.inSlips = false;
      this.blockPos = clamp(this.stringLen - this.slipsDepth, BLOCK_MIN, BLOCK_MAX);
      this.stringLen = this.slipsDepth + this.blockPos;
    }
    this.logEvent(msg || `Operasjonen «${this.op.name}» ble avbrutt.`, 'warn');
    this.op = null;
    this.emit('op', null);
  }

  get opProgress() {
    if (!this.op) return null;
    const op = this.op;
    const total = op.steps.reduce((s, x) => s + x.dur, 0);
    const done = op.steps.slice(0, op.i).reduce((s, x) => s + x.dur, 0) + op.stepT;
    return { name: op.name, step: op.steps[op.i].label, frac: Math.min(1, done / total), i: op.i, n: op.steps.length };
  }

  canConnect() {
    if (this.op) return 'En operasjon pågår allerede.';
    if (this.bopClosed) return 'Brønnen er stengt.';
    if (this.blockPos > 3.5) return `Toppdrevet står ${nf(this.blockPos, 1)} m over boredekket. Bor ned stativet først (kobling tas når toppdrevet er under 3,5 m).`;
    return null;
  }

  startConnection() {
    const why = this.canConnect();
    if (why) { this.logEvent(why, 'warn'); return false; }
    const resume = { pumps: this.pumpsRunning, spm: this.spmSet, rot: this.rotOn, rpm: this.rpmSet, auto: this.autoDrill };
    const self = this;
    let b0 = 0;
    const steps = [
      { label: 'Kobling: stopper rotasjon og løfter krona av bunnen', dur: 30, start() { self.rotOn = false; self.autoDrill = false; self.blockVelCmd = 0; b0 = self.blockPos; }, update(f) { self.blockPos = b0 + 2 * f; } },
      { label: 'Kobling: stopper pumpene', dur: 30, start() { self.pumpsRunning = false; } },
      { label: 'Kobling: setter kilene (slips) og bryter ut toppdrevet', dur: 40, end() { self.inSlips = true; self.slipsDepth = self.bitDepth; } },
      { label: 'Kobling: heiser toppdrevet til fingerbrettet', dur: 45, start() { b0 = self.blockPos; }, update(f) { self.blockPos = b0 + (Math.min(b0 + STAND_LENGTH, BLOCK_MAX) - b0) * f; } },
      { label: 'Kobling: rørhåndteringen henter nytt stativ fra rørstativet', dur: 40 },
      { label: 'Kobling: jernsjaueren skrur sammen (make-up)', dur: 30, end() { self.stringLen += STAND_LENGTH; self.inSlips = false; self.blockPos = self.stringLen - self.slipsDepth; self.logStand(); } },
      { label: 'Kobling: løfter kilene og starter pumpene', dur: 30, start() { self.pumpsRunning = resume.pumps || true; self.spmSet = resume.spm; } },
      { label: 'Kobling: starter rotasjon og vasker ned til bunn', dur: 30, start() { self.rotOn = resume.rot || true; self.rpmSet = resume.rpm; self.autoDrill = true; } },
    ];
    // Under heising henger strengen i kilene: krona står stille
    this._startOp('Kobling (connection)', steps.map((s) => ({ ...s, real: 1.2 })), {});
    return true;
  }

  logStand() {
    this.standsAdded = (this.standsAdded || 0) + 1;
  }

  get standsInHole() {
    const bha = this.section.bha.reduce((s, c) => s + c.length, 0) + PIPE.hwdp.length;
    return Math.max(0, Math.floor((this.stringLen - bha) / STAND_LENGTH));
  }

  startFlowCheck() {
    if (this.op || this.flowCheck) return;
    if (this.section.riserless) { this.logEvent('Uten stigerør kontrolleres strømning med ROV ved havbunnen.', 'info'); return; }
    this.pumpsRunning = false;
    this.rotOn = false;
    this.autoDrill = false;
    this._pickUp(2);
    this.flowCheck = { t: this.t, gain0: this.pitVolume, dur: 15 * 60 };
    this.logEvent('Strømningssjekk: pumpene stoppet, observerer brønnen i 15 minutter.', 'op');
  }

  _flowCheckTick() {
    const fc = this.flowCheck;
    if (!fc) return;
    if (this.bopClosed) { this.flowCheck = null; return; }
    if (this.t - fc.t >= fc.dur) {
      const gain = this.pitVolume - fc.gain0;
      this.flowCheck = null;
      if (gain > 0.15) this.logEvent(`Strømningssjekk: brønnen FLYTER (${nf(gain, 2)} m³ på 15 min). Steng BOP!`, 'alarm');
      else this.logEvent(`Strømningssjekk: brønnen er stabil (${nf(gain, 2)} m³).`, 'info');
      this.emit('flowcheck', gain);
    }
  }

  // Er det trygt å trekke ut av hullet? (slamvekt mot poretrykk + svabbing)
  tripMarginCheck() {
    const swab = 0.02 + 0.03 * (this.section.bha[this.section.bha.length - 1].od / this.section.hole) ** 2;
    let worst = null;
    for (const f of FORMATIONS) {
      if (!f.perm) continue;
      const top = Math.max(f.top, this.lastShoe);
      const bot = Math.min(f.base, this.holeDepth);
      if (bot <= top) continue;
      const pore = poreEMW(top);
      const margin = this._avgAnnulusSg() - swab - pore;
      if (!worst || margin < worst.margin) worst = { f, margin, pore, swab };
    }
    return worst;
  }

  _preOpCheck(what) {
    if (this.op) return 'En operasjon pågår allerede.';
    if (this.bopClosed) return 'Brønnen er stengt. Drep brønnen og åpne BOP først.';
    if (this.an.some((g) => g.gas) || this.qInflux > 0) return 'Det er innstrømning eller gass i brønnen. Steng og drep brønnen først.';
    if (Math.abs(this.pitSg - this._avgAnnulusSg()) > 0.02) return 'Slammet i brønnen er ikke sirkulert til samme vekt som tankene. Sirkuler først.';
    const w = this.tripMarginCheck();
    if (w && w.margin < 0) return `Svabbefare i ${w.f.name}: slamvekten må være minst ${nf((w.pore + w.swab), 2)} sg for å ${what}.`;
    return null;
  }

  tripForBit() {
    const why = this._preOpCheck('trekke ut');
    if (why) { this.logEvent(why, 'warn'); return false; }
    const self = this;
    const depth = this.bitDepth;
    const bu = this.Q > 0 ? this.geom.anVol / this.Q : this.geom.anVol / this.nominalQ;
    const tOut = depth / 400 * 3600, tIn = depth / 450 * 3600;
    const steps = [
      { label: 'Rundtur: sirkulerer bunnen opp (bottoms up)', dur: bu, start() { self.rotOn = false; self.autoDrill = false; } },
      { label: 'Rundtur: strømningssjekk før uttrekking', dur: 900, start() { self.pumpsRunning = false; } },
      { label: `Rundtur: trekker ut av hullet (POOH) fra ${nf(depth, 0)} m`, dur: tOut, update(f) { self._tripAnim(depth, 30, f); } },
      { label: `Rundtur: bytter krone (${this.section.bit.name}) og sjekker BHA`, dur: 5400, end() { self.bitWear = 0; self.bitHours = 0; self.bitMeters = 0; self.bitsUsed++; self.cost += 0.9; } },
      { label: 'Rundtur: kjører inn i hullet (RIH)', dur: tIn, update(f) { self._tripAnim(30, depth, f); } },
      { label: 'Rundtur: vasker ned til bunn', dur: 1800, end() { self._settle(depth); } },
    ];
    this._startOp('Rundtur for kronebytte', steps.map((s) => ({ ...s, real: s.dur > 3600 ? 5 : 2 })), { frozen: true });
    return true;
  }

  _tripAnim(from, to, f) {
    this.bitDepth = from + (to - from) * f;
    const phase = (this.t / 60) % 1;
    this.blockPos = 2 + (STAND_LENGTH) * (to < from ? phase : 1 - phase);
    this.stringLen = this.bitDepth + this.blockPos;
    this.rpm = 0; this.Q = 0; this.spm = 0; this.wob = 0; this.rop = 0;
  }

  // Plasser krona direkte på en dybde (brukes av tester og hurtigstart)
  placeBitAt(z) {
    this.holeDepth = Math.max(this.holeDepth, z);
    this._settle(z - 2);
    this._lastFormationId = formationAt(this.holeDepth)?.id;
  }

  _settle(depth) {
    this.inSlips = false;
    this.blockPos = 15;
    this.bitDepth = Math.min(depth, this.holeDepth - 1);
    this.stringLen = this.bitDepth + this.blockPos;
    this._updateGeometry();
    this.ds = [{ v: this.geom.dsVol, sg: this._inletSg() }];
    this.an = [{ v: this.geom.anVol + this.geom.rathole, sg: this._inletSg() }];
    this.compressedVol = 0;
    this.pitGainRef = this.pitVolume;
    this.gasQueue = [];
    this.cuttingsLoad = 0;
    this._computePressures();
  }

  canRunCasing() {
    const plan = this.section.casing.shoe;
    if (this.sectionIndex === SECTIONS.length - 1 && this.holeDepth < TD_PLAN - 10) return `Bor til TD (${TD_PLAN} m) før forlengningsrøret kjøres.`;
    if (this.holeDepth < plan - 25) return `Hullet (${nf(this.holeDepth, 0)} m) er ikke dypt nok. Planlagt skodybde er ${plan} m.`;
    return null;
  }

  runCasing() {
    const why = this.canRunCasing() || this._preOpCheck('kjøre foringsrør');
    if (why) { this.logEvent(why, 'warn'); return false; }
    const self = this;
    const sec = this.section;
    const shoe = Math.floor(this.holeDepth - 1);
    const depth = this.bitDepth;
    const bu = this.geom.anVol / Math.max(this.nominalQ, 0.01);
    const isLast = this.sectionIndex === SECTIONS.length - 1;
    const steps = [
      { label: 'Sirkulerer hullet rent før foringsrør', dur: 1.5 * bu, start() { self.rotOn = false; self.autoDrill = false; } },
      { label: 'Trekker ut av hullet (POOH)', dur: depth / 400 * 3600, start() { self.pumpsRunning = false; }, update(f) { self._tripAnim(depth, 30, f); } },
      { label: `Rigger opp og kjører ${sec.casing.name}`, dur: shoe / 250 * 3600 + 3 * 3600, update(f) { self._tripAnim(30, shoe * f + 30 * (1 - f), 1); } },
      { label: isLast ? 'Setter forlengningsrørhenger og pakning' : 'Lander foringsrørhengeren i brønnhodet', dur: 3600 },
      { label: 'Sementerer: pumper spacer, lead- og tail-sement og fortrenger', dur: 5 * 3600 },
      { label: 'Venter på at sementen herder (WOC)', dur: 12 * 3600 },
      { label: 'Trykktester foringsrøret', dur: 2 * 3600 },
    ];
    const next = () => {
      self.casings.push({ ...self._casingFor(self.sectionIndex, shoe) });
      self.lastShoe = shoe;
      self.cost += 8 + shoe / 400;
      if (isLast) {
        self.wellComplete = true;
        self._settle(shoe - 50);
        self.logEvent(`Brønnen er ferdigboret! ${sec.casing.name} er satt på ${shoe} m. Brønnen overleveres til komplettering og testing.`, 'info');
        self.emit('complete');
        return;
      }
      self.sectionIndex++;
      self.section = SECTIONS[self.sectionIndex];
      self._tdNotified = false;
      const afterConductor = self.sectionIndex === 2 && !self.bopInstalled;
      const drillOut = [
        { label: `Kjører inn med ny BHA: ${self.section.bit.name}`, dur: shoe / 450 * 3600 + 7200, update(f) { self._tripAnim(30, shoe - 30, f); } },
        { label: 'Borer ut skosporet og 3 m ny formasjon', dur: 3 * 3600, end() { self.holeDepth = shoe + 5; } },
        {
          label: 'Utfører formasjonsstyrketest (FIT/LOT)', dur: 5400, end() {
            self.lotEMW = round2(fracEMW(shoe) - 0.01);
            const mw = self.mud.type !== self.section.mud.type ? self.section.mud.sg : self.pitSg;
            self.logEvent(`FIT ved ${shoe} m: ${nf(self.lotEMW, 2)} sg EMW. MAASP med ${nf(mw, 2)} sg slam: ${nf(Math.max(0, (self.lotEMW - mw) * G * shoe), 0)} bar.`, 'info');
          },
        },
      ];
      const newBit = () => {
        self.bitWear = 0; self.bitHours = 0; self.bitMeters = 0; self.bitsUsed++;
        const m = self.section.mud;
        if (self.mud.type !== m.type) {
          self.mud = { name: m.name, type: m.type, pv: m.pv, yp: m.yp };
          self.pitSg = m.sg; self.pitTargetSg = m.sg; self.pitVolume = 160;
          self.logEvent(`Fortrenger til ${m.name.toLowerCase()} ${nf(m.sg, 2)} sg.`, 'info');
        }
        self.spmSet = Math.round(self.section.flow / (2 * PUMP.litersPerStroke));
        self.rpmSet = self.section.rpm;
        self.wobSet = self.section.wob;
        self._settle(self.holeDepth - 2);
        self.logEvent(`Klar for ${self.section.title}. Anbefalt slamvekt fra programmet: ${nf(self.section.mud.sg, 2)} sg.`, 'info');
      };
      if (afterConductor) {
        const bopSteps = [
          { label: 'Rigger opp stigerør (marine riser) og BOP-stakk', dur: 8 * 3600 },
          { label: 'Kjører BOP på stigerøret ned til havbunnen', dur: 14 * 3600 },
          { label: 'Lander og låser BOP på brønnhodet (18¾" 15k)', dur: 3 * 3600, end() { self.bopInstalled = true; } },
          { label: 'Trykktester BOP og chokemanifold', dur: 8 * 3600 },
        ];
        self._startOp('Kjøring av BOP og stigerør', [...bopSteps, ...drillOut].map((s) => ({ ...s, real: 3 })), { frozen: true, onDone: newBit });
      } else {
        self._startOp('Borer ut sko og FIT', drillOut.map((s) => ({ ...s, real: 3 })), { frozen: true, onDone: newBit });
      }
    };
    this._startOp(`Foringsrør: ${sec.casing.name}`, steps.map((s) => ({ ...s, real: 3 })), { frozen: true, onDone: next });
    return true;
  }

  // ---------- Hjelpere for grensesnittet ----------
  get dayClock() {
    const day = Math.floor(this.t / 86400) + 1;
    const s = this.t % 86400;
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    return { day, text: `Dag ${day} ${hh}:${mm}` };
  }

  get elapsedDays() { return (this.t - this.t0) / 86400; }

  get formation() { return formationAt(this.holeDepth); }

  get annulusGas() {
    return this.an.filter((g) => g.gas).map((g) => ({ top: g.zTop, bot: g.zBot, v: g.v }));
  }

  profileForPanel() {
    return { pore: poreEMW, frac: fracEMW, prognosis: prognosisPoreEMW };
  }
}

export { SECTIONS, FORMATIONS, SCENARIOS, PUMP };
