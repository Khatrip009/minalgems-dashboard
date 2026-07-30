// utilities/craftsmanStatementPdf.js
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';

pdfMake.vfs = pdfFonts;

function formatDMY(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

/**
 * @param {object} craftsman
 * @param {Array} issues
 * @param {Array} returns
 * @param {Array} consumptions
 * @param {Array} payments
 * @param {string} startDate
 * @param {string} endDate
 * @param {object} organization
 */
export function generateStatementPdf(
  craftsman,
  issues,
  returns,
  consumptions,
  payments,
  startDate = '',
  endDate = '',
  organization = {}
) {
  const org = organization;
  const craftsmanName = craftsman?.name || 'Craftsman';

  // ── Entries ──
  const leftEntries = consumptions.map((c) => ({
    sr_no: c.sr_no,
    date: c.consumption_date,
    item_no: c.item_no || '',
    carat: Number(c.carat || 18),
    conversion_percentage: Number(c.conversion_percentage || 100),
    gold_weight: Number(c.gold_weight || 0),
    final_gold_24kt: Number(c.final_gold_24kt || 0),
    labour_amount: Number(c.labour_amount || 0),
  }));

  const issueEntries = issues.map((i) => ({
    date: i.issue_date,
    remark: i.remark || 'Issue',
    cash_amount: null,
    quantity_24kt: Number(i.quantity_24kt),
  }));
  const returnEntries = returns.map((r) => ({
    date: r.return_date,
    remark: r.remark || 'Return',
    cash_amount: null,
    quantity_24kt: -Number(r.quantity_24kt),
  }));
  const paymentEntries = payments.map((p) => ({
    date: p.payment_date,
    remark: p.remark || '',
    cash_amount: Number(p.amount || 0),
    quantity_24kt: null,
  }));

  const rightEntries = [...issueEntries, ...returnEntries, ...paymentEntries]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((entry, index) => ({ ...entry, row_no: index + 1 }));

  // ── Totals ──
  let totalGoldWeight = 0, totalLabour = 0, totalEquivalent24kt = 0;
  leftEntries.forEach((e) => {
    totalGoldWeight += e.gold_weight;
    totalLabour += e.labour_amount;
    totalEquivalent24kt += e.final_gold_24kt;
  });
  let totalCash = 0, total24ktIssued = 0, total24ktReturned = 0;
  rightEntries.forEach((e) => {
    if (e.cash_amount) totalCash += e.cash_amount;
    if (e.quantity_24kt) {
      if (e.quantity_24kt > 0) total24ktIssued += e.quantity_24kt;
      else total24ktReturned += Math.abs(e.quantity_24kt);
    }
  });
  const netGold = total24ktIssued - total24ktReturned - totalEquivalent24kt;
  const netCash = totalLabour - totalCash;

  // ── Summary ──
  const summaryLeft = [
    `${Math.round(totalLabour)} Labour ${craftsmanName}`,
    `${Math.round(totalCash)} Office Paid`,
    `${Math.round(netCash)} APVANA`,
  ];
  const summaryRight = [`${total24ktIssued.toFixed(3)} 24kt office Gold`];
  if (total24ktReturned > 0) summaryRight.push(`${total24ktReturned.toFixed(3)} Gold Returned`);
  summaryRight.push(
    `${totalEquivalent24kt.toFixed(3)} ${craftsmanName} Labour gold (equiv 24kt)`,
    `${netGold.toFixed(3)} LAVANU`
  );

  // ── Build Left Table (Consumptions) ──
  const leftTableBody = [
    [
      { text: 'SR No', style: 'tableHeader', alignment: 'center' },
      { text: 'Date', style: 'tableHeader' },
      { text: 'Item No', style: 'tableHeader' },
      { text: 'Carat', style: 'tableHeader', alignment: 'center' },
      { text: 'Conv %', style: 'tableHeader', alignment: 'center' },
      { text: 'Gold Weight', style: 'tableHeader', alignment: 'right' },
      { text: 'Final 24kt', style: 'tableHeader', alignment: 'right' },
      { text: 'Labour', style: 'tableHeader', alignment: 'right' },
    ],
  ];
  leftEntries.forEach((e) => {
    leftTableBody.push([
      { text: e.sr_no, alignment: 'center' },
      formatDMY(e.date),
      e.item_no,
      { text: e.carat, alignment: 'center' },
      { text: e.conversion_percentage, alignment: 'center' },
      { text: e.gold_weight.toFixed(3), alignment: 'right' },
      { text: e.final_gold_24kt.toFixed(3), alignment: 'right' },
      { text: e.labour_amount.toFixed(2), alignment: 'right' },
    ]);
  });
  // Totals row – 8 columns: colSpan 5 for the first five, then totals for last three
  leftTableBody.push([
    { text: '', colSpan: 5, border: [false, false, false, false] },
    {},
    {},
    {},
    {},
    { text: totalGoldWeight.toFixed(3), alignment: 'right', bold: true, fillColor: '#f2f2f2' },
    { text: totalEquivalent24kt.toFixed(3), alignment: 'right', bold: true, fillColor: '#f2f2f2' },
    { text: totalLabour.toFixed(2), alignment: 'right', bold: true, fillColor: '#f2f2f2' },
  ]);

  // ── Build Right Table (Issues / Returns / Payments) ──
  const rightTableBody = [
    [
      { text: 'SR No', style: 'tableHeader', alignment: 'center' },
      { text: 'Date', style: 'tableHeader' },
      { text: 'Remark', style: 'tableHeader' },
      { text: 'Cash', style: 'tableHeader', alignment: 'right' },
      { text: '24Kt', style: 'tableHeader', alignment: 'right' },
    ],
  ];
  rightEntries.forEach((e) => {
    rightTableBody.push([
      { text: e.row_no, alignment: 'center' },
      formatDMY(e.date),
      e.remark,
      { text: e.cash_amount ? e.cash_amount.toFixed(2) : '', alignment: 'right' },
      { text: e.quantity_24kt != null ? Math.abs(e.quantity_24kt).toFixed(3) : '', alignment: 'right' },
    ]);
  });
  const net24kt = total24ktIssued - total24ktReturned;
  // Totals row – 5 columns: colSpan 3 for first three, then totals for Cash and 24Kt
  rightTableBody.push([
    { text: '', colSpan: 3, border: [false, false, false, false] },
    {},
    {},
    { text: totalCash.toFixed(2), alignment: 'right', bold: true, fillColor: '#f2f2f2' },
    { text: net24kt.toFixed(3), alignment: 'right', bold: true, fillColor: '#f2f2f2' },
  ]);

  // ── Company header info ──
  const addressObj =
    (typeof org.business_address === 'object'
      ? org.business_address
      : org.business_address ? JSON.parse(org.business_address) : {}) || {};

  const headerLines = [
    org.name || 'Company Name',
    org.legal_name || '',
    [addressObj.line1, addressObj.line2].filter(Boolean).join(', '),
    [addressObj.city, addressObj.state, addressObj.postal_code].filter(Boolean).join(' '),
    addressObj.country || '',
    `GSTIN: ${org.gstin || 'N/A'}  |  PAN: ${org.pan || 'N/A'}`,
    `Phone: ${org.phone || 'N/A'}  |  Email: ${org.email || 'N/A'}`,
  ].filter(Boolean);

  const headerBlock = headerLines.map((line) => ({ text: line, fontSize: 8, color: '#333' }));

  const docDefinition = {
    pageOrientation: 'landscape',
    pageMargins: [30, 30, 30, 40],
    header: {
      margin: [30, 10, 30, 0],
      columns: [
        {
          width: 'auto',
          stack: [
            ...(org.logo_url
              ? [{ image: org.logo_url, width: 80, alignment: 'left' }]
              : [{ text: org.name || 'Company', style: 'headerTitle' }]),
          ],
        },
        {
          width: '*',
          alignment: 'right',
          stack: headerBlock,
        },
      ],
    },
    footer: function (currentPage, pageCount) {
      return {
        margin: [30, 10, 30, 10],
        columns: [
          { text: 'This is a computer-generated statement.', style: 'footerText' },
          { text: `Page ${currentPage} of ${pageCount}`, style: 'footerText', alignment: 'right' },
        ],
      };
    },
    content: [
      { text: `Craftsman Statement: ${craftsmanName}`, style: 'title' },
      {
        text: `Period: ${startDate ? formatDMY(startDate) : 'from start'} to ${
          endDate ? formatDMY(endDate) : 'today'
        }`,
        style: 'subtitle',
        margin: [0, 0, 0, 20],
      },
      {
        columns: [
          {
            width: '60%',
            layout: 'grid',
            table: {
              widths: ['auto', '*', '*', 'auto', 'auto', 'auto', 'auto', 'auto'],
              body: leftTableBody,
            },
          },
          {
            width: '40%',
            layout: 'grid',
            table: {
              widths: ['auto', '*', '*', 'auto', 'auto'],
              body: rightTableBody,
            },
          },
        ],
      },
      { text: 'Summary', style: 'subheader', margin: [0, 20, 0, 10] },
      {
        columns: [
          { width: '50%', ul: summaryLeft.map((line) => ({ text: line, margin: [0, 2] })) },
          { width: '50%', ul: summaryRight.map((line) => ({ text: line, margin: [0, 2] })) },
        ],
      },
    ],
    styles: {
      headerTitle: { fontSize: 16, bold: true, color: '#1a5276' },
      title: { fontSize: 16, bold: true, alignment: 'center', margin: [0, 0, 0, 5], color: '#000' },
      subtitle: { fontSize: 11, italics: true, alignment: 'center', color: '#333' },
      subheader: { fontSize: 12, bold: true, color: '#000' },
      tableHeader: { bold: true, fillColor: '#1a5276', color: '#ffffff', alignment: 'center' },
      footerText: { fontSize: 7, color: '#888', italics: true },
    },
    defaultStyle: {
      fontSize: 8,
      lineHeight: 1.3,
      color: '#000',
    },
  };

  pdfMake.createPdf(docDefinition).download(`craftsman_${craftsmanName}_statement.pdf`);
}