const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const compiled = new Map();
function compile(name) {
  if (!compiled.has(name)) {
    compiled.set(name, ts.transpileModule(fs.readFileSync(path.join(root, name), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText);
  }
  return compiled.get(name);
}

class Clock {
  now = 100000;
  nextId = 1;
  timers = new Map();
  onAdvance = () => {};
  schedule = (callback, delay, repeat = false) => {
    const id = this.nextId++;
    this.timers.set(id, { callback, delay, repeat, at: this.now + delay });
    return id;
  };
  clear = (id) => this.timers.delete(id);
  advance(ms) {
    const end = this.now + ms;
    while (true) {
      const next = [...this.timers.entries()].filter(([, t]) => t.at <= end)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      const [id, timer] = next;
      this.onAdvance(timer.at - this.now);
      this.now = timer.at;
      if (timer.repeat) timer.at += timer.delay;
      else this.timers.delete(id);
      timer.callback();
      this.flush();
    }
    this.onAdvance(end - this.now);
    this.now = end;
    this.flush();
  }
}

function harness(options = {}) {
  const clock = new Clock();
  const slots = [];
  let cursor = 0;
  let dirty = true;
  let mounted = true;
  let inUpdater = false;
  let effects = [];
  let value;
  let focusedMs = 0;
  const listeners = new Set();
  const awake = new Set();
  const records = [];
  const haptics = [];
  let settings = {
    sensitivity: 'medium', warningGraceMs: 1000, soundEnabled: true, hapticsEnabled: true,
    ...options.settings,
  };
  const safe = () => {
    assert.equal(inUpdater, false, 'side effect inside a state updater');
    assert.equal(mounted, true, 'state update or side effect after unmount');
  };
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) {
        slots[index] = { value: typeof initial === 'function' ? initial() : initial };
        slots[index].set = (next) => {
          safe();
          const previous = slots[index].value;
          if (typeof next === 'function') {
            inUpdater = true;
            try {
              const first = next(previous);
              const second = next(previous);
              assert.deepEqual(first, second, 'state updater must be repeatable');
              next = second;
            } finally { inUpdater = false; }
          }
          if (!Object.is(previous, next)) {
            slots[index].value = next;
            dirty = true;
          }
        };
      }
      return [slots[index].value, slots[index].set];
    },
    useRef(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback(fn, deps) {
      const index = cursor++;
      if (!slots[index] || !sameDeps(slots[index].deps, deps)) slots[index] = { fn, deps };
      return slots[index].fn;
    },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!slots[index] || !sameDeps(slots[index].deps, deps)) {
        const old = slots[index];
        slots[index] = { deps, cleanup: old?.cleanup };
        effects.push(() => {
          slots[index].cleanup?.();
          slots[index].cleanup = fn();
        });
      }
    },
  };
  const DeviceMotion = {
    requestPermissionsAsync: options.permission || (async () => ({ granted: true })),
    isAvailableAsync: options.available || (async () => true),
    setUpdateInterval: (ms) => { safe(); assert.equal(ms, 100); options.setInterval?.(); },
    addListener: (fn) => {
      safe();
      options.addListener?.();
      listeners.add(fn);
      return { remove: () => listeners.delete(fn) };
    },
  };
  const mocks = {
    react,
    'expo-sensors': { DeviceMotion },
    'expo-haptics': {
      NotificationFeedbackType: { Warning: 'warning', Success: 'success', Error: 'error' },
      notificationAsync: async (kind) => { safe(); haptics.push(kind); },
    },
    'expo-keep-awake': {
      activateKeepAwakeAsync: async (tag) => {
        safe();
        await options.activate?.(tag);
        awake.add(tag);
      },
      deactivateKeepAwake: async (tag) => { assert.equal(inUpdater, false); awake.delete(tag); },
    },
  };
  function load(file) {
    const module = { exports: {} };
    vm.runInNewContext(compile(file), {
      module, exports: module.exports, __DEV__: false, Error, Math,
      require: (name) => name === './constants' ? load('src/constants.ts') : mocks[name],
      Date: class extends Date { static now() { return clock.now; } },
      setInterval: (fn, ms) => { safe(); return clock.schedule(fn, ms, true); },
      setTimeout: (fn, ms) => { safe(); return clock.schedule(fn, ms); },
      clearInterval: clock.clear, clearTimeout: clock.clear,
    }, { filename: file });
    return module.exports;
  }
  const { useJailSession } = load('src/useJailSession.ts');
  const record = (entry) => { safe(); records.push(entry); };
  const flush = () => {
    for (let i = 0; dirty; i++) {
      assert.ok(i < 100, 'hook render loop');
      dirty = false;
      cursor = 0;
      value = useJailSession(settings, record);
      const pending = effects;
      effects = [];
      pending.forEach((effect) => effect());
    }
  };
  clock.flush = flush;
  clock.onAdvance = (ms) => { if (value.state === 'active') focusedMs += ms; };
  flush();
  return {
    clock, records, listeners, awake, haptics, DeviceMotion, flush,
    get value() { return value; },
    get focusedMs() { return focusedMs; },
    async start(minutes) { const result = await value.confirmJailPlacement(minutes); flush(); return result; },
    sample(opts = {}) {
      const { disturbed = false, faceDown = true, moving = false, screenUp = false } = typeof opts === 'boolean' ? { disturbed: opts } : opts;
      // flat-down = z=9.81, flat-up (screen-up) = z=-9.81, not-flat = x=9.81.
      const incX = disturbed || (!faceDown && !screenUp) ? 9.81 : 0;
      const incZ = disturbed ? 0 : (screenUp ? -9.81 : (faceDown ? 9.81 : 0));
      const data = {
        accelerationIncludingGravity: { x: incX, y: 0, z: incZ },
        acceleration: { x: disturbed ? 2 : (moving ? 1 : 0), y: 0, z: 0 },
      };
      [...listeners].forEach((fn) => fn(data));
      flush();
    },
    until(state, disturbed = false, limit = 200) {
      for (let i = 0; value.state !== state && i < limit; i++) {
        clock.advance(100);
        this.sample({ disturbed });
      }
      assert.equal(value.state, state);
    },
    updateSettings(next) { settings = { ...settings, ...next }; dirty = true; flush(); },
    unmount() {
      mounted = false;
      slots.forEach((slot) => slot.cleanup?.());
    },
  };
}

async function active(h, minutes = 1) {
  assert.equal(await h.start(minutes), true);
  assert.equal(h.value.state, 'placement-confirmed');
  h.clock.advance(5000);
  assert.equal(h.value.remainingSeconds, 0, 'placement does not run countdown');
  h.sample();
  for (let i = 0; i < 7; i++) { h.clock.advance(100); h.sample(); }
  assert.equal(h.value.state, 'placement-confirmed', 'hold not reached before 800ms');
  h.clock.advance(100);
  h.sample();
  assert.equal(h.value.state, 'locking', 'face-down and still must hold 800ms');
  h.clock.advance(1399);
  assert.equal(h.value.remainingSeconds, 0);
  h.clock.advance(1);
  assert.equal(h.value.state, 'active');
  assert.equal(h.value.remainingSeconds, minutes * 60);
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function settle(h) {
  for (let i = 0; i < 8; i++) await Promise.resolve();
  h.flush();
}

async function run() {
  const h = harness();
  await active(h, 2);
  for (let cycle = 1; cycle <= 5; cycle++) {
    h.clock.advance(1250);
    h.until('warning', true);
    const paused = h.value.remainingSeconds;
    assert.equal(paused, 120 - Math.floor(h.focusedMs / 1000));
    const warningAt = h.clock.now;
    assert.equal(h.value.warningDeadline - warningAt, 1000);
    h.until('jailbreak', true);
    assert.equal(h.value.alarmActive, true);
    h.clock.advance(150000);
    assert.equal(h.value.state, 'jailbreak', 'jailbreak never automatically fails or completes');
    assert.equal(h.value.remainingSeconds, paused);
    assert.equal(h.records.length, 0);
    const pulses = h.haptics.length;
    h.clock.advance(1000);
    assert.ok(h.haptics.length > pulses, 'alarm haptics continue until stable');
    h.until('returned');
    assert.equal(h.value.alarmActive, false, 'stillness clears the alarm');
    assert.equal(h.value.remainingSeconds, paused);
    h.clock.advance(1199);
    assert.equal(h.value.state, 'returned');
    assert.equal(h.value.remainingSeconds, paused);
    h.clock.advance(1);
    assert.equal(h.value.state, 'active');
    assert.equal(h.value.alarmActive, false, 'alarm stays off after resuming');
    assert.equal(h.value.remainingSeconds, paused, 'resume does not reset countdown');
    assert.equal(h.value.stats.jailbreakCount, cycle);
    assert.equal(h.value.stats.warningsCount, cycle);
  }
  h.clock.advance(120000 - h.focusedMs);
  assert.equal(h.value.state, 'completed');
  assert.equal(h.value.alarmActive, false, 'timer completion stops the alarm');
  assert.equal(h.records.length, 1);
  assert.equal(h.records[0].status, 'completed');
  assert.equal(h.records[0].completedDurationSeconds, 120);
  assert.equal(h.value.stats.elapsedFocusSeconds, 120);
  assert.ok(h.records[0].endTime - h.records[0].startTime > 120000);
  assert.equal(h.listeners.size, 0);
  assert.equal(h.awake.size, 0);
  assert.equal(h.clock.timers.size, 0);
  h.value.endJail();
  h.clock.advance(5000);
  assert.equal(h.records.length, 1, 'completion is emitted once');
  console.log('PASS five jailbreak cycles, alarm, focused-time pauses, fractional resume and completion');

  const manual = harness({ settings: { warningGraceMs: 2000, hapticsEnabled: false } });
  await active(manual);
  manual.clock.advance(2250);
  manual.until('warning', true);
  manual.until('returned');
  assert.equal(manual.value.stats.jailbreakCount, 0, 'recovery within grace avoids jailbreak');
  const paused = manual.value.remainingSeconds;
  manual.clock.advance(1200);
  manual.clock.advance(1000);
  assert.equal(manual.value.remainingSeconds, paused - 1);
  manual.until('warning', true);
  manual.until('jailbreak', true);
  manual.clock.advance(10000);
  const focused = Math.floor(manual.focusedMs / 1000);
  manual.value.endJail();
  manual.flush();
  assert.equal(manual.records.length, 1);
  assert.equal(manual.records[0].status, 'ended-early');
  assert.equal(manual.records[0].completedDurationSeconds, focused);
  assert.equal(manual.value.stats.elapsedFocusSeconds, focused);
  assert.equal(manual.value.alarmActive, false);
  assert.equal(manual.haptics.length, 0, 'haptics setting is respected');
  assert.equal(manual.clock.timers.size, 0);
  manual.value.dismissEnd();
  manual.flush();
  assert.equal(manual.value.state, 'idle');
  assert.equal(manual.value.remainingSeconds, 0);
  // A brand new session must be able to trigger the alarm again.
  await active(manual);
  manual.clock.advance(1250);
  manual.until('warning', true);
  manual.until('jailbreak', true);
  assert.equal(manual.value.alarmActive, true, 'alarm re-arms in a new session');
  manual.value.endJail();
  manual.flush();
  assert.equal(manual.value.alarmActive, false, 'End Jail stops the alarm');
  manual.unmount();
  console.log('PASS grace recovery, haptics disabled, manual end records only focus, dismissal, alarm re-arm');

  for (const stage of ['permission', 'available', 'activate']) {
    for (const action of ['cancel', 'unmount', 'supersede']) {
      const pending = deferred();
      let calls = 0;
      const normal = stage === 'permission' ? { granted: true } : stage === 'available' ? true : undefined;
      const race = harness({ [stage]: () => ++calls === 1 ? pending.promise : Promise.resolve(normal) });
      const first = race.value.confirmJailPlacement(1);
      await settle(race);
      assert.equal(calls, 1);
      if (action === 'unmount') race.unmount();
      else if (action === 'cancel') { race.value.cancelPlacement(); race.flush(); }
      else assert.equal(await race.start(2), true);
      pending.resolve(normal);
      assert.equal(await first, false);
      if (action !== 'unmount') race.flush();
      assert.equal(race.records.length, 0);
      assert.equal(race.listeners.size, action === 'supersede' ? 1 : 0);
      assert.equal(race.awake.size, action === 'supersede' ? 1 : 0, 'stale wake lock must not leak or release the new lock');
      if (action === 'cancel') assert.equal(race.value.state, 'idle');
      if (action === 'supersede') { race.value.cancelPlacement(); race.flush(); }
    }
  }
  console.log('PASS cancellation, unmount and overlapping starts at each asynchronous stage');

  for (const options of [
    { permission: async () => ({ granted: false }) },
    { permission: async () => { throw new Error('Permission API failed'); } },
    { available: async () => false },
    { available: async () => { throw new Error('Availability failed'); } },
    { activate: async () => { throw new Error('Wake lock failed'); } },
    { setInterval: () => { throw new Error('Sensor update failed'); } },
    { addListener: () => { throw new Error('Subscription failed'); } },
  ]) {
    const failed = harness(options);
    assert.equal(await failed.start(), false);
    assert.equal(failed.value.state, 'idle');
    assert.ok(failed.value.placementError);
    assert.equal(failed.listeners.size, 0);
    assert.equal(failed.awake.size, 0);
    assert.equal(failed.records.length, 0);
  }
  const retry = harness({ permission: async () => ({ granted: false }) });
  assert.equal(await retry.start(), false);
  retry.DeviceMotion.requestPermissionsAsync = async () => ({ granted: true });
  assert.equal(await retry.start(), true);
  assert.equal(retry.value.placementError, null);
  retry.until('locking');
  retry.value.cancelPlacement();
  retry.flush();
  retry.clock.advance(5000);
  assert.equal(retry.value.state, 'idle');
  assert.equal(retry.records.length, 0);
  console.log('PASS permission/availability/startup failures, retry and cancellation during locking');

  const delayed = harness();
  await active(delayed);
  const interval = [...delayed.clock.timers.values()].find((timer) => timer.repeat);
  delayed.clock.now += 5250;
  interval.callback();
  delayed.flush();
  assert.equal(delayed.value.remainingSeconds, 55, 'delayed ticks use elapsed time, not tick count');
  delayed.clock.now += 900;
  delayed.value.endJail();
  delayed.flush();
  assert.equal(delayed.records[0].completedDurationSeconds, 6, 'manual end accounts for time since the last tick');
  assert.equal(delayed.value.remainingSeconds, 54);

  const live = harness();
  await active(live);
  const listener = [...live.listeners][0];
  live.updateSettings({ sensitivity: 'high', warningGraceMs: 500, hapticsEnabled: false });
  assert.equal([...live.listeners][0], listener, 'settings changes preserve the sensor subscription');
  live.until('warning', true);
  assert.equal(live.value.warningDeadline - live.clock.now, 500);
  live.until('jailbreak', true);
  for (let i = 0; i < 20; i++) { live.clock.advance(100); live.sample(); }
  assert.equal(live.value.state, 'jailbreak', 'alarm requires the full stable hold');
  assert.equal(live.value.alarmActive, true, 'alarm keeps sounding during the stillness hold');
  for (let i = 0; i < 10; i++) { live.clock.advance(100); live.sample(true); }
  assert.equal(live.value.alarmActive, true, 'motion interrupts recovery');
  live.until('returned');
  assert.equal(live.value.alarmActive, false, 'returned state stops the alarm');
  live.unmount();
  live.clock.advance(10000);
  assert.equal(live.clock.timers.size, 0);
  assert.equal(live.listeners.size, 0);
  assert.equal(live.awake.size, 0);
  assert.equal(live.records.length, 0);
  console.log('PASS delayed ticks, active manual end, live settings, interrupted recovery and returned unmount');

  const auto = harness();
  await active(auto);
  assert.equal(auto.records.length, 0, 'timer is active, not yet completed');
  auto.value.endJail();
  auto.flush();
  assert.equal(auto.records.length, 1);
  console.log('PASS automatic face-down start still works and ends once');

  const manualConfirm = harness();
  assert.equal(await manualConfirm.value.confirmJailPlacement(1), true, 'manual confirm starts the placement watch');
  manualConfirm.flush();
  assert.equal(manualConfirm.value.state, 'placement-confirmed', 'Place Jail does not start the timer');
  assert.equal(manualConfirm.value.remainingSeconds, 0, 'timer has not started');
  manualConfirm.clock.advance(5000);
  manualConfirm.flush();
  assert.equal(manualConfirm.value.state, 'placement-confirmed', 'placement remains confirmed with no flat placement');
  assert.equal(manualConfirm.value.remainingSeconds, 0, 'timer still has not started');
  console.log('PASS manual Place Jail only confirms; timer does not start');

  const tilt = harness();
  await tilt.start(1);
  tilt.sample({ faceDown: true });
  for (let i = 0; i < 2; i++) { tilt.clock.advance(100); tilt.sample({ faceDown: true }); }
  // User briefly tilts the phone away from flat (upright) — hold resets.
  tilt.clock.advance(100); tilt.sample({ faceDown: false });
  for (let i = 0; i < 8; i++) { tilt.clock.advance(100); tilt.sample({ faceDown: true }); }
  assert.equal(tilt.value.state, 'placement-confirmed', 'brief upright tilt while holding must not start');
  tilt.clock.advance(100); tilt.sample({ faceDown: true });
  assert.equal(tilt.value.state, 'locking', 'full 800ms hold after a reset must lock');
  tilt.unmount();
  console.log('PASS brief tilt does not start, reset and re-hold locks');

  const screenUp = harness();
  await screenUp.start(1);
  screenUp.sample({ screenUp: true });
  for (let i = 0; i < 8; i++) { screenUp.clock.advance(100); screenUp.sample({ screenUp: true }); }
  assert.equal(screenUp.value.state, 'locking', 'screen-up flat and still must lock');
  screenUp.unmount();
  console.log('PASS screen-up flat and still locks');

  const upright = harness();
  await upright.start(1);
  for (let i = 0; i < 20; i++) { upright.clock.advance(100); upright.sample({ faceDown: false }); }
  assert.equal(upright.value.state, 'placement-confirmed', 'upright phone must not start');
  upright.unmount();
  console.log('PASS upright phone does not start');

  const moving = harness();
  await moving.start(1);
  for (let i = 0; i < 20; i++) { moving.clock.advance(100); moving.sample({ faceDown: true, moving: true }); }
  assert.equal(moving.value.state, 'placement-confirmed', 'flat but moving phone must not start');
  moving.unmount();
  console.log('PASS flat but moving phone does not start');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
