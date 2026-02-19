"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type Role = "owner" | "office_admin" | "mechanic" | "employee";

type AcademyContentRow = {
  id: string;
  title: string;
  description: string | null;
  content_type: "pdf" | "video";
  content_url: string;
  thumbnail_url: string | null;
  published_at: string | null;
};

type ActiveItem = {
  type: "pdf" | "video";
  title: string;
  url: string;
};

type VehicleOption = {
  id: string;
  name: string | null;
  type: string | null;
};

type EquipmentTypeRow = {
  equipment_type: string | null;
};

const PDF_BUCKET = "academy-pdfs";
const VIDEO_BUCKET = "academy-videos";

function toStorageSafe(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeTag(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isAllowedFileForType(file: File, type: "pdf" | "video") {
  const name = file.name.toLowerCase();
  if (type === "pdf") {
    return file.type === "application/pdf" || name.endsWith(".pdf");
  }
  return file.type.startsWith("video/");
}

function AcademyPageContent() {
  const searchParams = useSearchParams();
  const vehicleId = (searchParams.get("vehicleId") || "").trim();
  const assetTypeParam = (searchParams.get("assetType") || "").trim().toLowerCase();
  const section = (searchParams.get("section") || "").trim().toLowerCase();

  const [items, setItems] = useState<AcademyContentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<ActiveItem | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [assetTypesByContentId, setAssetTypesByContentId] = useState<Record<string, string[]>>({});
  const [topicsByContentId, setTopicsByContentId] = useState<Record<string, string[]>>({});
  const [vehicleOptions, setVehicleOptions] = useState<VehicleOption[]>([]);
  const [existingAssetTypeOptions, setExistingAssetTypeOptions] = useState<string[]>([]);

  const [query, setQuery] = useState("");
  const [assetFilter, setAssetFilter] = useState("all");
  const [topicFilter, setTopicFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState<"all" | "pdf" | "video">("all");
  const [sortBy, setSortBy] = useState<"recommended" | "newest" | "oldest" | "title_az" | "title_za">("recommended");

  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadType, setUploadType] = useState<"pdf" | "video">("pdf");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const uploadFileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadAssetTags, setUploadAssetTags] = useState<string[]>([]);
  const [uploadTopicTags, setUploadTopicTags] = useState<string[]>([]);
  const [uploadLinkedVehicleIds, setUploadLinkedVehicleIds] = useState<string[]>([]);
  const [uploadLinkedAssetTypes, setUploadLinkedAssetTypes] = useState<string[]>([]);
  const [newAssetTag, setNewAssetTag] = useState("");
  const [newTopicTag, setNewTopicTag] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);

  useEffect(() => {
    if (assetTypeParam) setAssetFilter(assetTypeParam);
  }, [assetTypeParam]);

  useEffect(() => {
    if (!uploadFile) return;
    if (isAllowedFileForType(uploadFile, uploadType)) return;
    setUploadFile(null);
    setUploadMessage(
      uploadType === "pdf"
        ? "Switched to PDF type. Please choose a PDF file."
        : "Switched to Video type. Please choose a video file."
    );
  }, [uploadFile, uploadType]);

  useEffect(() => {
    void (async () => {
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
        setRole((profile?.role as Role | undefined) ?? "employee");
      } else {
        setRole(null);
      }

      const [contentRes, assetLinksRes, topicLinksRes, vehiclesRes, equipmentTypesRes] = await Promise.all([
        supabase
          .from("academy_content")
          .select("id,title,description,content_type,content_url,thumbnail_url,published_at")
          .eq("is_published", true)
          .in("content_type", ["pdf", "video"])
          .order("published_at", { ascending: false }),
        supabase.from("academy_links_asset_type").select("content_id,asset_type"),
        supabase.from("academy_links_topic").select("content_id,topic"),
        supabase.from("vehicles").select("id,name,type").order("name", { ascending: true }),
        supabase.from("equipment").select("equipment_type"),
      ]);

      if (contentRes.error) {
        console.error("[academy] failed to load content:", contentRes.error);
        setErrorMessage(contentRes.error.message || "Failed to load academy content.");
        setItems([]);
        setLoading(false);
        return;
      }

      if (assetLinksRes.error) {
        console.error("[academy] asset links load error:", assetLinksRes.error);
      }
      if (topicLinksRes.error) {
        console.error("[academy] topic links load error:", topicLinksRes.error);
      }
      if (vehiclesRes.error) {
        console.error("[academy] vehicle options load error:", vehiclesRes.error);
      }
      if (equipmentTypesRes.error) {
        console.error("[academy] equipment types load error:", equipmentTypesRes.error);
      }

      const vehicleRows = (vehiclesRes.data ?? []) as VehicleOption[];
      setVehicleOptions(vehicleRows);

      const vehicleTypes = vehicleRows
        .map((row) => (row.type || "").trim().toLowerCase())
        .filter(Boolean);
      const equipmentTypes = ((equipmentTypesRes.data ?? []) as EquipmentTypeRow[])
        .map((row) => (row.equipment_type || "").trim().toLowerCase())
        .filter(Boolean);
      setExistingAssetTypeOptions(Array.from(new Set([...vehicleTypes, ...equipmentTypes])).sort((a, b) => a.localeCompare(b)));

      const baseItems = (contentRes.data ?? []) as AcademyContentRow[];
      const idSet = new Set(baseItems.map((item) => item.id));

      const assetMap: Record<string, string[]> = {};
      for (const row of (assetLinksRes.data ?? []) as Array<{ content_id: string | null; asset_type: string | null }>) {
        const contentId = (row.content_id || "").trim();
        const asset = (row.asset_type || "").trim().toLowerCase();
        if (!contentId || !asset || !idSet.has(contentId)) continue;
        if (!assetMap[contentId]) assetMap[contentId] = [];
        if (!assetMap[contentId].includes(asset)) assetMap[contentId].push(asset);
      }

      const topicMap: Record<string, string[]> = {};
      for (const row of (topicLinksRes.data ?? []) as Array<{ content_id: string | null; topic: string | null }>) {
        const contentId = (row.content_id || "").trim();
        const topic = (row.topic || "").trim().toLowerCase();
        if (!contentId || !topic || !idSet.has(contentId)) continue;
        if (!topicMap[contentId]) topicMap[contentId] = [];
        if (!topicMap[contentId].includes(topic)) topicMap[contentId].push(topic);
      }

      setAssetTypesByContentId(assetMap);
      setTopicsByContentId(topicMap);

      let prioritizedIds: string[] = [];

      if (vehicleId) {
        const vehicleLinksRes = await supabase
          .from("academy_links_vehicle")
          .select("content_id")
          .eq("vehicle_id", vehicleId);

        if (vehicleLinksRes.error) {
          console.error("[academy] vehicle links load error:", vehicleLinksRes.error);
        } else {
          prioritizedIds = (vehicleLinksRes.data ?? [])
            .map((row) => row.content_id)
            .filter((id): id is string => typeof id === "string" && idSet.has(id));
        }
      }

      if (prioritizedIds.length === 0 && assetTypeParam) {
        prioritizedIds = baseItems
          .filter((item) => (assetMap[item.id] ?? []).includes(assetTypeParam))
          .map((item) => item.id);
      }

      if (prioritizedIds.length === 0) {
        setItems(baseItems);
        setLoading(false);
        return;
      }

      const rank = new Map(prioritizedIds.map((id, idx) => [id, idx]));
      const prioritized = [...baseItems].sort((a, b) => {
        const aRank = rank.has(a.id) ? (rank.get(a.id) as number) : Number.MAX_SAFE_INTEGER;
        const bRank = rank.has(b.id) ? (rank.get(b.id) as number) : Number.MAX_SAFE_INTEGER;
        if (aRank !== bRank) return aRank - bRank;
        return a.title.localeCompare(b.title);
      });

      setItems(prioritized);
      setLoading(false);
    })();
  }, [assetTypeParam, reloadKey, vehicleId]);

  const canUpload = role === "owner" || role === "office_admin" || role === "mechanic";

  function addUploadAssetTag(value: string) {
    const normalized = normalizeTag(value);
    if (!normalized) return;
    setUploadAssetTags((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
  }

  function addUploadTopicTag(value: string) {
    const normalized = normalizeTag(value);
    if (!normalized) return;
    setUploadTopicTags((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
  }

  async function submitUpload() {
    if (!canUpload) {
      setUploadMessage("You do not have permission to upload academy content.");
      return;
    }
    if (!uploadTitle.trim()) {
      setUploadMessage("Title is required.");
      return;
    }
    if (!uploadFile) {
      setUploadMessage("Choose a file to upload.");
      return;
    }
    if (!isAllowedFileForType(uploadFile, uploadType)) {
      setUploadMessage(
        uploadType === "pdf"
          ? "Only PDF files are allowed when type is PDF."
          : "Only video files are allowed when type is Video."
      );
      return;
    }
    if (uploadAssetTags.length === 0) {
      setUploadMessage("Select at least one asset tag.");
      return;
    }
    if (uploadTopicTags.length === 0) {
      setUploadMessage("Select at least one topic tag.");
      return;
    }

    setUploading(true);
    setUploadMessage(null);

    try {
      const supabase = createSupabaseBrowser();
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id ?? null;
      const bucket = uploadType === "pdf" ? PDF_BUCKET : VIDEO_BUCKET;
      const path = `academy/${uploadType}/${Date.now()}-${toStorageSafe(uploadFile.name)}`;

      const uploadRes = await supabase.storage.from(bucket).upload(path, uploadFile, { upsert: false });
      if (uploadRes.error) {
        setUploadMessage(uploadRes.error.message || "Failed to upload file.");
        setUploading(false);
        return;
      }

      const { data: created, error: insertError } = await supabase
        .from("academy_content")
        .insert({
          title: uploadTitle.trim(),
          description: uploadDescription.trim() || null,
          content_type: uploadType,
          content_url: `${bucket}/${uploadRes.data.path}`,
          is_published: true,
          published_at: new Date().toISOString(),
          created_by: userId,
        })
        .select("id")
        .single();

      if (insertError || !created?.id) {
        setUploadMessage(insertError?.message || "Failed to create academy content.");
        setUploading(false);
        return;
      }

      const contentId = created.id as string;
      const assetTypes = Array.from(new Set([...uploadAssetTags, ...uploadLinkedAssetTypes]));
      const topics = uploadTopicTags;

      if (assetTypes.length > 0) {
        const { error } = await supabase
          .from("academy_links_asset_type")
          .insert(assetTypes.map((asset_type) => ({ content_id: contentId, asset_type })));
        if (error) {
          setUploadMessage(error.message || "Uploaded, but failed to save asset tags.");
          setUploading(false);
          return;
        }
      }

      if (uploadLinkedVehicleIds.length > 0) {
        const { error } = await supabase
          .from("academy_links_vehicle")
          .insert(uploadLinkedVehicleIds.map((vehicle_id) => ({ content_id: contentId, vehicle_id })));
        if (error) {
          setUploadMessage(error.message || "Uploaded, but failed to save linked assets.");
          setUploading(false);
          return;
        }
      }

      if (topics.length > 0) {
        const { error } = await supabase
          .from("academy_links_topic")
          .insert(topics.map((topic) => ({ content_id: contentId, topic })));
        if (error) {
          setUploadMessage(error.message || "Uploaded, but failed to save topic tags.");
          setUploading(false);
          return;
        }
      }

      setUploadTitle("");
      setUploadDescription("");
      setUploadType("pdf");
      setUploadFile(null);
      setUploadAssetTags([]);
      setUploadTopicTags([]);
      setUploadLinkedVehicleIds([]);
      setUploadLinkedAssetTypes([]);
      setNewAssetTag("");
      setNewTopicTag("");
      setUploadMessage("Upload complete.");
      setReloadKey((prev) => prev + 1);
    } catch (error) {
      setUploadMessage(error instanceof Error ? error.message : "Failed to upload academy content.");
    } finally {
      setUploading(false);
    }
  }

  const allAssetTypes = useMemo(() => {
    const values = Object.values(assetTypesByContentId).flat();
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }, [assetTypesByContentId]);

  const allTopics = useMemo(() => {
    const values = Object.values(topicsByContentId).flat();
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }, [topicsByContentId]);

  const uploadAssetOptions = useMemo(() => {
    return Array.from(new Set([...allAssetTypes, ...uploadAssetTags])).sort((a, b) => a.localeCompare(b));
  }, [allAssetTypes, uploadAssetTags]);

  const uploadTopicOptions = useMemo(() => {
    return Array.from(new Set([...allTopics, ...uploadTopicTags])).sort((a, b) => a.localeCompare(b));
  }, [allTopics, uploadTopicTags]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();

    return items.filter((item) => {
      if (kindFilter !== "all" && item.content_type !== kindFilter) return false;

      const itemAssets = assetTypesByContentId[item.id] ?? [];
      const itemTopics = topicsByContentId[item.id] ?? [];

      if (assetFilter !== "all" && !itemAssets.includes(assetFilter)) return false;
      if (topicFilter !== "all" && !itemTopics.includes(topicFilter)) return false;

      if (!q) return true;
      const haystack = [item.title, item.description ?? "", ...itemAssets, ...itemTopics]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [assetFilter, assetTypesByContentId, items, kindFilter, query, topicFilter, topicsByContentId]);

  const sortedItems = useMemo(() => {
    if (sortBy === "recommended") return filteredItems;

    const next = [...filteredItems];
    if (sortBy === "newest") {
      next.sort((a, b) => (b.published_at || "").localeCompare(a.published_at || ""));
      return next;
    }
    if (sortBy === "oldest") {
      next.sort((a, b) => (a.published_at || "").localeCompare(b.published_at || ""));
      return next;
    }
    if (sortBy === "title_az") {
      next.sort((a, b) => a.title.localeCompare(b.title));
      return next;
    }
    next.sort((a, b) => b.title.localeCompare(a.title));
    return next;
  }, [filteredItems, sortBy]);

  const sopPdfs = useMemo(() => sortedItems.filter((item) => item.content_type === "pdf"), [sortedItems]);
  const trainingVideos = useMemo(() => sortedItems.filter((item) => item.content_type === "video"), [sortedItems]);
  const sectionOrder = useMemo(() => {
    if (section === "training_videos") return ["training_videos", "sop_pdfs"] as const;
    return ["sop_pdfs", "training_videos"] as const;
  }, [section]);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <h1 style={{ marginBottom: 6 }}>OI Academy</h1>
      <div style={{ opacity: 0.74, marginBottom: 16 }}>
        SOPs and training content for field and shop teams.
      </div>

      {canUpload ? (
        <section style={{ ...cardStyle, marginBottom: 18 }}>
          <h2 style={{ marginTop: 0, marginBottom: 8 }}>Upload Academy Content</h2>
          <div style={{ opacity: 0.74, marginBottom: 12 }}>
            Allowed roles: owner, office admin, and mechanic.
          </div>
          <div style={uploadGridStyle}>
            <Field label="Title">
              <input value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Type">
              <select value={uploadType} onChange={(e) => setUploadType(e.target.value as "pdf" | "video")} style={inputStyle}>
                <option value="pdf">PDF</option>
                <option value="video">Video</option>
              </select>
            </Field>
            <Field label={`Upload ${uploadType.toUpperCase()} File`}>
              <div style={{ display: "grid", gap: 8 }}>
                <input
                  ref={uploadFileInputRef}
                  type="file"
                  accept={uploadType === "pdf" ? ".pdf,application/pdf" : "video/*"}
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (!file) {
                      setUploadFile(null);
                      return;
                    }
                    if (!isAllowedFileForType(file, uploadType)) {
                      setUploadMessage(
                        uploadType === "pdf"
                          ? "Only PDF files are allowed when type is PDF."
                          : "Only video files are allowed when type is Video."
                      );
                      setUploadFile(null);
                      e.currentTarget.value = "";
                      return;
                    }
                    setUploadMessage(null);
                    setUploadFile(file);
                  }}
                />
                {!uploadFile ? (
                  <button
                    type="button"
                    style={uploadButtonStyle}
                    onClick={() => uploadFileInputRef.current?.click()}
                  >
                    Upload Content File
                  </button>
                ) : (
                  <div style={selectedFileStyle}>{uploadFile.name}</div>
                )}
              </div>
            </Field>
            <SelectAddField
              label="Link Specific Asset (Vehicle)"
              options={vehicleOptions.map((v) => ({
                value: v.id,
                label: `${v.name || "Unnamed"} (${v.id}${v.type ? `, ${v.type}` : ""})`,
              }))}
              selected={uploadLinkedVehicleIds}
              onAdd={(value) =>
                setUploadLinkedVehicleIds((prev) => (prev.includes(value) ? prev : [...prev, value]))
              }
              onRemove={(value) => setUploadLinkedVehicleIds((prev) => prev.filter((x) => x !== value))}
              emptySelectedText="No specific assets linked."
            />
            <SelectAddField
              label="Link Asset Type (Existing)"
              options={existingAssetTypeOptions.map((value) => ({ value, label: value }))}
              selected={uploadLinkedAssetTypes}
              onAdd={(value) =>
                setUploadLinkedAssetTypes((prev) => (prev.includes(value) ? prev : [...prev, value]))
              }
              onRemove={(value) => setUploadLinkedAssetTypes((prev) => prev.filter((x) => x !== value))}
              emptySelectedText="No existing asset types linked."
            />
            <TagPicker
              label="Asset Tags *"
              options={uploadAssetOptions}
              selected={uploadAssetTags}
              onAdd={(value) => addUploadAssetTag(value)}
              onRemove={(value) => setUploadAssetTags((prev) => prev.filter((x) => x !== value))}
              newValue={newAssetTag}
              onNewValueChange={setNewAssetTag}
              onAddNew={() => {
                addUploadAssetTag(newAssetTag);
                setNewAssetTag("");
              }}
              addPlaceholder="Add asset tag"
            />
            <TagPicker
              label="Topic Tags *"
              options={uploadTopicOptions}
              selected={uploadTopicTags}
              onAdd={(value) => addUploadTopicTag(value)}
              onRemove={(value) => setUploadTopicTags((prev) => prev.filter((x) => x !== value))}
              newValue={newTopicTag}
              onNewValueChange={setNewTopicTag}
              onAddNew={() => {
                addUploadTopicTag(newTopicTag);
                setNewTopicTag("");
              }}
              addPlaceholder="Add topic tag"
            />
            <Field label="Description (optional)">
              <textarea
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                style={{ ...inputStyle, minHeight: 88 }}
              />
            </Field>
          </div>
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={() => void submitUpload()} style={uploadButtonStyle} disabled={uploading}>
              {uploading ? "Uploading..." : "Save Content"}
            </button>
            {uploadMessage ? <div style={{ opacity: 0.86 }}>{uploadMessage}</div> : null}
          </div>
        </section>
      ) : null}

      <section style={{ ...cardStyle, marginBottom: 18 }}>
        <h2 style={{ marginTop: 0, marginBottom: 6 }}>Filter & Sort</h2>
        <div style={{ opacity: 0.72, marginBottom: 10, fontSize: 13 }}>
          Use dropdowns to narrow results like an e-commerce catalog.
        </div>
        <div style={filterGridStyle}>
          <Field label="Search">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={inputStyle}
              placeholder="Search title, description, asset, topic"
            />
          </Field>

          <Field label="Asset">
            <select value={assetFilter} onChange={(e) => setAssetFilter(e.target.value)} style={inputStyle}>
              <option value="all">All assets</option>
              {allAssetTypes.map((asset) => (
                <option key={asset} value={asset}>
                  {asset}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Topic">
            <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)} style={inputStyle}>
              <option value="all">All topics</option>
              {allTopics.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Kind">
            <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as "all" | "pdf" | "video")} style={inputStyle}>
              <option value="all">PDF + Video</option>
              <option value="pdf">PDF only</option>
              <option value="video">Video only</option>
            </select>
          </Field>

          <Field label="Sort">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "recommended" | "newest" | "oldest" | "title_az" | "title_za")}
              style={inputStyle}
            >
              <option value="recommended">Recommended</option>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="title_az">Title A-Z</option>
              <option value="title_za">Title Z-A</option>
            </select>
          </Field>
        </div>
      </section>

      {loading ? <div style={{ opacity: 0.75 }}>Loading academy content...</div> : null}
      {errorMessage ? <div style={{ ...cardStyle, color: "#ffb0b0" }}>{errorMessage}</div> : null}

      {!loading && !errorMessage ? (
        <div style={{ display: "grid", gap: 18 }}>
          {sectionOrder.map((sectionKey) =>
            sectionKey === "sop_pdfs" ? (
              <Section
                key="sop_pdfs"
                title="SOP PDFs"
                emptyText="No SOP PDFs match these filters."
                items={sopPdfs}
                sortBy={sortBy}
                assetTypesByContentId={assetTypesByContentId}
                topicsByContentId={topicsByContentId}
                onOpen={(item) => setActiveItem({ type: "pdf", title: item.title, url: item.content_url })}
              />
            ) : (
              <Section
                key="training_videos"
                title="Training Videos"
                emptyText="No training videos match these filters."
                items={trainingVideos}
                sortBy={sortBy}
                assetTypesByContentId={assetTypesByContentId}
                topicsByContentId={topicsByContentId}
                onOpen={(item) => setActiveItem({ type: "video", title: item.title, url: item.content_url })}
              />
            )
          )}
        </div>
      ) : null}

      {activeItem ? (
        <div role="dialog" aria-modal="true" style={overlayStyle} onClick={() => setActiveItem(null)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                marginBottom: 10,
              }}
            >
              <div style={{ fontWeight: 900 }}>{activeItem.title}</div>
              <button type="button" onClick={() => setActiveItem(null)} style={closeButtonStyle}>
                Close
              </button>
            </div>

            {activeItem.type === "pdf" ? (
              <iframe
                src={activeItem.url}
                title={activeItem.title}
                style={{ width: "100%", height: "72vh", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10 }}
              />
            ) : (
              <video
                src={activeItem.url}
                controls
                autoPlay
                style={{ width: "100%", maxHeight: "72vh", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10 }}
              />
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}

export default function AcademyPage() {
  return (
    <Suspense
      fallback={<main style={{ maxWidth: 1100, margin: "0 auto", padding: 24, opacity: 0.75 }}>Loading academy...</main>}
    >
      <AcademyPageContent />
    </Suspense>
  );
}

function Section({
  title,
  emptyText,
  items,
  sortBy,
  onOpen,
  assetTypesByContentId,
  topicsByContentId,
}: {
  title: string;
  emptyText: string;
  items: AcademyContentRow[];
  sortBy: "recommended" | "newest" | "oldest" | "title_az" | "title_za";
  onOpen: (item: AcademyContentRow) => void;
  assetTypesByContentId: Record<string, string[]>;
  topicsByContentId: Record<string, string[]>;
}) {
  const sortLabel =
    sortBy === "recommended"
      ? "Recommended"
      : sortBy === "newest"
        ? "Newest"
        : sortBy === "oldest"
          ? "Oldest"
          : sortBy === "title_az"
            ? "Title A-Z"
            : "Title Z-A";

  return (
    <section style={sectionWrapStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={sectionMetaChipStyle}>{items.length} item{items.length === 1 ? "" : "s"}</span>
          <span style={sectionMetaChipStyle}>Sort: {sortLabel}</span>
        </div>
      </div>
      {items.length === 0 ? (
        <div style={{ opacity: 0.7 }}>{emptyText}</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 12,
          }}
        >
          {items.map((item) => {
            const assets = assetTypesByContentId[item.id] ?? [];
            const topics = topicsByContentId[item.id] ?? [];

            return (
              <button key={item.id} type="button" onClick={() => onOpen(item)} style={cardButtonStyle}>
                {item.thumbnail_url ? (
                  <div
                    style={{
                      width: "100%",
                      height: 130,
                      borderRadius: 10,
                      marginBottom: 10,
                      backgroundImage: `url(${item.thumbnail_url})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      border: "1px solid rgba(255,255,255,0.14)",
                    }}
                  />
                ) : null}
                <div style={{ fontWeight: 800, textAlign: "left" }}>{item.title}</div>
                <div style={{ opacity: 0.75, marginTop: 6, textAlign: "left", lineHeight: 1.35 }}>
                  {item.description || "No description"}
                </div>

                {topics.length > 0 ? (
                  <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {topics.map((topic) => (
                      <span key={`${item.id}-topic-${topic}`} style={topicChipStyle}>
                        {topic}
                      </span>
                    ))}
                  </div>
                ) : null}

                {assets.length > 0 ? (
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {assets.map((asset) => (
                      <span key={`${item.id}-asset-${asset}`} style={assetChipStyle}>
                        {asset}
                      </span>
                    ))}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.76, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function TagPicker({
  label,
  options,
  selected,
  onAdd,
  onRemove,
  newValue,
  onNewValueChange,
  onAddNew,
  addPlaceholder,
}: {
  label: string;
  options: string[];
  selected: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  newValue: string;
  onNewValueChange: (value: string) => void;
  onAddNew: () => void;
  addPlaceholder: string;
}) {
  const available = options.filter((opt) => !selected.includes(opt));

  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.76, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            style={{ ...inputStyle, flex: 1 }}
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              onAdd(e.target.value);
            }}
          >
            <option value="">Select tag...</option>
            {available.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={newValue}
            onChange={(e) => onNewValueChange(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
            placeholder={addPlaceholder}
          />
          <button type="button" style={miniActionButtonStyle} onClick={onAddNew}>
            Add tag
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {selected.length === 0 ? <span style={{ opacity: 0.7 }}>No tags selected.</span> : null}
          {selected.map((tag) => (
            <button key={tag} type="button" style={selectedTagChipStyle} onClick={() => onRemove(tag)}>
              {tag} ×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SelectAddField({
  label,
  options,
  selected,
  onAdd,
  onRemove,
  emptySelectedText,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  emptySelectedText: string;
}) {
  const available = options.filter((opt) => !selected.includes(opt.value));
  const optionMap = new Map(options.map((opt) => [opt.value, opt.label]));

  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.76, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "grid", gap: 8 }}>
        <select
          style={inputStyle}
          value=""
          onChange={(e) => {
            if (!e.target.value) return;
            onAdd(e.target.value);
          }}
        >
          <option value="">Select...</option>
          {available.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {selected.length === 0 ? <span style={{ opacity: 0.7 }}>{emptySelectedText}</span> : null}
          {selected.map((value) => (
            <button key={value} type="button" style={selectedTagChipStyle} onClick={() => onRemove(value)}>
              {optionMap.get(value) ?? value} ×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 14,
  padding: 14,
  background: "rgba(255,255,255,0.03)",
};

const uploadGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
};

const filterGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const sectionWrapStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 14,
  padding: 14,
  background: "rgba(255,255,255,0.02)",
};

const sectionMetaChipStyle: React.CSSProperties = {
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.04)",
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 700,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.03)",
  color: "inherit",
};

const uploadButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(126,255,167,0.35)",
  borderRadius: 10,
  padding: "8px 12px",
  background: "rgba(126,255,167,0.14)",
  color: "inherit",
  fontWeight: 800,
  cursor: "pointer",
};

const miniActionButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.2)",
  borderRadius: 10,
  padding: "8px 10px",
  background: "rgba(255,255,255,0.06)",
  color: "inherit",
  fontWeight: 700,
  cursor: "pointer",
};

const selectedTagChipStyle: React.CSSProperties = {
  borderRadius: 999,
  border: "1px solid rgba(126,255,167,0.35)",
  background: "rgba(126,255,167,0.16)",
  padding: "4px 10px",
  fontSize: 12,
  color: "inherit",
  cursor: "pointer",
};

const selectedFileStyle: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.2)",
  background: "rgba(255,255,255,0.05)",
  padding: "10px 12px",
  fontSize: 13,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const cardButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 14,
  padding: 12,
  background: "rgba(255,255,255,0.03)",
  color: "inherit",
  cursor: "pointer",
};

const topicChipStyle: React.CSSProperties = {
  borderRadius: 999,
  border: "1px solid rgba(126,255,167,0.3)",
  background: "rgba(126,255,167,0.14)",
  padding: "2px 8px",
  fontSize: 12,
};

const assetChipStyle: React.CSSProperties = {
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.24)",
  background: "rgba(255,255,255,0.05)",
  padding: "2px 8px",
  fontSize: 12,
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.65)",
  display: "grid",
  placeItems: "center",
  padding: 16,
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  width: "min(1000px, 100%)",
  background: "rgba(15,16,18,0.98)",
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 14,
  padding: 14,
};

const closeButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.2)",
  borderRadius: 10,
  background: "transparent",
  color: "inherit",
  padding: "6px 10px",
  cursor: "pointer",
};
