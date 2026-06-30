import { useState } from "react";
import {
  useListCategories,
  useListProducts,
  useCreateCategory,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useUpdateCategory,
  useDeleteCategory,
  getListCategoriesQueryKey,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

function VegDot({ isVeg, size = "md" }: { isVeg: boolean; size?: "sm" | "md" }) {
  const s = size === "sm" ? "w-2.5 h-2.5" : "w-3.5 h-3.5";
  return (
    <span
      title={isVeg ? "Vegetarian" : "Non-Vegetarian"}
      className={cn(
        "rounded-sm border-2 shrink-0 inline-flex items-center justify-center",
        s,
        isVeg ? "border-green-500 bg-green-500/20" : "border-red-500 bg-red-500/20"
      )}
    >
      <span className={cn("rounded-full", size === "sm" ? "w-1 h-1" : "w-1.5 h-1.5", isVeg ? "bg-green-500" : "bg-red-500")} />
    </span>
  );
}

export default function MenuManager() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"products" | "categories">("products");
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);

  const { data: categories = [] } = useListCategories();
  const { data: products = [] } = useListProducts({}, { query: { queryKey: getListProductsQueryKey({}) } });

  const createCategory = useCreateCategory();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [catForm, setCatForm] = useState({ name: "", displayOrder: "0" });
  const [prodForm, setProdForm] = useState({ name: "", categoryId: "", price: "", description: "", active: true, isVeg: true });

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    createCategory.mutate({ data: { name: catForm.name, displayOrder: parseInt(catForm.displayOrder) || 0 } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
        setCatForm({ name: "", displayOrder: "0" });
        setShowAddCategory(false);
      },
    });
  };

  const handleAddProduct = (e: React.FormEvent) => {
    e.preventDefault();
    createProduct.mutate({
      data: {
        name: prodForm.name,
        categoryId: prodForm.categoryId ? parseInt(prodForm.categoryId) : null,
        price: parseFloat(prodForm.price),
        description: prodForm.description || undefined,
        active: prodForm.active,
        isVeg: prodForm.isVeg,
      },
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListProductsQueryKey({}) });
        setProdForm({ name: "", categoryId: "", price: "", description: "", active: true, isVeg: true });
        setShowAddProduct(false);
      },
    });
  };

  const toggleProduct = (id: number, active: boolean) => {
    updateProduct.mutate({ id, data: { active: !active } }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: getListProductsQueryKey({}) }),
    });
  };

  const toggleVeg = (id: number, isVeg: boolean) => {
    updateProduct.mutate({ id, data: { isVeg: !isVeg } }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: getListProductsQueryKey({}) }),
    });
  };

  const toggleCategory = (id: number, active: boolean) => {
    updateCategory.mutate({ id, data: { active: !active } }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: getListCategoriesQueryKey() }),
    });
  };

  const handleDeleteProduct = (id: number) => {
    deleteProduct.mutate({ id }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: getListProductsQueryKey({}) }),
    });
  };

  const handleDeleteCategory = (id: number) => {
    deleteCategory.mutate({ id }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: getListCategoriesQueryKey() }),
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Menu Manager</h1>
          <p className="text-sm text-muted-foreground">Manage products and categories</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-0">
        {(["products", "categories"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium capitalize border-b-2 -mb-px transition-colors",
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab} ({tab === "products" ? products.length : categories.length})
          </button>
        ))}
      </div>

      {/* Products tab */}
      {activeTab === "products" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowAddProduct(!showAddProduct)}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90"
            >
              <Plus size={14} /> Add Product
            </button>
          </div>

          {showAddProduct && (
            <form onSubmit={handleAddProduct} className="bg-card border border-card-border rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground">New Product</h3>
                <button type="button" onClick={() => setShowAddProduct(false)} className="text-muted-foreground hover:text-foreground">
                  <X size={16} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <input
                    required
                    type="text"
                    placeholder="Product name *"
                    value={prodForm.name}
                    onChange={e => setProdForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full bg-background border border-input rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Price"
                    value={prodForm.price}
                    onChange={e => setProdForm(f => ({ ...f, price: e.target.value }))}
                    className="w-full bg-background border border-input rounded-lg pl-7 pr-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <select
                  value={prodForm.categoryId}
                  onChange={e => setProdForm(f => ({ ...f, categoryId: e.target.value }))}
                  className="bg-background border border-input rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">No category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <div className="col-span-2">
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={prodForm.description}
                    onChange={e => setProdForm(f => ({ ...f, description: e.target.value }))}
                    className="w-full bg-background border border-input rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                {/* Veg / Non-Veg toggle */}
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground mb-1.5">Food type</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setProdForm(f => ({ ...f, isVeg: true }))}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors",
                        prodForm.isVeg
                          ? "bg-green-500/15 border-green-500/50 text-green-400"
                          : "bg-secondary border-transparent text-muted-foreground hover:border-border"
                      )}
                    >
                      <VegDot isVeg={true} size="sm" /> Veg
                    </button>
                    <button
                      type="button"
                      onClick={() => setProdForm(f => ({ ...f, isVeg: false }))}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors",
                        !prodForm.isVeg
                          ? "bg-red-500/15 border-red-500/50 text-red-400"
                          : "bg-secondary border-transparent text-muted-foreground hover:border-border"
                      )}
                    >
                      <VegDot isVeg={false} size="sm" /> Non-Veg
                    </button>
                  </div>
                </div>
              </div>
              <button
                type="submit"
                disabled={createProduct.isPending}
                className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {createProduct.isPending ? "Adding..." : "Add Product"}
              </button>
            </form>
          )}

          <div className="space-y-2">
            {products.length === 0 && (
              <p className="text-center py-8 text-muted-foreground text-sm">No products yet. Add your first item!</p>
            )}
            {products.map(p => (
              <div
                key={p.id}
                className={cn(
                  "bg-card border border-card-border rounded-xl px-4 py-3.5 flex items-center gap-4",
                  !p.active && "opacity-50"
                )}
              >
                {/* Veg dot — clickable to toggle */}
                <button
                  onClick={() => toggleVeg(p.id, p.isVeg)}
                  title={`${p.isVeg ? "Veg" : "Non-Veg"} — click to toggle`}
                  className="shrink-0 hover:scale-110 transition-transform"
                >
                  <VegDot isVeg={p.isVeg} />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground">{p.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {p.categoryName && (
                      <span className="text-xs px-2 py-0.5 bg-primary/15 text-primary rounded-full">{p.categoryName}</span>
                    )}
                    {p.description && <span className="text-xs text-muted-foreground truncate">{p.description}</span>}
                  </div>
                </div>
                <span className="text-primary font-bold text-base shrink-0">{formatCurrency(p.price)}</span>
                <button onClick={() => toggleProduct(p.id, p.active)} className="shrink-0 text-muted-foreground hover:text-primary">
                  {p.active ? <ToggleRight size={22} className="text-primary" /> : <ToggleLeft size={22} />}
                </button>
                <button onClick={() => handleDeleteProduct(p.id)} className="shrink-0 text-muted-foreground hover:text-destructive">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Categories tab */}
      {activeTab === "categories" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowAddCategory(!showAddCategory)}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90"
            >
              <Plus size={14} /> Add Category
            </button>
          </div>

          {showAddCategory && (
            <form onSubmit={handleAddCategory} className="bg-card border border-card-border rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground">New Category</h3>
                <button type="button" onClick={() => setShowAddCategory(false)} className="text-muted-foreground hover:text-foreground">
                  <X size={16} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  required
                  type="text"
                  placeholder="Category name *"
                  value={catForm.name}
                  onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))}
                  className="bg-background border border-input rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  type="number"
                  placeholder="Display order"
                  value={catForm.displayOrder}
                  onChange={e => setCatForm(f => ({ ...f, displayOrder: e.target.value }))}
                  className="bg-background border border-input rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <button
                type="submit"
                disabled={createCategory.isPending}
                className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {createCategory.isPending ? "Adding..." : "Add Category"}
              </button>
            </form>
          )}

          <div className="space-y-2">
            {categories.length === 0 && (
              <p className="text-center py-8 text-muted-foreground text-sm">No categories yet</p>
            )}
            {categories.map(c => (
              <div key={c.id} className={cn("bg-card border border-card-border rounded-xl px-4 py-3.5 flex items-center gap-4", !c.active && "opacity-60")}>
                <div className="flex-1">
                  <p className="font-semibold text-sm text-foreground">{c.name}</p>
                  <p className="text-xs text-muted-foreground">Order: {c.displayOrder} · {c.active ? "Active" : "Inactive"}</p>
                </div>
                <button onClick={() => toggleCategory(c.id, c.active)} className="shrink-0 text-muted-foreground hover:text-primary">
                  {c.active ? <ToggleRight size={22} className="text-primary" /> : <ToggleLeft size={22} />}
                </button>
                <button onClick={() => handleDeleteCategory(c.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
