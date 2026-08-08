import React, { useEffect, useState } from "react";
import {
  ArrowDown,
  Clock3,
  Eye,
  GitCommit,
  MoreHorizontal,
  Network,
  RefreshCw,
  Pencil,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../../context/AuthContext";
import { useI18n } from "@mom-platform/i18n-ui-shared";
import { Button, Confirmation, Popover, PopoverContent, PopoverTrigger } from "../../components/ui";
import { ErrorBoundaryCard } from "../../components/ErrorBoundaryCard";
import { fetchResource, gatewayBaseUrl } from "../../lib/masterDataApi";
import { normalizeStatusCode, translatedEnum } from "../../lib/i18nLabels";
import {
  BaseDataTable,
  BaseModal,
  type BaseDataTableColumn,
} from "../../components/base";
import { formatNumberForDisplay } from "../../lib/numeric/uomNumeric";

function localizedText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const item = value as Record<string, unknown>;
  return String(item.vi || item.en || item.ja || item.ko || "");
}
function predecessors(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value === null || value === undefined || value === "") return [];
  return String(value)
    .split(/[\s,]+/)
    .filter(Boolean);
}

export const RoutingScreen: React.FC = () => {
  const { user } = useAuth();
  const { t } = useI18n();
  const [routings, setRoutings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [operations, setOperations] = useState<any[]>([]);
  const [selectedOperation, setSelectedOperation] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRoutings(await fetchResource("routing-headers", user));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [user?.userId]);
  const openDetail = async (routing: any) => {
    setSelected(routing);
    setSelectedOperation(null);
    setDetailLoading(true);
    try {
      const rows = await fetchResource(
        "routing-operations",
        user,
        "?limit=500",
      );
      const related = rows
        .filter(
          (row: any) =>
            row.routing_header_id === routing.master_id &&
            !row.effective_to &&
            !["Inactive", "Obsolete"].includes(String(row.lifecycle_status)),
        )
        .sort((a: any, b: any) => Number(a.seq) - Number(b.seq));
      setOperations(related);
      setSelectedOperation(related[0] || null);
    } catch (err: any) {
      toast.error(t("routing.detailFailed"));
    } finally {
      setDetailLoading(false);
    }
  };
  const release = async (id: string) => {
    setSubmitting(true);
    try {
      const response = await fetch(
        `${gatewayBaseUrl()}/api/mes/master-data/routings/${id}/release`,
        {
          method: "POST",
          headers: {
            "X-User-ID": user?.userId || "admin",
            "X-Role-Code": user?.roles[0] || "PROD_MANAGER",
          },
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          payload.message || payload.error || t("routing.releaseFailed"),
        );
      toast.success(t("routing.released"));
      await load();
    } catch (err: any) {
      toast.error(t("routing.releaseError", { message: err.message }));
    } finally {
      setSubmitting(false);
    }
  };
  const remove = async () => {
    if (!deleteTarget?.master_id) return;
    try {
      const response = await fetch(
        `${gatewayBaseUrl()}/api/mes/master-data/routing-headers/${deleteTarget.master_id}`,
        {
          method: "DELETE",
          headers: {
            "X-User-ID": user?.userId || "admin",
            "X-Role-Code": user?.roles[0] || "PROD_MANAGER",
          },
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          payload.message || payload.error || "Routing could not be deleted",
        );
      toast.success(t("common.delete"));
      setDeleteTarget(null);
      await load();
    } catch (err: any) {
      toast.error(err.message);
    }
  };
  const visibleRoutings = routings.filter((row) =>
    `${row.code || ""} ${localizedText(row.name)} ${row.routing_type || ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  if (error) return <ErrorBoundaryCard error={error} onRetry={load} />;
  const columns: BaseDataTableColumn<any>[] = [
    {
      id: "code",
      header: t("routing.code"),
      accessorKey: "code",
      cell: ({ row }) => (
        <span className="font-mono font-bold text-amber-400">
          {row.original.code}
        </span>
      ),
    },
    {
      id: "name",
      header: t("routing.name"),
      accessorFn: (row) => localizedText(row.name),
      cell: ({ row }) => (
        <>
          <div className="font-semibold text-foreground">
            {localizedText(row.original.name)}
          </div>
          <div className="text-xs text-muted-foreground">
            {localizedText(row.original.description)}
          </div>
        </>
      ),
    },
    {
      id: "version",
      header: t("routing.version"),
      accessorFn: (row) => row.business_version || row.version_no || "1",
    },
    {
      id: "type",
      header: t("routing.type"),
      accessorKey: "routing_type",
      cell: ({ row }) => row.original.routing_type || "Standard",
    },
    {
      id: "operations",
      header: t("routing.operations"),
      accessorFn: (row) => row.operation_count ?? 0,
    },
    {
      id: "factories",
      header: t("routing.detail.factoriesInvolved"),
      accessorFn: (row) => row.factory_count ?? 0,
    },
    {
      id: "status",
      header: t("common.status"),
      accessorFn: (row) => normalizeStatusCode(row.lifecycle_status || "Draft"),
      cell: ({ row }) => {
        const value = normalizeStatusCode(
          row.original.lifecycle_status || "Draft",
        );
        return (
          <span className="whitespace-nowrap rounded-full border border-amber-800 bg-amber-950/60 px-2.5 py-1 text-xs font-semibold text-amber-300">
            {translatedEnum(t, "status.master", value)}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: t("routing.validationActions"),
      align: "right",
      cell: ({ row }) => {
        const value = normalizeStatusCode(
          row.original.lifecycle_status || "Draft",
        );
        return (
          <div
            className="flex justify-end"
            onClick={(event) => event.stopPropagation()}
          >
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" title={t("routing.validationActions")} aria-label={t("routing.validationActions")}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-52 space-y-1 bg-surface-elevated p-2">
                <Button className="w-full justify-start" variant="ghost" onClick={() => void openDetail(row.original)}><Eye className="h-4 w-4" />{t("common.detail")}</Button>
                {value !== "Released" && row.original.master_id && <Button className="w-full justify-start" variant="ghost" onClick={() => window.location.assign(`/master-data/routings/${row.original.master_id}/edit`)}><Pencil className="h-4 w-4" />{t("common.edit")}</Button>}
                {value !== "Released" && row.original.master_id && <Button className="w-full justify-start text-danger-foreground" variant="ghost" onClick={() => setDeleteTarget(row.original)}><Trash2 className="h-4 w-4" />{t("common.delete")}</Button>}
                {value !== "Released" && row.original.master_id && <Button className="w-full justify-start" disabled={submitting} onClick={() => void release(row.original.master_id)}><GitCommit className="h-4 w-4" />{t("routing.release")}</Button>}
              </PopoverContent>
            </Popover>
          </div>
        );
      },
    },
  ];
  return (
    <div className="mes-page">
      <div className="mes-page-header">
        <div className="flex items-center space-x-3">
          <Link
            to="/master-data/routings/new"
            className="inline-flex items-center gap-2 rounded-md bg-action px-4 py-2.5 font-semibold text-white"
          >
            {t("common.create")}
          </Link>
          <div className="mes-icon-tile">
            <GitCommit className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">
              {t("routing.title")}
            </h1>
            <p className="text-xs text-slate-400">{t("routing.subtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("common.search")}
            className="w-56 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
            aria-label={t("common.search")}
          />
          <Button
            onClick={() => void load()}
            variant="secondary"
            size="icon"
            title={t("common.refresh")}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>
      <BaseDataTable
        data={visibleRoutings}
        columns={columns}
        loading={loading}
        getRowId={(row) => row.master_id || row.code}
        onRowClick={(row) => void openDetail(row)}
        stickyHeader
      />
      {selected && (
        <RoutingDetailModal
          routing={selected}
          operations={operations}
          selectedOperation={selectedOperation}
          loading={detailLoading}
          onSelect={setSelectedOperation}
          onClose={() => setSelected(null)}
          t={t}
        />
      )}
      <Confirmation
        open={Boolean(deleteTarget)}
        title={t("common.delete")}
        description={t("routing.deleteConfirm")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        destructive
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
};

function RoutingDetailModal({
  routing,
  operations,
  selectedOperation,
  loading,
  onSelect,
  onClose,
  t,
}: {
  routing: any;
  operations: any[];
  selectedOperation: any;
  loading: boolean;
  onSelect: (row: any) => void;
  onClose: () => void;
  t: (key: string, params?: Record<string, any>) => string;
}) {
  const status = normalizeStatusCode(routing.lifecycle_status || "Draft");
  const factoryCount =
    routing.factory_count ??
    new Set(operations.map((row) => row.factory_code).filter(Boolean)).size;
  return (
    <BaseModal
      open
      title={
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-lg font-bold text-amber-300">
              {routing.code}
            </span>
            <span className="rounded-full border border-emerald-800 bg-emerald-950/60 px-2.5 py-1 text-xs font-semibold text-amber-200">
              {t(`status.master.${status}`)}
            </span>
            {factoryCount > 1 && (
              <span className="rounded-full border border-amber-700 bg-amber-950/60 px-2.5 py-1 text-xs font-semibold text-amber-200">
                {t("routing.detail.multiFactory")}
              </span>
            )}
          </div>
          <h2 className="mt-1 text-xl font-bold text-slate-100">
            {localizedText(routing.name)}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {localizedText(routing.description) ||
              t("routing.detail.noDescription")}
          </p>
        </div>
      }
      onClose={onClose}
      size="full"
      placement="center"
      className="mx-4 max-w-7xl"
      contentClassName="p-6"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Summary
          label={t("routing.version")}
          value={routing.business_version || routing.version_no || "1"}
        />
        <Summary
          label={t("routing.type")}
          value={routing.routing_type || "Standard"}
        />
        <Summary
          label={t("routing.detail.validity")}
          value={`${routing.effective_from ? new Date(routing.effective_from).toLocaleDateString() : "-"} → ${routing.effective_to ? new Date(routing.effective_to).toLocaleDateString() : "∞"}`}
        />
        <Summary
          label={t("routing.detail.operationCount")}
          value={String(routing.operation_count ?? operations.length)}
        />
        <Summary
          label={t("routing.detail.factoriesInvolved")}
          value={String(factoryCount)}
        />
        <Summary
          label={t("routing.detail.status")}
          value={t(`status.master.${status}`)}
        />
        <Summary
          label={t("routing.detail.dependency")}
          value={
            operations.some((row) => predecessors(row.predecessor_seq).length)
              ? t("routing.detail.hasDependencies")
              : t("routing.detail.linearFlow")
          }
        />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]">
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Network className="h-4 w-4 text-action" />
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-300">
              {t("routing.detail.flow")}
            </h3>
          </div>
          {loading ? (
            <div className="p-8 text-center text-slate-400">
              {t("routing.detailLoading")}
            </div>
          ) : operations.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              {t("routing.noOperations")}
            </div>
          ) : (
            <div>
              {operations.map((row, index) => (
                <React.Fragment key={row.master_id || row.seq}>
                  <button
                    type="button"
                    onClick={() => onSelect(row)}
                    className={`flex w-full items-start gap-4 rounded-md border p-4 text-left ${selectedOperation?.master_id === row.master_id ? "border-action bg-action/10" : "border-slate-800 bg-slate-950/40 hover:border-slate-600"}`}
                  >
                    <span className="flex h-9 w-12 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-900 font-mono text-sm font-bold text-amber-300">
                      {row.seq}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-slate-100">
                        {localizedText(row.operation_name) ||
                          row.operation_code}{" "}
                        <span className="font-mono text-xs text-slate-500">
                          ({row.operation_code})
                        </span>
                      </span>
                      <span className="mt-1 block text-xs text-slate-400">
                        {localizedText(row.operation_description) ||
                          t("routing.detail.noDescription")}
                      </span>
                      <span className="mt-2 block text-xs text-slate-500">
                        {localizedText(row.work_center_name) ||
                          row.work_center_code}{" "}
                        · {localizedText(row.factory_name) || row.factory_code}{" "}
                        /{" "}
                        {localizedText(row.shopfloor_name) ||
                          row.shopfloor_code}
                      </span>
                    </span>
                  </button>
                  {index < operations.length - 1 && (
                    <div className="ml-6 flex h-8 items-center">
                      <div className="h-full border-l border-dashed border-slate-600" />
                      <ArrowDown className="-ml-1.5 h-4 w-4 text-slate-500" />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}
        </section>
        <OperationPanel
          operation={selectedOperation}
          operations={operations}
          t={t}
        />
      </div>
    </BaseModal>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/50 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}
function OperationPanel({
  operation,
  operations,
  t,
}: {
  operation: any;
  operations: any[];
  t: (key: string, params?: Record<string, any>) => string;
}) {
  if (!operation)
    return (
      <aside className="rounded-md border border-slate-800 bg-slate-950/30 p-5 text-sm text-slate-500">
        {t("routing.detail.selectOperation")}
      </aside>
    );
  const available = (value: unknown) =>
    value !== null && value !== undefined && value !== "";
  const valueOrUnavailable = (value: unknown) =>
    available(value) ? formatNumberForDisplay(value) : t("common.notAvailable");
  const duration = (seconds: unknown) => {
    if (!available(seconds) || !Number.isFinite(Number(seconds)))
      return t("common.notAvailable");
    return `${formatNumberForDisplay(seconds)} s (${formatNumberForDisplay(Number(seconds) / 60)} min)`;
  };
  const skillRequirements = Array.isArray(operation.worker_skill_requirements)
    ? operation.worker_skill_requirements
    : [];
  const rows: [string, string][] = [
    [t("mbom.seq"), formatNumberForDisplay(operation.seq)],
    [
      t("routing.operation"),
      `${localizedText(operation.operation_name) || operation.operation_code} (${operation.operation_code})`,
    ],
    [
      t("routing.workCenter"),
      available(operation.work_center_code)
        ? `${localizedText(operation.work_center_name) || operation.work_center_code} (${operation.work_center_code})`
        : t("common.notAvailable"),
    ],
    [
      t("routing.detail.location"),
      [
        localizedText(operation.factory_name) || operation.factory_code,
        localizedText(operation.shopfloor_name) || operation.shopfloor_code,
      ]
        .filter(Boolean)
        .join(" → ") || t("common.notAvailable"),
    ],
    [
      t("routing.detail.schedulingMode"),
      operation.scheduling_mode || t("common.notAvailable"),
    ],
    [
      t("routing.detail.planningSource"),
      operation.resolved_source
        ? t(`routing.detail.source.${operation.resolved_source}`)
        : t("common.notAvailable"),
    ],
    [
      t("resourceFoundation.baseQuantity"),
      valueOrUnavailable(operation.resolved_base_quantity),
    ],
    [
      t("resourceFoundation.setupTime"),
      available(operation.resolved_setup_time_min)
        ? `${formatNumberForDisplay(operation.resolved_setup_time_min)} min`
        : t("common.notAvailable"),
    ],
    [
      t("resourceFoundation.cycleTime"),
      available(operation.resolved_cycle_time_sec)
        ? `${formatNumberForDisplay(operation.resolved_cycle_time_sec)} s`
        : t("common.notAvailable"),
    ],
    [
      t("routing.detail.estimatedLifecycleTime"),
      duration(operation.estimated_lifecycle_time_sec),
    ],
    [
      t("routing.detail.requiredWorkers"),
      valueOrUnavailable(operation.resolved_required_workers),
    ],
    [
      t("routing.detail.queueTime"),
      available(operation.queue_time_min)
        ? `${formatNumberForDisplay(operation.queue_time_min)} min`
        : t("common.notAvailable"),
    ],
    [
      t("routing.detail.moveTime"),
      available(operation.move_time_min)
        ? `${formatNumberForDisplay(operation.move_time_min)} min`
        : t("common.notAvailable"),
    ],
    [
      t("routing.detail.overlap"),
      operation.overlap_allowed ? t("common.yes") : t("common.no"),
    ],
    [
      t("routing.detail.transferBatch"),
      operation.transfer_batch_qty == null
        ? t("common.notAvailable")
        : formatNumberForDisplay(operation.transfer_batch_qty),
    ],
    [
      t("routing.detail.milestone"),
      operation.milestone_flag ? t("common.yes") : t("common.no"),
    ],
    [
      t("routing.confirmation"),
      operation.confirmation_mode || t("common.notAvailable"),
    ],
    [
      t("routing.scan"),
      operation.requires_material_scan ? t("common.yes") : t("common.no"),
    ],
    [
      t("routing.outputLabel"),
      operation.requires_output_label ? t("common.yes") : t("common.no"),
    ],
    [
      t("routing.detail.dependency"),
      predecessors(operation.predecessor_seq).length
        ? t("routing.detail.followsSequence", {
            sequence: predecessors(operation.predecessor_seq).join(", "),
          })
        : t("routing.detail.firstOrParallel"),
    ],
  ];
  return (
    <aside className="rounded-md border border-slate-700 bg-slate-950/50 p-5">
      <div className="mb-4 flex items-center gap-2">
        <Clock3 className="h-4 w-4 text-action" />
        <h3 className="font-semibold text-slate-100">
          {t("routing.detail.selectedOperation")}
        </h3>
      </div>
      <div className="space-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="border-b border-slate-800 pb-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {label}
            </div>
            <div className="mt-1 text-sm text-slate-200">{value}</div>
          </div>
        ))}
      </div>
      <div className="mt-5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {t("routing.detail.workerSkills")}
        </div>
        {skillRequirements.length ? (
          <div className="mt-2 space-y-2">
            {skillRequirements.map((requirement: any) => (
              <div
                key={requirement.skill_id}
                className="rounded-md border border-slate-800 bg-slate-900 p-3"
              >
                <div className="font-medium text-slate-100">
                  {localizedText(requirement.skill_name) ||
                    requirement.skill_code}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {requirement.skill_code} ·{" "}
                  {t("operationCatalog.minimumLevel")}:{" "}
                  {requirement.minimum_level} ·{" "}
                  {t("operationCatalog.requiredPersons")}:{" "}
                  {formatNumberForDisplay(requirement.required_persons)} ·{" "}
                  {requirement.mandatory_flag
                    ? t("operationCatalog.mandatory")
                    : t("common.optional")}{" "}
                  · {t(`routing.detail.source.${requirement.source}`)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">
            {t("routing.detail.noWorkerSkills")}
          </p>
        )}
      </div>
    </aside>
  );
}
