const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const compiled = new Map();
function compile(file) {
  if (!compiled.has(file)) {
    compiled.set(file, ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
      }, fileName: file,
    }).outputText);
  }
  return compiled.get(file);
}

function children(node) {
  return [node?.props?.children].flat(Infinity).filter((child) => child && typeof child === 'object');
}
function nodes(tree, name) {
  if (!tree) return [];
  const matches = tree.type === name || tree.type?.name === name;
  return [...(matches ? [tree] : []), ...children(tree).flatMap((child) => nodes(child, name))];
}
function near(actual, expected) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-9,
    `coordinate ${i}: expected ${expected[i]}, got ${value}`));
}

// Controllable clock + rAF queue shared by every vm context, so the
// settle animation (requestAnimationFrame + Date.now) can be driven
// deterministically from the tests.
let fakeNow = 0;
let pendingRafs = [];
const sandboxGlobals = {
  requestAnimationFrame: (cb) => { pendingRafs.push(cb); return pendingRafs.length; },
  cancelAnimationFrame: () => { pendingRafs = []; },
  Date: { now: () => fakeNow },
};

function harness(file, name, initialProps) {
  const slots = [];
  let cursor = 0;
  let phase = 'idle';
  let props = initialProps;
  let work;
  let tree;
  let effects = [];
  let dirty = true;
  const depsEqual = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) {
        const slot = { value: typeof initial === 'function' ? initial() : initial, queue: [] };
        slot.set = (next) => {
          assert.notEqual(phase, 'updater', 'nested state update inside an updater');
          assert.notEqual(phase, 'render', 'render-phase state update');
          slot.queue.push(next);
          dirty = true;
        };
        slots[index] = slot;
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
      if (!slots[index] || !depsEqual(slots[index].deps, deps)) slots[index] = { fn, deps };
      return slots[index].fn;
    },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!slots[index] || !depsEqual(slots[index].deps, deps)) {
        const cleanup = slots[index]?.cleanup;
        slots[index] = { deps, cleanup };
        effects.push(() => { cleanup?.(); slots[index].cleanup = fn(); });
      }
    },
  };
  const viro = Object.fromEntries([
    'ViroAmbientLight', 'ViroARPlane', 'ViroARScene', 'ViroNode', 'ViroQuad', 'Viro3DObject',
    'ViroBox', 'ViroPolyline', 'ViroSphere',
  ].map((name) => [name, name]));
  Object.assign(viro, {
    ViroMaterials: { createMaterials() {} },
    ViroAnimations: { registerAnimations() {} },
    ViroTrackingStateConstants: { TRACKING_NORMAL: 3 },
    ViroPinchStateTypes: { PINCH_MOVE: 2, PINCH_END: 3 },
    ViroRotateStateTypes: { ROTATE_MOVE: 2, ROTATE_END: 3 },
  });
  const jsx = (type, props, key) => ({ type, props, key });
  const modules = new Map();
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const module = { exports: {} };
    vm.runInNewContext(compile(file), {
      module, exports: module.exports, __DEV__: false, console, Map, Set, Number, Math,
      ...sandboxGlobals,
      require(id) {
        if (id === 'react') return react;
        if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
        if (id === '@reactvision/react-viro') return viro;
        if (id === './VirtualJail3D') return load('src/ar/VirtualJail3D.tsx');
        if (id.startsWith('../../assets/')) return id;
        throw new Error(`Unexpected import ${id} in ${file}`);
      },
    }, { filename: file });
    modules.set(file, module.exports);
    return module.exports;
  }
  const Component = load(file)[name];
  const api = {
    get phase() { return phase; },
    get tree() { return tree; },
    get work() { return work; },
    get dirty() { return dirty; },
    render() {
      assert.equal(phase, 'idle');
      assert.equal(effects.length, 0, 'commit previous render before rendering again');
      dirty = false;
      phase = 'updater';
      try {
        for (const slot of slots) {
          if (!slot.queue) continue;
          for (const update of slot.queue.splice(0)) {
            if (typeof update === 'function') {
              const first = update(slot.value);
              const second = update(slot.value);
              assert.deepEqual(first, second, 'state updater must be repeatable');
              slot.value = second;
            } else slot.value = update;
          }
        }
        phase = 'render';
        cursor = 0;
        work = Component(props);
      } finally { phase = 'idle'; }
      return work;
    },
    commit() {
      tree = work;
      const pending = effects;
      effects = [];
      phase = 'effect';
      try { pending.forEach((effect) => effect()); }
      finally { phase = 'idle'; }
    },
    flush() {
      for (let i = 0; dirty; i++) {
        assert.ok(i < 100, 'render loop');
        api.render();
        api.commit();
      }
    },
    update(next) { props = { ...props, ...next }; dirty = true; },
    advance(ms) {
      let remaining = ms;
      while (remaining > 0) {
        const tick = Math.min(16, remaining);
        fakeNow += tick;
        const cbs = pendingRafs;
        pendingRafs = [];
        cbs.forEach((cb) => cb());
        remaining -= tick;
      }
    },
  };
  return api;
}

function sceneHarness(navigator = 'sceneNavigator') {
  const selected = [];
  const counts = [];
  const tracking = [];
  const appProps = {
    placed: false, locked: false,
    onPlaneSelected(value) {
      assert.equal(h.phase, 'effect', 'parent selection callback must run after commit, never in render/updater/event');
      const models = nodes(h.tree, 'VirtualJail3D');
      assert.equal(models.length, value ? 1 : 0, 'selection callback must observe an atomically committed model');
      selected.push({ value, model: models[0] });
    },
    onPlaneCountChange(value) {
      assert.equal(h.phase, 'effect', 'plane count callback cannot run inside a state updater');
      counts.push(value);
    },
    onTrackingReady(value) { tracking.push(value); },
    onModelReady() {}, onModelError() {},
  };
  const h = harness('src/ar/JailARScene.tsx', 'JailARScene', { [navigator]: { viroAppProps: appProps } });
  return Object.assign(h, {
    selected, counts, tracking,
    updateApp(next) {
      Object.assign(appProps, next);
      h.update({ [navigator]: { viroAppProps: { ...appProps } } });
    },
  });
}

const plane = (id, extra = {}) => ({
  type: 'plane', anchorId: id, alignment: 'HorizontalUpward', position: [1, 0.7, 2],
  rotation: [0, 0, 0], width: 0.8, height: 0.6, center: [0.1, 0, 0.2], ...extra,
});
const FALLBACK = [0, -0.38, -0.8];
const jailNodeOf = (tree) =>
  nodes(tree, 'ViroNode').find((node) => nodes(node, 'VirtualJail3D').length === 1);
const hit = (position, type = 'EstimatedHorizontalPlane') => ({
  hitTestResults: [{ type, transform: { position, rotation: [0, 0, 0], scale: [1, 1, 1] } }],
  cameraOrientation: { position: [0, 0, 0], rotation: [0, 0, 0], forward: [0, 0, -1], up: [0, 1, 0] },
});

function run() {
  const h = sceneHarness();
  h.render();
  assert.equal(h.selected.length, 0, 'initial callback must also wait for commit');
  h.commit();
  assert.deepEqual(h.selected.map((event) => event.value), [true],
    'jail is placeable immediately from its fallback world position — no tap required');
  assert.equal(nodes(h.tree, 'VirtualJail3D').length, 1, 'exactly one jail node exists from the first frame');
  near(jailNodeOf(h.tree).props.position, FALLBACK);
  assert.equal(jailNodeOf(h.tree).props.dragType, undefined, 'dragging is disabled before the jail lands on a surface');

  h.tree.props.onTrackingUpdated(3, 'normal');
  h.tree.props.onTrackingUpdated(1, 'limited');
  assert.deepEqual(h.tracking, [true, false]);

  h.tree.props.onAnchorFound(plane('vertical', { alignment: 'Vertical' }));
  h.tree.props.onAnchorFound(plane('image', { type: 'image' }));
  h.flush();
  assert.equal(nodes(h.tree, 'ViroARPlane').length, 0);
  near(jailNodeOf(h.tree).props.position, FALLBACK, 'non-horizontal anchors must not move the jail');

  h.tree.props.onCameraARHitTest(hit([9, 9, 9], 'FeaturePoint'));
  h.advance(300);
  h.flush();
  near(jailNodeOf(h.tree).props.position, FALLBACK, 'non-plane hit results must not move the jail');

  // Center-camera hit test lands on a horizontal surface: the jail animates
  // toward it without popping and without a second jail ever existing.
  h.tree.props.onCameraARHitTest(hit([0.5, -0.5, -1.2]));
  h.advance(140);
  h.flush();
  const mid = jailNodeOf(h.tree).props.position;
  assert.ok(mid[0] > 0 && mid[0] < 0.5 && mid[1] < -0.38 && mid[1] > -0.5 && mid[2] < -0.8 && mid[2] > -1.2,
    `settle interpolates smoothly, got ${mid}`);
  assert.equal(nodes(h.tree, 'VirtualJail3D').length, 1, 'still exactly one jail during the settle');
  h.advance(200);
  h.flush();
  near(jailNodeOf(h.tree).props.position, [0.5, -0.5, -1.2]);

  h.tree.props.onCameraARHitTest(hit([7, 7, 7]));
  h.advance(300);
  h.flush();
  near(jailNodeOf(h.tree).props.position, [0.5, -0.5, -1.2], 'later hit tests cannot re-settle the jail');

  // Drag is world-space plane-constrained once settled.
  assert.equal(jailNodeOf(h.tree).props.dragType, 'FixedToPlane');
  near(jailNodeOf(h.tree).props.dragPlane.planePoint, [0.5, -0.5, -1.2]);
  jailNodeOf(h.tree).props.onDrag([0.8, -0.5, -1.0]);
  h.flush();
  near(jailNodeOf(h.tree).props.position, [0.8, -0.5, -1.0]);

  // Detected planes still render as visual overlays, but taps are not needed.
  h.tree.props.onAnchorFound(plane('desk'));
  h.tree.props.onAnchorFound(plane('other', { width: 0, height: 0, alignment: undefined }));
  h.flush();
  assert.equal(nodes(h.tree, 'ViroARPlane').length, 2);
  nodes(h.tree, 'ViroQuad').forEach((quad) => {
    assert.equal(quad.props.ignoreEventHandling, true);
    assert.equal(quad.props.onClickState, undefined);
  });
  near(jailNodeOf(h.tree).props.position, [0.8, -0.5, -1.0], 'anchors after settling must not move the jail');
  assert.deepEqual(h.counts.filter((v) => v > 0).at(-1), 2);

  // Confirmation freezes everything but keeps the single jail mounted.
  h.updateApp({ placed: true, locked: true });
  h.flush();
  assert.equal(jailNodeOf(h.tree).props.onDrag, undefined);
  assert.equal(jailNodeOf(h.tree).props.dragType, undefined);
  assert.equal(nodes(h.tree, 'ViroARPlane').length, 0, 'overlays hide after placement is confirmed');
  const model = nodes(h.tree, 'VirtualJail3D')[0];
  assert.equal(model.props.frozen, true);
  assert.equal(model.props.locked, true);
  console.log('PASS fallback mount, center hit-test settle animation, world drag and placement freeze');

  // Anchor-fallback path: if the camera hit test never lands on a plane, the
  // first detected horizontal anchor's center becomes the settle target.
  const anchorOnly = sceneHarness('arSceneNavigator');
  anchorOnly.flush();
  anchorOnly.tree.props.onAnchorFound(plane('desk'));
  anchorOnly.flush();
  anchorOnly.advance(300);
  anchorOnly.flush();
  near(jailNodeOf(anchorOnly.tree).props.position, [1.1, 0.7, 2.2],
    'first horizontal anchor center becomes the landing point');
  console.log('PASS anchor-fallback settle to detected plane center');

  // Placement confirmed before any surface is found: the jail stays at its
  // fallback world position and late hits/anchors cannot move it.
  const early = sceneHarness();
  early.flush();
  early.updateApp({ placed: true });
  early.flush();
  early.tree.props.onCameraARHitTest(hit([9, 9, 9]));
  early.tree.props.onAnchorFound(plane('desk'));
  early.advance(400);
  early.flush();
  near(jailNodeOf(early.tree).props.position, FALLBACK,
    'confirmation before surface detection keeps the fallback world position');
  console.log('PASS placement confirmed before surface detection keeps fallback position');

  // An in-flight settle is cancelled by placement confirmation: the jail
  // freezes mid-flight rather than completing the move after confirm.
  const late = sceneHarness();
  late.flush();
  late.tree.props.onCameraARHitTest(hit([1, -0.5, 2]));
  late.advance(50);
  late.flush();
  late.updateApp({ placed: true });
  late.flush();
  late.advance(400);
  late.flush();
  const frozenMid = jailNodeOf(late.tree).props.position;
  assert.ok(frozenMid[0] < 1 && frozenMid[2] < 2 && frozenMid[0] > 0,
    `in-flight settle must freeze at the interpolated position, got ${frozenMid}`);
  console.log('PASS in-flight settle animation cancelled by placement confirmation');

  // Auto-lock path: session lock (without the manual placed flag) still hides
  // the plane overlays, disables drag, and freezes the jail mesh.
  const auto = sceneHarness();
  auto.flush();
  auto.tree.props.onCameraARHitTest(hit([0.6, -0.5, -1.1]));
  auto.advance(300);
  auto.flush();
  auto.updateApp({ locked: true });
  auto.flush();
  assert.equal(jailNodeOf(auto.tree).props.dragType, undefined, 'session lock disables drag');
  assert.equal(nodes(auto.tree, 'ViroARPlane').length, 0, 'session lock hides plane overlays');
  const autoModel = nodes(auto.tree, 'VirtualJail3D')[0];
  assert.equal(autoModel.props.frozen, true, 'session lock freezes jail gestures');
  assert.equal(autoModel.props.locked, true);
  console.log('PASS session lock freezes the jail without a manual placed flag');

  // The AR jail is built from ViroBox primitives.
  const ready = [];
  const errors = [];
  const mesh = harness('src/ar/VirtualJail3D.tsx', 'VirtualJail3D', {
    locked: true,
    onReady() { assert.equal(mesh.phase, 'effect'); ready.push(true); },
    onError(message) { errors.push(message); },
  });
  mesh.flush();
  assert.equal(ready.length, 1, 'jail reports ready after mount');
  assert.equal(errors.length, 0);
  mesh.render();
  assert.equal(ready.length, 1, 'model ready is not emitted during render');
  mesh.commit();
  assert.equal(ready.length, 1, 'ready must not be re-emitted for the same mount');
  assert.equal(nodes(mesh.tree, 'Viro3DObject').length, 0, 'jail is built from Viro primitives, not OBJ models');
  assert.equal(nodes(mesh.tree, 'ViroQuad').length, 0, 'previous translucent panel geometry is gone');
  assert.equal(nodes(mesh.tree, 'ViroPolyline').length, 0, 'previous polyline lock geometry is gone');
  assert.ok(nodes(mesh.tree, 'ViroBox').length >= 12, 'body, edge and grid geometry is present');

  // Pinch/rotate live on the inner node; drag lives on the parent world node.
  const gestures = harness('src/ar/VirtualJail3D.tsx', 'VirtualJail3D', { frozen: false, locked: false });
  gestures.flush();
  assert.equal(gestures.tree.props.dragType, undefined, 'inner node no longer owns drag');
  assert.equal(gestures.tree.props.onDrag, undefined);
  gestures.tree.props.onPinch(3, 10);
  gestures.tree.props.onRotate(3, 30);
  gestures.flush();
  near(gestures.tree.props.scale, [2.2, 2.2, 2.2]);
  near(gestures.tree.props.rotation, [0, -30, 0]);
  gestures.update({ frozen: true });
  gestures.flush();
  for (const name of ['onPinch', 'onRotate']) assert.equal(gestures.tree.props[name], undefined);
  console.log('PASS model postcommit readiness/error forwarding and placed gesture freeze');
}

run();
