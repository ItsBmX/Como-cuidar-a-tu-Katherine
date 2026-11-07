'use strict';

window.renderCertificateJpeg = async function renderCertificateJpeg(source, fields) {
  const width = 816, height = 1056, scale = 2.5;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.fillStyle = '#f3e0b5';
  ctx.fillRect(0, 0, width, height);

  async function loadImage(src) {
    const image = new Image();
    image.src = src;
    try { await image.decode(); return image; } catch { return null; }
  }

  const [stamp, signature] = await Promise.all([
    loadImage(source.querySelector('.stamp').src),
    fields.signature ? loadImage(fields.signature) : null,
    Promise.allSettled([document.fonts.load('700 48px Playfair'), document.fonts.load('18px Prime'), document.fonts.load('italic 22px Playfair')]),
  ]);
  const ink = '#32241b', rust = '#8b2a14', forest = '#293e26';
  for (const [inset, weight, color] of [[24, 2, '#996d44'], [31, 1, '#b58a5b'], [42, 1, '#c09a68']]) {
    ctx.strokeStyle = color;
    ctx.lineWidth = weight;
    ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2);
  }

  const text = selector => source.querySelector(selector).textContent.trim();
  const center = width / 2;
  function drawLines(value, y, font, color = ink, max = 616, lead = 30, x = center) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    let line = '';
    for (const word of value.split(/\s+/)) {
      const next = line ? line + ' ' + word : word;
      if (line && ctx.measureText(next).width > max) {
        ctx.fillText(line, x, y, max);
        y += lead;
        line = word;
      } else line = next;
    }
    if (line) ctx.fillText(line, x, y, max);
    return y + lead;
  }
  function rule(y, a, b) {
    ctx.strokeStyle = '#a87b51';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a, y);
    ctx.lineTo(b, y);
    ctx.stroke();
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = rust;
  ctx.font = '700 41px Playfair, Georgia, serif';
  ctx.fillText(text('h2'), center, 171, 654);
  drawLines(text('.department'), 215, 'italic 20px Playfair, Georgia, serif', forest);
  rule(245, 168, 648);
  const paragraphs = [...source.querySelector('.content').children].filter(node => node.tagName === 'P');
  const prose = '19px Prime, "Courier New", monospace';
  drawLines(paragraphs[1].textContent.trim(), 307, prose);
  ctx.textAlign = 'center';
  ctx.fillStyle = rust;
  let nameSize = 39;
  do { ctx.font = '700 ' + nameSize + 'px Playfair, Georgia, serif'; }
  while (ctx.measureText(fields.name).width > 620 && --nameSize >= 20);
  if (fields.name) ctx.fillText(fields.name, center, 369, 620);
  rule(426, 114, 702);
  let y = drawLines(paragraphs[3].textContent.trim(), 467, prose, ink, 600, 28);
  y = drawLines(paragraphs[4].textContent.trim(), y + 20, prose, ink, 600, 28);
  y = drawLines(text('.certificate-title'), y + 25, '700 31px Playfair, Georgia, serif', forest, 640, 38);
  drawLines(paragraphs[6].textContent.trim(), y + 18, prose, ink, 600, 28);

  const signatureY = 805;
  rule(signatureY, 110, 365);
  rule(signatureY, 450, 705);
  if (signature) {
    const ratio = Math.min(225 / signature.naturalWidth, 67 / signature.naturalHeight);
    const w = signature.naturalWidth * ratio, h = signature.naturalHeight * ratio;
    ctx.drawImage(signature, 237.5 - w / 2, signatureY - h - 4, w, h);
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = ink;
  ctx.font = '18px Prime, "Courier New", monospace';
  ctx.fillText(fields.date, 577.5, signatureY - 15, 255);
  drawLines('Firma del explorador', 832, '17px Prime, "Courier New", monospace', ink, 255, 24, 237.5);
  drawLines('Fecha de emisión', 832, '17px Prime, "Courier New", monospace', ink, 255, 24, 577.5);
  if (stamp) {
    const h = 80 * stamp.naturalHeight / stamp.naturalWidth;
    ctx.globalAlpha = .85;
    ctx.drawImage(stamp, center - 40, 856, 80, h);
    ctx.globalAlpha = 1;
  }
  drawLines(text('.valid'), 977, 'italic 17px Playfair, Georgia, serif', forest, 490, 23);
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob?.type === 'image/jpeg' ? resolve(blob) : reject(new Error('JPEG encoding failed')), 'image/jpeg', .94);
  });
};
