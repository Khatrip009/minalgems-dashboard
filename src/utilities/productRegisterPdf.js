import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const CURRENCY_SYMBOL = 'Rs. '

function formatCurrency(amount) {
  return `${CURRENCY_SYMBOL}${Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function generateProductRegisterPDF(products, organization = null) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  const pageWidth = 297
  const pageHeight = 210
  const margin = 10
  const footerHeight = 8

  const primaryColor = [41, 128, 185]
  const lightGray = [245, 245, 245]

  // ---------- Column definitions (added Craftsman) ----------
  const colDefs = [
    { key: 'item_no',    header: 'Item No',    width: 20 },
    { key: 'sku',        header: 'SKU',        width: 22 },
    { key: 'title',      header: 'Title',      width: 38 },
    { key: 'category',   header: 'Category',   width: 22 },
    { key: 'craftsman',  header: 'Craftsman',  width: 22 },   // ✅ new column
    { key: 'metal',      header: 'Metal',      width: 26 },
    { key: 'gold_wt',    header: 'Gold Wt',    width: 15 },
    { key: 'metal_rate', header: 'Metal Rt',   width: 22 },
    { key: 'labour',     header: 'Labour',     width: 20 },
    { key: 'price',      header: 'Price',      width: 24 },
    { key: 'stock',      header: 'Stock',      width: 12 },
    { key: 'published',  header: 'Pub',        width: 12 },
  ]

  // Total width of all columns
  const totalWidth = colDefs.reduce((s, c) => s + c.width, 0)   // ~255 mm, fits in 277 mm
  const tableStartX = margin
  const availableWidth = pageWidth - 2 * margin

  const diamondColumns = [
    { header: 'Type', dataKey: 'diamond_type' },
    { header: 'Shape', dataKey: 'shape' },
    { header: 'Color', dataKey: 'color' },
    { header: 'Clarity', dataKey: 'clarity' },
    { header: 'Carat', dataKey: 'carat' },
    { header: 'Pcs', dataKey: 'pcs' },
    { header: 'Rate', dataKey: 'rate' },
    { header: 'Total', dataKey: 'total_price' },
  ]

  // ----- Helper functions -----
  function drawProductRowHeader(yPos) {
    doc.setFontSize(7).setFont('helvetica', 'bold')
    doc.setFillColor(...primaryColor)
    doc.rect(tableStartX, yPos, availableWidth, 7, 'F')
    doc.setTextColor(255, 255, 255)
    let x = tableStartX
    colDefs.forEach(col => {
      doc.text(col.header, x + 1, yPos + 5)
      x += col.width
    })
    doc.setTextColor(0, 0, 0)
  }

  function drawProductRow(product, yPos) {
    doc.setFontSize(7).setFont('helvetica', 'normal')
    doc.setTextColor(0, 0, 0)
    doc.setFillColor(255, 255, 255)
    doc.rect(tableStartX, yPos, availableWidth, 7, 'F')

    let x = tableStartX
    const values = {
      item_no: product.item_no || '-',
      sku: product.sku || '-',
      title: product.title.substring(0, 35),
      category: product.categories?.name || '-',
      craftsman: product.craftsmen?.name || '-',   // ✅ craftsman name
      metal: `${product.metal_type} ${product.gold_carat}K`,
      gold_wt: product.gold_weight + 'g',
      metal_rate: formatCurrency(product.metal_rate),
      labour: formatCurrency(product.labour),
      price: formatCurrency(product.price),
      stock: product.available_qty,
      published: product.is_published ? 'Y' : 'N',
    }
    colDefs.forEach(col => {
      const val = values[col.key] || ''
      doc.text(String(val).substring(0, col.width / 2), x + 1, yPos + 5)
      x += col.width
    })

    doc.setDrawColor(100)
    doc.setLineWidth(0.2)
    doc.line(tableStartX, yPos + 7, tableStartX + availableWidth, yPos + 7)
  }

  function drawDiamondTable(product, startY) {
    const diamonds = product.diamonds || []
    if (diamonds.length === 0) return startY

    const diamondRows = diamonds.map(d => ({
      diamond_type: d.diamond_type,
      shape: d.shape,
      color: d.color || '-',
      clarity: d.clarity || '-',
      carat: Number(d.carat).toFixed(3),
      pcs: d.pcs,
      rate: formatCurrency(d.rate),
      total_price: formatCurrency(d.total_price),
    }))

    autoTable(doc, {
      startY: startY,
      margin: { left: tableStartX + 5, right: tableStartX + 5 },
      head: [diamondColumns.map(c => c.header)],
      body: diamondRows.map(r => diamondColumns.map(c => r[c.dataKey])),
      theme: 'grid',
      styles: {
        fontSize: 6.5,
        cellPadding: 1,
        halign: 'left',
        valign: 'middle',
        lineColor: [0, 0, 0],
        lineWidth: 0.05,
        textColor: 0,
      },
      headStyles: {
        fillColor: primaryColor,
        textColor: 255,
        fontStyle: 'bold',
      },
      alternateRowStyles: { fillColor: lightGray },
      columnStyles: {
        diamond_type: { cellWidth: 20 },
        shape: { cellWidth: 15 },
        color: { cellWidth: 12 },
        clarity: { cellWidth: 12 },
        carat: { cellWidth: 16 },
        pcs: { cellWidth: 10 },
        rate: { cellWidth: 22 },
        total_price: { cellWidth: 25 },
      },
    })

    return doc.lastAutoTable.finalY + 3
  }

  // ----- Global header -----
  let y = margin
  doc.setFontSize(16).setTextColor(...primaryColor).setFont('helvetica', 'bold')
  doc.text('PRODUCT REGISTER', pageWidth / 2, y, { align: 'center' })
  y += 7
  if (organization?.name) {
    doc.setFontSize(9).setTextColor(0)
    doc.text(organization.name, pageWidth / 2, y, { align: 'center' })
    y += 5
  }
  doc.setFontSize(8)
  doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}     Total Products: ${products.length}`, pageWidth / 2, y, { align: 'center' })
  y += 8

  // ----- Main loop -----
  let currentPage = 1
  const rowHeight = 7
  const headerRowHeight = 7

  function newPage() {
    doc.addPage()
    currentPage++
    y = margin
  }

  function enoughSpace(product) {
    const diamonds = product.diamonds || []
    const estimatedDiamondHeight = diamonds.length > 0 ? (diamonds.length * 6 + 8) : 0
    return (y + rowHeight + estimatedDiamondHeight + 5) < (pageHeight - footerHeight)
  }

  drawProductRowHeader(y)
  y += headerRowHeight

  for (let i = 0; i < products.length; i++) {
    const product = products[i]

    if (!enoughSpace(product)) {
      newPage()
      drawProductRowHeader(y)
      y += headerRowHeight
    }

    drawProductRow(product, y)
    y += rowHeight

    if (product.diamonds && product.diamonds.length > 0) {
      y = drawDiamondTable(product, y)
    }

    y += 2

    // temporary footer (will be overridden)
    doc.setFontSize(6).setTextColor(150)
    doc.text(`Page ${currentPage}`, pageWidth - margin, pageHeight - 5, { align: 'right' })
  }

  // Final page numbers
  const totalPages = doc.internal.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setFontSize(6).setTextColor(150)
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - 5, { align: 'right' })
    doc.text('Generated by Minal Gems Admin', margin, pageHeight - 5)
  }

  const timestamp = new Date().toISOString().slice(0, 10)
  doc.save(`product-register-${timestamp}.pdf`)
}