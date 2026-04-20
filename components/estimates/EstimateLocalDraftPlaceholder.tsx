"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { crmCardStyle, crmMutedTextStyle, crmPrimaryButtonStyle, crmSecondaryButtonStyle } from "@/components/crm/styles";
import EstimateEntryWorkspace from "@/components/estimates/EstimateEntryWorkspace";
import type { CrmClient, CrmProperty } from "@/lib/crm";
import { localEstimateDraftStorageKey, type LocalEstimateDraft } from "@/lib/estimateLocalDraft";

type EstimateLocalDraftPlaceholderProps = {
  estimateId: string;
  clients: CrmClient[];
  properties: CrmProperty[];
  crmLoadError?: string | null;
};

type LocalDraftSnapshot = {
  draft: LocalEstimateDraft | null;
  error: string | null;
  loaded: boolean;
};

function readLocalDraftSnapshot(estimateId: string): LocalDraftSnapshot {
  if (typeof window === "undefined") {
    return { draft: null, error: null, loaded: false };
  }

  try {
    const raw = window.localStorage.getItem(localEstimateDraftStorageKey(estimateId));
    if (!raw) {
      return {
        draft: null,
        error: "This local estimate draft is not available in this browser.",
        loaded: true,
      };
    }

    return {
      draft: JSON.parse(raw) as LocalEstimateDraft,
      error: null,
      loaded: true,
    };
  } catch (error) {
    return {
      draft: null,
      error: error instanceof Error ? error.message : "Unable to load this local estimate draft.",
      loaded: true,
    };
  }
}

export default function EstimateLocalDraftPlaceholder({
  estimateId,
  clients,
  properties,
  crmLoadError = null,
}: EstimateLocalDraftPlaceholderProps) {
  const [loadResult, setLoadResult] = useState<LocalDraftSnapshot>({
    draft: null,
    error: null,
    loaded: false,
  });

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setLoadResult(readLocalDraftSnapshot(estimateId));
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [estimateId]);

  const draft = loadResult.draft;
  const loadError = loadResult.error;
  const loaded = loadResult.loaded;

  if (loadError) {
    return (
      <section style={crmCardStyle}>
        <div style={{ display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0 }}>Local Estimate Unavailable</h2>
          <div style={crmMutedTextStyle}>{loadError}</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/estimates/new" style={crmPrimaryButtonStyle}>
              Start New Estimate
            </Link>
            <Link href="/estimates" style={crmSecondaryButtonStyle}>
              Back to Estimates
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (!loaded || !draft) {
    return (
      <section style={crmCardStyle}>
        <div style={{ ...crmMutedTextStyle }}>Loading local estimate draft…</div>
      </section>
    );
  }

  return (
    <EstimateEntryWorkspace
      key={estimateId}
      clients={clients}
      properties={properties}
      crmLoadError={crmLoadError}
      initialDraft={draft}
      localDraftId={estimateId}
    />
  );
}
