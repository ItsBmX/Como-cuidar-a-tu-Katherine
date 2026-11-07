'use strict';
const $ = (id) => document.getElementById(id);
const shell = $('bookShell');
const main = shell.closest('main');
const fallback = $('book');
const pages = [...fallback.children];
const small = matchMedia('(max-width: 760px), (max-width: 1024px) and (pointer: coarse), (max-height: 500px)');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
// Remove only keys written by older versions of this book.
for (const key of ['name', 'date', 'caption', 'signature', 'photo', 'sound']) {
  try { localStorage.removeItem('katherine.' + key); } catch { /* Storage can be blocked. */ }
}
let active = 0, single;
const final = pages.length - 1;
const cert = pages.findIndex(page => page.firstElementChild.id === 'certificado');
const positionFor = i => Math.floor((i + 1) / 2) - 1;
const firstFor = position => Math.max(0, 2 * position + 1);
const spreadFor = i => {
  const first = firstFor(positionFor(i));
  return first === 0 || first === final ? [first] : [first, first + 1];
};

function fit() {
  if (single) return;
  const { width, height } = main.getBoundingClientRect();
  const px = Math.max(1, Math.floor(Math.min((width - 48) / 2, (height - 30) * 816 / 1056, 816)));
  shell.style.setProperty('--page-w', px + 'px');
  shell.style.setProperty('--page-h', (px * 1056 / 816) + 'px');
  shell.style.setProperty('--page-scale', px / 816);
}

function visiblePages(index) {
  return (single ? [index] : spreadFor(index)).map(i => pages[i]);
}
function render() {
  const indices = single ? [active] : spreadFor(active);
  pages.forEach((page, i) => { page.hidden = !indices.includes(i); });
  const [first, last] = indices.map(i => i + 1);
  $('pageIndicator').textContent = last ? 'Páginas ' + first + '–' + last + ' de ' + pages.length : 'Página ' + first + ' de ' + pages.length;
  $('fullscreenBtn').hidden = single || !document.fullscreenEnabled;
  $('closeHardcover').hidden = indices.at(-1) !== final;
}
function go(index) {
  active = Math.max(0, Math.min(index, final));
  if (single) main.scrollTop = 0;
  render();
}
function adjacent(direction) {
  const index = single ? active + direction : firstFor(positionFor(active) + direction);
  return index < 0 || index > final || index === active ||
    (!single && positionFor(index) === positionFor(active)) ? null : index;
}
const gestures = window.installPageGestures({
  shell, deck: fallback, main, reduced,
  adjacent, visiblePages, commit: go,
});
function updateMode() {
  gestures.cancel();
  single = small.matches;
  shell.dataset.mode = single ? 'single' : 'spread';
  fit();
  render();
}
document.addEventListener('keydown', event => {
  if (document.querySelector('dialog[open]') || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.target.closest('input,textarea,select,[contenteditable]')) return;
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
  event.preventDefault();
  if (event.repeat) return;
  const direction = event.key === 'ArrowRight' ? 1 : -1;
  if (!single) {
    gestures.turn(direction);
    return;
  }
  const index = adjacent(direction);
  if (index !== null) { gestures.cancel(); go(index); }
});
new ResizeObserver(fit).observe(main);
small.addEventListener('change', updateMode);
reduced.addEventListener('change', () => gestures.cancel());

$('fullscreenBtn').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { /* Some browser contexts block fullscreen. */ }
};
document.addEventListener('fullscreenchange', () => {
  $('fullscreenBtn').textContent = document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa';
});

const editor = $('editor');
$('customizeBtn').onclick = () => { gestures.cancel(); editor.showModal(); };
document.querySelector('#editor .close').onclick = event => {
  event.preventDefault();
  editor.close();
};
const ids = pages.map(page => page.firstElementChild.id);
document.querySelectorAll('.toc a').forEach(link => {
  link.addEventListener('click', event => {
    const i = ids.indexOf(link.hash.slice(1));
    if (i !== -1) { event.preventDefault(); gestures.cancel(); go(i); }
  });
});
function followHash() {
  const i = ids.indexOf(location.hash.slice(1));
  if (i !== -1) { gestures.cancel(); go(i); }
}
window.addEventListener('hashchange', followHash);

const device = document.querySelector('.device > img');
if (device) {
  const zoom = document.createElement('dialog');
  zoom.id = 'diagramZoomDialog';
  zoom.setAttribute('aria-label', 'Diagrama ampliado');
  const image = new Image();
  image.alt = device.alt;
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.textContent = 'Cerrar diagrama';
  dismiss.onclick = () => zoom.close();
  zoom.append(image, dismiss);
  document.body.append(zoom);

  const expand = document.createElement('button');
  expand.type = 'button';
  expand.className = 'device-zoom';
  expand.textContent = 'Ampliar diagrama';
  expand.setAttribute('aria-haspopup', 'dialog');
  expand.onclick = () => {
    gestures.cancel();
    image.src = device.currentSrc || device.src;
    zoom.showModal();
  };
  device.after(expand);
}

const nameInput = $('nameInput'), dateInput = $('dateInput'), captionInput = $('captionInput');
const signature = $('signatureCanvas'), signatureImage = $('signatureImage');
const ctx = signature.getContext('2d');
ctx.lineWidth = 3;
ctx.strokeStyle = '#483121';
ctx.lineCap = 'round';
ctx.lineJoin = 'round';
let drawing = false;
let signatureData = '';
let photoRequest = 0;
const placeholderCaption = $('memoryCaption').textContent;
const dateFormat = new Intl.DateTimeFormat('es-DO', { day: 'numeric', month: 'long', year: 'numeric' });
const point = event => {
  const box = signature.getBoundingClientRect();
  return [(event.clientX - box.left) * signature.width / box.width, (event.clientY - box.top) * signature.height / box.height];
};
signature.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  drawing = true;
  signature.setPointerCapture(event.pointerId);
  const [x, y] = point(event);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + .1, y);
  ctx.stroke();
});
signature.addEventListener('pointermove', event => {
  if (!drawing || !event.isPrimary) return;
  ctx.lineTo(...point(event));
  ctx.stroke();
});
function finishSignature() {
  if (!drawing) return;
  drawing = false;
  signatureData = signature.toDataURL('image/png');
  signatureImage.src = signatureData;
}
signature.addEventListener('pointerup', finishSignature);
signature.addEventListener('pointercancel', finishSignature);
$('clearSignature').onclick = () => {
  drawing = false;
  ctx.clearRect(0, 0, signature.width, signature.height);
  signatureImage.removeAttribute('src');
  signatureData = '';
};

const formatDate = () => dateInput.value ? dateFormat.format(new Date(dateInput.value + 'T12:00:00')) : '';
const displayName = () => nameInput.value.trim();
nameInput.oninput = () => {
  $('certificateName').textContent = displayName();
};
dateInput.oninput = () => {
  $('certificateDate').textContent = formatDate();
};
captionInput.oninput = () => {
  $('memoryCaption').textContent = captionInput.value || placeholderCaption;
};

const status = $('editorStatus');
$('photoInput').onchange = async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  const request = ++photoRequest;
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (request !== photoRequest) return;
    const scale = Math.min(1, 1100 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', .84);
    $('memoryPhoto').src = data;
    status.textContent = 'Foto añadida a Recuerdos para esta visita.';
  } catch {
    if (request === photoRequest) status.textContent = 'No se pudo abrir la foto. Prueba con un archivo JPG o PNG.';
  } finally {
    URL.revokeObjectURL(url);
  }
};
$('goCertificate').onclick = () => { editor.close(); go(cert); };
$('goPhoto').onclick = () => { editor.close(); go(final); };
$('downloadCertificate').onclick = async event => {
  const button = event.currentTarget;
  button.disabled = true;
  status.textContent = 'Preparando el certificado…';
  try {
    const blob = await window.renderCertificateJpeg(pages[cert].firstElementChild, {
      name: displayName(), date: formatDate(), signature: signatureData,
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'certificado-katherine.jpg';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    status.textContent = 'Certificado JPG preparado.';
  } catch {
    status.textContent = 'No se pudo descargar el certificado. Intenta de nuevo.';
  } finally { button.disabled = false; }
};

nameInput.value = '';
dateInput.value = '';
captionInput.value = '';
$('photoInput').value = '';
nameInput.oninput();
dateInput.oninput();
captionInput.oninput();
document.addEventListener('katherine:open-cover', event => {
  gestures.cancel();
  if (event.detail?.reset || active === 0) go(1);
});
updateMode();
followHash();
