const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

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
  rowAlt: '#F9FCF9', white: '#FFFFFF', ruleThin: '#DDDDDD'
};

function getFontPath(name) {
  return path.join(__dirname, name);
}

function cleanInline(text) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

function buildPDF(markdown) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true, autoFirstPage: true });

    // Register Inter fonts
    doc.registerFont('Inter', getFontPath('inter-regular.woff'));
    doc.registerFont('Inter-Bold', getFontPath('inter-bold.woff'));

    const buffers = [];
    doc.on('data', d => buffers.push(d));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const L = 56; // left margin
    const R = 56; // right margin
    const pageW = doc.page.width - L - R;
    const pageBottom = doc.page.height - 44;

    // ── Draw header bar ────────────────────────────────────────────
    function drawHeader() {
      doc.rect(0, 0, doc.page.width, 44).fill(C.green);
      doc.font('Inter-Bold').fontSize(11).fillColor('#FFFFFF')
         .text('ARCSPECT', L, 16);
      doc.font('Inter').fontSize(9).fillColor('rgba(255,255,255,0.65)')
         .text('AI Product Documentation', L + 82, 18);
    }

    // ── Draw footer bar ────────────────────────────────────────────
    function drawFooter(pageNum, total) {
      const fy = doc.page.height - 28;
      doc.moveTo(L, fy).lineTo(L + pageW, fy)
         .strokeColor(C.border).lineWidth(0.5).stroke();
      doc.font('Inter').fontSize(8).fillColor(C.muted)
         .text('arcspect.netlify.app', L, fy + 8, { continued: true, width: pageW })
         .text(`Page ${pageNum} of ${total}`, { align: 'right' });
    }

    drawHeader();
    doc.y = 64;

    const lines = markdown.split('\n');
    let i = 0;

    function newPage() {
      doc.addPage();
      drawHeader();
      doc.y = 60;
    }

    function ensureSpace(needed) {
      if (doc.y + needed > pageBottom) newPage();
    }

    function hRule(color, weight, yOffset) {
      const y = doc.y + (yOffset || 0);
      doc.moveTo(L, y).lineTo(L + pageW, y)
         .strokeColor(color || C.border).lineWidth(weight || 0.5).stroke();
      doc.y = y + 6;
    }

    while (i < lines.length) {
      const line = lines[i];

      // H1 — document title
      if (line.startsWith('# ')) {
        ensureSpace(72);
        doc.y += 8;
        doc.font('Inter-Bold').fontSize(22).fillColor(C.text)
           .text(line.slice(2).trim(), L, doc.y, { width: pageW });
        doc.y += 4;
        hRule(C.green, 2);
        doc.y += 6;
        i++; continue;
      }

      // H2 — section label
      if (line.startsWith('## ') && !line.startsWith('### ')) {
        ensureSpace(52);
        doc.y += 18;
        doc.font('Inter-Bold').fontSize(8).fillColor(C.green)
           .text(line.slice(3).trim().toUpperCase(), L, doc.y, { width: pageW, characterSpacing: 1.6 });
        doc.y += 5;
        hRule(C.ruleThin, 0.5);
        doc.y += 2;
        i++; continue;
      }

      // H3 — subsection
      if (line.startsWith('### ')) {
        ensureSpace(32);
        doc.y += 8;
        doc.font('Inter-Bold').fontSize(12).fillColor(C.text)
           .text(line.slice(4).trim(), L, doc.y, { width: pageW });
        doc.y += 4;
        i++; continue;
      }

      // HR
      if (/^---+$/.test(line.trim())) {
        doc.y += 10; hRule(C.border, 0.5); doc.y += 10;
        i++; continue;
      }

      // Table
      if (line.trim().startsWith('|')) {
        const tableLines = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          if (!/^[\|\s\-:]+$/.test(lines[i])) tableLines.push(lines[i]);
          i++;
        }
        if (!tableLines.length) continue;

        const parseRow = r => r.split('|').map(c => c.trim()).filter(Boolean);
        const headers = parseRow(tableLines[0]);
        const colW = Math.floor(pageW / headers.length);
        const headerRowH = 24;
        const dataRowH = 20;

        ensureSpace(headerRowH + Math.min(tableLines.length - 1, 4) * dataRowH + 16);
        doc.y += 8;

        // Header row
        const startY = doc.y;
        headers.forEach((h, ci) => {
          const x = L + ci * colW;
          doc.rect(x, startY, colW, headerRowH).fill(C.headerBg);
          doc.rect(x, startY, colW, headerRowH).strokeColor(C.border).lineWidth(0.5).stroke();
          doc.font('Inter-Bold').fontSize(8).fillColor(C.green)
             .text(h.toUpperCase(), x + 8, startY + 8, { width: colW - 16, ellipsis: true });
        });
        doc.y = startY + headerRowH;

        // Data rows
        for (let r = 1; r < tableLines.length; r++) {
          const cells = parseRow(tableLines[r]);
          if (doc.y + dataRowH > pageBottom) newPage();
          const ry = doc.y;
          headers.forEach((_, ci) => {
            const x = L + ci * colW;
            doc.rect(x, ry, colW, dataRowH).fill(r % 2 === 0 ? C.rowAlt : C.white);
            doc.rect(x, ry, colW, dataRowH).strokeColor(C.border).lineWidth(0.5).stroke();
            doc.font('Inter').fontSize(9).fillColor(C.text2)
               .text(cleanInline(cells[ci] || ''), x + 8, ry + 6, { width: colW - 16, ellipsis: true });
          });
          doc.y = ry + dataRowH;
        }
        doc.y += 14;
        continue;
      }

      // Checkbox
      if (/^- \[[ x]\] /.test(line)) {
        ensureSpace(22);
        const checked = line[3] === 'x';
        const text = cleanInline(line.slice(6).trim());
        doc.font('Inter-Bold').fontSize(11).fillColor(C.green)
           .text(checked ? '☑' : '☐', L, doc.y, { width: 18, continued: true });
        doc.font('Inter').fillColor(C.text2)
           .text('  ' + text, { width: pageW - 18 });
        doc.y += 2;
        i++; continue;
      }

      // Bullet
      if (/^- /.test(line)) {
        ensureSpace(22);
        const text = cleanInline(line.slice(2).trim());
        doc.font('Inter-Bold').fontSize(13).fillColor(C.green)
           .text('•', L, doc.y - 1, { width: 16, continued: true });
        doc.font('Inter').fontSize(11).fillColor(C.text2)
           .text(' ' + text, { width: pageW - 16 });
        doc.y += 2;
        i++; continue;
      }

      // Numbered list
      if (/^\d+\. /.test(line)) {
        ensureSpace(22);
        const num = line.match(/^(\d+)\./)[1];
        const text = cleanInline(line.replace(/^\d+\. /, '').trim());
        // Render number and text as separate positioned elements to avoid wrapping issues
        const numW = 20;
        doc.font('Inter-Bold').fontSize(11).fillColor(C.muted)
           .text(num + '.', L, doc.y, { width: numW });
        const textY = doc.y;
        doc.font('Inter').fontSize(11).fillColor(C.text2)
           .text(text, L + numW + 4, textY, { width: pageW - numW - 4 });
        doc.y = Math.max(doc.y, textY) + 4;
        i++; continue;
      }

      // Empty line
      if (!line.trim()) { doc.y += 6; i++; continue; }

      // Paragraph — detect bold:value pattern
      ensureSpace(22);
      const boldMatch = line.trim().match(/^\*\*([^*]+)\*\*[:\s]\s*(.*)/);
      if (boldMatch) {
        const label = boldMatch[1];
        const rest = cleanInline(boldMatch[2]);
        doc.font('Inter-Bold').fontSize(11).fillColor(C.text)
           .text(label + ': ', L, doc.y, { continued: true, width: pageW });
        doc.font('Inter').fillColor(C.text2).text(rest);
      } else {
        doc.font('Inter').fontSize(11).fillColor(C.text2)
           .text(cleanInline(line.trim()), L, doc.y, { width: pageW });
      }
      doc.y += 4;
      i++;
    }

    // ── Add footers to all pages ───────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let p = 0; p < range.count; p++) {
      doc.switchToPage(range.start + p);
      drawFooter(p + 1, range.count);
    }

    doc.end();
  });
}