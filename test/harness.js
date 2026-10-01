/* Headless harness: runs real Hunterz modules (js/util.js, js/world.js registry,
   js/textures.js) in Node with a stubbed DOM + THREE, so the translated code paths
   are executed rather than only syntax-checked. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function boot(ROOT, SCRIPTS) {

  // ---------------------------------------------------------------- DOM stubs
  const listeners = [];
  function makeCtx2d() {
    const imgData = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
    const noop = () => {};
    return new Proxy({}, {
      get(t, k) {
        if (k === 'createImageData') return (w, h) => imgData(w, h);
        if (k === 'getImageData') return (x, y, w, h) => imgData(w || 1, h || 1);
        if (k === 'putImageData') return noop;
        if (k === 'createLinearGradient' || k === 'createRadialGradient') {
          return () => ({ addColorStop: noop });
        }
        if (k === 'measureText') return () => ({ width: 10 });
        if (typeof k === 'string') return noop;
        return undefined;
      },
      set() { return true; },
    });
  }
  function makeCanvas() {
    const c = {
      width: 1, height: 1, style: {}, dataset: {},
      getContext(kind) { return kind === '2d' ? makeCtx2d() : { getParameter: () => 0 }; },
      toDataURL: () => 'data:,',
      addEventListener: (t, f) => listeners.push([t, f]),
      removeEventListener() {}, appendChild() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      requestPointerLock() {},
    };
    return c;
  }
  const elCache = new Map();
  function makeEl(id) {
    const el = {
      id, className: '', textContent: '', value: '75', checked: false, disabled: false,
      children: [], style: {}, dataset: {}, offsetWidth: 10, innerText: '', parent: null,
      classList: {
        _s: new Set(),
        add(...c) { c.forEach(x => this._s.add(x)); },
        remove(...c) { c.forEach(x => this._s.delete(x)); },
        toggle(c, f) { if (f === undefined) f = !this._s.has(c); f ? this._s.add(c) : this._s.delete(c); return f; },
        contains(c) { return this._s.has(c); },
      },
      appendChild(x) { x.parent = this; this.children.push(x); return x; },
      append(...nodes) { nodes.forEach(n => this.appendChild(n)); },   // real DOM has append(); ui code uses it
      prepend(x) { x.parent = this; this.children.unshift(x); },
      // honour the one innerHTML use in the code base (clearing a list before redrawing)
      get innerHTML() { return this._innerHTML; },
      set innerHTML(v) { this._innerHTML = v; if (v === '') this.children.length = 0; },
      remove() { const p = this.parent; if (!p) return; const i = p.children.indexOf(this); if (i >= 0) p.children.splice(i, 1); this.parent = null; },
      removeChild(x) { const i = this.children.indexOf(x); if (i >= 0) this.children.splice(i, 1); x.parent = null; },
      focus() {},
      get lastChild() { return this.children[this.children.length - 1] || null; },
      get firstChild() { return this.children[0] || null; },
      addEventListener: (t, f) => listeners.push([id + ':' + t, f]),
      removeEventListener() {},
      querySelector: () => null,
    };
    el._innerHTML = '';
    return el;
  }
  const documentStub = {
    createElement: (t) => (t === 'canvas' ? makeCanvas() : makeEl('created-' + t)),
    createTextNode: (t) => ({ nodeType: 3, textContent: String(t) }),
    getElementById: (id) => { if (!elCache.has(id)) elCache.set(id, makeEl(id)); return elCache.get(id); },
    addEventListener: (t, f) => listeners.push(['doc:' + t, f]),
    exitPointerLock() {},
    pointerLockElement: null,
    body: makeEl('body'),
  };
  const store = new Map();
  const localStorageStub = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };

  // ---------------------------------------------------------------- THREE stub
  function mock(label) {
    const f = function () { return mock(label); };
    return new Proxy(f, {
      get(t, k) {
        if (k === Symbol.toPrimitive || k === 'toString') return () => label;
        if (k === 'valueOf') return () => 0;
        if (k === Symbol.iterator) return undefined;
        if (k === 'userData') return {};
        if (k === 'isMesh' || k === 'isObject3D') return true;
        if (typeof k === 'symbol') return undefined;
        return mock(label + '.' + String(k));
      },
      apply() { return mock(label + '()'); },
      construct() { return mock('new ' + label); },
      set() { return true; },
    });
  }
  const THREE = mock('THREE');

  // ---------------------------------------------------------------- sandbox
  const sandbox = {
    console,
    document: documentStub,
    navigator: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) HeadlessTest/1.0', deviceMemory: 8, hardwareConcurrency: 8 },
    localStorage: localStorageStub,
    location: { href: 'http://localhost:8000/index.html', search: '', replace() {}, assign() {} },
    performance: { now: () => Date.now() },
    requestAnimationFrame: () => 0,
  addEventListener: (t, f) => listeners.push(['win:' + t, f]),
  removeEventListener() {},
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    setTimeout, clearTimeout, setInterval, clearInterval,
    Promise, Math, JSON, Date, URL, URLSearchParams, Number, String, Object, Array, Map, Set, Error,
    Float32Array, Uint8Array, Uint8ClampedArray, Uint16Array, Int32Array, ArrayBuffer, isNaN, isFinite, parseInt, parseFloat,
    window: null,
  THREE: null,
  };
  sandbox.THREE = THREE;
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  for (const rel of SCRIPTS) {
    const file = path.join(ROOT, rel);
    vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  }
  return { sandbox, elCache, store, listeners };
}

module.exports = boot;
