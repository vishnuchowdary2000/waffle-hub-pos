---
name: Print settings architecture
description: How printer names, paper sizes, and auto-print toggles are wired together across the stack.
---

**Printer name fields** (`receiptPrinterName`, `kotPrinterName`) are stored in `store_settings` and passed through to:
- The browser print window title (so the OS print dialog shows the target printer name as a hint)
- The `print_history` log row (`printerName` column)

**Why:** Browsers cannot programmatically route to a specific printer; the name is advisory only. Staff see it in the title bar and in Print History.

**Auto-print split:**
- `autoPrint` (KOT) — fires from Counter.tsx on successful order creation (`placeOrder` onSuccess)
- `autoPrintReceipt` (Receipt) — fires from Billing.tsx after full payment is recorded (`autoPrintAfterSave`)

**Paper size custom flow:**
- `paperSize` field stores "58mm" | "80mm" | "A4" | "custom"
- When "custom": `customPaperWidth` (integer mm) and `customPaperHeight` (integer mm, nullable = auto/unset) are used by `getPaperCSS()` in printService.ts

**Print History:** logged via `POST /api/print/history`; returned by `GET /api/print/history` ordered desc, limit 100. Admin StoreTab shows last 20.
