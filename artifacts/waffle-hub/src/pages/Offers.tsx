import { useState } from "react";
import {
  useListOffers,
  useCreateOffer,
  useUpdateOffer,
  useDeleteOffer,
  useToggleOffer,
  getListOffersQueryKey,
} from "@workspace/api-client-react";
import type { Offer } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Tag, Percent, DollarSign, Gift, BadgePercent } from "lucide-react";

const OFFER_TYPES = [
  { value: "buy_x_get_y",   label: "Buy X Get Y Free", icon: Gift },
  { value: "percentage",    label: "Percentage Discount", icon: Percent },
  { value: "fixed_amount",  label: "Fixed Amount Off", icon: DollarSign },
  { value: "min_bill",      label: "Min Bill Discount", icon: BadgePercent },
] as const;

type OfferType = "buy_x_get_y" | "percentage" | "fixed_amount" | "min_bill";

const TYPE_LABELS: Record<OfferType, string> = {
  buy_x_get_y:  "Buy X Get Y",
  percentage:   "% Discount",
  fixed_amount: "Fixed Off",
  min_bill:     "Min Bill",
};

const TYPE_COLORS: Record<OfferType, string> = {
  buy_x_get_y:  "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  percentage:   "bg-amber-500/15 text-amber-400 border-amber-500/25",
  fixed_amount: "bg-blue-500/15 text-blue-400 border-blue-500/25",
  min_bill:     "bg-purple-500/15 text-purple-400 border-purple-500/25",
};

function describeOffer(offer: Offer): string {
  const p = offer.params as Record<string, number>;
  switch (offer.type as OfferType) {
    case "buy_x_get_y":
      return `Buy ${p.buyQty ?? "?"}, Get ${p.getQty ?? "?"} Free`;
    case "percentage":
      return `${p.percentage ?? "?"}% off`;
    case "fixed_amount":
      return `₹${p.amount ?? "?"} off`;
    case "min_bill":
      return `₹${p.discountAmount ?? "?"} off on bills ≥ ₹${p.minBill ?? "?"}`;
    default:
      return offer.type;
  }
}

type FormState = {
  name: string;
  type: OfferType;
  buyQty: string;
  getQty: string;
  percentage: string;
  amount: string;
  minBill: string;
  discountAmount: string;
  startDate: string;
  endDate: string;
  active: boolean;
};

const defaultForm = (): FormState => ({
  name: "", type: "percentage",
  buyQty: "2", getQty: "1",
  percentage: "10",
  amount: "50",
  minBill: "500", discountAmount: "50",
  startDate: "", endDate: "",
  active: true,
});

function buildParams(f: FormState): Record<string, number> {
  switch (f.type) {
    case "buy_x_get_y":  return { buyQty: Number(f.buyQty), getQty: Number(f.getQty) };
    case "percentage":   return { percentage: Number(f.percentage) };
    case "fixed_amount": return { amount: Number(f.amount) };
    case "min_bill":     return { minBill: Number(f.minBill), discountAmount: Number(f.discountAmount) };
  }
}

function formFromOffer(o: Offer): FormState {
  const p = o.params as Record<string, number>;
  return {
    name: o.name,
    type: o.type as OfferType,
    buyQty:         String(p.buyQty ?? "2"),
    getQty:         String(p.getQty ?? "1"),
    percentage:     String(p.percentage ?? "10"),
    amount:         String(p.amount ?? "50"),
    minBill:        String(p.minBill ?? "500"),
    discountAmount: String(p.discountAmount ?? "50"),
    startDate: o.startDate ? o.startDate.slice(0, 10) : "",
    endDate:   o.endDate   ? o.endDate.slice(0, 10)   : "",
    active: o.active,
  };
}

export default function Offers() {
  const qc = useQueryClient();
  const { data: offers = [], isLoading } = useListOffers();
  const createOffer = useCreateOffer();
  const updateOffer = useUpdateOffer();
  const deleteOffer = useDeleteOffer();
  const toggleOffer = useToggleOffer();

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Offer | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const openCreate = () => { setEditing(null); setForm(defaultForm()); setShowModal(true); };
  const openEdit   = (o: Offer) => { setEditing(o); setForm(formFromOffer(o)); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditing(null); };

  const invalidate = () => qc.invalidateQueries({ queryKey: getListOffersQueryKey() });

  const handleSave = () => {
    const payload = {
      name:      form.name.trim(),
      type:      form.type,
      params:    buildParams(form),
      startDate: form.startDate || null,
      endDate:   form.endDate   || null,
      active:    form.active,
    };
    if (!payload.name) return;
    if (editing) {
      updateOffer.mutate({ id: editing.id, data: payload }, {
        onSuccess: () => { invalidate(); closeModal(); },
      });
    } else {
      createOffer.mutate({ data: payload }, {
        onSuccess: () => { invalidate(); closeModal(); },
      });
    }
  };

  const handleToggle = (id: number) => {
    toggleOffer.mutate({ id }, { onSuccess: () => invalidate() });
  };

  const handleDelete = (id: number) => {
    deleteOffer.mutate({ id }, {
      onSuccess: () => { invalidate(); setConfirmDelete(null); },
    });
  };

  const set = (key: keyof FormState, val: string | boolean) =>
    setForm(f => ({ ...f, [key]: val }));

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Tag size={20} className="text-primary" /> Offers
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage promotional offers and discounts</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all">
          <Plus size={15} /> New Offer
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : offers.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Gift size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No offers yet. Create your first offer!</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {offers.map(offer => (
            <div key={offer.id} className={cn(
              "bg-card border rounded-xl p-4 space-y-3 transition-all",
              offer.active ? "border-card-border" : "border-border/40 opacity-60"
            )}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground truncate">{offer.name}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{describeOffer(offer)}</p>
                </div>
                <span className={cn(
                  "shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border",
                  TYPE_COLORS[offer.type as OfferType] ?? "bg-secondary text-muted-foreground"
                )}>
                  {TYPE_LABELS[offer.type as OfferType] ?? offer.type}
                </span>
              </div>

              {(offer.startDate || offer.endDate) && (
                <p className="text-xs text-muted-foreground">
                  {offer.startDate ? offer.startDate.slice(0, 10) : "—"} → {offer.endDate ? offer.endDate.slice(0, 10) : "ongoing"}
                </p>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button onClick={() => handleToggle(offer.id)}
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors",
                    offer.active
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20"
                      : "bg-secondary text-muted-foreground border-transparent hover:border-border"
                  )}>
                  {offer.active ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                  {offer.active ? "Active" : "Inactive"}
                </button>
                <div className="flex-1" />
                <button onClick={() => openEdit(offer)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <Pencil size={14} />
                </button>
                <button onClick={() => setConfirmDelete(offer.id)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-card border border-card-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-base font-bold text-foreground">{editing ? "Edit Offer" : "New Offer"}</h2>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground p-1">✕</button>
            </div>
            <div className="px-5 py-4 space-y-4 max-h-[75vh] overflow-y-auto">

              {/* Name */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Offer Name</label>
                <input value={form.name} onChange={e => set("name", e.target.value)}
                  placeholder="e.g. Weekend 10% Off"
                  className="w-full bg-background border border-input rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>

              {/* Type */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Offer Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {OFFER_TYPES.map(({ value, label, icon: Icon }) => (
                    <button key={value} onClick={() => set("type", value)}
                      className={cn("flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors text-left",
                        form.type === value
                          ? "bg-primary/15 border-primary/50 text-primary"
                          : "bg-secondary border-transparent text-muted-foreground hover:border-border")}>
                      <Icon size={14} /> {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic params */}
              <div className="bg-secondary/50 rounded-xl p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Parameters</p>

                {form.type === "buy_x_get_y" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Buy Qty</label>
                      <input type="number" min="1" value={form.buyQty} onChange={e => set("buyQty", e.target.value)}
                        className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Get Free</label>
                      <input type="number" min="1" value={form.getQty} onChange={e => set("getQty", e.target.value)}
                        className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>
                  </div>
                )}

                {form.type === "percentage" && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Discount %</label>
                    <div className="relative">
                      <input type="number" min="1" max="100" value={form.percentage} onChange={e => set("percentage", e.target.value)}
                        className="w-full bg-background border border-input rounded-lg px-3 pr-8 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                    </div>
                  </div>
                )}

                {form.type === "fixed_amount" && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Discount Amount (₹)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                      <input type="number" min="1" value={form.amount} onChange={e => set("amount", e.target.value)}
                        className="w-full bg-background border border-input rounded-lg pl-7 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                    </div>
                  </div>
                )}

                {form.type === "min_bill" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Min Bill (₹)</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">₹</span>
                        <input type="number" min="0" value={form.minBill} onChange={e => set("minBill", e.target.value)}
                          className="w-full bg-background border border-input rounded-lg pl-6 pr-2 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Discount (₹)</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">₹</span>
                        <input type="number" min="0" value={form.discountAmount} onChange={e => set("discountAmount", e.target.value)}
                          className="w-full bg-background border border-input rounded-lg pl-6 pr-2 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Start Date (optional)</label>
                  <input type="date" value={form.startDate} onChange={e => set("startDate", e.target.value)}
                    className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">End Date (optional)</label>
                  <input type="date" value={form.endDate} onChange={e => set("endDate", e.target.value)}
                    className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              </div>

              {/* Active toggle */}
              <label className="flex items-center gap-3 cursor-pointer py-1">
                <input type="checkbox" checked={form.active} onChange={e => set("active", e.target.checked)}
                  className="w-4 h-4 rounded accent-primary" />
                <span className="text-sm text-foreground font-medium">Active (available to apply on orders)</span>
              </label>
            </div>

            <div className="px-5 py-4 border-t border-border flex gap-2">
              <button onClick={closeModal}
                className="flex-1 py-2.5 rounded-xl bg-secondary text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
                Cancel
              </button>
              <button onClick={handleSave}
                disabled={!form.name.trim() || createOffer.isPending || updateOffer.isPending}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 disabled:opacity-40 transition-all">
                {(createOffer.isPending || updateOffer.isPending) ? "Saving…" : editing ? "Save Changes" : "Create Offer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmDelete !== null && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-card border border-card-border rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center space-y-4">
            <Trash2 size={32} className="text-destructive mx-auto" />
            <div>
              <p className="font-bold text-foreground">Delete this offer?</p>
              <p className="text-sm text-muted-foreground mt-1">This action cannot be undone.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-xl bg-secondary text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">
                Cancel
              </button>
              <button onClick={() => handleDelete(confirmDelete)}
                disabled={deleteOffer.isPending}
                className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-all">
                {deleteOffer.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
