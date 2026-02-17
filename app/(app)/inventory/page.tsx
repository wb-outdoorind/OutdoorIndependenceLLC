"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type Role = "owner" | "office_admin" | "mechanic" | "employee";

type InventoryItemRow = {
  id: string;
  name: string;
  category: string | null;
  quantity: number;
  minimum_quantity: number;
  location_id: string | null;
  is_active: boolean;
};

type InventoryLocationRow = {
  id: string;
  name: string;
};

function canManageInventory(role: string | null | undefined) {
  return role === "owner" || role === "office_admin" || role === "mechanic";
}

function cardStyle(): React.CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 16,
    padding: 16,
    background: "rgba(255,255,255,0.03)",
  };
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    padding: 10,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.03)",
    color: "inherit",
  };
}

function badgeStyle(lowStock: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    border: lowStock
      ? "1px solid rgba(255,120,120,0.30)"
      : "1px solid rgba(0,255,120,0.22)",
    background: lowStock ? "rgba(255,120,120,0.10)" : "rgba(0,255,120,0.08)",
    fontWeight: 800,
  };
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItemRow[]>([]);
  const [locations, setLocations] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadData() {
      setLoading(true);
      setErrorMessage(null);

      const supabase = createSupabaseBrowser();

      const { data: authData } = await supabase.auth.getUser();
      if (authData.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", authData.user.id)
          .maybeSingle();
        if (alive) setRole((profile?.role as Role | undefined) ?? "employee");
      } else if (alive) {
        setRole(null);
      }

      const [itemsRes, locationsRes] = await Promise.all([
        supabase
          .from("inventory_items")
          .select("id,name,category,quantity,minimum_quantity,location_id,is_active")
          .eq("is_active", true)
          .order("name", { ascending: true }),
        supabase.from("inventory_locations").select("id,name").order("name", { ascending: true }),
      ]);

      if (!alive) return;
      if (itemsRes.error || locationsRes.error) {
        console.error("[inventory] load error:", {
          itemsError: itemsRes.error,
          locationsError: locationsRes.error,
        });
        setErrorMessage(itemsRes.error?.message || locationsRes.error?.message || "Failed to load inventory.");
        setItems([]);
        setLocations({});
        setLoading(false);
        return;
      }

      setItems((itemsRes.data ?? []) as InventoryItemRow[]);
      const locationMap: Record<string, string> = {};
      for (const row of ((locationsRes.data ?? []) as InventoryLocationRow[])) {
        locationMap[row.id] = row.name;
      }
      setLocations(locationMap);
      setLoading(false);
    }

    loadData();

    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;

    return items.filter((item) => {
      const hay = [item.name, item.category ?? ""].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [items, search]);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", paddingBottom: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Inventory</h1>
          <div style={{ marginTop: 6, opacity: 0.75 }}>
            Quantity tracking and stock levels by location.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or category"
            style={{ ...inputStyle(), width: 280 }}
          />

          <Link href="/inventory/locations" style={secondaryButtonStyle}>
            Locations
          </Link>
          <Link href="/inventory/alerts" style={secondaryButtonStyle}>
            Alerts
          </Link>
          <Link href="/inventory/reports" style={secondaryButtonStyle}>
            Reports
          </Link>
          <Link href="/inventory/ledger" style={secondaryButtonStyle}>
            Ledger
          </Link>
          <Link href="/inventory/transfers" style={secondaryButtonStyle}>
            Transfers
          </Link>
          <Link href="/inventory/trends" style={secondaryButtonStyle}>
            Trends
          </Link>

          {canManageInventory(role) ? (
            <Link href="/inventory/new" style={buttonStyle}>
              New Item
            </Link>
          ) : null}
        </div>
      </div>

      <div style={{ marginTop: 16, ...cardStyle() }}>
        {loading ? (
          <div style={{ opacity: 0.75 }}>Loading inventory...</div>
        ) : errorMessage ? (
          <div style={{ opacity: 0.9, color: "#ff9d9d" }}>{errorMessage}</div>
        ) : filtered.length === 0 ? (
          <div style={{ opacity: 0.75 }}>No inventory items found.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1.2fr 0.8fr 0.8fr 1.5fr 1fr",
                gap: 10,
                opacity: 0.7,
                fontSize: 12,
                padding: "0 4px",
              }}
            >
              <div>Name</div>
              <div>Category</div>
              <div>Quantity</div>
              <div>Minimum</div>
              <div>Location</div>
              <div>Status</div>
            </div>

            {filtered.map((item) => {
              const lowStock = item.quantity <= item.minimum_quantity;

              return (
                <Link
                  key={item.id}
                  href={`/inventory/${encodeURIComponent(item.id)}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div
                    style={{
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 14,
                      padding: 12,
                      background: "rgba(255,255,255,0.02)",
                      display: "grid",
                      gridTemplateColumns: "2fr 1.2fr 0.8fr 0.8fr 1.5fr 1fr",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>{item.name}</div>
                    <div style={{ opacity: 0.8 }}>{item.category ?? "-"}</div>
                    <div style={{ fontWeight: 800 }}>{item.quantity}</div>
                    <div style={{ opacity: 0.85 }}>{item.minimum_quantity}</div>
                    <div style={{ opacity: 0.85 }}>{item.location_id ? locations[item.location_id] ?? "-" : "-"}</div>
                    <div>
                      <span style={badgeStyle(lowStock)}>{lowStock ? "Low Stock" : "OK"}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "inherit",
  fontWeight: 900,
  textDecoration: "none",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "transparent",
  color: "inherit",
  fontWeight: 800,
  opacity: 0.9,
  textDecoration: "none",
};
