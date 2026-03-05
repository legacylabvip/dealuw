/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * generatePDF.js — Server-side PDF generation for DealUW deal reports.
 * Uses jsPDF + jspdf-autotable for a clean, professional white-background layout.
 */

const { jsPDF } = require('jspdf');
require('jspdf-autotable');

// ─── Constants ──────────────────────────────────────────────────────────────

const COLORS = {
  darkBg: [7, 11, 20],
  cardBg: [12, 18, 32],
  accent: [58, 173, 232],
  gold: [212, 175, 55],
  go: [34, 197, 94],
  pass: [239, 68, 68],
  negotiate: [245, 158, 11],
  white: [255, 255, 255],
  black: [30, 30, 30],
  gray: [120, 130, 145],
  lightGray: [200, 210, 220],
  headerBg: [7, 11, 20],
  tableBorder: [40, 50, 65],
  tableStripe: [245, 247, 250],
};

const PAGE_W = 612; // Letter width in points
const PAGE_H = 792;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

function money(n) {
  if (n == null) return '--';
  return '$' + Math.round(n).toLocaleString('en-US');
}

function pct(n) {
  if (n == null) return '--';
  return (n * 100).toFixed(1) + '%';
}

// ─── Main Generator ─────────────────────────────────────────────────────────

function generateDealPDF(dealData) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  let y = 0;

  const subject = dealData.subject || {};
  const arvResult = dealData.arvResult || null;
  const repairEstimate = dealData.repairEstimate || null;
  const allOffers = dealData.allOffers || null;
  const adjusted = dealData.adjusted || [];
  const generatedAt = dealData.generatedAt || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const confidence = dealData.confidence || 'low';

  // ═══ HEADER BAR ═══
  doc.setFillColor(...COLORS.headerBg);
  doc.rect(0, 0, PAGE_W, 72, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...COLORS.accent);
  doc.text('DealUW', MARGIN, 32);

  doc.setFontSize(9);
  doc.setTextColor(...COLORS.lightGray);
  doc.text('Deal Analysis Report', MARGIN, 48);

  doc.setFontSize(8);
  doc.setTextColor(...COLORS.gray);
  doc.text(`Generated: ${generatedAt}`, PAGE_W - MARGIN, 32, { align: 'right' });
  doc.text(`Confidence: ${confidence.toUpperCase()}`, PAGE_W - MARGIN, 44, { align: 'right' });

  // Accent line under header
  doc.setDrawColor(...COLORS.accent);
  doc.setLineWidth(2);
  doc.line(0, 72, PAGE_W, 72);

  y = 90;

  // ═══ SECTION 1: PROPERTY OVERVIEW ═══
  y = sectionTitle(doc, 'PROPERTY OVERVIEW', y);

  const propRows = [
    ['Address', subject.address || '--'],
    ['Location', `${subject.city || '--'}, ${subject.state || '--'} ${subject.zip || ''}`],
    ['Beds / Baths', `${subject.beds ?? '--'} / ${subject.baths ?? '--'}`],
    ['Square Feet', subject.sqft ? subject.sqft.toLocaleString() : '--'],
    ['Lot Size', subject.lot_sqft ? `${subject.lot_sqft.toLocaleString()} sqft` : '--'],
    ['Year Built', String(subject.year_built ?? '--')],
    ['Type', subject.property_type || '--'],
    ['Condition', subject.condition || '--'],
    ['Asking Price', subject.asking_price ? money(subject.asking_price) : 'Not disclosed'],
  ];

  if (subject.seller_motivation) propRows.push(['Motivation', subject.seller_motivation]);
  if (subject.seller_timeline) propRows.push(['Timeline', subject.seller_timeline]);
  if (subject.has_pool) propRows.push(['Pool', 'Yes']);
  if (subject.has_garage) propRows.push(['Garage', `${subject.garage_count} bay(s)`]);
  if (subject.has_basement) propRows.push(['Basement', `${subject.basement_sqft} sqft`]);

  doc.autoTable({
    startY: y,
    head: [],
    body: propRows,
    theme: 'plain',
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: 9, cellPadding: 3, textColor: COLORS.black, lineColor: COLORS.tableBorder, lineWidth: 0.25 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 100, textColor: COLORS.gray },
      1: { cellWidth: CONTENT_W - 100 },
    },
    alternateRowStyles: { fillColor: COLORS.tableStripe },
  });

  y = doc.lastAutoTable.finalY + 16;

  // ═══ SECTION 2: TOP COMPS ═══
  if (adjusted.length > 0) {
    y = checkPageBreak(doc, y, 120);
    y = sectionTitle(doc, 'COMPARABLE SALES', y);

    const compHead = [['#', 'Address', 'Sale Price', 'Adj. Price', 'Sqft', 'Distance', 'Days Old']];
    const compRows = adjusted.slice(0, 5).map((c, i) => [
      String(i + 1),
      truncate(c.address || '--', 30),
      money(c.sale_price),
      money(c.adjusted_price),
      c.sqft ? c.sqft.toLocaleString() : '--',
      c.distance_miles != null ? c.distance_miles.toFixed(2) + ' mi' : '--',
      c.days_old != null ? String(c.days_old) : '--',
    ]);

    doc.autoTable({
      startY: y,
      head: compHead,
      body: compRows,
      theme: 'grid',
      margin: { left: MARGIN, right: MARGIN },
      headStyles: { fillColor: COLORS.headerBg, textColor: COLORS.white, fontSize: 8, fontStyle: 'bold', cellPadding: 4 },
      styles: { fontSize: 8, cellPadding: 3, textColor: COLORS.black, lineColor: COLORS.tableBorder, lineWidth: 0.25 },
      alternateRowStyles: { fillColor: COLORS.tableStripe },
      columnStyles: {
        0: { cellWidth: 20, halign: 'center' },
        1: { cellWidth: 150 },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
      },
    });

    y = doc.lastAutoTable.finalY + 10;
  }

  // ═══ ARV BOX ═══
  if (arvResult) {
    y = checkPageBreak(doc, y, 50);

    doc.setFillColor(250, 248, 240);
    doc.setDrawColor(...COLORS.gold);
    doc.setLineWidth(1);
    doc.roundedRect(MARGIN, y, CONTENT_W, 44, 4, 4, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.gray);
    doc.text('After Repair Value (ARV)', MARGIN + 12, y + 16);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(...COLORS.gold);
    doc.text(money(arvResult.arv), MARGIN + 12, y + 36);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.gray);
    doc.text(`${arvResult.method} | ${arvResult.confidence} confidence`, PAGE_W - MARGIN - 12, y + 28, { align: 'right' });

    y += 56;
  }

  // ═══ SECTION 3: REPAIR ESTIMATE ═══
  if (repairEstimate && repairEstimate.line_items && repairEstimate.line_items.length > 0) {
    y = checkPageBreak(doc, y, 80);
    y = sectionTitle(doc, 'REPAIR ESTIMATE', y);

    const repairHead = [['Category', 'Description', 'Low', 'Recommended', 'High']];
    const repairRows = repairEstimate.line_items.map(item => [
      item.category.replace(/_/g, ' '),
      truncate(item.description, 35),
      money(item.estimate_low),
      money(item.recommended),
      money(item.estimate_high),
    ]);

    // Add total row
    repairRows.push([
      'TOTAL',
      '',
      money(repairEstimate.total_low),
      money(repairEstimate.total_recommended),
      money(repairEstimate.total_high),
    ]);

    doc.autoTable({
      startY: y,
      head: repairHead,
      body: repairRows,
      theme: 'grid',
      margin: { left: MARGIN, right: MARGIN },
      headStyles: { fillColor: COLORS.headerBg, textColor: COLORS.white, fontSize: 8, fontStyle: 'bold', cellPadding: 4 },
      styles: { fontSize: 8, cellPadding: 3, textColor: COLORS.black, lineColor: COLORS.tableBorder, lineWidth: 0.25 },
      alternateRowStyles: { fillColor: COLORS.tableStripe },
      columnStyles: {
        0: { cellWidth: 85, fontStyle: 'bold', textColor: COLORS.gray },
        1: { cellWidth: 160 },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
      didParseCell: (data) => {
        // Bold the total row
        if (data.row.index === repairRows.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          if (data.column.index === 3) {
            data.cell.styles.textColor = COLORS.gold;
          }
        }
      },
    });

    y = doc.lastAutoTable.finalY + 16;
  }

  // ═══ SECTION 4: OFFER STRATEGIES ═══
  if (allOffers) {
    y = checkPageBreak(doc, y, 140);
    y = sectionTitle(doc, 'OFFER STRATEGIES', y);

    const cash = allOffers.cash;
    const of = allOffers.owner_finance;
    const nov = allOffers.novation;

    const offerHead = [['', 'Cash Offer', 'Owner Finance', 'Novation']];
    const offerRows = [
      ['MAO / Price', money(cash.mao), money(of.purchase_price), money(nov.seller_price)],
      ['Starting Offer', money(cash.suggested_starting_offer), money(of.suggested_starting_offer.price), money(nov.suggested_starting_offer.seller_price)],
      ['Your Profit', `${money(cash.assignment_fee.conservative)}-${money(cash.assignment_fee.aggressive)}`, `${money(of.assignment_fee)} + ${money(of.monthly_cashflow)}/mo`, money(nov.wholesaler_profit)],
      ['Seller Receives', money(cash.mao), `${money(of.total_seller_receives)} (over ${of.term_years}yr)`, money(nov.seller_price)],
      ['Time to Close', '7-14 days', '30 days', nov.estimated_timeline],
      ['Viable?', cash.works ? 'YES' : 'NO', of.works ? 'YES' : 'NO', nov.works ? 'YES' : 'NO'],
    ];

    doc.autoTable({
      startY: y,
      head: offerHead,
      body: offerRows,
      theme: 'grid',
      margin: { left: MARGIN, right: MARGIN },
      headStyles: { fillColor: COLORS.headerBg, textColor: COLORS.white, fontSize: 8, fontStyle: 'bold', cellPadding: 5, halign: 'center' },
      styles: { fontSize: 8, cellPadding: 4, textColor: COLORS.black, lineColor: COLORS.tableBorder, lineWidth: 0.25 },
      alternateRowStyles: { fillColor: COLORS.tableStripe },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 90, textColor: COLORS.gray },
        1: { halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'center' },
      },
      didParseCell: (data) => {
        // Color the Viable row
        if (data.row.index === offerRows.length - 1 && data.column.index > 0) {
          const val = data.cell.raw;
          if (val === 'YES') data.cell.styles.textColor = COLORS.go;
          if (val === 'NO') data.cell.styles.textColor = COLORS.pass;
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    y = doc.lastAutoTable.finalY + 12;

    // Recommended Strategy box
    y = checkPageBreak(doc, y, 50);
    doc.setFillColor(250, 248, 240);
    doc.setDrawColor(...COLORS.gold);
    doc.setLineWidth(1);

    const stratText = allOffers.strategy_reasoning || `Best strategy: ${allOffers.best_strategy}`;
    const stratLines = doc.splitTextToSize(stratText, CONTENT_W - 24);
    const stratHeight = Math.max(40, stratLines.length * 12 + 24);
    doc.roundedRect(MARGIN, y, CONTENT_W, stratHeight, 4, 4, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.gold);
    doc.text(`RECOMMENDED: ${allOffers.best_strategy.toUpperCase()}`, MARGIN + 12, y + 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.black);
    doc.text(stratLines, MARGIN + 12, y + 28);

    y += stratHeight + 16;
  }

  // ═══ FOOTER ═══
  const addFooter = (pageNum, totalPages) => {
    doc.setPage(pageNum);
    doc.setDrawColor(...COLORS.lightGray);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, PAGE_H - 35, PAGE_W - MARGIN, PAGE_H - 35);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.gray);
    doc.text('Powered by DealUW — Arctic Acquisitions LLC', MARGIN, PAGE_H - 22);
    doc.text('For investment purposes only. Not an appraisal.', MARGIN, PAGE_H - 12);
    doc.text(`Page ${pageNum} of ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 22, { align: 'right' });
  };

  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    addFooter(i, totalPages);
  }

  return doc.output('arraybuffer');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sectionTitle(doc, title, y) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.accent);
  doc.text(title, MARGIN, y + 4);

  doc.setDrawColor(...COLORS.accent);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y + 8, MARGIN + CONTENT_W, y + 8);

  return y + 18;
}

function checkPageBreak(doc, y, needed) {
  if (y + needed > PAGE_H - 50) {
    doc.addPage();
    return 30;
  }
  return y;
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '...' : str;
}

module.exports = { generateDealPDF, money, pct };
