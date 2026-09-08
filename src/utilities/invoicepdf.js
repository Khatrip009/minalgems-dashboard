import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─── Currency Configuration ─────────────────────────────────
const CURRENCY_CONFIG = {
  INR: { symbol: 'Rs. ', name: 'Rupee', subunit: 'Paisa', locale: 'en-IN', decimals: 2, numbering: 'indian' },
  USD: { symbol: '$', name: 'Dollar', subunit: 'Cent', locale: 'en-US', decimals: 2, numbering: 'international' },
  EUR: { symbol: '€', name: 'Euro', subunit: 'Cent', locale: 'de-DE', decimals: 2, numbering: 'international' },
  GBP: { symbol: '£', name: 'Pound', subunit: 'Penny', locale: 'en-GB', decimals: 2, numbering: 'international' },
  AED: { symbol: 'د.إ', name: 'Dirham', subunit: 'Fils', locale: 'ar-AE', decimals: 2, numbering: 'international' },
}

const DEFAULT_CURRENCY = 'INR'

function getCurrencyConfig(currency) {
  return CURRENCY_CONFIG[currency] || CURRENCY_CONFIG[DEFAULT_CURRENCY]
}

// ─── Address Parser ─────────────────────────────────────────
function parseAddress(addr) {
  if (!addr) return {}
  if (typeof addr === 'object') return addr
  try {
    return JSON.parse(addr)
  } catch {
    return { line1: addr }
  }
}

// ─── Currency Formatter ─────────────────────────────────────
function formatCurrency(amount, currency = DEFAULT_CURRENCY) {
  const num = Number(amount)
  if (isNaN(num)) return ''
  const config = getCurrencyConfig(currency)
  // Use Intl for number formatting, but we'll manually add the symbol for INR
  // to avoid unsupported glyph issues in PDF.
  const numberString = new Intl.NumberFormat(config.locale, {
    minimumFractionDigits: config.decimals,
    maximumFractionDigits: config.decimals,
  }).format(num)
  if (currency === 'INR') {
    return `Rs. ${numberString}`
  }
  // For other currencies, use the native currency formatting with symbol.
  return new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: config.decimals,
    maximumFractionDigits: config.decimals,
  }).format(num)
}

// ─── Number to Words (Supports Indian & International) ──────
function numberToWords(amount, currency = DEFAULT_CURRENCY) {
  const num = Number(amount)
  if (isNaN(num)) return ''

  const config = getCurrencyConfig(currency)
  const integerPart = Math.floor(Math.abs(num))
  const decimalPart = Math.round((Math.abs(num) - integerPart) * Math.pow(10, config.decimals))

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  function convertHundreds(n) {
    let str = ''
    if (n > 99) {
      str += ones[Math.floor(n / 100)] + ' Hundred '
      n %= 100
    }
    if (n > 19) {
      str += tens[Math.floor(n / 10)] + ' '
      n %= 10
    } else if (n > 9) {
      str += teens[n - 10] + ' '
      n = 0
    }
    if (n > 0) str += ones[n] + ' '
    return str.trim()
  }

  function convertIndian(n) {
    if (n === 0) return 'Zero'
    let result = ''
    const crore = Math.floor(n / 10000000)
    const lakh = Math.floor((n % 10000000) / 100000)
    const thousand = Math.floor((n % 100000) / 1000)
    const hundred = n % 1000

    if (crore > 0) result += convertHundreds(crore) + ' Crore '
    if (lakh > 0) result += convertHundreds(lakh) + ' Lakh '
    if (thousand > 0) result += convertHundreds(thousand) + ' Thousand '
    if (hundred > 0) result += convertHundreds(hundred)

    return result.trim()
  }

  function convertInternational(n) {
    if (n === 0) return 'Zero'
    let result = ''
    const billion = Math.floor(n / 1000000000)
    const million = Math.floor((n % 1000000000) / 1000000)
    const thousand = Math.floor((n % 1000000) / 1000)
    const hundred = n % 1000

    if (billion > 0) result += convertHundreds(billion) + ' Billion '
    if (million > 0) result += convertHundreds(million) + ' Million '
    if (thousand > 0) result += convertHundreds(thousand) + ' Thousand '
    if (hundred > 0) result += convertHundreds(hundred)

    return result.trim()
  }

  const convert = config.numbering === 'indian' ? convertIndian : convertInternational
  let words = convert(integerPart) + ' ' + config.name + (integerPart !== 1 ? 's' : '')
  if (decimalPart > 0) {
    words += ' and ' + convert(decimalPart) + ' ' + config.subunit + (decimalPart !== 1 ? 's' : '')
  }
  words += ' Only'
  return words.replace(/\s+/g, ' ').trim()
}

/**
 * Build product description.
 * - If price_mode is "manual", show only item name and final price.
 * - Otherwise (auto), show full breakdown.
 */
function buildProductDescription(item, currency = DEFAULT_CURRENCY) {
  const metadata = item.metadata || {}
  const priceMode = metadata.price_mode || item.price_mode || 'auto'
  const breakdown = metadata.breakdown || item.breakdown || {}
  const product = metadata.product_snapshot || item.product_details || {}

  const title = item.product_title || item.title || product.title || 'Product'
  const itemNo = product.item_no || product.sku || item.product_sku || ''

  if (priceMode === 'manual') {
    if (itemNo) return `Item No: ${itemNo}  |  ${title}`
    return title
  }

  const lines = []
  if (itemNo) {
    lines.push(`Item No: ${itemNo}  |  ${title}`)
  } else {
    lines.push(title)
  }

  // Diamonds
  const diamonds = product.diamonds || []
  if (diamonds.length > 0) {
    lines.push('Diamonds:')
    diamonds.forEach((d, i) => {
      const details = [d.diamond_type, d.shape, d.color, d.clarity].filter(Boolean).join(' ')
      const carat = Number(d.carat).toFixed(3)
      const rate = formatCurrency(d.rate, currency)
      const total = formatCurrency(d.total_price, currency)
      lines.push(`${i + 1}. ${details}  ${carat} ct  x  ${rate}/ct  =  ${total}`)
    })
    const totalCarat = diamonds.reduce((s, d) => s + Number(d.carat), 0)
    const totalPrice = diamonds.reduce((s, d) => s + Number(d.total_price), 0)
    const avgRate = totalCarat > 0 ? totalPrice / totalCarat : 0
    lines.push(`Total Diamonds: ${totalCarat.toFixed(3)} ct, Avg Rate: ${formatCurrency(avgRate, currency)}/ct, Total: ${formatCurrency(totalPrice, currency)}`)
  } else if (breakdown.diamond_total > 0 || breakdown.diamond_weight > 0) {
    const dWeight = breakdown.diamond_weight || 0
    const dTotal = breakdown.diamond_total || 0
    const dRate = dWeight > 0 ? dTotal / dWeight : breakdown.diamond_rate || 0
    lines.push(`Diamonds: ${Number(dWeight).toFixed(3)} ct x ${formatCurrency(dRate, currency)}/ct = ${formatCurrency(dTotal, currency)}`)
  }

  // Metal
  const metalType = product.metal_type || 'Gold'
  const goldCarat = product.gold_carat || ''
  let metalWeight = product.gold_weight || breakdown.metal_weight || 0
  let metalRate = product.metal_rate || breakdown.metal_rate || 0
  let metalTotal = product.total_metal_price || breakdown.metal_total || 0
  if (!metalTotal && metalWeight > 0 && metalRate > 0) {
    metalTotal = metalWeight * metalRate
  }
  if (metalWeight > 0 || metalTotal > 0) {
    lines.push(`Metal: ${metalType} ${goldCarat}K, ${Number(metalWeight).toFixed(3)} g x ${formatCurrency(metalRate, currency)}/g = ${formatCurrency(metalTotal, currency)}`)
  }

  // Labour
  const labour = product.labour || breakdown.labour || 0
  if (labour > 0) {
    lines.push(`Labour: ${formatCurrency(labour, currency)}`)
  }

  // Total excl tax
  lines.push(`Total (excl. tax): ${formatCurrency(item.unit_price, currency)}`)

  return lines.join('\n')
}

export function generateInvoicePDF({
  organization,
  invoice,
  items,
  taxLines = [],
  payments = [],
  currency = DEFAULT_CURRENCY,
}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15
  let y = margin

  const primaryColor = [41, 128, 185]
  const lightGray = [245, 245, 245]

  // ─── Company Header ────────────────────────────────────────
  doc.setFillColor(...primaryColor)
  doc.rect(0, 0, pageWidth, 35, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(22).setFont('helvetica', 'bold')
  doc.text(organization?.name || 'Company Name', margin, 18)
  doc.setFontSize(10).setFont('helvetica', 'normal')
  doc.text(organization?.legal_name || '', margin, 28)

  const addrObj = parseAddress(organization?.business_address)
  const companyAddressLines = [
    addrObj.line1 || '',
    addrObj.line2 || '',
    [addrObj.city, addrObj.state, addrObj.postal_code].filter(Boolean).join(' ') || '',
    addrObj.country || '',
    `GSTIN: ${organization?.gstin || 'N/A'}  |  PAN: ${organization?.pan || 'N/A'}`,
    `Phone: ${organization?.phone || 'N/A'}  |  Email: ${organization?.email || 'N/A'}`,
  ].filter(Boolean)

  doc.setFontSize(8)
  let addrY = 10
  companyAddressLines.forEach(line => {
    if (line) {
      doc.text(line, pageWidth - margin, addrY, { align: 'right' })
      addrY += 3.5
    }
  })

  y = 45

  // ─── Invoice Title ─────────────────────────────────────────
  doc.setFontSize(18).setTextColor(...primaryColor).setFont('helvetica', 'bold')
  doc.text('INVOICE', margin, y)
  y += 8

  // ─── Left Column: Bill To ──────────────────────────────────
  const leftX = margin
  const rightMetaStartX = pageWidth - margin - 58
  const maxLeftWidth = rightMetaStartX - margin - 5

  let billY = y
  doc.setFontSize(9).setTextColor(0).setFont('helvetica', 'normal')
  doc.text('Bill To:', leftX, billY)
  billY += 5

  doc.setFont('helvetica', 'bold')
  const customerName = invoice?.customer_name || invoice?.shipping_address?.full_name || 'Customer'
  const nameLines = doc.splitTextToSize(customerName, maxLeftWidth)
  nameLines.forEach(line => {
    doc.text(line, leftX, billY)
    billY += 4
  })

  doc.setFont('helvetica', 'normal')
  const shipAddr = invoice?.shipping_address
  if (shipAddr) {
    const addressParts = [
      shipAddr.line1,
      shipAddr.line2,
      [shipAddr.city, shipAddr.state, shipAddr.postal_code].filter(Boolean).join(' '),
      shipAddr.country,
      shipAddr.phone ? `Phone: ${shipAddr.phone}` : '',
    ].filter(Boolean)
    const fullAddress = addressParts.join(', ')
    const addrLines = doc.splitTextToSize(fullAddress, maxLeftWidth)
    addrLines.forEach(line => {
      doc.text(line, leftX, billY)
      billY += 4
    })
  }

  // ─── Right Column: Invoice Meta ────────────────────────────
  let metaY = y
  const metaStartX = pageWidth - margin - 58
  const valueX = pageWidth - margin

  const metaLines = [
    { label: 'Invoice Number:', value: invoice?.invoice_number || 'INV-XXX' },
    { label: 'Invoice Date:', value: invoice?.created_at ? new Date(invoice.created_at).toLocaleDateString('en-IN') : '' },
    { label: 'Order Number:', value: invoice?.order_number || '' },
    { label: 'Currency:', value: currency },
    { label: 'Status:', value: invoice?.status?.toUpperCase() || '' },
  ]

  doc.setFontSize(8)
  metaLines.forEach(({ label, value }) => {
    doc.setFont('helvetica', 'normal')
    doc.text(label, metaStartX, metaY)
    doc.setFont('helvetica', 'bold')
    doc.text(value, valueX, metaY, { align: 'right' })
    metaY += 5
  })

  y = Math.max(billY, metaY) + 8

  // ─── Items Table ───────────────────────────────────────────
  const tableColumns = [
    { header: '#', dataKey: 'sr' },
    { header: 'Product / Service', dataKey: 'title' },
    { header: 'HSN', dataKey: 'hsn' },
    { header: 'Qty', dataKey: 'qty' },
    { header: 'Unit Price', dataKey: 'unit_price' },
    { header: 'Tax %', dataKey: 'tax_rate' },
    { header: 'Tax Amt', dataKey: 'tax_amount' },
    { header: 'Total', dataKey: 'total' },
  ]

  const tableRows = items.map((item, idx) => ({
    sr: idx + 1,
    title: buildProductDescription(item, currency),
    hsn: item.hsn_code || '7113',
    qty: item.quantity,
    unit_price: formatCurrency(item.unit_price, currency),
    tax_rate: `${((item.tax_amount / (item.unit_price * item.quantity)) * 100 || 0).toFixed(1)}%`,
    tax_amount: formatCurrency(item.tax_amount, currency),
    total: formatCurrency(item.quantity * item.unit_price + (item.tax_amount || 0), currency),
  }))

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [tableColumns.map(col => col.header)],
    body: tableRows.map(row => tableColumns.map(col => row[col.dataKey])),
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2,
      halign: 'left',
      valign: 'middle',
      lineColor: [0, 0, 0],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: primaryColor,
      textColor: 255,
      fontStyle: 'bold',
      lineColor: primaryColor,
      lineWidth: 0.1,
    },
    alternateRowStyles: {
      fillColor: lightGray,
    },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 50 },
      2: { cellWidth: 18 },
      3: { cellWidth: 10 },
      4: { cellWidth: 26 },
      5: { cellWidth: 16 },
      6: { cellWidth: 26 },
      7: { cellWidth: 26 },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.dataKey === 'title') {
        data.cell.text = data.cell.raw // use raw string; autoTable will handle \n
      }
    },
  })

  y = doc.lastAutoTable.finalY + 10

  // ─── Totals ────────────────────────────────────────────────
  const totalX = pageWidth - margin - 65
  const lineH = 6
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0)
  const totalTax = items.reduce((sum, i) => sum + (i.tax_amount || 0), 0)
  const shipping = invoice?.shipping_cost || 0
  const discount = invoice?.discount_amount || 0
  const grandTotal = invoice?.total || (subtotal + totalTax + shipping - discount)

  doc.setFontSize(10).setFont('helvetica', 'normal')
  const drawTotal = (label, value, bold = false) => {
    if (bold) doc.setFont('helvetica', 'bold')
    doc.text(label, totalX - 10, y)
    doc.text(value, totalX + 55, y, { align: 'right' })
    y += lineH
    if (bold) doc.setFont('helvetica', 'normal')
  }

  drawTotal('Subtotal:', formatCurrency(subtotal, currency))
  if (discount > 0) drawTotal('Discount:', formatCurrency(discount, currency))
  if (shipping > 0) drawTotal('Shipping:', formatCurrency(shipping, currency))
  drawTotal('Total Tax:', formatCurrency(totalTax, currency))
  drawTotal('Grand Total:', formatCurrency(grandTotal, currency), true)

  // ─── Amount in Words ───────────────────────────────────────
  y += 2
  doc.setFontSize(9).setFont('helvetica', 'italic')
  const amountWords = numberToWords(grandTotal, currency)
  doc.text(`Amount in Words: ${amountWords}`, margin, y)
  y += 6

  // ─── Tax Breakdown ─────────────────────────────────────────
  if (taxLines.length > 0) {
    y += 4
    doc.setFontSize(9).setFont('helvetica', 'bold')
    doc.text('Tax Breakup', margin, y)
    y += 5
    taxLines.forEach(tl => {
      doc.setFont('helvetica', 'normal')
      doc.text(`${tl.tax_type} @ ${tl.rate}%`, margin + 5, y)
      doc.text(formatCurrency(tl.tax_amount || 0, currency), totalX + 55, y, { align: 'right' })
      y += lineH
    })
  }

  // ─── Payment History ───────────────────────────────────────
  if (payments.length > 0) {
    y += 8
    doc.setFontSize(9).setFont('helvetica', 'bold')
    doc.text('Payment History', margin, y)
    y += 5
    payments.forEach(p => {
      doc.setFont('helvetica', 'normal')
      const paidOn = p.paid_at ? new Date(p.paid_at).toLocaleDateString('en-IN') : '-'
      doc.text(`${p.payment_method?.toUpperCase()} | ${paidOn}`, margin + 5, y)
      doc.text(formatCurrency(p.amount, currency), totalX + 55, y, { align: 'right' })
      y += lineH
    })
  }

  // ─── Footer ────────────────────────────────────────────────
  const footerStartY = 240
  if (y > footerStartY - 20) {
    doc.addPage()
    y = margin
  } else {
    y = Math.max(y + 15, footerStartY)
  }

  doc.setFontSize(8).setTextColor(100).setFont('helvetica', 'italic')
  doc.text('Payment Terms: 100% advance unless credit terms agreed.', margin, y)
  y += 6
  doc.text(
    'Bank Details: Account Name - Your Company, Account No - 1234567890, IFSC - ABCD0123456',
    margin,
    y
  )

  y += 12
  doc.setDrawColor(0)
  doc.line(margin, y, pageWidth - margin, y)
  y += 4
  doc.setFontSize(8).setFont('helvetica', 'normal')
  doc.text('Authorized Signatory', pageWidth - margin, y, { align: 'right' })

  doc.setFontSize(6).setTextColor(150)
  doc.text('This is a computer-generated invoice.', margin, 287)

  doc.save(`invoice-${invoice?.invoice_number || 'download'}.pdf`)
}