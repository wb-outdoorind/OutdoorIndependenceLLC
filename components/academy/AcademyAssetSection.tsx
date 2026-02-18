"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import PdfViewerModal from "@/components/academy/PdfViewerModal";
import VideoViewerModal from "@/components/academy/VideoViewerModal";

type AcademyAssetSectionProps = {
  vehicleId: string;
  assetType: string;
};

type AcademyContentRow = {
  id: string;
  title: string;
  description: string | null;
  content_type: "pdf" | "video";
  content_url: string;
  thumbnail_url: string | null;
};

type DirectoryMode = "most_viewed" | "preset";
type DirectoryKey = "sop_pdfs" | "training_videos";

const DIRECTORY_CONFIG: Record<DirectoryKey, { title: string; contentType: "pdf" | "video"; viewAllLabel: string }> = {
  sop_pdfs: {
    title: "SOP PDF Directory",
    contentType: "pdf",
    viewAllLabel: "View all PDFs",
  },
  training_videos: {
    title: "Training Video Directory",
    contentType: "video",
    viewAllLabel: "View all Videos",
  },
};

export default function AcademyAssetSection({ vehicleId, assetType }: AcademyAssetSectionProps) {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [modeByDirectory, setModeByDirectory] = useState<Record<DirectoryKey, DirectoryMode>>({
    sop_pdfs: "most_viewed",
    training_videos: "most_viewed",
  });

  const [itemsByDirectory, setItemsByDirectory] = useState<Record<DirectoryKey, AcademyContentRow[]>>({
    sop_pdfs: [],
    training_videos: [],
  });

  const [activePdf, setActivePdf] = useState<{ title: string; url: string } | null>(null);
  const [activeVideo, setActiveVideo] = useState<{ id: string; title: string; url: string } | null>(null);

  const normalizedAssetType = useMemo(() => assetType.trim().toLowerCase(), [assetType]);

  const vehicleScope = useMemo(() => `vehicle:${vehicleId}`, [vehicleId]);
  const assetScope = useMemo(() => `asset_type:${normalizedAssetType || "unknown"}`, [normalizedAssetType]);

  useEffect(() => {
    let alive = true;

    async function loadDirectoryData() {
      setLoading(true);
      setErrorMessage(null);

      const supabase = createSupabaseBrowser();

      const loadOne = async (directory: DirectoryKey): Promise<{ mode: DirectoryMode; items: AcademyContentRow[] }> => {
        const config = DIRECTORY_CONFIG[directory];

        const vehiclePrefRes = await supabase
          .from("academy_display_prefs")
          .select("mode")
          .eq("scope", vehicleScope)
          .eq("section", directory)
          .maybeSingle();

        const prefModeFromVehicle = vehiclePrefRes.data?.mode;
        let selectedMode: DirectoryMode = prefModeFromVehicle === "preset" ? "preset" : "most_viewed";

        if (!vehiclePrefRes.data) {
          const assetPrefRes = await supabase
            .from("academy_display_prefs")
            .select("mode")
            .eq("scope", assetScope)
            .eq("section", directory)
            .maybeSingle();

          const prefModeFromAsset = assetPrefRes.data?.mode;
          selectedMode = prefModeFromAsset === "preset" ? "preset" : "most_viewed";
        }

        const contentIds = await getLinkedContentIds({
          supabase,
          vehicleId,
          assetType: normalizedAssetType,
        });

        if (contentIds.length === 0) {
          return { mode: selectedMode, items: [] };
        }

        if (selectedMode === "most_viewed") {
          const items = await getMostViewedItems({
            supabase,
            contentIds,
            contentType: config.contentType,
          });
          return { mode: selectedMode, items };
        }

        const items = await getPresetItems({
          supabase,
          vehicleScope,
          assetScope,
          section: directory,
          fallbackContentIds: contentIds,
          contentType: config.contentType,
        });
        return { mode: selectedMode, items };
      };

      try {
        const [sopData, videoData] = await Promise.all([loadOne("sop_pdfs"), loadOne("training_videos")]);

        if (!alive) return;

        setModeByDirectory({
          sop_pdfs: sopData.mode,
          training_videos: videoData.mode,
        });

        setItemsByDirectory({
          sop_pdfs: sopData.items,
          training_videos: videoData.items,
        });
      } catch (error) {
        if (!alive) return;
        const msg = error instanceof Error ? error.message : "Failed to load academy asset section.";
        setErrorMessage(msg);
        console.error("[academy-asset] load error:", error);
      } finally {
        if (alive) setLoading(false);
      }
    }

    void loadDirectoryData();

    return () => {
      alive = false;
    };
  }, [assetScope, normalizedAssetType, vehicleId, vehicleScope]);

  async function toggleMode(directory: DirectoryKey, mode: DirectoryMode) {
    setModeByDirectory((prev) => ({ ...prev, [directory]: mode }));

    const supabase = createSupabaseBrowser();
    const config = DIRECTORY_CONFIG[directory];

    try {
      const contentIds = await getLinkedContentIds({
        supabase,
        vehicleId,
        assetType: normalizedAssetType,
      });

      if (contentIds.length === 0) {
        setItemsByDirectory((prev) => ({ ...prev, [directory]: [] }));
        return;
      }

      const items =
        mode === "most_viewed"
          ? await getMostViewedItems({ supabase, contentIds, contentType: config.contentType })
          : await getPresetItems({
              supabase,
              vehicleScope,
              assetScope,
              section: directory,
              fallbackContentIds: contentIds,
              contentType: config.contentType,
            });

      setItemsByDirectory((prev) => ({ ...prev, [directory]: items }));
    } catch (error) {
      console.error("[academy-asset] mode toggle load error:", error);
      setErrorMessage(error instanceof Error ? error.message : "Failed to update directory mode.");
    }
  }

  const viewAllHref = `/academy?vehicleId=${encodeURIComponent(vehicleId)}&assetType=${encodeURIComponent(normalizedAssetType || assetType)}`;

  return (
    <div style={{ marginTop: 18, ...cardStyle }}>
      <div style={{ fontWeight: 900, marginBottom: 12 }}>OI Academy</div>
      <div style={{ opacity: 0.74, marginBottom: 12, fontSize: 13 }}>
        Content targeted to this vehicle and asset type.
      </div>

      {loading ? <div style={{ opacity: 0.75 }}>Loading academy content...</div> : null}
      {errorMessage ? <div style={{ color: "#ffb0b0", marginBottom: 10 }}>{errorMessage}</div> : null}

      <div style={{ display: "grid", gap: 14 }}>
        {(Object.keys(DIRECTORY_CONFIG) as DirectoryKey[]).map((directory) => {
          const config = DIRECTORY_CONFIG[directory];
          const mode = modeByDirectory[directory];
          const items = itemsByDirectory[directory] ?? [];

          return (
            <section
              key={directory}
              style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: 12 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontWeight: 800 }}>{config.title}</div>
                <Link href={viewAllHref} style={linkButtonStyle}>
                  View all
                </Link>
              </div>

              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  style={{ ...toggleBtnStyle, ...(mode === "most_viewed" ? toggleActiveStyle : {}) }}
                  onClick={() => void toggleMode(directory, "most_viewed")}
                >
                  Top 4 most viewed
                </button>
                <button
                  type="button"
                  style={{ ...toggleBtnStyle, ...(mode === "preset" ? toggleActiveStyle : {}) }}
                  onClick={() => void toggleMode(directory, "preset")}
                >
                  Preset
                </button>
              </div>

              <div style={{ marginTop: 10 }}>
                {items.length === 0 ? (
                  <div style={{ opacity: 0.72, fontSize: 13 }}>No published content linked for this directory.</div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: 10,
                    }}
                  >
                    {items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        style={contentCardButtonStyle}
                        onClick={() => {
                          if (item.content_type === "pdf") {
                            setActivePdf({ title: item.title, url: item.content_url });
                          } else {
                            setActiveVideo({ id: item.id, title: item.title, url: item.content_url });
                          }
                        }}
                      >
                        {item.thumbnail_url ? (
                          <div
                            style={{
                              height: 110,
                              borderRadius: 8,
                              marginBottom: 8,
                              backgroundImage: `url(${item.thumbnail_url})`,
                              backgroundSize: "cover",
                              backgroundPosition: "center",
                              border: "1px solid rgba(255,255,255,0.14)",
                            }}
                          />
                        ) : null}
                        <div style={{ textAlign: "left", fontWeight: 800 }}>{item.title}</div>
                        <div style={{ textAlign: "left", marginTop: 6, opacity: 0.72, fontSize: 13 }}>
                          {item.description || "No description"}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <PdfViewerModal
        isOpen={Boolean(activePdf)}
        signedUrl={activePdf?.url ?? null}
        title={activePdf?.title}
        onClose={() => setActivePdf(null)}
      />

      <VideoViewerModal
        isOpen={Boolean(activeVideo)}
        signedUrl={activeVideo?.url ?? null}
        title={activeVideo?.title}
        contentId={activeVideo?.id}
        onClose={() => setActiveVideo(null)}
      />
    </div>
  );
}

async function getLinkedContentIds({
  supabase,
  vehicleId,
  assetType,
}: {
  supabase: ReturnType<typeof createSupabaseBrowser>;
  vehicleId: string;
  assetType: string;
}) {
  const byVehicle = await supabase
    .from("academy_links_vehicle")
    .select("content_id")
    .eq("vehicle_id", vehicleId);

  if (byVehicle.error) {
    throw new Error(byVehicle.error.message);
  }

  const vehicleIds = (byVehicle.data ?? []).map((row) => row.content_id).filter(Boolean);
  if (vehicleIds.length > 0) {
    return Array.from(new Set(vehicleIds));
  }

  if (!assetType) return [];

  const byAssetType = await supabase
    .from("academy_links_asset_type")
    .select("content_id")
    .eq("asset_type", assetType);

  if (byAssetType.error) {
    throw new Error(byAssetType.error.message);
  }

  const assetIds = (byAssetType.data ?? []).map((row) => row.content_id).filter(Boolean);
  return Array.from(new Set(assetIds));
}

async function getMostViewedItems({
  supabase,
  contentIds,
  contentType,
}: {
  supabase: ReturnType<typeof createSupabaseBrowser>;
  contentIds: string[];
  contentType: "pdf" | "video";
}) {
  const contentRes = await supabase
    .from("academy_content")
    .select("id,title,description,content_type,content_url,thumbnail_url")
    .eq("is_published", true)
    .eq("content_type", contentType)
    .in("id", contentIds);

  if (contentRes.error) {
    throw new Error(contentRes.error.message);
  }

  const contentRows = (contentRes.data ?? []) as AcademyContentRow[];
  if (contentRows.length === 0) return [];

  const viewsRes = await supabase
    .from("academy_views")
    .select("content_id")
    .in(
      "content_id",
      contentRows.map((row) => row.id)
    );

  if (viewsRes.error) {
    throw new Error(viewsRes.error.message);
  }

  const counts = new Map<string, number>();
  for (const row of viewsRes.data ?? []) {
    const contentId = (row as { content_id?: string }).content_id;
    if (!contentId) continue;
    counts.set(contentId, (counts.get(contentId) ?? 0) + 1);
  }

  return [...contentRows]
    .sort((a, b) => {
      const aCount = counts.get(a.id) ?? 0;
      const bCount = counts.get(b.id) ?? 0;
      if (aCount !== bCount) return bCount - aCount;
      return a.title.localeCompare(b.title);
    })
    .slice(0, 4);
}

async function getPresetItems({
  supabase,
  vehicleScope,
  assetScope,
  section,
  fallbackContentIds,
  contentType,
}: {
  supabase: ReturnType<typeof createSupabaseBrowser>;
  vehicleScope: string;
  assetScope: string;
  section: DirectoryKey;
  fallbackContentIds: string[];
  contentType: "pdf" | "video";
}) {
  const loadFeaturedIds = async (scope: string) => {
    const featuredRes = await supabase
      .from("academy_featured")
      .select("content_id,rank")
      .eq("scope", scope)
      .eq("section", section)
      .eq("is_active", true)
      .order("rank", { ascending: true });

    if (featuredRes.error) {
      throw new Error(featuredRes.error.message);
    }

    return (featuredRes.data ?? [])
      .map((row) => row.content_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
  };

  const vehicleFeaturedIds = await loadFeaturedIds(vehicleScope);
  const selectedFeaturedIds = vehicleFeaturedIds.length > 0 ? vehicleFeaturedIds : await loadFeaturedIds(assetScope);

  const filteredIds = selectedFeaturedIds.filter((id) => fallbackContentIds.includes(id));
  if (filteredIds.length === 0) {
    return [];
  }

  const contentRes = await supabase
    .from("academy_content")
    .select("id,title,description,content_type,content_url,thumbnail_url")
    .eq("is_published", true)
    .eq("content_type", contentType)
    .in("id", filteredIds);

  if (contentRes.error) {
    throw new Error(contentRes.error.message);
  }

  const contentRows = (contentRes.data ?? []) as AcademyContentRow[];
  const rank = new Map(filteredIds.map((id, index) => [id, index]));

  return [...contentRows]
    .sort((a, b) => (rank.get(a.id) ?? 9999) - (rank.get(b.id) ?? 9999))
    .slice(0, 4);
}

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 16,
  padding: 16,
  background: "rgba(255,255,255,0.03)",
};

const toggleBtnStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 9,
  background: "rgba(255,255,255,0.03)",
  color: "inherit",
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const toggleActiveStyle: React.CSSProperties = {
  border: "1px solid rgba(126,255,167,0.5)",
  background: "rgba(126,255,167,0.16)",
};

const contentCardButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 12,
  background: "rgba(255,255,255,0.03)",
  color: "inherit",
  padding: 10,
  cursor: "pointer",
};

const linkButtonStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 9,
  padding: "6px 10px",
  textDecoration: "none",
  color: "inherit",
  fontSize: 12,
  fontWeight: 700,
};
