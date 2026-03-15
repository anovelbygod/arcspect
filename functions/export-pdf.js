const PDFDocument = require('pdfkit');
const fonts = require('./fonts.js');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  try {
    const { markdown, filename } = JSON.parse(event.body);
    if (!markdown) return { statusCode: 400, body: JSON.stringify({ error: 'No markdown provided' }) };
    const buffer = await buildPDF(markdown);
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: buffer.toString('base64'), filename: filename || 'Arcspect-Export.pdf' })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

const C = {
  green: '#4A7C59', text: '#1A1A1A', text2: '#444444',
  muted: '#999999', border: '#E0E0E0', headerBg: '#F0F7F2',
  codeBackground: '#F5F5F5', rowAlt: '#F9FCF9', white: '#FFFFFF'
};

function clean(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .trim();
}

function buildPDF(markdown) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true, autoFirstPage: true });
    doc.registerFont('Inter', fonts.regular);
    doc.registerFont('Inter-Bold', fonts.bold);

    const bufs = [];
    doc.on('data', d => bufs.push(d));
    doc.on('end', () => resolve(Buffer.concat(bufs)));
    doc.on('error', reject);

    const L = 56, W = doc.page.width - 112, BOTTOM = doc.page.height - 48;

    function header() {
      doc.rect(0, 0, doc.page.width, 44).fill(C.green);
      doc.font('Inter-Bold').fontSize(11).fillColor('#FFF').text('ARCSPECT', L, 16);
      doc.font('Inter').fontSize(9).fillColor('rgba(255,255,255,0.65)').text('AI Product Documentation', L + 82, 18);
    }

    function footer(n, total) {
      const fy = doc.page.height - 28;
      doc.moveTo(L, fy).lineTo(L + W, fy).strokeColor(C.border).lineWidth(0.5).stroke();
      doc.font('Inter').fontSize(8).fillColor(C.muted)
         .text('arcspect.netlify.app', L, fy + 8, { continued: true, width: W })
         .text(`Page ${n} of ${total}`, { align: 'right' });
    }

    header();
    doc.y = 64;

    function newPage() { doc.addPage(); header(); doc.y = 60; }
    function space(n) { if (doc.y + n > BOTTOM) newPage(); }
    function rule(color, w) {
      doc.moveTo(L, doc.y).lineTo(L + W, doc.y).strokeColor(color || C.border).lineWidth(w || 0.5).stroke();
      doc.y += 6;
    }

    // ── Pre-process markdown into typed blocks ───────────────────
    const lines = markdown.split('\n');
    const blocks = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Fenced code block
      if (line.trim().startsWith('```')) {
        const codeLines = [];
        i++; // skip opening fence
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        i++; // skip closing fence
        blocks.push({ type: 'code', content: codeLines.join('\n') });
        continue;
      }

      // Bullet list
      if (/^- /.test(line)) {
        const items = [];
        while (i < lines.length && /^- /.test(lines[i])) {
          items.push(clean(lines[i].replace(/^- (\[[ x]\] )?/, '')));
          i++;
        }
        blocks.push({ type: 'bullets', items });
        continue;
      }

      // Numbered list
      if (/^\d+\. /.test(line)) {
        const items = [];
        let num = 1;
        while (i < lines.length && /^\d+\. /.test(lines[i])) {
          items.push({ num: num++, text: clean(lines[i].replace(/^\d+\. /, '')) });
          i++;
        }
        blocks.push({ type: 'numbers', items });
        continue;
      }

      // Table
      if (line.trim().startsWith('|')) {
        const rows = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          if (!/^[\|\s\-:]+$/.test(lines[i])) {
            rows.push(lines[i].split('|').map(c => c.trim()).filter(Boolean));
          }
          i++;
        }
        if (rows.length) blocks.push({ type: 'table', rows });
        continue;
      }

      blocks.push({ type: 'line', content: line });
      i++;
    }

    // ── Render blocks ─────────────────────────────────────────────
    for (const block of blocks) {

      // Bullet list — use pdfkit native list
      if (block.type === 'bullets') {
        space(24 * Math.min(block.items.length, 3));
        doc.y += 2;
        doc.font('Inter').fontSize(11).fillColor(C.text2)
           .list(block.items, L, doc.y, {
             bulletRadius: 2.5,
             bulletIndent: 8,
             textIndent: 16,
             width: W,
             bulletColor: C.green,
             lineGap: 4
           });
        doc.y += 10;
        continue;
      }

      // Numbered list — manual rendering to avoid counter reset bug
      if (block.type === 'numbers') {
        space(24 * Math.min(block.items.length, 3));
        doc.y += 2;
        for (const item of block.items) {
          space(22);
          const numStr = item.num + '.';
          const numW = 22;
          const startY = doc.y;
          // Render number
          doc.font('Inter-Bold').fontSize(11).fillColor(C.muted)
             .text(numStr, L, startY, { width: numW, lineBreak: false });
          // Render text at offset — track y from this call
          const beforeY = doc.y;
          doc.font('Inter').fontSize(11).fillColor(C.text2)
             .text(item.text, L + numW + 4, startY, { width: W - numW - 4 });
          doc.y += 4;
        }
        doc.y += 6;
        continue;
      }

      // Code block
      if (block.type === 'code') {
        if (!block.content.trim()) { continue; }
        const codeLines = block.content.split('\n');
        const lineH = 14;
        const padding = 10;
        const blockH = codeLines.length * lineH + padding * 2;
        space(blockH + 16);
        doc.y += 8;
        // Background
        doc.rect(L, doc.y, W, blockH).fill(C.codeBackground);
        doc.rect(L, doc.y, W, blockH).strokeColor('#DDDDDD').lineWidth(0.5).stroke();
        const codeY = doc.y + padding;
        codeLines.forEach((cl, ci) => {
          doc.font('Inter').fontSize(9).fillColor('#333')
             .text(cl, L + padding, codeY + ci * lineH, { width: W - padding * 2, lineBreak: false });
        });
        doc.y += blockH + 10;
        continue;
      }

      // Table
      if (block.type === 'table') {
        const { rows } = block;
        const colCount = rows[0].length;
        const colW = Math.floor(W / colCount);
        const hRowH = 24;

        // Calculate dynamic row heights based on content length
        const getRowH = (row) => {
          const maxChars = Math.max(...row.map(c => (c || '').length));
          const estLines = Math.ceil(maxChars / (colW / 6));
          return Math.max(20, Math.min(estLines * 14, 40));
        };

        space(hRowH + 20);
        doc.y += 8;
        const sy = doc.y;

        // Header row
        rows[0].forEach((h, ci) => {
          const x = L + ci * colW;
          doc.rect(x, sy, colW, hRowH).fill(C.headerBg);
          doc.rect(x, sy, colW, hRowH).strokeColor(C.border).lineWidth(0.5).stroke();
          doc.font('Inter-Bold').fontSize(8).fillColor(C.green)
             .text(h.toUpperCase(), x + 8, sy + 8, { width: colW - 16, lineBreak: false });
        });
        doc.y = sy + hRowH;

        // Data rows with dynamic height
        for (let r = 1; r < rows.length; r++) {
          const rowH = getRowH(rows[r]);
          if (doc.y + rowH > BOTTOM) newPage();
          const ry = doc.y;
          rows[r].forEach((cell, ci) => {
            const x = L + ci * colW;
            doc.rect(x, ry, colW, rowH).fill(r % 2 === 0 ? C.rowAlt : C.white);
            doc.rect(x, ry, colW, rowH).strokeColor(C.border).lineWidth(0.5).stroke();
            doc.font('Inter').fontSize(9).fillColor(C.text2)
               .text(clean(cell || ''), x + 8, ry + 6, { width: colW - 16, height: rowH - 12 });
          });
          doc.y = ry + rowH;
        }
        doc.y += 14;
        continue;
      }

      // ── Single line blocks ───────────────────────────────────────
      const line = block.content;

      if (line.startsWith('# ')) {
        space(72); doc.y += 8;
        doc.font('Inter-Bold').fontSize(22).fillColor(C.text).text(line.slice(2).trim(), L, doc.y, { width: W });
        doc.y += 4; rule(C.green, 2); doc.y += 6;
        continue;
      }

      if (line.startsWith('## ') && !line.startsWith('### ')) {
        space(52); doc.y += 18;
        doc.font('Inter-Bold').fontSize(8).fillColor(C.green)
           .text(line.slice(3).trim().toUpperCase(), L, doc.y, { width: W, characterSpacing: 1.6 });
        doc.y += 5; rule('#DDDDDD', 0.5); doc.y += 2;
        continue;
      }

      if (line.startsWith('### ') || line.startsWith('#### ')) {
        space(32); doc.y += 8;
        const txt = line.replace(/^#{3,5} /, '').trim();
        doc.font('Inter-Bold').fontSize(12).fillColor(C.text).text(txt, L, doc.y, { width: W });
        doc.y += 6;
        continue;
      }

      if (/^---+$/.test(line.trim())) {
        doc.y += 10; rule(C.border, 0.5); doc.y += 10;
        continue;
      }

      if (!line.trim()) { doc.y += 6; continue; }

      // Paragraph — handle bold label pattern
      space(22);
      const boldMatch = line.trim().match(/^\*\*([^*]+)\*\*[:\s]\s*(.*)/);
      if (boldMatch) {
        const label = boldMatch[1] + ': ';
        const rest = clean(boldMatch[2]);

        if (!rest) {
          // Standalone bold label — render as normal paragraph, doc.y advances correctly
          doc.font('Inter-Bold').fontSize(11).fillColor(C.text)
             .text(label, L, doc.y, { width: W });
          doc.y += 4;
        } else {
          // Label + rest text — cap labelW to avoid pushing text off page
          const rawLabelW = doc.font('Inter-Bold').fontSize(11).widthOfString(label);
          const labelW = Math.min(rawLabelW, 140);

          if (rawLabelW > 140) {
            // Long label — put on own line, rest on next line
            doc.font('Inter-Bold').fontSize(11).fillColor(C.text)
               .text(label, L, doc.y, { width: W });
            doc.y += 2;
            doc.font('Inter').fontSize(11).fillColor(C.text2)
               .text(rest, L, doc.y, { width: W });
          } else {
            // Short label — inline with rest
            const startY = doc.y;
            doc.font('Inter-Bold').fontSize(11).fillColor(C.text)
               .text(label, L, startY, { lineBreak: false });
            doc.font('Inter').fontSize(11).fillColor(C.text2)
               .text(rest, L + labelW, startY, { width: W - labelW });
          }
          doc.y += 6;
        }
      } else {
        doc.font('Inter').fontSize(11).fillColor(C.text2)
           .text(clean(line.trim()), L, doc.y, { width: W });
        doc.y += 4;
      }
    }

    // Footers on all pages
    const range = doc.bufferedPageRange();
    for (let p = 0; p < range.count; p++) {
      doc.switchToPage(range.start + p);
      footer(p + 1, range.count);
    }

    doc.end();
  });
}