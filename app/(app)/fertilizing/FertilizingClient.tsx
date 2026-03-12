"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type FertClient = {
  id: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
};

type FertProperty = {
  id: string;
  client_id: string;
  property_name: string;
  address_line_1: string;
  address_line_2: string | null;
  city: string;
  state: string;
  postal_code: string;
  lawn_sqft: number | string;
  lawn_acres: number | string;
  property_type: "Residential" | "Commercial";
  gate_present: boolean;
  locked_gate: boolean;
  pets_present: boolean;
  created_at: string;
};

type FertProduct = {
  id: string;
  name: string;
  default_unit: string;
  default_target_pest: string | null;
  default_application_rate: string | null;
  epa_registration_number: string | null;
  default_reentry_interval_ppe_notes: string | null;
  active: boolean;
};

type FertServiceRecord = {
  id: string;
  property_id: string;
  applicator_name: string | null;
  applicator_license_number: string | null;
  service_date: string | null;
  created_at: string;
};

type ChemicalDraft = {
  localId: string;
  productId: string;
  chemicalName: string;
  epaRegistrationNumber: string;
  batchLotNumber: string;
  concentration: string;
  targetPest: string;
  totalApplied: string;
  units: string;
  applicationAreaSqft: string;
  applicationRate: string;
  reentryIntervalPpeNotes: string;
};

type Props = {
  fullName: string;
  userId: string;
};

const ACRE_TO_SQFT = 43_560;

function asNullable(value: string) {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function fullName(client: FertClient) {
  const first = (client.first_name ?? "").trim();
  const middle = (client.middle_name ?? "").trim();
  const last = (client.last_name ?? "").trim();
  return [first, middle, last].filter(Boolean).join(" ");
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function fmtDateOnly(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function emptyChemicalDraft(): ChemicalDraft {
  return {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    productId: "",
    chemicalName: "",
    epaRegistrationNumber: "",
    batchLotNumber: "",
    concentration: "",
    targetPest: "",
    totalApplied: "",
    units: "",
    applicationAreaSqft: "",
    applicationRate: "",
    reentryIntervalPpeNotes: "",
  };
}

export default function FertilizingClient({ fullName: signedInName, userId }: Props) {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [clients, setClients] = useState<FertClient[]>([]);
  const [properties, setProperties] = useState<FertProperty[]>([]);
  const [products, setProducts] = useState<FertProduct[]>([]);
  const [serviceRecords, setServiceRecords] = useState<FertServiceRecord[]>([]);

  const [search, setSearch] = useState("");
  const [propertyTypeFilter, setPropertyTypeFilter] = useState<"all" | "Residential" | "Commercial">("all");

  const [clientFirstName, setClientFirstName] = useState("");
  const [clientMiddleName, setClientMiddleName] = useState("");
  const [clientLastName, setClientLastName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");

  const [propertyClientId, setPropertyClientId] = useState("");
  const [propertyName, setPropertyName] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("WI");
  const [postalCode, setPostalCode] = useState("");
  const [lawnEntryMode, setLawnEntryMode] = useState<"sqft" | "acres">("sqft");
  const [lawnEntryValue, setLawnEntryValue] = useState("");
  const [propertyType, setPropertyType] = useState<"Residential" | "Commercial">("Residential");
  const [gatePresent, setGatePresent] = useState(false);
  const [lockedGate, setLockedGate] = useState(false);
  const [petsPresent, setPetsPresent] = useState(false);

  const [servicePropertyId, setServicePropertyId] = useState("");
  const [applicatorName, setApplicatorName] = useState(signedInName);
  const [applicatorLicense, setApplicatorLicense] = useState("");
  const [serviceDate, setServiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [signatureMode, setSignatureMode] = useState<"typed" | "drawn">("typed");
  const [typedSignature, setTypedSignature] = useState("");
  const [drawnSignatureData, setDrawnSignatureData] = useState("");
  const [chemicals, setChemicals] = useState<ChemicalDraft[]>([emptyChemicalDraft()]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [clientsRes, propertiesRes, productsRes, serviceRes] = await Promise.all([
        supabase
          .from("fert_clients")
          .select("id,first_name,middle_name,last_name,phone,email,created_at")
          .order("last_name", { ascending: true }),
        supabase
          .from("fert_properties")
          .select(
            "id,client_id,property_name,address_line_1,address_line_2,city,state,postal_code,lawn_sqft,lawn_acres,property_type,gate_present,locked_gate,pets_present,created_at"
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("fert_products")
          .select(
            "id,name,default_unit,default_target_pest,default_application_rate,epa_registration_number,default_reentry_interval_ppe_notes,active"
          )
          .eq("active", true)
          .order("name", { ascending: true }),
        supabase
          .from("fert_service_records")
          .select("id,property_id,applicator_name,applicator_license_number,service_date,created_at")
          .order("created_at", { ascending: false })
          .limit(30),
      ]);

      const firstError = clientsRes.error || propertiesRes.error || productsRes.error || serviceRes.error;
      if (firstError) {
        if (firstError.message.toLowerCase().includes("does not exist")) {
          throw new Error("Fertilizing tables are not deployed yet. Run `npx supabase db push --linked`.");
        }
        throw firstError;
      }

      setClients((clientsRes.data ?? []) as FertClient[]);
      setProperties((propertiesRes.data ?? []) as FertProperty[]);
      setProducts((productsRes.data ?? []) as FertProduct[]);
      setServiceRecords((serviceRes.data ?? []) as FertServiceRecord[]);

      const defaultClientId = ((clientsRes.data ?? []) as FertClient[])[0]?.id ?? "";
      if (defaultClientId) {
        setPropertyClientId((prev) => prev || defaultClientId);
      }
      const defaultPropertyId = ((propertiesRes.data ?? []) as FertProperty[])[0]?.id ?? "";
      if (defaultPropertyId) {
        setServicePropertyId((prev) => prev || defaultPropertyId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load fertilizing data.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const propertiesByClient = useMemo(() => {
    const grouped = new Map<string, FertProperty[]>();
    for (const row of properties) {
      const list = grouped.get(row.client_id) ?? [];
      list.push(row);
      grouped.set(row.client_id, list);
    }
    return grouped;
  }, [properties]);

  const propertyById = useMemo(() => {
    const map = new Map<string, FertProperty>();
    for (const row of properties) map.set(row.id, row);
    return map;
  }, [properties]);

  const clientById = useMemo(() => {
    const map = new Map<string, FertClient>();
    for (const row of clients) map.set(row.id, row);
    return map;
  }, [clients]);

  const filteredClients = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return clients.filter((client) => {
      const ownedProperties = propertiesByClient.get(client.id) ?? [];
      const matchesType =
        propertyTypeFilter === "all" ||
        ownedProperties.some((property) => property.property_type === propertyTypeFilter);
      if (!matchesType) return false;
      if (!needle) return true;

      const clientText = [
        client.first_name,
        client.middle_name,
        client.last_name,
        client.email,
        client.phone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (clientText.includes(needle)) return true;

      for (const property of ownedProperties) {
        const propertyText = [
          property.property_name,
          property.address_line_1,
          property.address_line_2,
          property.city,
          property.state,
          property.postal_code,
          property.property_type,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (propertyText.includes(needle)) return true;
      }
      return false;
    });
  }, [clients, propertiesByClient, propertyTypeFilter, search]);

  async function addClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const first = clientFirstName.trim();
      const last = clientLastName.trim();
      if (!first || !last) throw new Error("Client first and last name are required.");

      const { data, error: insertError } = await supabase
        .from("fert_clients")
        .insert({
          first_name: first,
          middle_name: asNullable(clientMiddleName),
          last_name: last,
          phone: asNullable(clientPhone),
          email: asNullable(clientEmail),
        })
        .select("id")
        .single();
      if (insertError) throw insertError;

      setClientFirstName("");
      setClientMiddleName("");
      setClientLastName("");
      setClientPhone("");
      setClientEmail("");
      setPropertyClientId((data?.id as string | undefined) ?? "");
      setSuccess("Client added.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add client.");
    } finally {
      setSaving(false);
    }
  }

  async function addProperty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const clientId = propertyClientId.trim();
      if (!clientId) throw new Error("Select a client.");

      const numericLawn = Number(lawnEntryValue);
      if (!Number.isFinite(numericLawn) || numericLawn <= 0) {
        throw new Error("Lawn size must be a positive number.");
      }

      const lawnSqft = lawnEntryMode === "sqft" ? numericLawn : numericLawn * ACRE_TO_SQFT;
      const lawnAcres = lawnEntryMode === "acres" ? numericLawn : numericLawn / ACRE_TO_SQFT;

      const { error: insertError } = await supabase.from("fert_properties").insert({
        client_id: clientId,
        property_name: propertyName.trim(),
        address_line_1: address1.trim(),
        address_line_2: asNullable(address2),
        city: city.trim(),
        state: stateCode.trim().toUpperCase(),
        postal_code: postalCode.trim(),
        lawn_sqft: lawnSqft,
        lawn_acres: lawnAcres,
        property_type: propertyType,
        gate_present: gatePresent,
        locked_gate: gatePresent ? lockedGate : false,
        pets_present: petsPresent,
      });
      if (insertError) throw insertError;

      setPropertyName("");
      setAddress1("");
      setAddress2("");
      setCity("");
      setStateCode("WI");
      setPostalCode("");
      setLawnEntryMode("sqft");
      setLawnEntryValue("");
      setPropertyType("Residential");
      setGatePresent(false);
      setLockedGate(false);
      setPetsPresent(false);
      setSuccess("Property added.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add property.");
    } finally {
      setSaving(false);
    }
  }

  function updateChemical(index: number, patch: Partial<ChemicalDraft>) {
    setChemicals((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        return { ...row, ...patch };
      })
    );
  }

  function setChemicalProduct(index: number, productId: string) {
    const selectedProduct = products.find((row) => row.id === productId);
    updateChemical(index, {
      productId,
      chemicalName: selectedProduct?.name ?? "",
      epaRegistrationNumber: selectedProduct?.epa_registration_number ?? "",
      targetPest: selectedProduct?.default_target_pest ?? "",
      units: selectedProduct?.default_unit ?? "",
      applicationRate: selectedProduct?.default_application_rate ?? "",
      reentryIntervalPpeNotes: selectedProduct?.default_reentry_interval_ppe_notes ?? "",
    });
  }

  async function submitServiceRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const propertyId = servicePropertyId.trim();
      if (!propertyId) throw new Error("Select a property.");

      const cleanedChemicals = chemicals
        .map((row) => ({
          ...row,
          chemicalName: row.chemicalName.trim(),
          epaRegistrationNumber: row.epaRegistrationNumber.trim(),
          batchLotNumber: row.batchLotNumber.trim(),
          concentration: row.concentration.trim(),
          targetPest: row.targetPest.trim(),
          units: row.units.trim(),
          applicationRate: row.applicationRate.trim(),
          reentryIntervalPpeNotes: row.reentryIntervalPpeNotes.trim(),
        }))
        .filter((row) => row.chemicalName.length > 0);
      if (!cleanedChemicals.length) throw new Error("Add at least one chemical.");

      if (signatureMode === "typed" && !typedSignature.trim()) {
        throw new Error("Typed legal signature is required.");
      }
      if (signatureMode === "drawn" && !drawnSignatureData.trim()) {
        throw new Error("Drawn signature data is required.");
      }

      const { data: recordData, error: recordError } = await supabase
        .from("fert_service_records")
        .insert({
          property_id: propertyId,
          applicator_id: userId,
          applicator_name: asNullable(applicatorName),
          applicator_license_number: asNullable(applicatorLicense),
          service_date: asNullable(serviceDate),
          start_time: asNullable(startTime),
          end_time: asNullable(endTime),
          signature_mode: signatureMode,
          typed_legal_signature: signatureMode === "typed" ? typedSignature.trim() : null,
          signature_drawn_data: signatureMode === "drawn" ? drawnSignatureData.trim() : null,
        })
        .select("id")
        .single();
      if (recordError) throw recordError;

      const serviceRecordId = recordData?.id as string;
      const chemicalRows = cleanedChemicals.map((row) => ({
        service_record_id: serviceRecordId,
        product_id: asNullable(row.productId),
        chemical_name: row.chemicalName,
        epa_registration_number: asNullable(row.epaRegistrationNumber),
        batch_lot_number: asNullable(row.batchLotNumber),
        concentration: asNullable(row.concentration),
        target_pest: asNullable(row.targetPest),
        total_applied: numberOrNull(row.totalApplied),
        units: asNullable(row.units),
        application_area_sqft: numberOrNull(row.applicationAreaSqft),
        application_rate: asNullable(row.applicationRate),
        reentry_interval_ppe_notes: asNullable(row.reentryIntervalPpeNotes),
      }));

      const { error: chemError } = await supabase.from("fert_service_chemicals").insert(chemicalRows);
      if (chemError) throw chemError;

      setChemicals([emptyChemicalDraft()]);
      setTypedSignature("");
      setDrawnSignatureData("");
      setSuccess("Chemical tracking record submitted.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit service record.");
    } finally {
      setSaving(false);
    }
  }

  const summary = useMemo(() => {
    const residential = properties.filter((row) => row.property_type === "Residential").length;
    const commercial = properties.filter((row) => row.property_type === "Commercial").length;
    return {
      clients: clients.length,
      properties: properties.length,
      residential,
      commercial,
      services: serviceRecords.length,
    };
  }, [clients, properties, serviceRecords]);

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", paddingBottom: 28 }}>
      <section style={cardStyle}>
        <h1 style={{ margin: 0 }}>Fertilizing Operations Dashboard</h1>
        <p style={{ marginTop: 8, opacity: 0.84 }}>
          Phase 1: client/property tracking with compliance-ready chemical tracking fields.
        </p>

        <div style={statsGridStyle}>
          <div style={statCardStyle}>
            <div style={statLabelStyle}>Clients</div>
            <div style={statValueStyle}>{summary.clients}</div>
          </div>
          <div style={statCardStyle}>
            <div style={statLabelStyle}>Properties</div>
            <div style={statValueStyle}>{summary.properties}</div>
          </div>
          <div style={statCardStyle}>
            <div style={statLabelStyle}>Residential</div>
            <div style={statValueStyle}>{summary.residential}</div>
          </div>
          <div style={statCardStyle}>
            <div style={statLabelStyle}>Commercial</div>
            <div style={statValueStyle}>{summary.commercial}</div>
          </div>
          <div style={statCardStyle}>
            <div style={statLabelStyle}>Recent Services</div>
            <div style={statValueStyle}>{summary.services}</div>
          </div>
        </div>
      </section>

      {error ? <div style={errorStyle}>{error}</div> : null}
      {success ? <div style={successStyle}>{success}</div> : null}

      <section style={gridTwoStyle}>
        <form style={cardStyle} onSubmit={addClient}>
          <h2 style={h2Style}>Add Client</h2>
          <div style={fieldGridStyle}>
            <label style={labelStyle}>
              First Name
              <input value={clientFirstName} onChange={(e) => setClientFirstName(e.target.value)} style={inputStyle} required />
            </label>
            <label style={labelStyle}>
              Middle Name
              <input value={clientMiddleName} onChange={(e) => setClientMiddleName(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Last Name
              <input value={clientLastName} onChange={(e) => setClientLastName(e.target.value)} style={inputStyle} required />
            </label>
            <label style={labelStyle}>
              Phone
              <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Email
              <input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} style={inputStyle} type="email" />
            </label>
          </div>
          <button type="submit" style={buttonPrimaryStyle} disabled={saving}>
            {saving ? "Saving..." : "Add Client"}
          </button>
        </form>

        <form style={cardStyle} onSubmit={addProperty}>
          <h2 style={h2Style}>Add Property</h2>
          <div style={fieldGridStyle}>
            <label style={labelStyle}>
              Client
              <select value={propertyClientId} onChange={(e) => setPropertyClientId(e.target.value)} style={inputStyle} required>
                <option value="">Select client</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {fullName(client)}
                  </option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              Property Name
              <input value={propertyName} onChange={(e) => setPropertyName(e.target.value)} style={inputStyle} required />
            </label>
            <label style={labelStyle}>
              Address Line 1
              <input value={address1} onChange={(e) => setAddress1(e.target.value)} style={inputStyle} required />
            </label>
            <label style={labelStyle}>
              Address Line 2
              <input value={address2} onChange={(e) => setAddress2(e.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              City
              <input value={city} onChange={(e) => setCity(e.target.value)} style={inputStyle} required />
            </label>
            <label style={labelStyle}>
              State
              <input value={stateCode} onChange={(e) => setStateCode(e.target.value.toUpperCase())} style={inputStyle} required />
            </label>
            <label style={labelStyle}>
              Postal Code
              <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} style={inputStyle} required />
            </label>
            <label style={labelStyle}>
              Lawn Entry Mode
              <select value={lawnEntryMode} onChange={(e) => setLawnEntryMode(e.target.value as "sqft" | "acres")} style={inputStyle}>
                <option value="sqft">Square Feet</option>
                <option value="acres">Acres</option>
              </select>
            </label>
            <label style={labelStyle}>
              Lawn Size ({lawnEntryMode === "sqft" ? "sqft" : "acres"})
              <input value={lawnEntryValue} onChange={(e) => setLawnEntryValue(e.target.value)} style={inputStyle} type="number" min="0" step="any" required />
            </label>
            <label style={labelStyle}>
              Property Type
              <select value={propertyType} onChange={(e) => setPropertyType(e.target.value as "Residential" | "Commercial")} style={inputStyle}>
                <option value="Residential">Residential</option>
                <option value="Commercial">Commercial</option>
              </select>
            </label>
            <label style={labelCheckStyle}>
              <input type="checkbox" checked={gatePresent} onChange={(e) => setGatePresent(e.target.checked)} />
              Gate Present
            </label>
            <label style={labelCheckStyle}>
              <input
                type="checkbox"
                checked={lockedGate}
                onChange={(e) => setLockedGate(e.target.checked)}
                disabled={!gatePresent}
              />
              Locked Gate
            </label>
            <label style={labelCheckStyle}>
              <input type="checkbox" checked={petsPresent} onChange={(e) => setPetsPresent(e.target.checked)} />
              Pets Present
            </label>
          </div>
          <button type="submit" style={buttonPrimaryStyle} disabled={saving}>
            {saving ? "Saving..." : "Add Property"}
          </button>
        </form>
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>Fertilizing Client List</h2>
        <div style={filterRowStyle}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client / property / address"
            style={{ ...inputStyle, minWidth: 260 }}
          />
          <select
            value={propertyTypeFilter}
            onChange={(e) => setPropertyTypeFilter(e.target.value as "all" | "Residential" | "Commercial")}
            style={inputStyle}
          >
            <option value="all">All Property Types</option>
            <option value="Residential">Residential</option>
            <option value="Commercial">Commercial</option>
          </select>
        </div>

        {loading ? <div style={{ opacity: 0.8 }}>Loading clients...</div> : null}

        <div style={clientListStyle}>
          {filteredClients.map((client) => {
            const ownedProperties = propertiesByClient.get(client.id) ?? [];
            return (
              <article key={client.id} style={clientCardStyle}>
                <div style={{ fontWeight: 800, fontSize: 17 }}>{fullName(client)}</div>
                <div style={{ opacity: 0.82, fontSize: 13, marginTop: 3 }}>
                  {client.email || "No email"} · {client.phone || "No phone"}
                </div>
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  {ownedProperties.length ? (
                    ownedProperties.map((property) => (
                      <div key={property.id} style={propertyItemStyle}>
                        <div style={{ fontWeight: 700 }}>
                          {property.property_name} · {property.property_type}
                        </div>
                        <div style={{ opacity: 0.82, fontSize: 13 }}>
                          {property.address_line_1}
                          {property.address_line_2 ? `, ${property.address_line_2}` : ""}
                          {`, ${property.city}, ${property.state} ${property.postal_code}`}
                        </div>
                        <div style={{ opacity: 0.82, fontSize: 12 }}>
                          {Number(property.lawn_sqft).toLocaleString()} sqft · {Number(property.lawn_acres).toFixed(3)} acres ·
                          Gate: {property.gate_present ? "Yes" : "No"} · Locked: {property.locked_gate ? "Yes" : "No"} · Pets:{" "}
                          {property.pets_present ? "Yes" : "No"}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ opacity: 0.74 }}>No properties linked yet.</div>
                  )}
                </div>
              </article>
            );
          })}
          {!loading && filteredClients.length === 0 ? (
            <div style={{ opacity: 0.8 }}>No matching clients found.</div>
          ) : null}
        </div>
      </section>

      <form style={cardStyle} onSubmit={submitServiceRecord}>
        <h2 style={h2Style}>Chemical Tracking Form (Phase 1)</h2>
        <div style={fieldGridStyle}>
          <label style={labelStyle}>
            Property
            <select value={servicePropertyId} onChange={(e) => setServicePropertyId(e.target.value)} style={inputStyle} required>
              <option value="">Select property</option>
              {properties.map((property) => {
                const client = clientById.get(property.client_id);
                const clientLabel = client ? fullName(client) : "Unknown client";
                return (
                  <option key={property.id} value={property.id}>
                    {property.property_name} · {clientLabel}
                  </option>
                );
              })}
            </select>
          </label>
          <label style={labelStyle}>
            Applicator Name
            <input value={applicatorName} onChange={(e) => setApplicatorName(e.target.value)} style={inputStyle} required />
          </label>
          <label style={labelStyle}>
            Applicator License #
            <input value={applicatorLicense} onChange={(e) => setApplicatorLicense(e.target.value)} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Service Date
            <input value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} style={inputStyle} type="date" />
          </label>
          <label style={labelStyle}>
            Start Time
            <input value={startTime} onChange={(e) => setStartTime(e.target.value)} style={inputStyle} type="time" />
          </label>
          <label style={labelStyle}>
            End Time
            <input value={endTime} onChange={(e) => setEndTime(e.target.value)} style={inputStyle} type="time" />
          </label>
          <label style={labelStyle}>
            Signature Mode
            <select value={signatureMode} onChange={(e) => setSignatureMode(e.target.value as "typed" | "drawn")} style={inputStyle}>
              <option value="typed">Typed legal signature</option>
              <option value="drawn">Drawn signature data</option>
            </select>
          </label>
          {signatureMode === "typed" ? (
            <label style={labelStyle}>
              Typed Legal Signature
              <input value={typedSignature} onChange={(e) => setTypedSignature(e.target.value)} style={inputStyle} required />
            </label>
          ) : (
            <label style={labelStyle}>
              Drawn Signature Data (Phase 1)
              <textarea
                value={drawnSignatureData}
                onChange={(e) => setDrawnSignatureData(e.target.value)}
                style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
                placeholder="Paste encoded signature payload"
                required
              />
            </label>
          )}
        </div>

        <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
          {chemicals.map((chemical, index) => (
            <div key={chemical.localId} style={chemicalCardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ fontWeight: 800 }}>Chemical #{index + 1}</div>
                {chemicals.length > 1 ? (
                  <button
                    type="button"
                    style={buttonGhostStyle}
                    onClick={() => setChemicals((prev) => prev.filter((row) => row.localId !== chemical.localId))}
                  >
                    Remove
                  </button>
                ) : null}
              </div>

              <div style={fieldGridStyle}>
                <label style={labelStyle}>
                  Product Template
                  <select
                    value={chemical.productId}
                    onChange={(e) => setChemicalProduct(index, e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">None (manual entry)</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={labelStyle}>
                  Chemical Name
                  <input
                    value={chemical.chemicalName}
                    onChange={(e) => updateChemical(index, { chemicalName: e.target.value })}
                    style={inputStyle}
                    required
                  />
                </label>
                <label style={labelStyle}>
                  EPA Registration #
                  <input
                    value={chemical.epaRegistrationNumber}
                    onChange={(e) => updateChemical(index, { epaRegistrationNumber: e.target.value })}
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Batch/Lot #
                  <input
                    value={chemical.batchLotNumber}
                    onChange={(e) => updateChemical(index, { batchLotNumber: e.target.value })}
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Concentration
                  <input
                    value={chemical.concentration}
                    onChange={(e) => updateChemical(index, { concentration: e.target.value })}
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Target Pest
                  <input
                    value={chemical.targetPest}
                    onChange={(e) => updateChemical(index, { targetPest: e.target.value })}
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Total Applied
                  <input
                    value={chemical.totalApplied}
                    onChange={(e) => updateChemical(index, { totalApplied: e.target.value })}
                    style={inputStyle}
                    type="number"
                    min="0"
                    step="any"
                  />
                </label>
                <label style={labelStyle}>
                  Units
                  <input
                    value={chemical.units}
                    onChange={(e) => updateChemical(index, { units: e.target.value })}
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Application Area (sqft)
                  <input
                    value={chemical.applicationAreaSqft}
                    onChange={(e) => updateChemical(index, { applicationAreaSqft: e.target.value })}
                    style={inputStyle}
                    type="number"
                    min="0"
                    step="any"
                    placeholder={servicePropertyId ? String(Number(propertyById.get(servicePropertyId)?.lawn_sqft ?? 0)) : ""}
                  />
                </label>
                <label style={labelStyle}>
                  Application Rate
                  <input
                    value={chemical.applicationRate}
                    onChange={(e) => updateChemical(index, { applicationRate: e.target.value })}
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  Re-entry Interval / PPE Notes
                  <textarea
                    value={chemical.reentryIntervalPpeNotes}
                    onChange={(e) => updateChemical(index, { reentryIntervalPpeNotes: e.target.value })}
                    style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" style={buttonGhostStyle} onClick={() => setChemicals((prev) => [...prev, emptyChemicalDraft()])}>
            Add Chemical
          </button>
          <button type="submit" style={buttonPrimaryStyle} disabled={saving}>
            {saving ? "Submitting..." : "Submit Chemical Tracking Form"}
          </button>
        </div>
      </form>

      <section style={cardStyle}>
        <h2 style={h2Style}>Recent Service Records</h2>
        <div style={{ display: "grid", gap: 8 }}>
          {serviceRecords.length ? (
            serviceRecords.map((row) => {
              const property = propertyById.get(row.property_id);
              const client = property ? clientById.get(property.client_id) : null;
              return (
                <div key={row.id} style={recordItemStyle}>
                  <div style={{ fontWeight: 700 }}>
                    {property?.property_name ?? row.property_id} · {client ? fullName(client) : "Unknown client"}
                  </div>
                  <div style={{ opacity: 0.82, fontSize: 13 }}>
                    Applicator: {row.applicator_name || "-"} · License: {row.applicator_license_number || "-"}
                  </div>
                  <div style={{ opacity: 0.82, fontSize: 13 }}>
                    Service Date: {fmtDateOnly(row.service_date)} · Created: {fmtDate(row.created_at)}
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ opacity: 0.8 }}>No service records yet.</div>
          )}
        </div>
      </section>
    </main>
  );
}

const cardStyle: CSSProperties = {
  border: "1px solid var(--surface-border)",
  borderRadius: 16,
  background: "var(--surface)",
  padding: 16,
  marginBottom: 14,
};

const statsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 10,
  marginTop: 12,
};

const statCardStyle: CSSProperties = {
  border: "1px solid var(--surface-border)",
  borderRadius: 12,
  padding: 10,
  background: "rgba(255,255,255,0.03)",
};

const statLabelStyle: CSSProperties = {
  opacity: 0.8,
  fontSize: 12,
  fontWeight: 700,
};

const statValueStyle: CSSProperties = {
  fontSize: 24,
  fontWeight: 900,
  lineHeight: 1.1,
  marginTop: 4,
};

const h2Style: CSSProperties = { marginTop: 0, marginBottom: 10 };

const gridTwoStyle: CSSProperties = {
  display: "grid",
  gap: 14,
  gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))",
};

const fieldGridStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  marginBottom: 12,
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  fontWeight: 700,
};

const labelCheckStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  fontSize: 13,
  fontWeight: 700,
  paddingTop: 22,
};

const inputStyle: CSSProperties = {
  borderRadius: 10,
  border: "1px solid var(--surface-border)",
  background: "var(--surface)",
  color: "inherit",
  padding: "10px 12px",
  font: "inherit",
};

const buttonPrimaryStyle: CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(60,170,110,0.75)",
  background: "linear-gradient(180deg, rgba(34,130,80,0.92), rgba(20,90,56,0.92))",
  color: "#f5fff8",
  padding: "10px 14px",
  fontWeight: 800,
  cursor: "pointer",
};

const buttonGhostStyle: CSSProperties = {
  borderRadius: 10,
  border: "1px solid var(--surface-border)",
  background: "rgba(255,255,255,0.03)",
  color: "inherit",
  padding: "9px 12px",
  fontWeight: 700,
  cursor: "pointer",
};

const filterRowStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 10,
};

const clientListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const clientCardStyle: CSSProperties = {
  border: "1px solid var(--surface-border)",
  borderRadius: 12,
  padding: 12,
  background: "rgba(255,255,255,0.02)",
};

const propertyItemStyle: CSSProperties = {
  border: "1px solid var(--surface-border)",
  borderRadius: 10,
  padding: 10,
  background: "rgba(255,255,255,0.015)",
};

const chemicalCardStyle: CSSProperties = {
  border: "1px solid var(--surface-border)",
  borderRadius: 12,
  padding: 12,
  background: "rgba(255,255,255,0.02)",
};

const recordItemStyle: CSSProperties = {
  border: "1px solid var(--surface-border)",
  borderRadius: 10,
  padding: 10,
  background: "rgba(255,255,255,0.02)",
};

const errorStyle: CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(255,120,120,0.6)",
  background: "rgba(140,20,20,0.32)",
  color: "#ffe3e3",
  padding: "10px 12px",
  marginBottom: 12,
  fontWeight: 700,
};

const successStyle: CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(80,180,120,0.6)",
  background: "rgba(20,120,70,0.28)",
  color: "#e4ffef",
  padding: "10px 12px",
  marginBottom: 12,
  fontWeight: 700,
};
