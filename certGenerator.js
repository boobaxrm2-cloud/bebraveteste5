'use strict';
/**
 * BeBrave — Certificate Generator (Node.js / PDFKit)
 * No Python dependency — works on any Node environment including Railway.
 */

const PDFDocument = require('pdfkit');

/**
 * generateCertificate(data) → Promise<Buffer>
 * data: { student_name, teacher_name, module, level, hours, period,
 *         location, issued_date, cert_id,
 *         teacher_signature, student_signature }
 * Signatures are base64 PNG data URLs (may be empty string).
 */
function generateCertificate(data) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    // A4 landscape: 841.89 x 595.28 pt
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 0,
      info: {
        Title: `Certificado — ${data.student_name || ''}`,
        Author: 'BeBrave English Platform',
      },
    });

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end',  ()    => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width;   // 841.89
    const H = doc.page.height;  // 595.28

    const mm = pt => pt * 2.8346;

    // ── Colours ────────────────────────────────────────────────
    const NAVY    = '#0f1b35';
    const NAVY2   = '#1a2d52';
    const BLUE    = '#3b6ef5';
    const GOLD    = '#c9a84c';
    const GOLD_LT = '#e8d5a3';
    const WHITE   = '#ffffff';
    const GRAY    = '#64748b';
    const GRAY_L  = '#e8eeff';

    // ── Background white ──────────────────────────────────────
    doc.rect(0, 0, W, H).fill(WHITE);

    // ── Navy left bar ─────────────────────────────────────────
    doc.rect(0, 0, 108, H).fill(NAVY);

    // ── Gold top stripe ───────────────────────────────────────
    doc.rect(0, 0, W, 17).fill(GOLD);

    // ── Gold bottom stripe ────────────────────────────────────
    doc.rect(0, H - 17, W, 17).fill(GOLD);

    // ── Decorative circle (light blue, top-right) ─────────────
    doc.circle(W - 80, 80, 155).fill(GRAY_L);
    doc.circle(W - 50, 30,  110).fill('#eef2ff');

    // ── Double border ─────────────────────────────────────────
    doc.rect(125, 34, W - 145, H - 68)
       .lineWidth(1.8).strokeColor(GOLD).stroke();
    doc.rect(130, 39, W - 155, H - 78)
       .lineWidth(0.5).strokeColor(GOLD).stroke();

    // ── Brand on left bar (rotated) ───────────────────────────
    doc.save();
    doc.translate(54, H / 2);
    doc.rotate(-90);
    doc.fontSize(14).fillColor(WHITE).font('Helvetica-Bold')
       .text('BeBrave', -40, -10, { width: 80, align: 'center' });
    doc.fontSize(8).fillColor(GOLD_LT).font('Helvetica')
       .text('English Learning Platform', -60, 8, { width: 120, align: 'center' });
    doc.restore();

    // ── Content centre X ──────────────────────────────────────
    const cx = (W + 108) / 2;  // centre of content area

    // ── Header label ──────────────────────────────────────────
    doc.fontSize(9).fillColor(NAVY).font('Helvetica-Bold')
       .text('CERTIFICADO DE CONCLUSÃO', 130, 58, { width: W - 165, align: 'center' });

    // ── Decorative line with dots ─────────────────────────────
    const lineY = 76;
    doc.moveTo(148, lineY).lineTo(W - 28, lineY)
       .lineWidth(1).strokeColor(GOLD).stroke();
    // dots
    for (const dx of [-80, 0, 80]) {
      doc.circle(cx + dx, lineY, 3).fill(GOLD);
    }

    // ── Module title ──────────────────────────────────────────
    const module = data.module || 'Módulo de Inglês';
    doc.fontSize(30).fillColor(NAVY).font('Helvetica-Bold')
       .text(module, 130, 90, { width: W - 165, align: 'center' });

    // ── "Certificamos que" ────────────────────────────────────
    doc.fontSize(10).fillColor(GRAY).font('Helvetica')
       .text('Certificamos que', 130, 140, { width: W - 165, align: 'center' });

    // ── Student name ──────────────────────────────────────────
    const studentName = data.student_name || '';
    doc.fontSize(26).fillColor(NAVY).font('Helvetica-Bold')
       .text(studentName, 130, 160, { width: W - 165, align: 'center' });

    // underline
    const nameW = doc.widthOfString(studentName, { fontSize: 26 }) + 20;
    const nameX = cx - nameW / 2;
    doc.moveTo(nameX, 193).lineTo(nameX + nameW, 193)
       .lineWidth(1).strokeColor(GOLD).stroke();

    // ── Body text ─────────────────────────────────────────────
    const teacher  = data.teacher_name || '';
    const level    = data.level    || '';
    const hours    = data.hours    || '';
    const period   = data.period   || '';
    const location = data.location || 'Brasil';
    const issued   = data.issued_date || new Date().toLocaleDateString('pt-BR');

    const lines = [
      `concluiu com êxito o módulo ${module},`,
      `atingindo o nível ${level} de proficiência em língua inglesa`,
      `com carga horária de ${hours} horas, no período de ${period}.`,
      `Sob orientação do(a) professor(a): ${teacher}`,
    ];

    doc.fontSize(10).fillColor(GRAY).font('Helvetica');
    lines.forEach((line, i) => {
      doc.text(line, 130, 205 + i * 19, { width: W - 165, align: 'center' });
    });

    // ── Signatures ────────────────────────────────────────────
    const sigLineY   = H - 85;
    const sigLabelY  = sigLineY + 8;
    const sigRoleY   = sigLabelY + 14;

    const sigTeacherX = cx - 170;
    const sigStudentX = cx + 170;

    const drawSigBlock = (centerX, label, role, sigB64) => {
      const lx1 = centerX - 128;
      const lx2 = centerX + 128;

      // Draw signature image if present
      if (sigB64 && sigB64.length > 100 && sigB64.includes('base64,')) {
        try {
          const b64data = sigB64.split('base64,')[1];
          const imgBuf = Buffer.from(b64data, 'base64');
          // Validate PNG header (first 8 bytes)
          const isPNG = imgBuf[0]===0x89 && imgBuf[1]===0x50 && imgBuf[2]===0x4E && imgBuf[3]===0x47;
          if (isPNG && imgBuf.length > 200) {
            doc.image(imgBuf, centerX - 100, sigLineY - 52, {
              width: 200, height: 50,
              fit: [200, 50],
            });
          }
        } catch (e) { /* skip bad image - cert still generated */ }
      }

      // Signature line
      doc.moveTo(lx1, sigLineY).lineTo(lx2, sigLineY)
         .lineWidth(0.8).strokeColor(NAVY2).stroke();

      // Label
      doc.fontSize(9).fillColor(NAVY).font('Helvetica-Bold')
         .text(label, centerX - 140, sigLabelY, { width: 280, align: 'center' });

      doc.fontSize(8).fillColor(GRAY).font('Helvetica')
         .text(role, centerX - 140, sigRoleY, { width: 280, align: 'center' });
    };

    drawSigBlock(sigTeacherX, `Prof(a). ${teacher}`, 'Professor(a)',
                 data.teacher_signature || '');
    drawSigBlock(sigStudentX, studentName, 'Aluno(a)',
                 data.student_signature || '');

    // ── Date & location ───────────────────────────────────────
    doc.fontSize(8).fillColor(GRAY).font('Helvetica')
       .text(`${location}, ${issued}`, 130, H - 52, { width: W - 165, align: 'center' });

    // ── Cert ID ───────────────────────────────────────────────
    const certId = data.cert_id || '';
    if (certId) {
      doc.fontSize(6).fillColor('#94a3b8').font('Helvetica')
         .text(`ID: ${certId}`, W - 200, H - 28, { width: 175, align: 'right' });
    }

    doc.end();
  });
}

module.exports = { generateCertificate };
