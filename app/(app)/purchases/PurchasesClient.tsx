"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import EmployeeMenuSelect from "@/components/EmployeeMenuSelect";
import {
  employeeBadgePrimary,
  fetchEmployeeAvatarUrls,
  type EmployeeBadgeOption,
} from "@/lib/employeeBadges";
import {
  canApApprovePurchase,
  canCreatePurchaseRequest,
  canManagerApprovePurchase,
  purchaseOverallStatusLabel,
  PURCHASE_DEPARTMENTS,
  PURCHASE_METHOD_OPTIONS,
  PURCHASE_TIMELINE_OPTIONS,
  type PurchaseDecision,
  type PurchaseMethod,
  type PurchaseTimeline,
} from "@/lib/purchases";
import { asStickyTableHeader } from "@/lib/tableStyles";

type PurchaseRequestRow = {
  id: string;
  request_date: string;
  requested_by: string | null;
  requested_for_id: string | null;
  requested_for_name: string | null;
  department: string;
  vendor_name: string;
  estimated_total: number | string;
  timeline: string;
  reason: string;
  reimbursable: boolean;
  purchase_method_requested: string;
  purchase_method_other: string | null;
  maintenance_request_type: "vehicle" | "equipment" | null;
  maintenance_request_id: string | null;
  maintenance_log_type: "vehicle" | "equipment" | null;
  maintenance_log_id: string | null;
  asset_type: "vehicle" | "equipment" | null;
  asset_id: string | null;
  manager_status: string;
  manager_approved_at: string | null;
  manager_approved_by: string | null;
  manager_signature: string | null;
  manager_note: string | null;
  ap_status: string;
  ap_reviewed_at: string | null;
  ap_reviewed_by: string | null;
  ap_signature: string | null;
  ap_note: string | null;
  funds_available_date: string | null;
  ap_payment_method: string | null;
  ap_payment_method_other: string | null;
  ap_po_number: string | null;
  detail_purchase_date: string | null;
  detail_total_amount: number | string | null;
  detail_purchase_method: string | null;
  detail_purchase_method_other: string | null;
  detail_purpose: string | null;
  detail_reimbursable: boolean | null;
  detail_receipt_attached: boolean | null;
  detail_comments: string | null;
  detail_manager_signature: string | null;
  detail_manager_approved_date: string | null;
  detail_submitted_at: string | null;
  overall_status:
    | "waiting_operations_manager_approval"
    | "waiting_ap_department_approval"
    | "approved_purchases"
    | "past_purchases"
    | "denied"
    | "completed";
  created_at: string;
  updated_at: string;
};

type PurchaseItemRow = {
  id: string;
  purchase_request_id: string;
  item_name: string;
  item_description: string | null;
  quantity: number | string;
  estimated_unit_cost: number | string | null;
  estimated_total: number | string | null;
  manager_decision: string;
  manager_note: string | null;
  ap_decision: string;
  ap_note: string | null;
  approved_payment_method: string | null;
  approved_payment_method_other: string | null;
  approved_po_number: string | null;
  funds_available_date: string | null;
  created_at: string;
  updated_at: string;
};

type PurchaseAttachmentRow = {
  id: string;
  purchase_request_id: string;
  item_id: string | null;
  attachment_type: "quote" | "receipt";
  file_name: string;
  storage_bucket: string;
  storage_path: string;
  uploaded_by: string | null;
  created_at: string;
};

type PurchaseVendorRow = {
  id: string;
  purchase_request_id: string;
  vendor_name: string;
  sort_order: number;
  created_at: string;
};

type MaintenanceLogOption = {
  id: string;
  type: "vehicle" | "equipment";
  asset_id: string;
  asset_name: string | null;
  status: string | null;
  created_at: string;
  title: string | null;
  maintenance_request_id: string | null;
};

type TeammateOption = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  full_name: string | null;
  name: string;
  email: string | null;
  role: string | null;
  department: string | null;
  status: string | null;
};

type PurchasesResponse = {
  requests?: PurchaseRequestRow[];
  itemsByRequestId?: Record<string, PurchaseItemRow[]>;
  attachmentsByRequestId?: Record<string, PurchaseAttachmentRow[]>;
  vendorsByRequestId?: Record<string, PurchaseVendorRow[]>;
  teammates?: TeammateOption[];
  maintenanceLogOptions?: MaintenanceLogOption[];
  prefill?: {
    requestedForId?: string | null;
    department?: string | null;
    timeline?: PurchaseTimeline | null;
    reason?: string | null;
  } | null;
  error?: string;
};

type ItemDraft = {
  localId: string;
  name: string;
  description: string;
  quantity: string;
  estimatedUnitCost: string;
  estimatedTotal: string;
};

type VendorDraft = {
  localId: string;
  name: string;
};

type ManagerDecisionDraft = {
  decision: PurchaseDecision;
  note: string;
};

type ApDecisionDraft = {
  decision: PurchaseDecision;
  note: string;
  approvedPaymentMethod: string;
  approvedPaymentMethodOther: string;
  approvedPoNumber: string;
  fundsAvailableDate: string;
};

type QueueBucketValue = PurchaseRequestRow["overall_status"];
type QueueBucket = {
  value: QueueBucketValue;
  label: string;
};

const REQUEST_QUEUE_BUCKETS: QueueBucket[] = [
  { value: "waiting_operations_manager_approval", label: "Waiting for Operations Manager Approval" },
  { value: "waiting_ap_department_approval", label: "Waiting for AP Department Approval" },
  { value: "denied", label: "Denied" },
];

const DETAIL_QUEUE_BUCKETS: QueueBucket[] = [
  { value: "approved_purchases", label: "Approved Purchases" },
  { value: "past_purchases", label: "Past Purchases" },
  { value: "completed", label: "Completed (Linked Maintenance Closed)" },
];

const REQUEST_FILTER_OPTIONS = [
  { value: "all", label: "All Request Buckets" },
  ...REQUEST_QUEUE_BUCKETS,
] as const;

const DETAIL_FILTER_OPTIONS = [
  { value: "all", label: "All Detail Buckets" },
  ...DETAIL_QUEUE_BUCKETS,
] as const;

function asCurrency(value: number | string | null | undefined) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
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

function summarizeVendors(vendors: string[]) {
  if (!vendors.length) return "No vendor";
  if (vendors.length === 1) return vendors[0];
  return `${vendors[0]} +${vendors.length - 1} more`;
}

function maintenanceLogOptionLabel(row: MaintenanceLogOption) {
  const type = row.type === "vehicle" ? "Vehicle" : "Equipment";
  const title = row.title?.trim() ? row.title.trim() : "Maintenance Log";
  const asset = row.asset_name?.trim() ? row.asset_name.trim() : row.asset_id;
  const status = row.status?.trim() ? row.status.trim() : "Unknown status";
  const date = fmtDate(row.created_at);
  return `${type} · ${title} · ${asset} · ${status} · ${date}`;
}

function statusBadgeStyle(status: string): React.CSSProperties {
  const base: React.CSSProperties = {
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.18)",
    padding: "3px 10px",
    fontSize: 12,
    fontWeight: 800,
    whiteSpace: "nowrap",
  };
  if (
    status === "approved_purchases" ||
    status === "approved" ||
    status === "partially_approved" ||
    status === "past_purchases" ||
    status === "completed"
  ) {
    return { ...base, borderColor: "rgba(70,220,120,0.45)", background: "rgba(70,220,120,0.16)" };
  }
  if (
    status === "waiting_operations_manager_approval" ||
    status === "pending_manager_approval" ||
    status === "waiting_ap_department_approval" ||
    status === "pending_ap_approval"
  ) {
    return { ...base, borderColor: "rgba(245,200,90,0.45)", background: "rgba(245,200,90,0.16)" };
  }
  if (status === "denied") {
    return { ...base, borderColor: "rgba(255,110,110,0.45)", background: "rgba(255,110,110,0.18)" };
  }
  return { ...base, borderColor: "rgba(120,180,255,0.45)", background: "rgba(120,180,255,0.14)" };
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
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.04)",
    color: "inherit",
  };
}

function buttonStyle(): React.CSSProperties {
  return {
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.06)",
    color: "inherit",
    borderRadius: 10,
    padding: "10px 12px",
    fontWeight: 800,
    cursor: "pointer",
  };
}

function primaryButtonStyle(): React.CSSProperties {
  return {
    ...buttonStyle(),
    background: "rgba(44, 165, 95, 0.22)",
    borderColor: "rgba(44, 165, 95, 0.52)",
  };
}

export default function PurchasesClient({
  role,
  fullName,
  email,
}: {
  role: string;
  fullName: string | null;
  email: string | null;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const returnToRaw = (sp?.get("returnTo") || "").trim();
  const returnTo = returnToRaw.startsWith("/") ? returnToRaw : "";
  const canCreate = canCreatePurchaseRequest(role);
  const canManagerApprove = canManagerApprovePurchase(role);
  const canApApprove = canApApprovePurchase(role);

  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [requests, setRequests] = useState<PurchaseRequestRow[]>([]);
  const [itemsByRequestId, setItemsByRequestId] = useState<Record<string, PurchaseItemRow[]>>({});
  const [attachmentsByRequestId, setAttachmentsByRequestId] = useState<Record<string, PurchaseAttachmentRow[]>>({});
  const [vendorsByRequestId, setVendorsByRequestId] = useState<Record<string, PurchaseVendorRow[]>>({});
  const [teammates, setTeammates] = useState<TeammateOption[]>([]);
  const [avatarUrlById, setAvatarUrlById] = useState<Record<string, string>>({});
  const [maintenanceLogOptions, setMaintenanceLogOptions] = useState<MaintenanceLogOption[]>([]);
  const [maintenanceLogSearch, setMaintenanceLogSearch] = useState("");
  const [requestQueueFilter, setRequestQueueFilter] = useState<(typeof REQUEST_FILTER_OPTIONS)[number]["value"]>("all");
  const [detailQueueFilter, setDetailQueueFilter] = useState<(typeof DETAIL_FILTER_OPTIONS)[number]["value"]>("all");
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const prefillAppliedKeyRef = useRef("__unset__");

  const [requestedForId, setRequestedForId] = useState("");
  const [department, setDepartment] = useState<(typeof PURCHASE_DEPARTMENTS)[number]>("Maintenance");
  const [vendors, setVendors] = useState<VendorDraft[]>([
    { localId: crypto.randomUUID(), name: "" },
  ]);
  const [estimatedTotal, setEstimatedTotal] = useState("");
  const [timeline, setTimeline] = useState<PurchaseTimeline | "">("");
  const [reason, setReason] = useState("");
  const [reimbursable, setReimbursable] = useState(false);
  const [purchaseMethod, setPurchaseMethod] = useState<PurchaseMethod>("Credit Card");
  const [purchaseMethodOther, setPurchaseMethodOther] = useState("");
  const [maintenanceRequestType, setMaintenanceRequestType] = useState<"" | "vehicle" | "equipment">("");
  const [maintenanceRequestId, setMaintenanceRequestId] = useState("");
  const [maintenanceLogType, setMaintenanceLogType] = useState<"" | "vehicle" | "equipment">("");
  const [maintenanceLogId, setMaintenanceLogId] = useState("");
  const [assetType, setAssetType] = useState<"" | "vehicle" | "equipment">("");
  const [assetId, setAssetId] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([
    {
      localId: crypto.randomUUID(),
      name: "",
      description: "",
      quantity: "1",
      estimatedUnitCost: "",
      estimatedTotal: "",
    },
  ]);
  const [quoteFiles, setQuoteFiles] = useState<File[]>([]);

  const [managerSignature, setManagerSignature] = useState("");
  const [managerNote, setManagerNote] = useState("");
  const [managerDecisions, setManagerDecisions] = useState<Record<string, ManagerDecisionDraft>>({});

  const [apSignature, setApSignature] = useState("");
  const [apNote, setApNote] = useState("");
  const [apFundsAvailableDate, setApFundsAvailableDate] = useState("");
  const [apPaymentMethod, setApPaymentMethod] = useState("");
  const [apPaymentMethodOther, setApPaymentMethodOther] = useState("");
  const [apPoNumber, setApPoNumber] = useState("");
  const [apDecisions, setApDecisions] = useState<Record<string, ApDecisionDraft>>({});

  const [detailPurchaseDate, setDetailPurchaseDate] = useState("");
  const [detailTotalAmount, setDetailTotalAmount] = useState("");
  const [detailPurchaseMethod, setDetailPurchaseMethod] = useState("");
  const [detailPurchaseMethodOther, setDetailPurchaseMethodOther] = useState("");
  const [detailPurpose, setDetailPurpose] = useState("");
  const [detailReimbursable, setDetailReimbursable] = useState<boolean | null>(null);
  const [detailReceiptAttached, setDetailReceiptAttached] = useState<boolean | null>(null);
  const [detailComments, setDetailComments] = useState("");
  const [detailManagerSignature, setDetailManagerSignature] = useState("");
  const [detailManagerApprovedDate, setDetailManagerApprovedDate] = useState("");

  const createQuoteCaptureRef = useRef<HTMLInputElement | null>(null);
  const createQuoteFileRef = useRef<HTMLInputElement | null>(null);
  const detailQuoteCaptureRef = useRef<HTMLInputElement | null>(null);
  const detailQuoteFileRef = useRef<HTMLInputElement | null>(null);
  const receiptCaptureRef = useRef<HTMLInputElement | null>(null);
  const receiptFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const qMaintenanceRequestType = sp?.get("maintenanceRequestType");
    const qMaintenanceRequestId = sp?.get("maintenanceRequestId");
    const qMaintenanceLogType = sp?.get("maintenanceLogType");
    const qMaintenanceLogId = sp?.get("maintenanceLogId");
    const qAssetType = sp?.get("assetType");
    const qAssetId = sp?.get("assetId");
    if (qMaintenanceRequestType === "vehicle" || qMaintenanceRequestType === "equipment") {
      setMaintenanceRequestType(qMaintenanceRequestType);
    }
    if (qMaintenanceRequestId) setMaintenanceRequestId(qMaintenanceRequestId);
    if (qMaintenanceLogType === "vehicle" || qMaintenanceLogType === "equipment") {
      setMaintenanceLogType(qMaintenanceLogType);
    }
    if (qMaintenanceLogId) setMaintenanceLogId(qMaintenanceLogId);
    if (qAssetType === "vehicle" || qAssetType === "equipment") setAssetType(qAssetType);
    if (qAssetId) setAssetId(qAssetId);
  }, [sp]);

  async function loadData(preferSelectedId?: string) {
    setLoading(true);
    setLoadingError(null);
    const params = new URLSearchParams();
    if (maintenanceRequestType) params.set("maintenanceRequestType", maintenanceRequestType);
    if (maintenanceRequestId.trim()) params.set("maintenanceRequestId", maintenanceRequestId.trim());
    if (maintenanceLogType) params.set("maintenanceLogType", maintenanceLogType);
    if (maintenanceLogId.trim()) params.set("maintenanceLogId", maintenanceLogId.trim());
    if (assetType) params.set("assetType", assetType);
    if (assetId.trim()) params.set("assetId", assetId.trim());
    params.set("prefill", "1");
    params.set("includeLinks", "1");
    const contextKey = [
      maintenanceRequestType || "",
      maintenanceRequestId.trim(),
      maintenanceLogType || "",
      maintenanceLogId.trim(),
      assetType || "",
      assetId.trim(),
    ].join("|");
    const res = await fetch(`/api/purchases?${params.toString()}`, { method: "GET" });
    const json = (await res.json().catch(() => ({}))) as PurchasesResponse;
    if (!res.ok) {
      setLoadingError(json.error || "Failed to load purchases.");
      setLoading(false);
      return;
    }
    const nextRequests = Array.isArray(json.requests) ? json.requests : [];
    setRequests(nextRequests);
    setItemsByRequestId(json.itemsByRequestId ?? {});
    setAttachmentsByRequestId(json.attachmentsByRequestId ?? {});
    setVendorsByRequestId(json.vendorsByRequestId ?? {});
    setTeammates(Array.isArray(json.teammates) ? json.teammates : []);
    setMaintenanceLogOptions(Array.isArray(json.maintenanceLogOptions) ? json.maintenanceLogOptions : []);

    if (prefillAppliedKeyRef.current !== contextKey && json.prefill) {
      const prefill = json.prefill;
      if (typeof prefill.requestedForId === "string" && prefill.requestedForId) {
        setRequestedForId((prev) => (prev.trim() ? prev : prefill.requestedForId ?? ""));
      }
      if (typeof prefill.department === "string" && PURCHASE_DEPARTMENTS.includes(prefill.department as (typeof PURCHASE_DEPARTMENTS)[number])) {
        setDepartment((prev) =>
          prev === "Maintenance"
            ? (prefill.department as (typeof PURCHASE_DEPARTMENTS)[number])
            : prev
        );
      }
      if (typeof prefill.timeline === "string" && prefill.timeline) {
        setTimeline((prev) => (prev ? prev : (prefill.timeline as PurchaseTimeline)));
      }
      if (typeof prefill.reason === "string" && prefill.reason) {
        setReason((prev) => (prev.trim() ? prev : prefill.reason ?? ""));
      }
      prefillAppliedKeyRef.current = contextKey;
    }

    const selected = preferSelectedId || selectedRequestId;
    if (selected && nextRequests.some((row) => row.id === selected)) {
      setSelectedRequestId(selected);
    } else {
      setSelectedRequestId(nextRequests[0]?.id ?? "");
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId, assetType, maintenanceLogId, maintenanceLogType, maintenanceRequestId, maintenanceRequestType]);

  const requestQueueRows = useMemo(
    () => requests.filter((row) => REQUEST_QUEUE_BUCKETS.some((bucket) => bucket.value === row.overall_status)),
    [requests]
  );

  const detailQueueRows = useMemo(
    () => requests.filter((row) => DETAIL_QUEUE_BUCKETS.some((bucket) => bucket.value === row.overall_status)),
    [requests]
  );

  const filteredRequestQueueRows = useMemo(() => {
    if (requestQueueFilter === "all") return requestQueueRows;
    return requestQueueRows.filter((row) => row.overall_status === requestQueueFilter);
  }, [requestQueueFilter, requestQueueRows]);

  const filteredDetailQueueRows = useMemo(() => {
    if (detailQueueFilter === "all") return detailQueueRows;
    return detailQueueRows.filter((row) => row.overall_status === detailQueueFilter);
  }, [detailQueueFilter, detailQueueRows]);

  const selectedRequest = useMemo(
    () => requests.find((row) => row.id === selectedRequestId) ?? null,
    [requests, selectedRequestId]
  );

  const selectedItems = useMemo(
    () => (selectedRequest ? itemsByRequestId[selectedRequest.id] ?? [] : []),
    [itemsByRequestId, selectedRequest]
  );

  const selectedAttachments = useMemo(
    () => (selectedRequest ? attachmentsByRequestId[selectedRequest.id] ?? [] : []),
    [attachmentsByRequestId, selectedRequest]
  );

  const selectedQuotes = useMemo(
    () => selectedAttachments.filter((row) => row.attachment_type === "quote"),
    [selectedAttachments]
  );
  const selectedReceipts = useMemo(
    () => selectedAttachments.filter((row) => row.attachment_type === "receipt"),
    [selectedAttachments]
  );
  const selectedVendors = useMemo(() => {
    if (!selectedRequest) return [];
    const rows = vendorsByRequestId[selectedRequest.id] ?? [];
    const names = rows.map((row) => row.vendor_name).filter(Boolean);
    if (names.length) return names;
    if (selectedRequest.vendor_name) return [selectedRequest.vendor_name];
    return [];
  }, [selectedRequest, vendorsByRequestId]);

  useEffect(() => {
    if (!selectedRequest) return;

    const nextManagerDraft: Record<string, ManagerDecisionDraft> = {};
    const nextApDraft: Record<string, ApDecisionDraft> = {};
    for (const item of selectedItems) {
      nextManagerDraft[item.id] = {
        decision:
          item.manager_decision === "approved" || item.manager_decision === "denied"
            ? (item.manager_decision as PurchaseDecision)
            : "pending",
        note: item.manager_note ?? "",
      };

      nextApDraft[item.id] = {
        decision:
          item.ap_decision === "approved" || item.ap_decision === "denied"
            ? (item.ap_decision as PurchaseDecision)
            : "pending",
        note: item.ap_note ?? "",
        approvedPaymentMethod: item.approved_payment_method ?? selectedRequest.ap_payment_method ?? "",
        approvedPaymentMethodOther: item.approved_payment_method_other ?? selectedRequest.ap_payment_method_other ?? "",
        approvedPoNumber: item.approved_po_number ?? selectedRequest.ap_po_number ?? "",
        fundsAvailableDate: item.funds_available_date ?? selectedRequest.funds_available_date ?? "",
      };
    }
    setManagerDecisions(nextManagerDraft);
    setManagerSignature(selectedRequest.manager_signature ?? "");
    setManagerNote(selectedRequest.manager_note ?? "");

    setApDecisions(nextApDraft);
    setApSignature(selectedRequest.ap_signature ?? "");
    setApNote(selectedRequest.ap_note ?? "");
    setApFundsAvailableDate(selectedRequest.funds_available_date ?? "");
    setApPaymentMethod(selectedRequest.ap_payment_method ?? "");
    setApPaymentMethodOther(selectedRequest.ap_payment_method_other ?? "");
    setApPoNumber(selectedRequest.ap_po_number ?? "");

    const initialMethod =
      selectedRequest.detail_purchase_method ??
      selectedRequest.ap_payment_method ??
      selectedRequest.purchase_method_requested ??
      "";
    setDetailPurchaseDate(
      selectedRequest.detail_purchase_date ??
        selectedRequest.request_date ??
        new Date().toISOString().slice(0, 10)
    );
    setDetailTotalAmount(
      selectedRequest.detail_total_amount != null
        ? String(selectedRequest.detail_total_amount)
        : selectedRequest.estimated_total != null
          ? String(selectedRequest.estimated_total)
          : ""
    );
    setDetailPurchaseMethod(initialMethod);
    setDetailPurchaseMethodOther(
      selectedRequest.detail_purchase_method_other ??
        selectedRequest.ap_payment_method_other ??
        ""
    );
    setDetailPurpose(selectedRequest.detail_purpose ?? selectedRequest.reason ?? "");
    setDetailReimbursable(
      typeof selectedRequest.detail_reimbursable === "boolean"
        ? selectedRequest.detail_reimbursable
        : selectedRequest.reimbursable
    );
    setDetailReceiptAttached(
      typeof selectedRequest.detail_receipt_attached === "boolean"
        ? selectedRequest.detail_receipt_attached
        : null
    );
    setDetailComments(selectedRequest.detail_comments ?? "");
    setDetailManagerSignature(selectedRequest.detail_manager_signature ?? "");
    setDetailManagerApprovedDate(selectedRequest.detail_manager_approved_date ?? "");
  }, [selectedItems, selectedRequest]);

  useEffect(() => {
    if (detailReceiptAttached !== null) return;
    if (selectedReceipts.length > 0) {
      setDetailReceiptAttached(true);
    }
  }, [detailReceiptAttached, selectedReceipts.length]);

  const activeTeammates = useMemo(
    () =>
      teammates
        .filter((row) => !row.status || row.status.toLowerCase() === "active")
        .sort((a, b) => employeeBadgePrimary(a).localeCompare(employeeBadgePrimary(b))),
    [teammates]
  );

  const teammateBadgeOptions = useMemo(
    () =>
      activeTeammates.map(
        (row) =>
          ({
            id: row.id,
            first_name: row.first_name,
            last_name: row.last_name,
            nickname: row.nickname,
            full_name: row.full_name,
            email: row.email,
            department: row.department,
            role: row.role,
            status: row.status,
          }) as EmployeeBadgeOption
      ),
    [activeTeammates]
  );

  useEffect(() => {
    let active = true;
    const ids = teammateBadgeOptions.map((row) => row.id).filter(Boolean);
    if (!ids.length) {
      void Promise.resolve().then(() => {
        if (!active) return;
        setAvatarUrlById({});
      });
      return;
    }
    void (async () => {
      const urls = await fetchEmployeeAvatarUrls(ids);
      if (!active) return;
      setAvatarUrlById(urls);
    })();
    return () => {
      active = false;
    };
  }, [teammateBadgeOptions]);

  const filteredMaintenanceLogOptions = useMemo(() => {
    const needle = maintenanceLogSearch.trim().toLowerCase();
    if (!needle) return maintenanceLogOptions;
    return maintenanceLogOptions.filter((row) => {
      const haystack = [
        row.id,
        row.type,
        row.asset_id,
        row.asset_name ?? "",
        row.status ?? "",
        row.title ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [maintenanceLogOptions, maintenanceLogSearch]);

  const selectedMaintenanceLogOption = useMemo(() => {
    if (!maintenanceLogType || !maintenanceLogId) return null;
    return (
      maintenanceLogOptions.find(
        (row) => row.type === maintenanceLogType && row.id === maintenanceLogId
      ) ?? null
    );
  }, [maintenanceLogId, maintenanceLogOptions, maintenanceLogType]);

  function updateItem(localId: string, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((row) => (row.localId === localId ? { ...row, ...patch } : row)));
  }

  function selectMaintenanceLog(value: string) {
    if (!value) {
      setMaintenanceLogType("");
      setMaintenanceLogId("");
      setMaintenanceRequestType("");
      setMaintenanceRequestId("");
      return;
    }
    const [nextType, nextId] = value.split(":");
    if ((nextType !== "vehicle" && nextType !== "equipment") || !nextId) return;
    const option =
      maintenanceLogOptions.find((row) => row.type === nextType && row.id === nextId) ?? null;
    setMaintenanceLogType(nextType);
    setMaintenanceLogId(nextId);
    if (option?.maintenance_request_id) {
      setMaintenanceRequestType(nextType);
      setMaintenanceRequestId(option.maintenance_request_id);
    } else {
      setMaintenanceRequestType("");
      setMaintenanceRequestId("");
    }
    if (option?.asset_id) {
      setAssetType(nextType);
      setAssetId(option.asset_id);
    }
  }

  function updateVendor(localId: string, patch: Partial<VendorDraft>) {
    setVendors((prev) => prev.map((row) => (row.localId === localId ? { ...row, ...patch } : row)));
  }

  function addVendorRow() {
    setVendors((prev) => [...prev, { localId: crypto.randomUUID(), name: "" }]);
  }

  function removeVendorRow(localId: string) {
    setVendors((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.localId !== localId)));
  }

  function addItemRow() {
    setItems((prev) => [
      ...prev,
      {
        localId: crypto.randomUUID(),
        name: "",
        description: "",
        quantity: "1",
        estimatedUnitCost: "",
        estimatedTotal: "",
      },
    ]);
  }

  function removeItemRow(localId: string) {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.localId !== localId)));
  }

  function resetCreateForm() {
    setVendors([{ localId: crypto.randomUUID(), name: "" }]);
    setEstimatedTotal("");
    setTimeline("");
    setReason("");
    setReimbursable(false);
    setPurchaseMethod("Credit Card");
    setPurchaseMethodOther("");
    setItems([
      {
        localId: crypto.randomUUID(),
        name: "",
        description: "",
        quantity: "1",
        estimatedUnitCost: "",
        estimatedTotal: "",
      },
    ]);
    setQuoteFiles([]);
  }

  async function uploadAttachments(
    purchaseRequestId: string,
    attachmentType: "quote" | "receipt",
    files: File[],
    itemId?: string
  ) {
    for (const file of files) {
      const fd = new FormData();
      fd.set("purchaseRequestId", purchaseRequestId);
      fd.set("attachmentType", attachmentType);
      if (itemId) fd.set("itemId", itemId);
      fd.set("file", file);
      const uploadRes = await fetch("/api/purchases/attachments", {
        method: "POST",
        body: fd,
      });
      if (!uploadRes.ok) {
        const uploadJson = (await uploadRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(uploadJson.error || "Attachment upload failed.");
      }
    }
  }

  async function onCreateRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreate) {
      setInlineMessage("You do not have permission to create purchase requests.");
      return;
    }
    if (!requestedForId.trim()) {
      setInlineMessage("Teammate Name is required.");
      return;
    }
    const preparedVendors = vendors
      .map((row) => row.name.trim())
      .filter((name, idx, arr) => name && arr.findIndex((v) => v.toLowerCase() === name.toLowerCase()) === idx);
    if (!preparedVendors.length) {
      setInlineMessage("Vendor/store name is required.");
      return;
    }
    if (!reason.trim()) {
      setInlineMessage("Reason for purchase is required.");
      return;
    }
    const preparedItems = items
      .map((row) => ({
        name: row.name.trim(),
        description: row.description.trim(),
        quantity: row.quantity.trim() || "1",
        estimatedUnitCost: row.estimatedUnitCost.trim(),
        estimatedTotal: row.estimatedTotal.trim(),
      }))
      .filter((row) => row.name);
    if (!preparedItems.length) {
      setInlineMessage("At least one item is required.");
      return;
    }
    if (purchaseMethod === "Other" && !purchaseMethodOther.trim()) {
      setInlineMessage("Please specify the purchase method.");
      return;
    }

    setSaving(true);
    setInlineMessage(null);
    const payload = {
      requestedForId,
      department,
      vendors: preparedVendors,
      estimatedTotal,
      timeline: timeline || undefined,
      reason,
      reimbursable,
      purchaseMethodRequested: purchaseMethod,
      purchaseMethodOther: purchaseMethod === "Other" ? purchaseMethodOther.trim() : "",
      maintenanceRequestType: maintenanceRequestType || undefined,
      maintenanceRequestId: maintenanceRequestId.trim() || undefined,
      maintenanceLogType: maintenanceLogType || undefined,
      maintenanceLogId: maintenanceLogId.trim() || undefined,
      assetType: assetType || undefined,
      assetId: assetId.trim() || undefined,
      items: preparedItems,
    };

    const res = await fetch("/api/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => ({}))) as {
      request?: PurchaseRequestRow;
      error?: string;
    };
    if (!res.ok || !json.request?.id) {
      setInlineMessage(json.error || "Failed to create purchase request.");
      setSaving(false);
      return;
    }

    try {
      if (quoteFiles.length > 0) {
        await uploadAttachments(json.request.id, "quote", quoteFiles);
      }
      resetCreateForm();
      if (returnTo) {
        router.replace(returnTo);
        return;
      }
      await loadData(json.request.id);
      setInlineMessage("Purchase request created.");
    } catch (err) {
      setInlineMessage((err as Error).message || "Request created but attachment upload failed.");
      if (returnTo) {
        router.replace(returnTo);
        return;
      }
      await loadData(json.request.id);
    } finally {
      setSaving(false);
    }
  }

  async function submitManagerApproval() {
    if (!selectedRequest) return;
    setSaving(true);
    setInlineMessage(null);
    const managerDecisionsPayload = selectedItems.map((item) => ({
      itemId: item.id,
      decision: managerDecisions[item.id]?.decision ?? "pending",
      note: managerDecisions[item.id]?.note ?? "",
    }));
    const res = await fetch("/api/purchases", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: selectedRequest.id,
        stage: "manager",
        managerSignature: managerSignature.trim(),
        managerNote: managerNote.trim(),
        managerDecisions: managerDecisionsPayload,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setInlineMessage(json.error || "Failed to submit manager approval.");
      setSaving(false);
      return;
    }
    await loadData(selectedRequest.id);
    setInlineMessage("Manager approval saved.");
    setSaving(false);
  }

  async function submitApApproval() {
    if (!selectedRequest) return;
    setSaving(true);
    setInlineMessage(null);
    const apDecisionsPayload = selectedItems.map((item) => ({
      itemId: item.id,
      decision: apDecisions[item.id]?.decision ?? "pending",
      note: apDecisions[item.id]?.note ?? "",
      approvedPaymentMethod: apDecisions[item.id]?.approvedPaymentMethod || apPaymentMethod || "",
      approvedPaymentMethodOther: apDecisions[item.id]?.approvedPaymentMethodOther || apPaymentMethodOther || "",
      approvedPoNumber: apDecisions[item.id]?.approvedPoNumber || apPoNumber || "",
      fundsAvailableDate: apDecisions[item.id]?.fundsAvailableDate || apFundsAvailableDate || "",
    }));
    const res = await fetch("/api/purchases", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: selectedRequest.id,
        stage: "ap",
        apSignature: apSignature.trim(),
        apNote: apNote.trim(),
        fundsAvailableDate: apFundsAvailableDate || undefined,
        paymentMethod: apPaymentMethod || undefined,
        paymentMethodOther: apPaymentMethodOther || undefined,
        poNumber: apPoNumber || undefined,
        apDecisions: apDecisionsPayload,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setInlineMessage(json.error || "Failed to submit AP approval.");
      setSaving(false);
      return;
    }
    await loadData(selectedRequest.id);
    setInlineMessage("Accounts payable approval saved.");
    setSaving(false);
  }

  async function submitMaintenanceDetail() {
    if (!selectedRequest) return;
    if (!detailPurchaseDate) {
      setInlineMessage("Date of purchase is required.");
      return;
    }
    const parsedTotal = Number(detailTotalAmount);
    if (!Number.isFinite(parsedTotal) || parsedTotal < 0) {
      setInlineMessage("Total purchase amount must be a valid non-negative number.");
      return;
    }
    if (!detailPurchaseMethod || !PURCHASE_METHOD_OPTIONS.includes(detailPurchaseMethod as PurchaseMethod)) {
      setInlineMessage("Method of purchase is required.");
      return;
    }
    if (detailPurchaseMethod === "Other" && !detailPurchaseMethodOther.trim()) {
      setInlineMessage("Please specify the Other purchase method.");
      return;
    }
    if (!detailPurpose.trim()) {
      setInlineMessage("Purpose of purchase is required.");
      return;
    }
    if (detailReimbursable === null) {
      setInlineMessage("Please select if this is for a reimbursable expense.");
      return;
    }
    if (detailReceiptAttached === null) {
      setInlineMessage("Please select whether a receipt is attached.");
      return;
    }
    if (detailReimbursable && (!detailManagerSignature.trim() || !detailManagerApprovedDate)) {
      setInlineMessage("Manager signature and date are required for reimbursable purchases.");
      return;
    }

    setSaving(true);
    setInlineMessage(null);
    const res = await fetch("/api/purchases", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: selectedRequest.id,
        stage: "detail",
        detailPurchaseDate,
        detailTotalAmount: parsedTotal,
        detailPurchaseMethod,
        detailPurchaseMethodOther:
          detailPurchaseMethod === "Other" ? detailPurchaseMethodOther.trim() : "",
        detailPurpose: detailPurpose.trim(),
        detailReimbursable,
        detailReceiptAttached,
        detailComments: detailComments.trim(),
        detailManagerSignature: detailReimbursable ? detailManagerSignature.trim() : "",
        detailManagerApprovedDate: detailReimbursable ? detailManagerApprovedDate : "",
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setInlineMessage(json.error || "Failed to submit purchase detail.");
      setSaving(false);
      return;
    }
    await loadData(selectedRequest.id);
    setInlineMessage("Purchase detail submitted. Request moved to Past Purchases.");
    setSaving(false);
  }

  async function handleQuoteFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setQuoteFiles((prev) => [...prev, ...Array.from(files)]);
  }

  async function handleReceiptUpload(files: FileList | null) {
    if (!selectedRequest || !files || files.length === 0) return;
    setSaving(true);
    setInlineMessage(null);
    try {
      await uploadAttachments(selectedRequest.id, "receipt", Array.from(files));
      setDetailReceiptAttached(true);
      await loadData(selectedRequest.id);
      setInlineMessage("Receipt uploaded.");
    } catch (err) {
      setInlineMessage((err as Error).message || "Failed to upload receipt.");
    } finally {
      setSaving(false);
    }
  }

  async function handleQuoteUploadToExisting(files: FileList | null) {
    if (!selectedRequest || !files || files.length === 0) return;
    setSaving(true);
    setInlineMessage(null);
    try {
      await uploadAttachments(selectedRequest.id, "quote", Array.from(files));
      await loadData(selectedRequest.id);
      setInlineMessage("Quote uploaded.");
    } catch (err) {
      setInlineMessage((err as Error).message || "Failed to upload quote.");
    } finally {
      setSaving(false);
    }
  }

  function renderQueueGroup({
    title,
    filterValue,
    onFilterChange,
    filterOptions,
    buckets,
    rows,
    emptyText,
  }: {
    title: string;
    filterValue: string;
    onFilterChange: (value: string) => void;
    filterOptions: ReadonlyArray<{ value: string; label: string }>;
    buckets: QueueBucket[];
    rows: PurchaseRequestRow[];
    emptyText: string;
  }) {
    const visibleBuckets =
      filterValue === "all" ? buckets : buckets.filter((bucket) => bucket.value === filterValue);

    return (
      <div
        style={{
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 12,
          padding: 10,
          background: "rgba(255,255,255,0.02)",
          display: "grid",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 800 }}>{title}</div>
          <select value={filterValue} onChange={(e) => onFilterChange(e.target.value)} style={{ ...inputStyle(), width: 240 }}>
            {filterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {rows.length === 0 ? (
            <div style={{ opacity: 0.72, fontSize: 13 }}>{emptyText}</div>
          ) : (
            visibleBuckets.map((bucket) => {
              const bucketRows = rows.filter((row) => row.overall_status === bucket.value);
              return (
                <div
                  key={bucket.value}
                  style={{
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 12,
                    padding: 10,
                    display: "grid",
                    gap: 8,
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <div style={{ fontWeight: 800 }}>{bucket.label}</div>
                    <div style={{ opacity: 0.75, fontSize: 12 }}>
                      {bucketRows.length} request{bucketRows.length === 1 ? "" : "s"}
                    </div>
                  </div>

                  {bucketRows.length === 0 ? (
                    <div style={{ opacity: 0.66, fontSize: 13 }}>No requests in this bucket.</div>
                  ) : (
                    bucketRows.map((row) => {
                      const itemCount = (itemsByRequestId[row.id] ?? []).length;
                      const vendorNames = (vendorsByRequestId[row.id] ?? [])
                        .map((vendor) => vendor.vendor_name)
                        .filter(Boolean);
                      const vendorLabel = summarizeVendors(
                        vendorNames.length ? vendorNames : [row.vendor_name]
                      );
                      const selected = row.id === selectedRequestId;
                      return (
                        <button
                          key={row.id}
                          type="button"
                          onClick={() => setSelectedRequestId(row.id)}
                          style={{
                            textAlign: "left",
                            borderRadius: 12,
                            border: selected
                              ? "1px solid rgba(120,180,255,0.7)"
                              : "1px solid rgba(255,255,255,0.14)",
                            background: selected ? "rgba(120,180,255,0.12)" : "rgba(255,255,255,0.03)",
                            color: "inherit",
                            padding: 12,
                            cursor: "pointer",
                            display: "grid",
                            gap: 6,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                            <div style={{ fontWeight: 800 }}>{vendorLabel}</div>
                            <span style={statusBadgeStyle(row.overall_status)}>
                              {purchaseOverallStatusLabel(row.overall_status)}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, opacity: 0.86 }}>
                            {row.requested_for_name || row.requested_for_id || "Unassigned teammate"} · {row.department}
                          </div>
                          <div style={{ fontSize: 13, opacity: 0.75 }}>
                            {itemCount} item{itemCount === 1 ? "" : "s"} · {asCurrency(row.estimated_total)}
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.65 }}>Requested {fmtDate(row.created_at)}</div>
                        </button>
                      );
                    })
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  return (
    <main style={{ maxWidth: 1400, margin: "0 auto", paddingBottom: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Purchases</h1>
          <div style={{ opacity: 0.78 }}>
            Workflow: Operations Manager approval to AP approval to Approved Purchases to Past Purchases.
          </div>
        </div>
        <Link href="/" style={buttonStyle()}>
          Back Home
        </Link>
      </div>

      <div style={{ marginTop: 12, ...cardStyle() }}>
        Signed in as <strong>{(fullName || email || "Unknown").trim()}</strong> ({role.replaceAll("_", " ")})
      </div>

      {inlineMessage ? (
        <div style={{ marginTop: 12, ...cardStyle(), opacity: 0.95 }}>{inlineMessage}</div>
      ) : null}

      {loading ? (
        <div style={{ marginTop: 12, ...cardStyle() }}>Loading purchases...</div>
      ) : loadingError ? (
        <div style={{ marginTop: 12, ...cardStyle(), color: "#ffb0b0" }}>{loadingError}</div>
      ) : (
        <>
          <section style={{ marginTop: 14, display: "grid", gap: 14 }}>
            <form onSubmit={onCreateRequest} style={{ ...cardStyle(), order: 2 }}>
              <div style={{ fontWeight: 900, marginBottom: 10 }}>Create Purchase Request</div>
              <div style={{ opacity: 0.75, marginBottom: 10 }}>Date of Request: {new Date().toLocaleDateString()}</div>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span>Teammate Name *</span>
                  <EmployeeMenuSelect
                    value={requestedForId}
                    onChange={setRequestedForId}
                    options={teammateBadgeOptions}
                    placeholder="Select teammate..."
                    disabled={!canCreate || saving}
                    avatarUrlById={avatarUrlById}
                    style={inputStyle()}
                  />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span>Department *</span>
                  <select value={department} onChange={(e) => setDepartment(e.target.value as (typeof PURCHASE_DEPARTMENTS)[number])} style={inputStyle()} disabled={!canCreate || saving}>
                    {PURCHASE_DEPARTMENTS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span>Total Estimated Purchase Amount</span>
                  <input value={estimatedTotal} onChange={(e) => setEstimatedTotal(e.target.value)} inputMode="decimal" style={inputStyle()} disabled={!canCreate || saving} />
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span>Timeline for Purchase</span>
                  <select value={timeline} onChange={(e) => setTimeline((e.target.value as PurchaseTimeline) || "")} style={inputStyle()} disabled={!canCreate || saving}>
                    <option value="">Auto (linked urgency/default)</option>
                    {PURCHASE_TIMELINE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span>Purchase Method *</span>
                  <select value={purchaseMethod} onChange={(e) => setPurchaseMethod(e.target.value as PurchaseMethod)} style={inputStyle()} disabled={!canCreate || saving}>
                    {PURCHASE_METHOD_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                {purchaseMethod === "Other" ? (
                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Other Purchase Method *</span>
                    <input
                      value={purchaseMethodOther}
                      onChange={(e) => setPurchaseMethodOther(e.target.value)}
                      style={inputStyle()}
                      disabled={!canCreate || saving}
                    />
                  </label>
                ) : null}
              </div>

              <div style={{ marginTop: 12, ...cardStyle(), padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 800 }}>Vendor(s) / Store(s) *</div>
                  <button type="button" onClick={addVendorRow} style={buttonStyle()} disabled={!canCreate || saving}>
                    Add Vendor
                  </button>
                </div>
                <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                  {vendors.map((row, idx) => (
                    <div
                      key={row.localId}
                      style={{
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 12,
                        padding: 10,
                        display: "grid",
                        gap: 8,
                        gridTemplateColumns: "minmax(0,1fr) auto",
                        alignItems: "end",
                      }}
                    >
                      <label style={{ display: "grid", gap: 6 }}>
                        <span>Vendor {idx + 1}</span>
                        <input
                          value={row.name}
                          onChange={(e) => updateVendor(row.localId, { name: e.target.value })}
                          style={inputStyle()}
                          placeholder="Type vendor/store name"
                          disabled={!canCreate || saving}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => removeVendorRow(row.localId)}
                        style={buttonStyle()}
                        disabled={!canCreate || saving || vendors.length <= 1}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <label style={{ display: "grid", gap: 6, marginTop: 10 }}>
                <span>Reason for Purchase *</span>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  style={{ ...inputStyle(), resize: "vertical" }}
                  placeholder="Specific replacement parts, emergency repair, equipment upgrades..."
                  disabled={!canCreate || saving}
                />
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                <input type="checkbox" checked={reimbursable} onChange={(e) => setReimbursable(e.target.checked)} disabled={!canCreate || saving} />
                <span>Reimbursable expense</span>
              </label>

              <div style={{ marginTop: 12, ...cardStyle(), padding: 12 }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Linked Maintenance Context (optional)</div>
                <div style={{ display: "grid", gap: 10 }}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Search Maintenance Logs</span>
                    <input
                      value={maintenanceLogSearch}
                      onChange={(e) => setMaintenanceLogSearch(e.target.value)}
                      placeholder="Search by title, asset, status, or ID"
                      style={inputStyle()}
                      disabled={!canCreate || saving}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Link Maintenance Log</span>
                    <select
                      value={
                        maintenanceLogType && maintenanceLogId
                          ? `${maintenanceLogType}:${maintenanceLogId}`
                          : ""
                      }
                      onChange={(e) => selectMaintenanceLog(e.target.value)}
                      style={inputStyle()}
                      disabled={!canCreate || saving}
                    >
                      <option value="">None</option>
                      {filteredMaintenanceLogOptions.map((row) => (
                        <option key={`${row.type}:${row.id}`} value={`${row.type}:${row.id}`}>
                          {maintenanceLogOptionLabel(row)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {selectedMaintenanceLogOption ? (
                    <div
                      style={{
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 12,
                        padding: 10,
                        background: "rgba(255,255,255,0.02)",
                        display: "grid",
                        gap: 4,
                        fontSize: 13,
                      }}
                    >
                      <div>
                        <strong>Linked Log:</strong> {selectedMaintenanceLogOption.id}
                      </div>
                      <div>
                        <strong>Type:</strong> {selectedMaintenanceLogOption.type}
                      </div>
                      <div>
                        <strong>Asset:</strong>{" "}
                        {selectedMaintenanceLogOption.asset_name || selectedMaintenanceLogOption.asset_id}
                      </div>
                      <div>
                        <strong>Maintenance Request ID:</strong>{" "}
                        {selectedMaintenanceLogOption.maintenance_request_id || "-"}
                      </div>
                    </div>
                  ) : maintenanceLogId || maintenanceRequestId || assetId ? (
                    <div
                      style={{
                        border: "1px solid rgba(255,255,255,0.12)",
                        borderRadius: 12,
                        padding: 10,
                        background: "rgba(255,255,255,0.02)",
                        display: "grid",
                        gap: 4,
                        fontSize: 13,
                      }}
                    >
                      <div>
                        <strong>Linked Log:</strong>{" "}
                        {maintenanceLogType && maintenanceLogId
                          ? `${maintenanceLogType} · ${maintenanceLogId}`
                          : "-"}
                      </div>
                      <div>
                        <strong>Linked Request:</strong>{" "}
                        {maintenanceRequestType && maintenanceRequestId
                          ? `${maintenanceRequestType} · ${maintenanceRequestId}`
                          : "-"}
                      </div>
                      <div>
                        <strong>Asset:</strong>{" "}
                        {assetType && assetId ? `${assetType} · ${assetId}` : "-"}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Item(s) Requested</div>
                <div style={{ display: "grid", gap: 10 }}>
                  {items.map((row, idx) => (
                    <div key={row.localId} style={{ ...cardStyle(), padding: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 8 }}>
                        <div style={{ fontWeight: 800 }}>Item {idx + 1}</div>
                        <button type="button" onClick={() => removeItemRow(row.localId)} style={buttonStyle()} disabled={!canCreate || saving || items.length <= 1}>
                          Remove Item
                        </button>
                      </div>
                      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
                        <label style={{ display: "grid", gap: 6 }}>
                          <span>Item *</span>
                          <input value={row.name} onChange={(e) => updateItem(row.localId, { name: e.target.value })} style={inputStyle()} disabled={!canCreate || saving} />
                        </label>
                        <label style={{ display: "grid", gap: 6 }}>
                          <span>Quantity</span>
                          <input value={row.quantity} onChange={(e) => updateItem(row.localId, { quantity: e.target.value })} style={inputStyle()} inputMode="decimal" disabled={!canCreate || saving} />
                        </label>
                        <label style={{ display: "grid", gap: 6 }}>
                          <span>Est. Unit Cost</span>
                          <input value={row.estimatedUnitCost} onChange={(e) => updateItem(row.localId, { estimatedUnitCost: e.target.value })} style={inputStyle()} inputMode="decimal" disabled={!canCreate || saving} />
                        </label>
                        <label style={{ display: "grid", gap: 6 }}>
                          <span>Est. Total</span>
                          <input value={row.estimatedTotal} onChange={(e) => updateItem(row.localId, { estimatedTotal: e.target.value })} style={inputStyle()} inputMode="decimal" disabled={!canCreate || saving} />
                        </label>
                      </div>
                      <label style={{ display: "grid", gap: 6, marginTop: 8 }}>
                        <span>Description (optional)</span>
                        <textarea value={row.description} onChange={(e) => updateItem(row.localId, { description: e.target.value })} rows={2} style={{ ...inputStyle(), resize: "vertical" }} disabled={!canCreate || saving} />
                      </label>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addItemRow} style={{ ...buttonStyle(), marginTop: 8 }} disabled={!canCreate || saving}>
                  Add Item
                </button>
              </div>

              <div style={{ marginTop: 12, ...cardStyle(), padding: 12 }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Add Quote (Camera / Photo / File)</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => createQuoteCaptureRef.current?.click()} style={buttonStyle()} disabled={!canCreate || saving}>
                    Add Quote Photo
                  </button>
                  <button type="button" onClick={() => createQuoteFileRef.current?.click()} style={buttonStyle()} disabled={!canCreate || saving}>
                    Add Quote File
                  </button>
                </div>
                <input
                  ref={createQuoteCaptureRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    void handleQuoteFiles(e.currentTarget.files);
                    e.currentTarget.value = "";
                  }}
                />
                <input
                  ref={createQuoteFileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => {
                    void handleQuoteFiles(e.currentTarget.files);
                    e.currentTarget.value = "";
                  }}
                />
                {quoteFiles.length ? (
                  <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                    {quoteFiles.map((file, idx) => (
                      <div key={`${file.name}-${idx}`} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ opacity: 0.85 }}>{file.name}</span>
                        <button
                          type="button"
                          style={buttonStyle()}
                          onClick={() =>
                            setQuoteFiles((prev) => prev.filter((_, fileIdx) => fileIdx !== idx))
                          }
                          disabled={saving}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ marginTop: 8, opacity: 0.75 }}>No quote files selected.</div>
                )}
              </div>

              <div style={{ marginTop: 12 }}>
                <button type="submit" style={primaryButtonStyle()} disabled={!canCreate || saving}>
                  {saving ? "Saving..." : "Submit Purchase Request"}
                </button>
              </div>
            </form>

            <section style={{ ...cardStyle(), order: 1 }}>
              <div style={{ fontWeight: 900 }}>Purchase Queues</div>
              <div style={{ marginTop: 10, display: "grid", gap: 10, maxHeight: 820, overflowY: "auto" }}>
                {renderQueueGroup({
                  title: "Purchase Request Queue",
                  filterValue: requestQueueFilter,
                  onFilterChange: (value) =>
                    setRequestQueueFilter(value as (typeof REQUEST_FILTER_OPTIONS)[number]["value"]),
                  filterOptions: REQUEST_FILTER_OPTIONS,
                  buckets: REQUEST_QUEUE_BUCKETS,
                  rows: filteredRequestQueueRows,
                  emptyText: "No purchase requests in request queue buckets for this filter.",
                })}
                {renderQueueGroup({
                  title: "Purchase Detail Queue",
                  filterValue: detailQueueFilter,
                  onFilterChange: (value) =>
                    setDetailQueueFilter(value as (typeof DETAIL_FILTER_OPTIONS)[number]["value"]),
                  filterOptions: DETAIL_FILTER_OPTIONS,
                  buckets: DETAIL_QUEUE_BUCKETS,
                  rows: filteredDetailQueueRows,
                  emptyText: "No purchase requests in detail queue buckets for this filter.",
                })}
              </div>
            </section>
          </section>

          {selectedRequest ? (
            <section style={{ marginTop: 14, ...cardStyle() }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>Purchase Detail</div>
                  <div style={{ opacity: 0.74 }}>Request ID: {selectedRequest.id}</div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={statusBadgeStyle(selectedRequest.overall_status)}>{purchaseOverallStatusLabel(selectedRequest.overall_status)}</span>
                  {(selectedRequest.overall_status === "approved_purchases" ||
                    selectedRequest.overall_status === "past_purchases") ? (
                    <button type="button" onClick={submitMaintenanceDetail} style={buttonStyle()} disabled={saving}>
                      {selectedRequest.overall_status === "approved_purchases"
                        ? "Submit Purchase Detail"
                        : "Update Purchase Detail"}
                    </button>
                  ) : null}
                </div>
              </div>

              {selectedRequest.overall_status === "past_purchases" ? (
                <div style={{ marginTop: 8, opacity: 0.75 }}>
                  This stays in Past Purchases until the linked maintenance log is closed.
                </div>
              ) : null}

              <div style={{ marginTop: 12, display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
                <div><strong>Teammate:</strong> {selectedRequest.requested_for_name || selectedRequest.requested_for_id || "-"}</div>
                <div><strong>Date:</strong> {fmtDateOnly(selectedRequest.request_date)}</div>
                <div><strong>Department:</strong> {selectedRequest.department}</div>
                <div>
                  <strong>Vendor(s):</strong>{" "}
                  {selectedVendors.length ? selectedVendors.join(", ") : "-"}
                </div>
                <div><strong>Estimated Total:</strong> {asCurrency(selectedRequest.estimated_total)}</div>
                <div><strong>Timeline:</strong> {selectedRequest.timeline}</div>
                <div><strong>Reimbursable:</strong> {selectedRequest.reimbursable ? "Yes" : "No"}</div>
                <div>
                  <strong>Requested Method:</strong> {selectedRequest.purchase_method_requested}
                  {selectedRequest.purchase_method_requested === "Other" && selectedRequest.purchase_method_other
                    ? ` (${selectedRequest.purchase_method_other})`
                    : ""}
                </div>
                <div><strong>Reason:</strong> {selectedRequest.reason}</div>
              </div>

              <div style={{ marginTop: 12, ...cardStyle(), padding: 12 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Outdoor Independence LLC - Purchase Detail Form</div>
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
                  <div><strong>Teammate Name:</strong> {selectedRequest.requested_for_name || selectedRequest.requested_for_id || "-"}</div>
                  <div><strong>Department/Team:</strong> {selectedRequest.department || "-"}</div>
                  <div><strong>Vendor/Store Name:</strong> {selectedVendors.length ? selectedVendors.join(", ") : "-"}</div>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Date of Purchase *</span>
                    <input
                      type="date"
                      value={detailPurchaseDate}
                      onChange={(e) => setDetailPurchaseDate(e.target.value)}
                      style={inputStyle()}
                      disabled={saving}
                    />
                  </label>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Total Purchase Amount *</span>
                    <input
                      value={detailTotalAmount}
                      onChange={(e) => setDetailTotalAmount(e.target.value)}
                      inputMode="decimal"
                      placeholder="$0.00"
                      style={inputStyle()}
                      disabled={saving}
                    />
                  </label>
                </div>

                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>Method of Purchase *</div>
                  <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
                    {PURCHASE_METHOD_OPTIONS.map((option) => (
                      <label key={option} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                          type="radio"
                          name="detailPurchaseMethod"
                          checked={detailPurchaseMethod === option}
                          onChange={() => setDetailPurchaseMethod(option)}
                          disabled={saving}
                        />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                  {detailPurchaseMethod === "Other" ? (
                    <label style={{ display: "grid", gap: 6, marginTop: 8 }}>
                      <span>Other Method *</span>
                      <input
                        value={detailPurchaseMethodOther}
                        onChange={(e) => setDetailPurchaseMethodOther(e.target.value)}
                        style={inputStyle()}
                        disabled={saving}
                      />
                    </label>
                  ) : null}
                </div>

                <label style={{ display: "grid", gap: 6, marginTop: 12 }}>
                  <span>Purpose of Purchase *</span>
                  <textarea
                    value={detailPurpose}
                    onChange={(e) => setDetailPurpose(e.target.value)}
                    rows={3}
                    style={{ ...inputStyle(), resize: "vertical" }}
                    placeholder="Please be specific – tools, materials, office supplies, etc."
                    disabled={saving}
                  />
                </label>

                <div style={{ marginTop: 12, display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}>
                  <div>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>Is this purchase for a reimbursable expense? *</div>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginRight: 12 }}>
                      <input
                        type="radio"
                        name="detailReimbursable"
                        checked={detailReimbursable === true}
                        onChange={() => setDetailReimbursable(true)}
                        disabled={saving}
                      />
                      <span>Yes</span>
                    </label>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="radio"
                        name="detailReimbursable"
                        checked={detailReimbursable === false}
                        onChange={() => setDetailReimbursable(false)}
                        disabled={saving}
                      />
                      <span>No</span>
                    </label>
                  </div>

                  <div>
                    <div style={{ fontWeight: 800, marginBottom: 6 }}>Receipt Attached? *</div>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 8, marginRight: 12 }}>
                      <input
                        type="radio"
                        name="detailReceiptAttached"
                        checked={detailReceiptAttached === true}
                        onChange={() => setDetailReceiptAttached(true)}
                        disabled={saving}
                      />
                      <span>Yes</span>
                    </label>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="radio"
                        name="detailReceiptAttached"
                        checked={detailReceiptAttached === false}
                        onChange={() => setDetailReceiptAttached(false)}
                        disabled={saving}
                      />
                      <span>No</span>
                    </label>
                  </div>
                </div>

                <label style={{ display: "grid", gap: 6, marginTop: 12 }}>
                  <span>Additional Comments or Notes</span>
                  <textarea
                    value={detailComments}
                    onChange={(e) => setDetailComments(e.target.value)}
                    rows={2}
                    style={{ ...inputStyle(), resize: "vertical" }}
                    disabled={saving}
                  />
                </label>

                <div style={{ marginTop: 12, ...cardStyle(), padding: 10 }}>
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>
                    Manager Approval (Required for any reimbursement)
                  </div>
                  <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span>Signature {detailReimbursable ? "*" : "(optional)"}</span>
                      <input
                        value={detailManagerSignature}
                        onChange={(e) => setDetailManagerSignature(e.target.value)}
                        style={inputStyle()}
                        disabled={saving}
                      />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span>Date {detailReimbursable ? "*" : "(optional)"}</span>
                      <input
                        type="date"
                        value={detailManagerApprovedDate}
                        onChange={(e) => setDetailManagerApprovedDate(e.target.value)}
                        style={inputStyle()}
                        disabled={saving}
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 10, ...cardStyle(), padding: 12 }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>Maintenance Link</div>
                <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
                  <div>
                    <strong>Asset:</strong>{" "}
                    {selectedRequest.asset_type && selectedRequest.asset_id
                      ? `${selectedRequest.asset_type} · ${selectedRequest.asset_id}`
                      : "None"}
                  </div>
                  <div>
                    <strong>Maintenance Request:</strong>{" "}
                    {selectedRequest.maintenance_request_type && selectedRequest.maintenance_request_id
                      ? `${selectedRequest.maintenance_request_type} · ${selectedRequest.maintenance_request_id}`
                      : "None"}
                  </div>
                  <div>
                    <strong>Maintenance Log:</strong>{" "}
                    {selectedRequest.maintenance_log_type && selectedRequest.maintenance_log_id
                      ? `${selectedRequest.maintenance_log_type} · ${selectedRequest.maintenance_log_id}`
                      : "None"}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Requested Items</div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Item</th>
                        <th style={thStyle}>Qty</th>
                        <th style={thStyle}>Est Unit</th>
                        <th style={thStyle}>Est Total</th>
                        <th style={thStyle}>Manager</th>
                        <th style={thStyle}>AP</th>
                        <th style={thStyle}>PO / Funds</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedItems.map((item) => (
                        <tr key={item.id}>
                          <td style={tdStyle}>
                            <div style={{ fontWeight: 700 }}>{item.item_name}</div>
                            {item.item_description ? (
                              <div style={{ opacity: 0.72, fontSize: 12 }}>{item.item_description}</div>
                            ) : null}
                          </td>
                          <td style={tdStyle}>{item.quantity}</td>
                          <td style={tdStyle}>{asCurrency(item.estimated_unit_cost)}</td>
                          <td style={tdStyle}>{asCurrency(item.estimated_total)}</td>
                          <td style={tdStyle}>{item.manager_decision}</td>
                          <td style={tdStyle}>{item.ap_decision}</td>
                          <td style={tdStyle}>
                            {item.approved_po_number || "-"}
                            <div style={{ fontSize: 12, opacity: 0.7 }}>
                              {item.funds_available_date ? `Funds: ${fmtDateOnly(item.funds_available_date)}` : "Funds: -"}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
                <div style={{ ...cardStyle(), padding: 12 }}>
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>Quotes</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                    <button type="button" onClick={() => detailQuoteCaptureRef.current?.click()} style={buttonStyle()} disabled={saving}>
                      Add Quote Photo
                    </button>
                    <button type="button" onClick={() => detailQuoteFileRef.current?.click()} style={buttonStyle()} disabled={saving}>
                      Add Quote File
                    </button>
                  </div>
                  <input
                    ref={detailQuoteCaptureRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      void handleQuoteUploadToExisting(e.currentTarget.files);
                      e.currentTarget.value = "";
                    }}
                  />
                  <input
                    ref={detailQuoteFileRef}
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    style={{ display: "none" }}
                    onChange={(e) => {
                      void handleQuoteUploadToExisting(e.currentTarget.files);
                      e.currentTarget.value = "";
                    }}
                  />
                  {selectedQuotes.length ? (
                    <div style={{ display: "grid", gap: 6 }}>
                      {selectedQuotes.map((row) => (
                        <a key={row.id} href={`/api/purchases/attachments/view?id=${encodeURIComponent(row.id)}`} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline", opacity: 0.9 }}>
                          {row.file_name} · {fmtDate(row.created_at)}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div style={{ opacity: 0.75 }}>No quotes uploaded.</div>
                  )}
                </div>

                <div style={{ ...cardStyle(), padding: 12 }}>
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>Receipts (Purchase Detail)</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                    <button type="button" onClick={() => receiptCaptureRef.current?.click()} style={buttonStyle()} disabled={saving}>
                      Add Receipt Photo
                    </button>
                    <button type="button" onClick={() => receiptFileRef.current?.click()} style={buttonStyle()} disabled={saving}>
                      Add Receipt File
                    </button>
                  </div>
                  <input
                    ref={receiptCaptureRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      void handleReceiptUpload(e.currentTarget.files);
                      e.currentTarget.value = "";
                    }}
                  />
                  <input
                    ref={receiptFileRef}
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    style={{ display: "none" }}
                    onChange={(e) => {
                      void handleReceiptUpload(e.currentTarget.files);
                      e.currentTarget.value = "";
                    }}
                  />
                  {selectedReceipts.length ? (
                    <div style={{ display: "grid", gap: 6 }}>
                      {selectedReceipts.map((row) => (
                        <a key={row.id} href={`/api/purchases/attachments/view?id=${encodeURIComponent(row.id)}`} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline", opacity: 0.9 }}>
                          {row.file_name} · {fmtDate(row.created_at)}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div style={{ opacity: 0.75 }}>No receipts uploaded yet.</div>
                  )}
                </div>
              </div>

              {canManagerApprove && selectedRequest.overall_status === "waiting_operations_manager_approval" ? (
                <div style={{ marginTop: 12, ...cardStyle(), padding: 12 }}>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>Manager Approval</div>
                  <div style={{ opacity: 0.75, marginBottom: 8 }}>
                    Approve/deny one or all requested items. Signature required to finalize.
                  </div>
                  {selectedItems.map((item) => (
                    <div key={item.id} style={{ ...cardStyle(), padding: 10, marginTop: 8 }}>
                      <div style={{ fontWeight: 800 }}>{item.item_name}</div>
                      <div style={{ marginTop: 8, display: "grid", gap: 8, gridTemplateColumns: "160px 1fr" }}>
                        <select
                          value={managerDecisions[item.id]?.decision ?? "pending"}
                          onChange={(e) =>
                            setManagerDecisions((prev) => ({
                              ...prev,
                              [item.id]: {
                                decision: e.target.value as PurchaseDecision,
                                note: prev[item.id]?.note ?? "",
                              },
                            }))
                          }
                          style={inputStyle()}
                          disabled={saving}
                        >
                          <option value="pending">Pending</option>
                          <option value="approved">Approved</option>
                          <option value="denied">Denied</option>
                        </select>
                        <input
                          value={managerDecisions[item.id]?.note ?? ""}
                          onChange={(e) =>
                            setManagerDecisions((prev) => ({
                              ...prev,
                              [item.id]: {
                                decision: prev[item.id]?.decision ?? "pending",
                                note: e.target.value,
                              },
                            }))
                          }
                          placeholder="Item approval note (optional)"
                          style={inputStyle()}
                          disabled={saving}
                        />
                      </div>
                    </div>
                  ))}

                  <div style={{ marginTop: 10, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))" }}>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span>Manager E-Signature *</span>
                      <input value={managerSignature} onChange={(e) => setManagerSignature(e.target.value)} style={inputStyle()} disabled={saving} />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span>Manager Notes</span>
                      <input value={managerNote} onChange={(e) => setManagerNote(e.target.value)} style={inputStyle()} disabled={saving} />
                    </label>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <button type="button" onClick={submitManagerApproval} style={primaryButtonStyle()} disabled={saving}>
                      Submit Manager Approval
                    </button>
                  </div>
                </div>
              ) : null}

              {canApApprove && selectedRequest.overall_status === "waiting_ap_department_approval" ? (
                <div style={{ marginTop: 12, ...cardStyle(), padding: 12 }}>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>Accounts Payable Approval</div>
                  <div style={{ opacity: 0.75, marginBottom: 8 }}>
                    Approve/deny item-level purchases, then assign funding date, payment method, and PO.
                  </div>
                  {selectedItems.map((item) => {
                    const row = apDecisions[item.id];
                    return (
                      <div key={item.id} style={{ ...cardStyle(), padding: 10, marginTop: 8 }}>
                        <div style={{ fontWeight: 800 }}>{item.item_name}</div>
                        <div style={{ marginTop: 8, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
                          <select
                            value={row?.decision ?? "pending"}
                            onChange={(e) =>
                              setApDecisions((prev) => ({
                                ...prev,
                                [item.id]: {
                                  decision: e.target.value as PurchaseDecision,
                                  note: prev[item.id]?.note ?? "",
                                  approvedPaymentMethod: prev[item.id]?.approvedPaymentMethod ?? "",
                                  approvedPaymentMethodOther: prev[item.id]?.approvedPaymentMethodOther ?? "",
                                  approvedPoNumber: prev[item.id]?.approvedPoNumber ?? "",
                                  fundsAvailableDate: prev[item.id]?.fundsAvailableDate ?? "",
                                },
                              }))
                            }
                            style={inputStyle()}
                            disabled={saving}
                          >
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="denied">Denied</option>
                          </select>
                          <input
                            value={row?.note ?? ""}
                            onChange={(e) =>
                              setApDecisions((prev) => ({
                                ...prev,
                                [item.id]: {
                                  decision: prev[item.id]?.decision ?? "pending",
                                  note: e.target.value,
                                  approvedPaymentMethod: prev[item.id]?.approvedPaymentMethod ?? "",
                                  approvedPaymentMethodOther: prev[item.id]?.approvedPaymentMethodOther ?? "",
                                  approvedPoNumber: prev[item.id]?.approvedPoNumber ?? "",
                                  fundsAvailableDate: prev[item.id]?.fundsAvailableDate ?? "",
                                },
                              }))
                            }
                            placeholder="AP note (optional)"
                            style={inputStyle()}
                            disabled={saving}
                          />
                        </div>
                      </div>
                    );
                  })}

                  <div style={{ marginTop: 10, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span>Funds Available Date</span>
                      <input type="date" value={apFundsAvailableDate} onChange={(e) => setApFundsAvailableDate(e.target.value)} style={inputStyle()} disabled={saving} />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span>AP Payment Method</span>
                      <select value={apPaymentMethod} onChange={(e) => setApPaymentMethod(e.target.value)} style={inputStyle()} disabled={saving}>
                        <option value="">Select...</option>
                        {PURCHASE_METHOD_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    {apPaymentMethod === "Other" ? (
                      <label style={{ display: "grid", gap: 6 }}>
                        <span>Other Payment Method</span>
                        <input value={apPaymentMethodOther} onChange={(e) => setApPaymentMethodOther(e.target.value)} style={inputStyle()} disabled={saving} />
                      </label>
                    ) : null}
                    <label style={{ display: "grid", gap: 6 }}>
                      <span>PO #</span>
                      <input value={apPoNumber} onChange={(e) => setApPoNumber(e.target.value)} style={inputStyle()} disabled={saving} />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span>AP E-Signature *</span>
                      <input value={apSignature} onChange={(e) => setApSignature(e.target.value)} style={inputStyle()} disabled={saving} />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span>AP Notes</span>
                      <input value={apNote} onChange={(e) => setApNote(e.target.value)} style={inputStyle()} disabled={saving} />
                    </label>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <button type="button" onClick={submitApApproval} style={primaryButtonStyle()} disabled={saving}>
                      Submit AP Approval
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : (
            <section style={{ marginTop: 14, ...cardStyle() }}>
              <div style={{ opacity: 0.75 }}>No purchase request selected.</div>
            </section>
          )}
        </>
      )}
    </main>
  );
}

const thStyle: React.CSSProperties = {
  ...asStickyTableHeader({
  textAlign: "left",
  padding: "10px 8px",
  borderBottom: "1px solid rgba(255,255,255,0.15)",
  whiteSpace: "nowrap",
  fontSize: 13,
}),
};

const tdStyle: React.CSSProperties = {
  padding: "10px 8px",
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  verticalAlign: "top",
  fontSize: 13,
};
