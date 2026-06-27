export type PaperSize = "58mm" | "80mm" | "A4";
export type PrintType = "receipt" | "kot";

export interface PrintShopInfo {
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  fssaiNumber: string;
  gstNumber: string;
  thankYouMessage: string;
  paperSize: PaperSize;
}

export interface ReceiptItem {
  productName: string;
  quantity: number;
  price: number;
  isAddon?: boolean;
}

export interface ReceiptData {
  orderNumber: string;
  orderType: string;
  customerName: string;
  customerPhone?: string | null;
  specialInstructions?: string | null;
  items: ReceiptItem[];
  totalAmount: number;
  cashAmount: number;
  upiAmount: number;
  cardAmount: number;
  discountAmount: number;
  charityAmount: number;
  balance: number;
  cashierName: string;
  createdAt: string;
}

export interface KOTItem {
  productName: string;
  quantity: number;
  specialInstructions?: string | null;
  isAddon?: boolean;
}

export interface KOTData {
  orderNumber: string;
  subCode?: string;
  orderType: string;
  customerName: string;
  specialInstructions?: string | null;
  items: KOTItem[];
  createdAt: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in:  "Dine In",
  takeaway: "Takeaway",
  delivery: "Delivery",
  mixed:    "Mixed",
};

function formatRupee(n: number): string {
  return `₹${Math.abs(n).toFixed(0)}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function getPaperCSS(size: PaperSize): string {
  const widths = { "58mm": "54mm", "80mm": "76mm", "A4": "190mm" };
  const fontSz = { "58mm": "9px",  "80mm": "11px", "A4": "12px" };
  const w = widths[size];
  const f = fontSz[size];
  const pageSize = size === "A4" ? "A4" : `${size} auto`;
  return `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: ${f};
      color: #000;
      background: #fff;
      width: ${w};
      max-width: ${w};
      padding: 2mm;
    }
    .center { text-align: center; }
    .right  { text-align: right; }
    .bold   { font-weight: bold; }
    .dashed { border-top: 1px dashed #333; margin: 3px 0; }
    .solid  { border-top: 1px solid #333; margin: 3px 0; }
    .row    { display: flex; justify-content: space-between; align-items: baseline; gap: 4px; }
    .muted  { opacity: 0.65; }
    .big    { font-size: 1.2em; font-weight: bold; }
    .xl     { font-size: 1.4em; font-weight: bold; }
    .tag    { display: inline-block; border: 1px solid #333; padding: 1px 4px; font-size: 0.85em; }
    .mt2    { margin-top: 2mm; }
    .mt3    { margin-top: 3mm; }
    table   { width: 100%; border-collapse: collapse; }
    th, td  { text-align: left; padding: 1px 0; vertical-align: top; }
    th.r, td.r { text-align: right; }
    @media print {
      html, body { margin: 0; padding: 0; }
      @page { size: ${pageSize}; margin: 4mm; }
    }
  `;
}

// ── Receipt Template ──────────────────────────────────────────────────────────

export function generateReceiptHTML(receipt: ReceiptData, shop: PrintShopInfo): string {
  const subtotal = receipt.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const finalAmt = subtotal - receipt.discountAmount + receipt.charityAmount;
  const paidMethods: string[] = [];
  if (receipt.cashAmount > 0) paidMethods.push(`Cash ${formatRupee(receipt.cashAmount)}`);
  if (receipt.upiAmount  > 0) paidMethods.push(`UPI ${formatRupee(receipt.upiAmount)}`);
  if (receipt.cardAmount > 0) paidMethods.push(`Card ${formatRupee(receipt.cardAmount)}`);
  const totalPaid = receipt.cashAmount + receipt.upiAmount + receipt.cardAmount;

  const itemRows = receipt.items.map(item => `
    <tr>
      <td>${item.isAddon ? "  +" : ""}${item.productName}</td>
      <td class="r">${item.quantity}</td>
      <td class="r">${formatRupee(item.price)}</td>
      <td class="r">${formatRupee(item.price * item.quantity)}</td>
    </tr>
  `).join("");

  return `
    <div class="center">
      <div class="xl">${shop.shopName}</div>
      ${shop.shopAddress ? `<div>${shop.shopAddress}</div>` : ""}
      ${shop.shopPhone   ? `<div>📞 ${shop.shopPhone}</div>` : ""}
      ${shop.fssaiNumber ? `<div class="muted">FSSAI: ${shop.fssaiNumber}</div>` : ""}
      ${shop.gstNumber   ? `<div class="muted">GST: ${shop.gstNumber}</div>` : ""}
    </div>

    <div class="dashed mt2"></div>

    <div class="center mt2">
      <div class="bold">RECEIPT</div>
    </div>

    <div class="mt2">
      <div class="row"><span>Order</span><span class="bold">${receipt.orderNumber}</span></div>
      <div class="row"><span>Type</span><span>${ORDER_TYPE_LABELS[receipt.orderType] ?? receipt.orderType}</span></div>
      <div class="row"><span>Customer</span><span class="bold">${receipt.customerName}</span></div>
      ${receipt.customerPhone ? `<div class="row"><span>Mobile</span><span>${receipt.customerPhone}</span></div>` : ""}
      <div class="row"><span>Date</span><span>${formatDateTime(receipt.createdAt)}</span></div>
      <div class="row"><span>Cashier</span><span>${receipt.cashierName}</span></div>
    </div>

    ${receipt.specialInstructions ? `<div class="mt2 muted">Note: ${receipt.specialInstructions}</div>` : ""}

    <div class="dashed mt2"></div>

    <table class="mt2">
      <thead>
        <tr>
          <th>Item</th>
          <th class="r">Qty</th>
          <th class="r">Rate</th>
          <th class="r">Amt</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div class="dashed mt2"></div>

    <div class="mt2">
      <div class="row"><span>Subtotal</span><span>${formatRupee(subtotal)}</span></div>
      ${receipt.discountAmount > 0
        ? `<div class="row"><span>Discount</span><span>- ${formatRupee(receipt.discountAmount)}</span></div>`
        : ""}
      ${receipt.charityAmount > 0
        ? `<div class="row"><span>Charity</span><span>+ ${formatRupee(receipt.charityAmount)}</span></div>`
        : ""}
      <div class="solid"></div>
      <div class="row bold"><span>TOTAL</span><span>${formatRupee(finalAmt)}</span></div>
    </div>

    <div class="dashed mt2"></div>

    <div class="mt2">
      ${paidMethods.map(m => `<div class="row"><span>${m.split(" ")[0]}</span><span>${m.split(" ")[1]}</span></div>`).join("")}
      <div class="solid"></div>
      <div class="row bold"><span>Amount Paid</span><span>${formatRupee(totalPaid)}</span></div>
      ${receipt.balance > 0
        ? `<div class="row"><span>Pending</span><span>${formatRupee(receipt.balance)}</span></div>`
        : `<div class="row muted"><span>Change</span><span>${formatRupee(Math.abs(receipt.balance))}</span></div>`}
    </div>

    <div class="dashed mt3"></div>
    <div class="center mt2 bold">${shop.thankYouMessage}</div>
    <div class="center mt2 muted" style="font-size:0.8em">Powered by Waffle Hub BCM</div>
  `;
}

// ── KOT Template ─────────────────────────────────────────────────────────────

export function generateKOTHTML(kot: KOTData, shop: PrintShopInfo): string {
  const displayNumber = kot.subCode ? `${kot.orderNumber}${kot.subCode}` : kot.orderNumber;

  const itemRows = kot.items.map(item => `
    <div class="row mt2">
      <span class="bold">${item.quantity} × ${item.isAddon ? "(Add-on) " : ""}${item.productName}</span>
    </div>
    ${item.specialInstructions
      ? `<div class="muted" style="padding-left:1em">↳ ${item.specialInstructions}</div>`
      : ""}
  `).join("");

  return `
    <div class="center">
      <div class="big">KOT</div>
      <div class="muted">${shop.shopName}</div>
    </div>

    <div class="solid mt2"></div>

    <div class="mt2">
      <div class="row">
        <span>Order</span>
        <span class="xl">${displayNumber}</span>
      </div>
      ${kot.subCode ? `<div class="row"><span>Part</span><span class="bold">${kot.subCode}</span></div>` : ""}
      <div class="row"><span>Type</span><span class="bold">${ORDER_TYPE_LABELS[kot.orderType] ?? kot.orderType}</span></div>
      <div class="row"><span>Customer</span><span class="bold">${kot.customerName}</span></div>
      <div class="row"><span>Time</span><span>${formatDateTime(kot.createdAt)}</span></div>
    </div>

    ${kot.specialInstructions ? `<div class="mt2 bold">📝 ${kot.specialInstructions}</div>` : ""}

    <div class="dashed mt2"></div>

    <div class="mt2">${itemRows}</div>

    <div class="solid mt2"></div>
    <div class="center mt2 muted" style="font-size:0.85em">— Kitchen Copy —</div>
  `;
}

// ── Browser Print Trigger ─────────────────────────────────────────────────────

export function triggerBrowserPrint(html: string, paperSize: PaperSize): void {
  const win = window.open("", "_blank", "width=600,height=700,scrollbars=yes");
  if (!win) {
    alert("Please allow pop-ups to enable printing.");
    return;
  }
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Print</title>
  <style>${getPaperCSS(paperSize)}</style>
</head>
<body>${html}</body>
</html>`);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 400);
}

// ── Async print history logger ────────────────────────────────────────────────

export async function logPrintHistory(data: {
  orderId: number; orderNumber: string;
  type: PrintType; action: "printed" | "reprinted";
  printedBy: string; paperSize: string;
}): Promise<void> {
  try {
    await fetch("/api/print/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch {
    // non-blocking — don't interrupt the print flow if logging fails
  }
}

// ── Main print functions (browser provider) ───────────────────────────────────

export function printReceipt(
  receipt: ReceiptData,
  shop: PrintShopInfo,
  orderId: number,
  action: "printed" | "reprinted",
): void {
  const html = generateReceiptHTML(receipt, shop);
  triggerBrowserPrint(html, shop.paperSize);
  void logPrintHistory({
    orderId,
    orderNumber: receipt.orderNumber,
    type: "receipt",
    action,
    printedBy: receipt.cashierName,
    paperSize: shop.paperSize,
  });
}

export function printKOT(
  kot: KOTData,
  shop: PrintShopInfo,
  orderId: number,
  printedBy: string,
): void {
  const html = generateKOTHTML(kot, shop);
  triggerBrowserPrint(html, shop.paperSize);
  void logPrintHistory({
    orderId,
    orderNumber: kot.orderNumber,
    type: "kot",
    action: "printed",
    printedBy,
    paperSize: shop.paperSize,
  });
}
