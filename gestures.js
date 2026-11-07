'use strict';

function paperSounds() {
  const Context = window.AudioContext || window.webkitAudioContext;
  const Decoder = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  let ctx, gain, idle, active, tail, generation = 0, prior = -1, clips = [];
  let ready = Promise.resolve();
  if (Decoder && window.katherinePaperSamples) {
    try {
      const decoder = new Decoder(1, 1, 44100);
      ready = Promise.all(window.katherinePaperSamples.map(async data => {
        try {
          const raw = Uint8Array.from(atob(data), char => char.charCodeAt(0));
          return await decoder.decodeAudioData(raw.buffer);
        } catch { return null; }
      })).then(decoded => { clips = decoded; });
    } catch { /* Keep the reader available if audio decoding is unsupported. */ }
  }
  function unlock() {
    if (!Context || navigator.userActivation?.hasBeenActive === false) return Promise.resolve();
    try {
      if (!ctx) {
        ctx = new Context();
        gain = ctx.createGain();
        gain.gain.value = 0;
        gain.connect(ctx.destination);
      }
      return ctx.state === 'running' ? Promise.resolve() : ctx.resume().catch(() => {});
    } catch { return Promise.resolve(); }
  }
  function cut(state) {
    clearTimeout(idle);
    if (!state?.source || !ctx) return;
    const source = state.source;
    state.source = null;
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0, now, .009);
    try { source.stop(now + .038); } catch { /* The clip already ended. */ }
  }
  function voice(state, release = false) {
    if (!ctx || ctx.state !== 'running' || !clips[state.choice]) return;
    const time = ctx.currentTime;
    const energy = Math.min(1, state.speed / 1.6);
    const volume = (.16 + .34 * energy) * (.78 + .22 * Math.min(1, state.progress * 2));
    const rate = .74 + .68 * energy;
    if (!state.source) {
      const source = ctx.createBufferSource();
      source.buffer = clips[state.choice];
      source.loop = !release;
      source.playbackRate.value = rate;
      source.connect(gain);
      source.onended = () => { source.disconnect(); if (state.source === source) state.source = null; };
      source.start();
      state.source = source;
      state.played = true;
    }
    state.source.playbackRate.setTargetAtTime(rate, time, .022);
    gain.gain.cancelScheduledValues(time);
    gain.gain.setTargetAtTime(volume, time, .012);
    if (release) {
      gain.gain.setTargetAtTime(0, time + .16, .026);
      state.source.stop(time + .27);
    } else {
      clearTimeout(idle);
      idle = setTimeout(() => cut(state), 90);
    }
  }
  return {
    unlock,
    begin() {
      const count = window.katherinePaperSamples?.length || 0;
      if (!count) return;
      generation++;
      cut(tail);
      tail = null;
      cut(active);
      prior = prior < 0 ? Math.floor(Math.random() * count) : (prior + 1 + Math.floor(Math.random() * (count - 1))) % count;
      active = { choice: prior, source: null, played: false, speed: 0, progress: 0 };
    },
    movement(speed, progress) {
      const state = active;
      if (!state) return;
      state.speed = speed;
      state.progress = progress;
      state.updated = performance.now();
      if (clips.length) voice(state);
      else ready.then(() => { if (active === state && performance.now() - state.updated < 90) voice(state); });
    },
    end(complete = false) {
      const state = active;
      active = null;
      cut(state);
      cut(tail);
      tail = null;
      const version = ++generation;
      if (!complete || !state || state.played || state.progress < .09) return;
      const requestedAt = performance.now();
      // The first touch may activate audio only at release. Give that committed
      // turn a short audible tail instead of silently losing the entire sound.
      Promise.all([unlock(), ready]).then(() => {
        if (!active && version === generation && performance.now() - requestedAt < 650) {
          tail = state;
          voice(state, true);
        }
      });
    },
  };
}

window.installPageGestures = function installPageGestures({ shell, deck, main, reduced, adjacent, visiblePages, commit }) {
  const sounds = paperSounds();
  const preview = document.createElement('div');
  preview.className = 'page-deck drag-preview';
  preview.setAttribute('aria-hidden', 'true');
  preview.inert = true;
  preview.hidden = true;
  shell.prepend(preview);
const back = document.createElement('div');
  back.className = 'fold-back';
  back.inert = true;
  back.setAttribute('aria-hidden', 'true');
  back.hidden = true;
  shell.append(back);
  let drag, raf, settling, folded, suppressClickUntil = 0;
  function clonePage(page) {
    const copy = page.cloneNode(true);
    copy.hidden = false;
    for (const node of copy.querySelectorAll('[id]')) node.removeAttribute('id');
    return copy;
  }
  function clearView() {
    folded?.leaf.style.removeProperty('clip-path');
    folded = null;
    preview.hidden = true;
    preview.replaceChildren();
    back.hidden = true;
    back.replaceChildren();
    shell.classList.remove('is-grabbing');
  }
  function polygon(points) {
    const coordinates = points.map(p => p.x.toFixed(2) + 'px ' + p.y.toFixed(2) + 'px');
    return 'polygon(' + (coordinates.length < 3 ? '0px 0px,0px 0px,0px 0px' : coordinates.join(',')) + ')';
  }
  function paint(progress, lift) {
    if (!folded) return;
    const geometry = window.grabfoldGeometry({
      spine: folded.spine, width: folded.width, height: folded.height,
      grabY: folded.grabY, progress, lift,
    });
    folded.leaf.style.clipPath = polygon(geometry.leaf);
    back.style.clipPath = polygon(geometry.flap);
    const { x, y, angle } = geometry.place;
    back.style.transform = 'translate(' + x + 'px,' + y + 'px) rotate(' + angle + 'rad)';
    back.style.setProperty('--fold-angle', geometry.roll.angle + 'rad');
    back.style.setProperty('--fold-shade', String(.1 + Math.sin(Math.PI * progress) * .28));
  }
  function buildPreview(state) {
    if (reduced.matches || !window.grabfoldGeometry) return;
    const from = [...deck.children].filter(page => !page.hidden);
    const targets = visiblePages(state.target);
    const forward = state.direction > 0;
    const leaf = forward ? from.at(-1) : from[0];
    const incoming = forward ? targets.at(-1) : targets[0];
    const reverse = forward ? targets[0] : targets.at(-1);
    const bounds = leaf.getBoundingClientRect();
    folded = {
      leaf, spine: forward ? 'left' : 'right', width: bounds.width, height: bounds.height,
      grabY: Math.max(0, Math.min(bounds.height, state.y - bounds.top)),
    };
    const position = { left: leaf.offsetLeft + 'px', top: leaf.offsetTop + 'px', width: bounds.width + 'px', height: bounds.height + 'px' };
    Object.assign(preview.style, position);
    Object.assign(back.style, position);
    preview.replaceChildren(clonePage(incoming));
    if (targets.length > 1) back.replaceChildren(clonePage(reverse));
    preview.hidden = false;
    back.hidden = false;
  }

  function cancel() {
    if (drag && shell.hasPointerCapture(drag.id)) shell.releasePointerCapture(drag.id);
    drag = null;
    settling = null;
    cancelAnimationFrame(raf);
    sounds.end();
    clearView();
  }

  function finish(event, cancelled) {
    if (!drag || drag.id !== event.pointerId) return;
    const state = drag;
    drag = null;
    if (!reduced.matches && !cancelled) sounds.unlock();
    if (!state.direction || state.target === null) { sounds.end(); return; }
    suppressClickUntil = performance.now() + 300;
    const velocity = !cancelled && performance.now() - state.time < 115 ? state.velocity : 0;
    const progress = state.progress;
    const projected = progress + Math.max(0, velocity) * 78 / state.width;
    const complete = !cancelled && progress >= .09 && state.peak - progress < .12 && velocity > -.26 && projected >= .29;
    sounds.end(complete);
    settle(state, complete, progress / 2, velocity * 500 / state.width);
  }

  function settle(state, complete, initial, initialSpeed) {
    if (reduced.matches || !folded) {
      clearView();
      if (complete) commit(state.target);
      return;
    }
    const goal = Number(complete);
    let value = initial, speed = Math.max(-4, Math.min(4, initialSpeed));
    const start = performance.now();
    let last = start;
    settling = state;
    function animate(now) {
      if (settling !== state) return;
      const dt = Math.min(.025, (now - last) / 1000);
      last = now;
      speed += ((goal - value) * 330 - speed * 34) * dt;
      value += speed * dt;
      paint(value, (state.lift || 0) * Math.max(0, 1 - (now - start) / 370));
      if (now - start < 370 && (Math.abs(goal - value) > .012 || Math.abs(speed) > .09)) {
        raf = requestAnimationFrame(animate);
        return;
      }
      settling = null;
      clearView();
      if (complete) commit(state.target);
    }
    raf = requestAnimationFrame(animate);
  }

  function turn(direction) {
    if (drag || settling) return;
    const target = adjacent(direction);
    if (target === null) return;
    const { top, height } = shell.getBoundingClientRect();
    const state = { direction, target, y: top + height * .54 };
    buildPreview(state);
    paint(0, 0);
    settle(state, true, 0, 0);
  }

  shell.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || drag || event.target.closest('button,input,a,select,textarea,[contenteditable]')) return;
    if (settling) cancel();
    if (!reduced.matches) sounds.unlock();
    const width = shell.getBoundingClientRect().width / (shell.dataset.mode === 'spread' ? 2 : 1);
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, time: performance.now(), width, progress: 0, peak: 0, velocity: 0, direction: 0, target: null };
  });
  window.addEventListener('pointermove', event => {
    const state = drag;
    if (!state || state.id !== event.pointerId) return;
    const dx = event.clientX - state.x, dy = event.clientY - state.y;
    if (!state.direction) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
      if (Math.abs(dx) < 11 || Math.abs(dx) < Math.abs(dy) * 1.22) return;
      state.direction = dx < 0 ? 1 : -1;
      state.target = adjacent(state.direction);
      if (state.target === null) { drag = null; return; }
      shell.setPointerCapture(event.pointerId);
      shell.classList.add('is-grabbing');
      buildPreview(state);
      if (!reduced.matches) sounds.begin();
    }
    const now = performance.now();
    const delta = -(event.clientX - state.lastX) * state.direction;
    const raw = delta / Math.max(6, now - state.time);
    state.velocity = .48 * state.velocity + .52 * raw;
    state.lastX = event.clientX;
    state.time = now;
    state.progress = Math.max(0, Math.min(1, -dx * state.direction / state.width));
    state.peak = Math.max(state.peak, state.progress);
    state.lift = dy;
    paint(state.progress / 2, dy);
    if (!reduced.matches && Math.abs(delta) > 1) sounds.movement(Math.abs(raw), state.progress);
    if (event.cancelable) event.preventDefault();
  }, { passive: false });
  window.addEventListener('pointerup', event => finish(event, false));
  window.addEventListener('pointercancel', event => finish(event, true));
  shell.addEventListener('lostpointercapture', event => {
    if (event.target === shell) finish(event, true);
  });
  shell.addEventListener('click', event => {
    if (performance.now() >= suppressClickUntil) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  shell.addEventListener('dragstart', event => event.preventDefault());
  window.addEventListener('blur', cancel);
  return { cancel, turn };
};
