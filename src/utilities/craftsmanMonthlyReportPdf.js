import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
pdfMake.vfs = pdfFonts;

function formatDMY(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

export function generateMonthlyReportPdf(reports, month, organization = {}) {
  const org = organization;
  const content = [];

  reports.forEach((r, idx) => {
    const leftBody = [
      [
        { text: 'Date', style: 'tableHeader' },
        { text: 'Item No', style: 'tableHeader' },
        { text: 'Carat', style: 'tableHeader', alignment: 'center' },
        { text: 'Conv %', style: 'tableHeader', alignment: 'center' },
        { text: 'Gold Wt', style: 'tableHeader', alignment: 'right' },
        { text: 'Final 24kt', style: 'tableHeader', alignment: 'right' },
        { text: 'Labour', style: 'tableHeader', alignment: 'right' },
      ],
    ];
    r.leftEntries.forEach(e => {
      leftBody.push([
        formatDMY(e.date),
        e.item_no || '',
        { text: e.carat || 18, alignment: 'center' },
        { text: e.conversion_percentage || 100, alignment: 'center' },
        { text: (e.gold_weight || 0).toFixed(3), alignment: 'right' },
        { text: (e.final_gold_24kt || 0).toFixed(3), alignment: 'right' },
        { text: (e.labour_amount || 0).toFixed(2), alignment: 'right' },
      ]);
    });
    // totals row
    leftBody.push([
      { text: '', colSpan: 4, border: [false, false, false, false] },
      {}, {}, {},
      { text: (r.totalGoldWeight || 0).toFixed(3), alignment: 'right', bold: true, fillColor: '#f2f2f2' },
      { text: (r.totalEquivalent24kt || 0).toFixed(3), alignment: 'right', bold: true, fillColor: '#f2f2f2' },
      { text: (r.totalLabour || 0).toFixed(2), alignment: 'right', bold: true, fillColor: '#f2f2f2' },
    ]);

    const rightBody = [
      [
        { text: 'Date', style: 'tableHeader' },
        { text: 'Remark', style: 'tableHeader' },
        { text: 'Cash', style: 'tableHeader', alignment: 'right' },
        { text: '24Kt', style: 'tableHeader', alignment: 'right' },
      ],
    ];
    r.rightEntries.forEach(e => {
      rightBody.push([
        formatDMY(e.date),
        e.remark || '',
        { text: e.cash_amount ? e.cash_amount.toFixed(2) : '', alignment: 'right' },
        { text: e.quantity_24kt != null ? Math.abs(e.quantity_24kt).toFixed(3) : '', alignment: 'right' },
      ]);
    });
    rightBody.push([
      { text: '', colSpan: 2, border: [false, false, false, false] },
      {},
      { text: (r.totalCash || 0).toFixed(2), alignment: 'right', bold: true, fillColor: '#f2f2f2' },
      { text: (r.total24ktIssued || 0).toFixed(3), alignment: 'right', bold: true, fillColor: '#f2f2f2' },
    ]);

    content.push(
      { text: `Craftsman: ${r.craftsmanName}`, style: 'title', pageBreak: idx === 0 ? undefined : 'before' },
      { text: `Period: ${formatDMY(r.startDate || month + '-01')} to ${formatDMY(r.endDate || month + '-31')}`, style: 'subtitle', margin: [0, 0, 0, 20] },
      {
        columns: [
          { width: '60%', layout: 'grid', table: { widths: ['*', '*', 'auto', 'auto', 'auto', 'auto', 'auto'], body: leftBody } },
          { width: '40%', layout: 'grid', table: { widths: ['*', '*', 'auto', 'auto'], body: rightBody } },
        ],
      },
      { text: 'Summary', style: 'subheader', margin: [0, 20, 0, 10] },
      {
        columns: [
          { width: '50%', ul: r.summaryLeft.map(line => ({ text: line, margin: [0, 2] })) },
          { width: '50%', ul: r.summaryRight.map(line => ({ text: line, margin: [0, 2] })) },
        ],
      }
    );
  });

  const docDefinition = {
    pageOrientation: 'landscape',
    pageMargins: [30, 30, 30, 40],
    header: {
      margin: [30, 10, 30, 0],
      columns: [
        { text: org.name || 'Company', style: 'headerTitle' },
        { text: `Monthly Report: ${month}`, style: 'headerRight', alignment: 'right' },
      ],
    },
    footer: (currentPage, pageCount) => ({
      margin: [30, 10, 30, 10],
      columns: [
        { text: 'Computer-generated report', style: 'footerText' },
        { text: `Page ${currentPage} of ${pageCount}`, style: 'footerText', alignment: 'right' },
      ],
    }),
    content,
    styles: {
      headerTitle: { fontSize: 16, bold: true, color: '#1a5276' },
      headerRight: { fontSize: 11, italics: true, color: '#333' },
      title: { fontSize: 16, bold: true, alignment: 'center', margin: [0, 0, 0, 5], color: '#000' },
      subtitle: { fontSize: 11, italics: true, alignment: 'center', color: '#333' },
      subheader: { fontSize: 12, bold: true, color: '#000' },
      tableHeader: { bold: true, fillColor: '#1a5276', color: '#ffffff', alignment: 'center' },
      footerText: { fontSize: 7, color: '#888', italics: true },
    },
    defaultStyle: { fontSize: 8, lineHeight: 1.3, color: '#000' },
  };

  pdfMake.createPdf(docDefinition).download(`monthly_report_${month}.pdf`);
}