"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type VehicleRow = {
  id: string;
  name: string | null;
  type: string | null;
};

type EquipmentTypeRow = {
  equipment_type: string | null;
};

type AcademyContentRow = {
  id: string;
  title: string;
  content_type: "pdf" | "video";
  is_published: boolean;
};

type ScopeKind = "vehicle" | "asset_type";
type SectionKind = "sop_pdfs" | "training_videos";
type DisplayMode = "most_viewed" | "preset";

const PDF_BUCKET = "academy-pdfs";
const VIDEO_BUCKET = "academy-videos";
const THUMB_BUCKET = "academy-thumbnails";

function toStorageSafe(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseCsvTokens(input: string) {
  return Array.from(
    new Set(
      input
        .split(/[\n,]/g)
        .map((x) => x.trim())
        .filter(Boolean)
    )
  );
}

export default function AcademyAdminClient() {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [assetTypes, setAssetTypes] = useState<string[]>([]);
  const [contentItems, setContentItems] = useState<AcademyContentRow[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contentType, setContentType] = useState<"pdf" | "video">("pdf");
  const [contentFile, setContentFile] = useState<File | null>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [isPublished, setIsPublished] = useState(true);
  const [linkVehicleIdsRaw, setLinkVehicleIdsRaw] = useState("");
  const [linkAssetTypesRaw, setLinkAssetTypesRaw] = useState("");

  const [featureScopeKind, setFeatureScopeKind] = useState<ScopeKind>("vehicle");
  const [featureScopeValue, setFeatureScopeValue] = useState("");
  const [featureSection, setFeatureSection] = useState<SectionKind>("sop_pdfs");
  const [selectedFeaturedIds, setSelectedFeaturedIds] = useState<string[]>([]);

  const [prefScopeKind, setPrefScopeKind] = useState<ScopeKind>("vehicle");
  const [prefScopeValue, setPrefScopeValue] = useState("");
  const [prefSection, setPrefSection] = useState<SectionKind>("sop_pdfs");
  const [prefMode, setPrefMode] = useState<DisplayMode>("most_viewed");

  useEffect(() => {
    let alive = true;

    void (async () => {
      setLoading(true);
      setErrorMessage(null);
      const supabase = createSupabaseBrowser();

      const [vehiclesRes, equipmentTypesRes, contentRes] = await Promise.all([
        supabase.from("vehicles").select("id,name,type").order("name", { ascending: true }),
        supabase.from("equipment").select("equipment_type"),
        supabase
          .from("academy_content")
          .select("id,title,content_type,is_published")
          .order("created_at", { ascending: false }),
      ]);

      if (!alive) return;

      if (vehiclesRes.error || equipmentTypesRes.error || contentRes.error) {
        setErrorMessage(
          vehiclesRes.error?.message ||
            equipmentTypesRes.error?.message ||
            contentRes.error?.message ||
            "Failed to load academy admin data."
        );
        setLoading(false);
        return;
      }

      const vehicleRows = (vehiclesRes.data ?? []) as VehicleRow[];
      const equipmentTypeRows = (equipmentTypesRes.data ?? []) as EquipmentTypeRow[];
      const vehicleTypes = vehicleRows.map((v) => (v.type ?? "").trim()).filter(Boolean);
      const equipmentTypes = equipmentTypeRows.map((r) => (r.equipment_type ?? "").trim()).filter(Boolean);

      setVehicles(vehicleRows);
      setAssetTypes(Array.from(new Set([...vehicleTypes, ...equipmentTypes])).sort((a, b) => a.localeCompare(b)));
      setContentItems((contentRes.data ?? []) as AcademyContentRow[]);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const filteredFeaturedCandidates = useMemo(() => {
    const kind = featureSection === "sop_pdfs" ? "pdf" : "video";
    return contentItems.filter((item) => item.is_published && item.content_type === kind);
  }, [contentItems, featureSection]);

  async function refreshContentItems() {
    const supabase = createSupabaseBrowser();
    const { data, error } = await supabase
      .from("academy_content")
      .select("id,title,content_type,is_published")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[academy-admin] refresh content error:", error);
      return;
    }
    setContentItems((data ?? []) as AcademyContentRow[]);
  }

  async function submitContent() {
    if (!title.trim()) {
      setErrorMessage("Title is required.");
      return;
    }
    if (!contentFile) {
      setErrorMessage("Content file is required.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const supabase = createSupabaseBrowser();
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id ?? null;

      const now = Date.now();
      const mainBucket = contentType === "pdf" ? PDF_BUCKET : VIDEO_BUCKET;
      const mainPath = `academy/${contentType}/${now}-${toStorageSafe(contentFile.name)}`;

      const uploadMain = await supabase.storage
        .from(mainBucket)
        .upload(mainPath, contentFile, { upsert: false });

      if (uploadMain.error) {
        setErrorMessage(uploadMain.error.message);
        setSaving(false);
        return;
      }

      let thumbnailPathValue: string | null = null;
      if (thumbFile) {
        const thumbPath = `academy/thumbs/${now}-${toStorageSafe(thumbFile.name)}`;
        const uploadThumb = await supabase.storage
          .from(THUMB_BUCKET)
          .upload(thumbPath, thumbFile, { upsert: false });

        if (uploadThumb.error) {
          setErrorMessage(uploadThumb.error.message);
          setSaving(false);
          return;
        }
        thumbnailPathValue = `${THUMB_BUCKET}/${uploadThumb.data.path}`;
      }

      const { data: createdRow, error: createError } = await supabase
        .from("academy_content")
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          content_type: contentType,
          content_url: `${mainBucket}/${uploadMain.data.path}`,
          thumbnail_url: thumbnailPathValue,
          is_published: isPublished,
          published_at: isPublished ? new Date().toISOString() : null,
          created_by: userId,
        })
        .select("id")
        .single();

      if (createError || !createdRow?.id) {
        setErrorMessage(createError?.message || "Failed to create content row.");
        setSaving(false);
        return;
      }

      const contentId = createdRow.id as string;
      const vehicleIds = parseCsvTokens(linkVehicleIdsRaw);
      const assetTypeValues = parseCsvTokens(linkAssetTypesRaw);

      if (vehicleIds.length > 0) {
        const { error } = await supabase
          .from("academy_links_vehicle")
          .insert(vehicleIds.map((vehicle_id) => ({ content_id: contentId, vehicle_id })));
        if (error) {
          setErrorMessage(error.message);
          setSaving(false);
          return;
        }
      }

      if (assetTypeValues.length > 0) {
        const { error } = await supabase
          .from("academy_links_asset_type")
          .insert(assetTypeValues.map((asset_type) => ({ content_id: contentId, asset_type })));
        if (error) {
          setErrorMessage(error.message);
          setSaving(false);
          return;
        }
      }

      setTitle("");
      setDescription("");
      setContentFile(null);
      setThumbFile(null);
      setLinkVehicleIdsRaw("");
      setLinkAssetTypesRaw("");
      await refreshContentItems();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create academy content.");
    } finally {
      setSaving(false);
    }
  }

  function scopeFrom(kind: ScopeKind, value: string) {
    const trimmed = value.trim();
    return kind === "vehicle" ? `vehicle:${trimmed}` : `asset_type:${trimmed.toLowerCase()}`;
  }

  async function loadFeaturedPreset() {
    const scope = scopeFrom(featureScopeKind, featureScopeValue);
    if (!featureScopeValue.trim()) {
      setErrorMessage("Select a scope value before loading presets.");
      return;
    }

    const supabase = createSupabaseBrowser();
    const { data, error } = await supabase
      .from("academy_featured")
      .select("content_id,rank")
      .eq("scope", scope)
      .eq("section", featureSection)
      .eq("is_active", true)
      .order("rank", { ascending: true });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSelectedFeaturedIds(
      (data ?? [])
        .map((row) => row.content_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    );
  }

  async function saveFeaturedPreset() {
    const scope = scopeFrom(featureScopeKind, featureScopeValue);
    if (!featureScopeValue.trim()) {
      setErrorMessage("Select a scope value before saving presets.");
      return;
    }
    if (selectedFeaturedIds.length > 4) {
      setErrorMessage("Select up to 4 featured items.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const supabase = createSupabaseBrowser();
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id ?? null;

      const { error: deleteError } = await supabase
        .from("academy_featured")
        .delete()
        .eq("scope", scope)
        .eq("section", featureSection);

      if (deleteError) {
        setErrorMessage(deleteError.message);
        setSaving(false);
        return;
      }

      if (selectedFeaturedIds.length > 0) {
        const rows = selectedFeaturedIds.map((content_id, idx) => ({
          scope,
          section: featureSection,
          content_id,
          rank: idx + 1,
          is_active: true,
          created_by: userId,
        }));

        const { error: insertError } = await supabase.from("academy_featured").insert(rows);
        if (insertError) {
          setErrorMessage(insertError.message);
          setSaving(false);
          return;
        }
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save featured preset.");
    } finally {
      setSaving(false);
    }
  }

  async function loadDisplayPref() {
    const scope = scopeFrom(prefScopeKind, prefScopeValue);
    if (!prefScopeValue.trim()) {
      setErrorMessage("Select a scope value before loading display prefs.");
      return;
    }

    const supabase = createSupabaseBrowser();
    const { data, error } = await supabase
      .from("academy_display_prefs")
      .select("mode")
      .eq("scope", scope)
      .eq("section", prefSection)
      .maybeSingle();

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    const mode = data?.mode;
    setPrefMode(mode === "preset" ? "preset" : "most_viewed");
  }

  async function saveDisplayPref() {
    const scope = scopeFrom(prefScopeKind, prefScopeValue);
    if (!prefScopeValue.trim()) {
      setErrorMessage("Select a scope value before saving display prefs.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const supabase = createSupabaseBrowser();
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id ?? null;

      const { error } = await supabase
        .from("academy_display_prefs")
        .upsert(
          {
            scope,
            section: prefSection,
            mode: prefMode,
            updated_by: userId,
          },
          { onConflict: "scope,section" }
        );

      if (error) {
        setErrorMessage(error.message);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save display preference.");
    } finally {
      setSaving(false);
    }
  }

  function addFeatured(contentId: string) {
    setSelectedFeaturedIds((prev) => {
      if (prev.includes(contentId) || prev.length >= 4) return prev;
      return [...prev, contentId];
    });
  }

  function removeFeatured(contentId: string) {
    setSelectedFeaturedIds((prev) => prev.filter((id) => id !== contentId));
  }

  function moveFeatured(contentId: string, direction: -1 | 1) {
    setSelectedFeaturedIds((prev) => {
      const idx = prev.indexOf(contentId);
      if (idx < 0) return prev;
      const target = idx + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }

  if (loading) {
    return <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24, opacity: 0.75 }}>Loading academy admin...</main>;
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24, paddingBottom: 40 }}>
      <h1 style={{ marginBottom: 6 }}>Academy Admin</h1>
      <div style={{ opacity: 0.74, marginBottom: 16 }}>Upload content, manage links, presets, and display modes.</div>
      {errorMessage ? <div style={{ ...cardStyle, color: "#ffb0b0", marginBottom: 12 }}>{errorMessage}</div> : null}

      <section style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Create Content</h2>

        <div style={gridStyle}>
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
          </Field>

          <Field label="Type">
            <select value={contentType} onChange={(e) => setContentType(e.target.value as "pdf" | "video")} style={inputStyle}>
              <option value="pdf">PDF</option>
              <option value="video">Video</option>
            </select>
          </Field>

          <Field label="Publish">
            <select value={isPublished ? "yes" : "no"} onChange={(e) => setIsPublished(e.target.value === "yes")} style={inputStyle}>
              <option value="yes">Published</option>
              <option value="no">Draft</option>
            </select>
          </Field>

          <Field label={`Upload ${contentType.toUpperCase()} file`}>
            <input type="file" accept={contentType === "pdf" ? ".pdf,application/pdf" : "video/*"} onChange={(e) => setContentFile(e.target.files?.[0] ?? null)} />
          </Field>

          <Field label="Thumbnail (optional)">
            <input type="file" accept="image/*" onChange={(e) => setThumbFile(e.target.files?.[0] ?? null)} />
          </Field>

          <Field label="Description">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ ...inputStyle, minHeight: 90 }} />
          </Field>

          <Field label="Link Vehicle IDs (comma/newline)">
            <textarea
              value={linkVehicleIdsRaw}
              onChange={(e) => setLinkVehicleIdsRaw(e.target.value)}
              style={{ ...inputStyle, minHeight: 90 }}
              placeholder={vehicles.slice(0, 4).map((v) => v.id).join(", ")}
            />
          </Field>

          <Field label="Link Asset Types (comma/newline)">
            <textarea
              value={linkAssetTypesRaw}
              onChange={(e) => setLinkAssetTypesRaw(e.target.value)}
              style={{ ...inputStyle, minHeight: 90 }}
              placeholder={assetTypes.slice(0, 4).join(", ")}
            />
          </Field>
        </div>

        <div style={{ marginTop: 12 }}>
          <button type="button" onClick={() => void submitContent()} style={buttonStyle} disabled={saving}>
            {saving ? "Saving..." : "Create Content"}
          </button>
        </div>
      </section>

      <section style={{ ...cardStyle, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Featured Presets</h2>

        <div style={gridStyle}>
          <Field label="Scope Type">
            <select value={featureScopeKind} onChange={(e) => setFeatureScopeKind(e.target.value as ScopeKind)} style={inputStyle}>
              <option value="vehicle">Vehicle</option>
              <option value="asset_type">Asset Type</option>
            </select>
          </Field>

          <Field label="Scope Value">
            <input list={featureScopeKind === "vehicle" ? "vehicle-scope-values" : "asset-type-scope-values"} value={featureScopeValue} onChange={(e) => setFeatureScopeValue(e.target.value)} style={inputStyle} />
          </Field>

          <Field label="Section">
            <select value={featureSection} onChange={(e) => setFeatureSection(e.target.value as SectionKind)} style={inputStyle}>
              <option value="sop_pdfs">sop_pdfs</option>
              <option value="training_videos">training_videos</option>
            </select>
          </Field>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => void loadFeaturedPreset()} style={secondaryButtonStyle} disabled={saving}>
            Load Existing
          </button>
          <button type="button" onClick={() => void saveFeaturedPreset()} style={buttonStyle} disabled={saving}>
            Save Preset
          </button>
        </div>

        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={innerCardStyle}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Available Items</div>
            <div style={{ display: "grid", gap: 6 }}>
              {filteredFeaturedCandidates.map((item) => (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <div style={{ fontSize: 13 }}>{item.title}</div>
                  <button type="button" style={miniButtonStyle} onClick={() => addFeatured(item.id)}>
                    Add
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div style={innerCardStyle}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Selected (max 4)</div>
            <div style={{ display: "grid", gap: 6 }}>
              {selectedFeaturedIds.length === 0 ? <div style={{ opacity: 0.72 }}>No items selected.</div> : null}
              {selectedFeaturedIds.map((id, idx) => {
                const item = contentItems.find((x) => x.id === id);
                return (
                  <div key={id} style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <div style={{ fontSize: 13 }}>
                      {idx + 1}. {item?.title ?? id}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button type="button" style={miniButtonStyle} onClick={() => moveFeatured(id, -1)}>
                        ↑
                      </button>
                      <button type="button" style={miniButtonStyle} onClick={() => moveFeatured(id, 1)}>
                        ↓
                      </button>
                      <button type="button" style={miniButtonStyle} onClick={() => removeFeatured(id)}>
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section style={{ ...cardStyle, marginTop: 16 }}>
        <h2 style={{ marginTop: 0 }}>Default Display Mode</h2>
        <div style={gridStyle}>
          <Field label="Scope Type">
            <select value={prefScopeKind} onChange={(e) => setPrefScopeKind(e.target.value as ScopeKind)} style={inputStyle}>
              <option value="vehicle">Vehicle</option>
              <option value="asset_type">Asset Type</option>
            </select>
          </Field>

          <Field label="Scope Value">
            <input list={prefScopeKind === "vehicle" ? "vehicle-scope-values" : "asset-type-scope-values"} value={prefScopeValue} onChange={(e) => setPrefScopeValue(e.target.value)} style={inputStyle} />
          </Field>

          <Field label="Section">
            <select value={prefSection} onChange={(e) => setPrefSection(e.target.value as SectionKind)} style={inputStyle}>
              <option value="sop_pdfs">sop_pdfs</option>
              <option value="training_videos">training_videos</option>
            </select>
          </Field>

          <Field label="Mode">
            <select value={prefMode} onChange={(e) => setPrefMode(e.target.value as DisplayMode)} style={inputStyle}>
              <option value="most_viewed">most_viewed</option>
              <option value="preset">preset</option>
            </select>
          </Field>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => void loadDisplayPref()} style={secondaryButtonStyle} disabled={saving}>
            Load Existing
          </button>
          <button type="button" onClick={() => void saveDisplayPref()} style={buttonStyle} disabled={saving}>
            Save Display Pref
          </button>
        </div>
      </section>

      <datalist id="vehicle-scope-values">
        {vehicles.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name ?? v.id}
          </option>
        ))}
      </datalist>

      <datalist id="asset-type-scope-values">
        {assetTypes.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 16,
  padding: 16,
  background: "rgba(255,255,255,0.03)",
};

const innerCardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12,
  padding: 10,
  background: "rgba(255,255,255,0.02)",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.03)",
  color: "inherit",
};

const buttonStyle: React.CSSProperties = {
  border: "1px solid rgba(126,255,167,0.35)",
  borderRadius: 10,
  padding: "8px 12px",
  background: "rgba(126,255,167,0.14)",
  color: "inherit",
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 10,
  padding: "8px 12px",
  background: "transparent",
  color: "inherit",
  fontWeight: 700,
  cursor: "pointer",
};

const miniButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 8,
  padding: "4px 8px",
  background: "transparent",
  color: "inherit",
  fontSize: 12,
  cursor: "pointer",
};
