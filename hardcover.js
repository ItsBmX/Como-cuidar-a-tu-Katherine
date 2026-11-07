(() => {
  'use strict';
  const cover = document.getElementById('coverDialog');
  const stage = document.getElementById('hardcoverStage');
  const model = document.getElementById('hardcoverModel');
  const panel = cover.querySelector('.hardcover-front');
  const open = document.getElementById('openHardcover');
  const close = document.getElementById('closeHardcover');
  const side = document.getElementById('hardcoverSide');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const paper = document.createElement('div');
  paper.className = 'hardcover-face hardcover-paper';
  const preview = document.getElementById('advertencia').cloneNode(true);
  preview.removeAttribute('id');
  paper.append(preview);
  model.prepend(paper);
  new ResizeObserver(([entry]) => {
    paper.style.setProperty('--paper-scale', entry.contentRect.width / 816);
  }).observe(paper);
  let yaw = 18, pitch = -7, drag, opening = false, reopened = false;
  const normalize = value => ((value + 180) % 360 + 360) % 360 - 180;
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

  function render(announce = false) {
    model.style.setProperty('--yaw', yaw + 'deg');
    model.style.setProperty('--pitch', pitch + 'deg');
    if (announce) {
      const n = normalize(yaw);
      side.textContent = Math.abs(n) > 135 ? 'Contraportada' : n > 45 ? 'Lomo' : n < -45 ? 'Canto de las páginas' : 'Portada';
    }
  }
  function stopDrag() {
    const pointer = drag?.pointer;
    drag = null;
    delete stage.dataset.dragging;
    if (pointer !== undefined && stage.hasPointerCapture(pointer)) stage.releasePointerCapture(pointer);
  }
  stage.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || opening || drag) return;
    drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, yaw, pitch };
    stage.dataset.dragging = 'true';
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointer) return;
    yaw = drag.yaw + (event.clientX - drag.x) * .73;
    pitch = Math.max(-30, Math.min(27, drag.pitch - (event.clientY - drag.y) * .36));
    render();
  });
  function finishDrag(event) {
    if (event.pointerId !== drag?.pointer) return;
    stopDrag();
    render(true);
  }
  for (const type of ['pointerup', 'pointercancel']) stage.addEventListener(type, finishDrag);
  stage.addEventListener('lostpointercapture', event => {
    if (event.target === stage) finishDrag(event);
  });
  stage.addEventListener('keydown', event => {
    if (opening) return;
    const steps = { ArrowLeft: -90, ArrowRight: 90 };
    if (event.key in steps) yaw = Math.round(yaw / 90) * 90 + steps[event.key];
    else if (event.key === 'Home') yaw -= normalize(yaw);
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void enter(); return; }
    else return;
    event.preventDefault();
    pitch = -7;
    render(true);
  });

  async function enter() {
    if (opening || !cover.open) return;
    opening = true;
    stopDrag();
    open.disabled = true;
    cover.dataset.phase = 'aligning';
    yaw -= normalize(yaw);
    pitch = 0;
    render(true);
    document.dispatchEvent(new CustomEvent('katherine:open-cover', { detail: { reset: reopened } }));
    if (!reduced.matches) {
      await pause(270);
      if (!reduced.matches) {
        cover.dataset.phase = 'hinge';
        await Promise.race([
          new Promise(resolve => panel.addEventListener('animationend', resolve, { once: true })),
          pause(575),
        ]);
      }
    }
    cover.close();
    delete cover.dataset.phase;
    open.disabled = false;
    opening = false;
    document.querySelector('.reader-main').focus({ preventScroll: true });
  }

  function showBack() {
    stopDrag();
    reopened = true;
    yaw = 180;
    pitch = -6;
    render(true);
    if (!reduced.matches) {
      cover.dataset.phase = 'revealing';
      setTimeout(() => {
        if (cover.dataset.phase === 'revealing') delete cover.dataset.phase;
      }, 235);
    }
    cover.showModal();
    open.focus({ preventScroll: true });
  }
  open.addEventListener('click', enter);
  close.addEventListener('click', showBack);
  cover.addEventListener('cancel', event => { event.preventDefault(); void enter(); });
  render(true);
  cover.showModal();
})();
