/**
 * @fileoverview Adapter Manager page — install, view, and manage external adapters.
 *
 * Adapters are simpler than plugins: no workers, no events, no manifests.
 * They just register a ServerAdapterModule that provides model discovery and execution.
 */
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Cpu, Plus, Power, Trash2, FolderOpen, Package, RefreshCw, Download, Settings, CheckCircle2, XCircle, Globe, Sliders, Shield } from "lucide-react";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useSearchParams } from "@/lib/router";
import { adaptersApi } from "@/api/adapters";
import type { AdapterInfo } from "@/api/adapters";
import { getAdapterLabel } from "@/adapters/adapter-display-registry";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToastActions } from "@/context/ToastContext";
import { cn } from "@/lib/utils";
import { ChoosePathButton } from "@/components/PathInstructionsModal";
import { invalidateDynamicParser } from "@/adapters/dynamic-loader";
import { invalidateConfigSchemaCache } from "@/adapters/schema-config-fields";

function AdapterRow({
  adapter,
  canRemove,
  onToggle,
  onRemove,
  onReload,
  onReinstall,
  onConfigure,
  isToggling,
  isReloading,
  isReinstalling,
  overriddenBy,
  /** Custom tooltip for the power button when adapter is enabled. */
  toggleTitleEnabled,
  /** Custom tooltip for the power button when adapter is disabled. */
  toggleTitleDisabled,
  /** Custom label for the disabled badge (defaults to "Hidden from menus"). */
  disabledBadgeLabel,
}: {
  adapter: AdapterInfo;
  canRemove: boolean;
  onToggle: (type: string, disabled: boolean) => void;
  onRemove: (type: string) => void;
  onReload?: (type: string) => void;
  onReinstall?: (type: string) => void;
  onConfigure?: (type: string) => void;
  isToggling: boolean;
  isReloading?: boolean;
  isReinstalling?: boolean;
  /** When set, shows an "Overridden by …" badge (used for builtin entries). */
  overriddenBy?: string;
  toggleTitleEnabled?: string;
  toggleTitleDisabled?: string;
  disabledBadgeLabel?: string;
}) {
  return (
    <li>
      <div className="flex items-center gap-4 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("font-medium", adapter.disabled && "text-muted-foreground line-through")}>
              {/* The server reports label = raw type id, so prefer the display
                  registry's human label; keep a real self-reported label if an
                  external adapter ever provides one. */}
              {adapter.label && adapter.label !== adapter.type ? adapter.label : getAdapterLabel(adapter.type)}
            </span>
            <Badge variant="outline">{adapter.source === "external" ? "External" : "Built-in"}</Badge>
            {adapter.source === "external" && (
              adapter.isLocalPath
                ? <span title="Installed from local path"><FolderOpen className="h-4 w-4 text-amber-500" /></span>
                : <span title="Installed from npm"><Package className="h-4 w-4 text-red-500" /></span>
            )}
            {adapter.version && (
              <Badge variant="secondary" className="font-mono text-(length:--text-nano)">
                v{adapter.version}
              </Badge>
            )}
            {adapter.overriddenBuiltin && (
              <Badge variant="secondary" className="text-blue-600 border-blue-400">
                Overrides built-in
              </Badge>
            )}
            {overriddenBy && (
              <Badge variant="secondary" className="text-blue-600 border-blue-400">
                Overridden by {overriddenBy}
              </Badge>
            )}
            {adapter.disabled && (
              <Badge variant="secondary" className="text-amber-600 border-amber-400">
                {disabledBadgeLabel ?? "Hidden from menus"}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {adapter.type}
            {adapter.packageName && adapter.packageName !== adapter.type && (
              <> · {adapter.packageName}</>
            )}
            {" · "}{adapter.modelsCount} models
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onConfigure && (
            <Button
              variant="outline"
              size="icon-sm"
              className="h-8 w-8 text-primary hover:text-primary"
              title="Configure adapter settings & endpoints"
              onClick={() => onConfigure(adapter.type)}
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
          {onReinstall && (
            <Button
              variant="outline"
              size="icon-sm"
              className="h-8 w-8"
              title="Reinstall adapter (pull latest from npm)"
              disabled={isReinstalling}
              onClick={() => onReinstall(adapter.type)}
            >
              <Download className={cn("h-4 w-4", isReinstalling && "animate-bounce")} />
            </Button>
          )}
          {onReload && (
            <Button
              variant="outline"
              size="icon-sm"
              className="h-8 w-8"
              title="Reload adapter (hot-swap)"
              disabled={isReloading}
              onClick={() => onReload(adapter.type)}
            >
              <RefreshCw className={cn("h-4 w-4", isReloading && "animate-spin")} />
            </Button>
          )}
          <Button
            variant="outline"
            size="icon-sm"
            className="h-8 w-8"
            title={adapter.disabled
              ? (toggleTitleEnabled ?? "Show in agent menus")
              : (toggleTitleDisabled ?? "Hide from agent menus")}
            disabled={isToggling}
            onClick={() => onToggle(adapter.type, !adapter.disabled)}
          >
            <Power className={cn("h-4 w-4", !adapter.disabled ? "text-green-600" : "text-muted-foreground")} />
          </Button>
          {canRemove && (
            <Button
              variant="outline"
              size="icon-sm"
              className="h-8 w-8 text-destructive hover:text-destructive"
              title="Remove adapter"
              onClick={() => onRemove(adapter.type)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function fetchNpmLatestVersion(packageName: string): Promise<string | null> {
  return fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`, {
    signal: AbortSignal.timeout(5000),
  })
    .then((res) => res.json())
    .then((data) => (typeof data?.version === "string" ? (data.version as string) : null))
    .catch(() => null);
}

function ReinstallDialog({
  adapter,
  open,
  isReinstalling,
  onConfirm,
  onCancel,
}: {
  adapter: AdapterInfo | null;
  open: boolean;
  isReinstalling: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { data: latestVersion, isLoading: isFetchingVersion } = useQuery({
    queryKey: ["npm-latest-version", adapter?.packageName],
    queryFn: () => {
      if (!adapter?.packageName) return null;
      return fetchNpmLatestVersion(adapter.packageName);
    },
    enabled: open && !!adapter?.packageName,
    staleTime: 60_000,
  });

  const isUpToDate = adapter?.version && latestVersion && adapter.version === latestVersion;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reinstall Adapter</DialogTitle>
          <DialogDescription>
            This will pull the latest version of{" "}
            <strong>{adapter?.packageName}</strong> from npm and hot-swap
            the running adapter module. Existing agents will use the new
            version on their next run.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-muted/50 px-4 py-3 text-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Package</span>
            <span className="font-mono">{adapter?.packageName}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Current</span>
            <span className="font-mono">
              {adapter?.version ? `v${adapter.version}` : "unknown"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Latest on npm</span>
            <span className="font-mono">
              {isFetchingVersion
                ? "checking..."
                : latestVersion
                  ? `v${latestVersion}`
                  : "unavailable"}
            </span>
          </div>
          {isUpToDate && (
            <p className="text-xs text-muted-foreground pt-1">
              Already on the latest version.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isReinstalling}>
            Cancel
          </Button>
          <Button disabled={isReinstalling} onClick={onConfirm}>
            {isReinstalling ? "Reinstalling..." : "Reinstall"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OmniaConfigDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();

  const { data: configData, isLoading: isLoadingConfig } = useQuery({
    queryKey: queryKeys.adapters.config("omnia"),
    queryFn: () => adaptersApi.getConfig("omnia"),
    enabled: open,
  });

  const [baseUrl, setBaseUrl] = useState("https://api.ntv.cloud2local.com/omnia/api");
  const [model, setModel] = useState("qwen2.5:7b");
  const [authToken, setAuthToken] = useState("");
  const [temperature, setTemperature] = useState("0.8");
  const [numCtx, setNumCtx] = useState("4096");
  const [numPredict, setNumPredict] = useState("2048");
  const [omniaMode, setOmniaMode] = useState<"permissive" | "read_only" | "restricted">("permissive");

  const [testStatus, setTestStatus] = useState<{
    tested: boolean;
    ok: boolean;
    message: string;
    models?: string[];
  } | null>(null);

  useEffect(() => {
    if (configData) {
      if (typeof configData.baseUrl === "string" && configData.baseUrl.trim()) {
        setBaseUrl(configData.baseUrl);
      }
      if (typeof configData.model === "string" && configData.model.trim()) {
        setModel(configData.model);
      }
      if (typeof configData.omnia_auth_token === "string") {
        setAuthToken(configData.omnia_auth_token);
      }
      if (configData.temperature !== undefined) {
        setTemperature(String(configData.temperature));
      }
      if (configData.num_ctx !== undefined) {
        setNumCtx(String(configData.num_ctx));
      }
      if (configData.num_predict !== undefined) {
        setNumPredict(String(configData.num_predict));
      }
      if (typeof configData.omnia_mode === "string" && ["permissive", "read_only", "restricted"].includes(configData.omnia_mode)) {
        setOmniaMode(configData.omnia_mode as "permissive" | "read_only" | "restricted");
      }
    }
  }, [configData]);

  const saveMutation = useMutation({
    mutationFn: () =>
      adaptersApi.saveConfig("omnia", {
        baseUrl: baseUrl.trim() || "https://api.ntv.cloud2local.com/omnia/api",
        model: model.trim() || "qwen2.5:7b",
        omnia_auth_token: authToken.trim() || undefined,
        temperature: parseFloat(temperature) || 0.8,
        num_ctx: parseInt(numCtx, 10) || 4096,
        num_predict: parseInt(numPredict, 10) || 2048,
        omnia_mode: omniaMode,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.adapters.config("omnia") });
      queryClient.invalidateQueries({ queryKey: queryKeys.adapters.all });
      pushToast({
        title: "OmnIA Configuration Saved",
        body: `Endpoint updated to ${baseUrl.trim() || "https://api.ntv.cloud2local.com/omnia/api"}`,
        tone: "success",
      });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      pushToast({ title: "Save Failed", body: err.message, tone: "error" });
    },
  });

  const testMutation = useMutation({
    mutationFn: () => adaptersApi.testConnection("omnia", { baseUrl: baseUrl.trim() }),
    onSuccess: (res) => {
      setTestStatus({
        tested: true,
        ok: res.ok,
        message: res.message,
        models: res.models,
      });
      if (res.ok && res.models && res.models.length > 0) {
        if (!model || model === "qwen2.5:7b") {
          setModel(res.models[0]);
        }
      }
    },
    onError: (err: Error) => {
      setTestStatus({
        tested: true,
        ok: false,
        message: err.message,
      });
    },
  });

  useEffect(() => {
    if (open && !testStatus.tested) {
      testMutation.mutate();
    }
  }, [open, testStatus.tested]);

  const defaultOmniaModels = [
    { id: "qwen3.8:latest", label: "Qwen 3.8 (Latest, 27.3B, tools, thinking)" },
    { id: "deepseek-r1:14b", label: "DeepSeek R1 14B (Thinking / Reasoning)" },
    { id: "qwen3.5:9b", label: "Qwen 3.5 9B (Tools + Thinking)" },
    { id: "orcarouter/Qwen3.8-27B-Uncensored:latest", label: "Qwen 3.8 27B Uncensored (Latest)" },
    { id: "orcarouter/Qwen3.8-27B-Uncensored:iq3_m", label: "Qwen 3.8 27B Uncensored (IQ3_M)" },
    { id: "qwen3-vl:latest", label: "Qwen 3 VL (Vision-Language, 8.8B)" },
    { id: "gpt-oss:20b", label: "GPT OSS 20B (MXFP4, thinking, tools)" },
    { id: "qwen3-embedding:0.6b", label: "Qwen 3 Embedding 0.6B" },
  ];

  const availableModels = testStatus.models && testStatus.models.length > 0
    ? testStatus.models.map((m) => ({ id: m, label: m }))
    : defaultOmniaModels;

  const omniaTools = [
    { name: "git_intelligence", label: "Git Intelligence", desc: "Branch changelogs, tag ranges, beta features, refactor analysis" },
    { name: "ip_location", label: "IP & Geolocation", desc: "Runtime IP & geographical location inspector" },
    { name: "call_api_endpoint", label: "REST / HTTP Client", desc: "Direct HTTP/REST endpoint requests" },
    { name: "query_graphql", label: "GraphQL Client", desc: "GraphQL query and mutation execution" },
    { name: "inspect_api_documentation", label: "API Schema Inspector", desc: "OpenAPI and GraphQL schema inspection" },
    { name: "save_artifact", label: "Artifact & Report Publisher", desc: "Markdown security audits and reports publisher" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sliders className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle>OmnIA Adapter Configuration</DialogTitle>
              <DialogDescription>
                Configure the remote Sovereign AI Engine endpoint and integrated tool suite.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isLoadingConfig ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading configuration...</div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Remote Endpoint Notice */}
            <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3 text-xs text-blue-900 dark:text-blue-200 space-y-1">
              <div className="flex items-center gap-1.5 font-medium">
                <Globe className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                <span>Remote Sovereign Host (non del locale)</span>
              </div>
              <p className="text-muted-foreground">
                All requests, model inference, and tool executions are routed through the remote OmnIA API endpoint without relying on local background daemons.
              </p>
            </div>

            {/* Base URL */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="omniaBaseUrl" className="text-xs font-semibold">
                  API Endpoint URL
                </Label>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => setBaseUrl("https://api.ntv.cloud2local.com/omnia/api")}
                >
                  Reset to default remote URL
                </button>
              </div>
              <div className="flex gap-2">
                <Input
                  id="omniaBaseUrl"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.ntv.cloud2local.com/omnia/api"
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={testMutation.isPending}
                  onClick={() => testMutation.mutate()}
                >
                  {testMutation.isPending ? "Testing..." : "Test"}
                </Button>
              </div>
              <p className="text-(length:--text-nano) text-muted-foreground">
                Default: <code className="text-foreground">https://api.ntv.cloud2local.com/omnia/api</code>
              </p>
              {testStatus?.tested && (
                <div className="space-y-2">
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-md p-2 text-xs",
                      testStatus.ok ? "bg-green-500/10 text-green-700 dark:text-green-300" : "bg-destructive/10 text-destructive"
                    )}
                  >
                    {testStatus.ok ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        <span>{testStatus.message} {testStatus.models?.length ? `(${testStatus.models.length} remote models available)` : ""}</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 shrink-0" />
                        <span>{testStatus.message}</span>
                      </>
                    )}
                  </div>

                  {testStatus.ok && testStatus.models && testStatus.models.length > 0 && (
                    <div className="rounded-md border border-border/60 bg-muted/30 p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between text-(length:--text-nano) font-medium text-muted-foreground">
                        <span>Remote Models Discovered:</span>
                        <span className="font-mono text-primary font-semibold">Active: {model}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                        {testStatus.models.map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setModel(m)}
                            className={cn(
                              "rounded border px-2 py-0.5 text-(length:--text-nano) font-mono transition-colors",
                              model === m
                                ? "border-primary bg-primary/20 text-primary font-bold shadow-xs"
                                : "border-border bg-background text-foreground hover:bg-muted"
                            )}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Default Model */}
            <div className="space-y-2">
              <Label htmlFor="omniaModel" className="text-xs font-semibold">
                Default Model
              </Label>
              <div className="flex gap-2">
                <Input
                  id="omniaModel"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="qwen2.5:7b"
                  className="font-mono text-xs flex-1"
                />
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {availableModels.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setModel(m.id)}
                    className={cn(
                      "rounded border px-2 py-0.5 text-(length:--text-nano) font-mono transition-colors",
                      model === m.id
                        ? "border-primary bg-primary/10 text-primary font-semibold"
                        : "border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {m.id}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Bearer Token */}
            <div className="space-y-2">
              <Label htmlFor="omniaAuthToken" className="text-xs font-semibold">
                Authorization Token / API Key (Optional)
              </Label>
              <Input
                id="omniaAuthToken"
                type="password"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                placeholder="Bearer token if remote endpoint is authenticated"
                className="font-mono text-xs"
              />
            </div>

            {/* Model Generation Parameters */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="omniaNumCtx" className="text-xs font-semibold">
                  Context (num_ctx)
                </Label>
                <Input
                  id="omniaNumCtx"
                  type="number"
                  value={numCtx}
                  onChange={(e) => setNumCtx(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="omniaTemp" className="text-xs font-semibold">
                  Temperature
                </Label>
                <Input
                  id="omniaTemp"
                  type="number"
                  step="0.05"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="omniaNumPredict" className="text-xs font-semibold">
                  Max Tokens
                </Label>
                <Input
                  id="omniaNumPredict"
                  type="number"
                  value={numPredict}
                  onChange={(e) => setNumPredict(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </div>

            {/* OmnIA Tool Suite */}
            <div className="space-y-2.5 rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                  <Shield className="h-3.5 w-3.5 text-primary" />
                  <span>OmnIA Tool Suite & Execution Policy</span>
                </div>
                <Badge variant="secondary" className="text-(length:--text-nano) font-mono">
                  {omniaTools.length} tools active
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {omniaTools.map((t) => (
                  <div key={t.name} className="rounded border border-border/60 bg-background/80 p-2 text-xs space-y-0.5">
                    <div className="font-mono font-medium text-foreground">{t.name}</div>
                    <div className="text-(length:--text-nano) text-muted-foreground">{t.desc}</div>
                  </div>
                ))}
              </div>

              <div className="pt-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Execution mode:</span>
                <div className="flex gap-1.5">
                  {(["permissive", "read_only", "restricted"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setOmniaMode(mode)}
                      className={cn(
                        "rounded px-2 py-0.5 text-xs capitalize transition-colors",
                        omniaMode === mode
                          ? "bg-primary text-primary-foreground font-medium"
                          : "border border-border text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "Saving..." : "Save Configuration"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdapterManager() {
  const { selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();

  const [installPackage, setInstallPackage] = useState("");
  const [installVersion, setInstallVersion] = useState("");
  const [isLocalPath, setIsLocalPath] = useState(false);
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [removeType, setRemoveType] = useState<string | null>(null);
  const [reinstallTarget, setReinstallTarget] = useState<AdapterInfo | null>(null);
  const [configuringType, setConfiguringType] = useState<string | null>(() => {
    const target = searchParams.get("configure") || searchParams.get("adapter");
    return target === "omnia" ? "omnia" : null;
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Organization", href: "/dashboard" },
      { label: "Settings", href: "/company/settings" },
      { label: "Adapters" },
    ]);
  }, [selectedCompany?.name, setBreadcrumbs]);

  const { data: adapters, isLoading } = useQuery({
    queryKey: queryKeys.adapters.all,
    queryFn: () => adaptersApi.list(),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.adapters.all });
  };

  const installMutation = useMutation({
    mutationFn: (params: { packageName: string; version?: string; isLocalPath?: boolean }) =>
      adaptersApi.install(params),
    onSuccess: (result) => {
      invalidate();
      setInstallDialogOpen(false);
      setInstallPackage("");
      setInstallVersion("");
      setIsLocalPath(false);
      pushToast({
        title: "Adapter installed",
        body: `Type "${result.type}" registered successfully.${result.version ? ` (v${result.version})` : ""}`,
        tone: "success",
      });
    },
    onError: (err: Error) => {
      pushToast({ title: "Install failed", body: err.message, tone: "error" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (type: string) => adaptersApi.remove(type),
    onSuccess: () => {
      invalidate();
      pushToast({ title: "Adapter removed", tone: "success" });
    },
    onError: (err: Error) => {
      pushToast({ title: "Removal failed", body: err.message, tone: "error" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ type, disabled }: { type: string; disabled: boolean }) =>
      adaptersApi.setDisabled(type, disabled),
    onSuccess: () => {
      invalidate();
    },
    onError: (err: Error) => {
      pushToast({ title: "Toggle failed", body: err.message, tone: "error" });
    },
  });

  const overrideMutation = useMutation({
    mutationFn: ({ type, paused }: { type: string; paused: boolean }) =>
      adaptersApi.setOverridePaused(type, paused),
    onSuccess: () => {
      invalidate();
    },
    onError: (err: Error) => {
      pushToast({ title: "Override toggle failed", body: err.message, tone: "error" });
    },
  });

  const reloadMutation = useMutation({
    mutationFn: (type: string) => adaptersApi.reload(type),
    onSuccess: (result) => {
      invalidate();
      invalidateDynamicParser(result.type);
      invalidateConfigSchemaCache(result.type);
      pushToast({
        title: "Adapter reloaded",
        body: `Type "${result.type}" reloaded.${result.version ? ` (v${result.version})` : ""}`,
        tone: "success",
      });
    },
    onError: (err: Error) => {
      pushToast({ title: "Reload failed", body: err.message, tone: "error" });
    },
  });

  const reinstallMutation = useMutation({
    mutationFn: (type: string) => adaptersApi.reinstall(type),
    onSuccess: (result) => {
      invalidate();
      invalidateDynamicParser(result.type);
      invalidateConfigSchemaCache(result.type);
      pushToast({
        title: "Adapter reinstalled",
        body: `Type "${result.type}" updated from npm.${result.version ? ` (v${result.version})` : ""}`,
        tone: "success",
      });
    },
    onError: (err: Error) => {
      pushToast({ title: "Reinstall failed", body: err.message, tone: "error" });
    },
  });

  const sortWithOmniaFirst = <T extends { type: string }>(items: T[]): T[] => {
    return [...items].sort((a, b) => {
      if (a.type === "omnia") return -1;
      if (b.type === "omnia") return 1;
      return a.type.localeCompare(b.type);
    });
  };

  const builtinAdapters = sortWithOmniaFirst((adapters ?? []).filter((a) => a.source === "builtin"));
  const externalAdapters = sortWithOmniaFirst((adapters ?? []).filter((a) => a.source === "external"));

  // External adapters that override a builtin type.  The server only returns
  // one entry per type (the external), so we synthesize a builtin row for
  // the builtins section so users can see which builtins are affected.
  const overriddenBuiltins = (adapters ?? [])
    .filter((a) => a.source === "external" && a.overriddenBuiltin)
    .filter((a) => !builtinAdapters.some((b) => b.type === a.type))
    .map((a) => ({
      type: a.type,
      label: getAdapterLabel(a.type),
      overriddenBy: [
        a.packageName,
        a.version ? `v${a.version}` : undefined,
      ].filter(Boolean).join(" "),
      overridePaused: !!a.overridePaused,
      menuDisabled: !!a.disabled,
    }));

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading adapters...</div>;

  const isMutating = installMutation.isPending || removeMutation.isPending || toggleMutation.isPending || overrideMutation.isPending || reloadMutation.isPending || reinstallMutation.isPending;

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Adapters</h1>
          <Badge variant="outline" className="text-amber-600 border-amber-400">
            Alpha
          </Badge>
        </div>

        <Dialog open={installDialogOpen} onOpenChange={setInstallDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Install Adapter
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Install External Adapter</DialogTitle>
              <DialogDescription>
                Add an adapter from npm or a local path. The adapter package must export <code className="text-xs bg-muted px-1 py-0.5 rounded">createServerAdapter()</code>.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {/* Source toggle */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors",
                    !isLocalPath
                      ? "border-foreground bg-accent text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  )}
                  onClick={() => setIsLocalPath(false)}
                >
                  <Package className="h-3.5 w-3.5" />
                  npm package
                </button>
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors",
                    isLocalPath
                      ? "border-foreground bg-accent text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  )}
                  onClick={() => setIsLocalPath(true)}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  Local path
                </button>
              </div>

              {isLocalPath ? (
                /* Local path input */
                <div className="grid gap-2">
                  <Label htmlFor="adapterLocalPath">Path to adapter package</Label>
                  <div className="flex gap-2">
                    <Input
                      id="adapterLocalPath"
                      className="flex-1 font-mono text-xs"
                      placeholder="/mnt/e/Projects/my-adapter  or  E:\Projects\my-adapter"
                      value={installPackage}
                      onChange={(e) => setInstallPackage(e.target.value)}
                    />
                    <ChoosePathButton />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Accepts Linux, WSL, and Windows paths. Windows paths are auto-converted.
                  </p>
                </div>
              ) : (
                /* npm package input */
                <>
                  <div className="grid gap-2">
                    <Label htmlFor="adapterPackageName">Package Name</Label>
                    <Input
                      id="adapterPackageName"
                      placeholder="my-paperclip-adapter"
                      value={installPackage}
                      onChange={(e) => setInstallPackage(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="adapterVersion">Version (optional)</Label>
                    <Input
                      id="adapterVersion"
                      placeholder="latest"
                      value={installVersion}
                      onChange={(e) => setInstallVersion(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInstallDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={() =>
                  installMutation.mutate({
                    packageName: installPackage,
                    version: installVersion || undefined,
                    isLocalPath,
                  })
                }
                disabled={!installPackage || installMutation.isPending}
              >
                {installMutation.isPending ? "Installing..." : "Install"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Alpha notice */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">External adapters are alpha.</p>
            <p className="text-muted-foreground">
              The adapter plugin system is under active development. APIs and storage format may change.
              Use the power icon to hide adapters from agent menus without removing them.
            </p>
          </div>
        </div>
      </div>

      {/* OmnIA Sovereign Engine Configuration Card */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground text-sm">OmnIA Engine Configuration</span>
            <Badge variant="secondary" className="font-mono text-(length:--text-nano) bg-primary/10 text-primary border-primary/20">
              Active Host
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Remote sovereign endpoint: <code className="text-xs font-mono font-medium text-foreground bg-muted/60 px-1.5 py-0.5 rounded">https://api.ntv.cloud2local.com/omnia/api</code> (Zero local Ollama dependency)
          </p>
        </div>
        <Button
          size="sm"
          variant="default"
          className="gap-2 shrink-0"
          onClick={() => setConfiguringType("omnia")}
        >
          <Sliders className="h-4 w-4" />
          Configure OmnIA
        </Button>
      </div>

      {/* External adapters */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Cpu className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-semibold">External Adapters</h2>
        </div>

        {externalAdapters.length === 0 ? (
          <Card className="bg-muted/30">
            <CardContent className="flex flex-col items-center justify-center py-10">
              <Cpu className="h-10 w-10 text-muted-foreground mb-4" />
              <p className="text-sm font-medium">No external adapters installed</p>
              <p className="text-xs text-muted-foreground mt-1">
                Install an adapter package to extend model support.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="block py-0">
          <ul className="divide-y">
            {externalAdapters.map((adapter) => {
              const isBuiltinOverride = adapter.overriddenBuiltin;
              const overridePaused = isBuiltinOverride && !!adapter.overridePaused;

              // For overridden builtins, the power button controls the
              // override pause state (not server menu visibility).
              const effectiveAdapter: AdapterInfo = isBuiltinOverride
                ? { ...adapter, disabled: overridePaused ?? false }
                : adapter;

              return (
                <AdapterRow
                  key={adapter.type}
                  adapter={effectiveAdapter}
                  canRemove={true}
                  onToggle={
                    isBuiltinOverride
                      ? (type, disabled) => overrideMutation.mutate({ type, paused: disabled })
                      : (type, disabled) => toggleMutation.mutate({ type, disabled })
                  }
                  onRemove={(type) => setRemoveType(type)}
                  onReload={(type) => reloadMutation.mutate(type)}
                  onReinstall={!adapter.isLocalPath ? (type) => setReinstallTarget(adapter) : undefined}
                  onConfigure={adapter.type === "omnia" ? () => setConfiguringType(adapter.type) : undefined}
                  isToggling={isBuiltinOverride ? overrideMutation.isPending : toggleMutation.isPending}
                  isReloading={reloadMutation.isPending}
                  isReinstalling={reinstallMutation.isPending}
                  toggleTitleDisabled={isBuiltinOverride ? "Pause external override" : undefined}
                  toggleTitleEnabled={isBuiltinOverride ? "Resume external override" : undefined}
                  disabledBadgeLabel={isBuiltinOverride ? "Override paused" : undefined}
                />
              );
            })}
          </ul>
          </Card>
        )}
      </section>

      {/* Built-in adapters */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Cpu className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-semibold">Built-in Adapters</h2>
        </div>

        {builtinAdapters.length === 0 && overriddenBuiltins.length === 0 ? (
          <div className="text-sm text-muted-foreground">No built-in adapters found.</div>
        ) : (
          <Card className="block py-0">
          <ul className="divide-y">
            {builtinAdapters.map((adapter) => (
              <AdapterRow
                key={adapter.type}
                adapter={adapter}
                canRemove={false}
                onToggle={(type, disabled) => toggleMutation.mutate({ type, disabled })}
                onRemove={() => {}}
                onConfigure={adapter.type === "omnia" ? () => setConfiguringType(adapter.type) : undefined}
                isToggling={isMutating}
              />
            ))}
            {overriddenBuiltins.map((virtual) => (
              <AdapterRow
                key={virtual.type}
                adapter={{
                  type: virtual.type,
                  label: virtual.label,
                  source: "builtin",
                  modelsCount: 0,
                  loaded: true,
                  disabled: virtual.menuDisabled,
                  capabilities: {
                    supportsInstructionsBundle: false,
                    supportsSkills: false,
                    supportsLocalAgentJwt: false,
                    requiresMaterializedRuntimeSkills: false,
                    supportsAcp: false,
                  },
                }}
                canRemove={false}
                onToggle={(type, disabled) => toggleMutation.mutate({ type, disabled })}
                onRemove={() => {}}
                isToggling={isMutating}
                overriddenBy={virtual.overridePaused ? undefined : virtual.overriddenBy}
              />
            ))}
          </ul>
          </Card>
        )}
      </section>

      {/* Remove confirmation */}
      <Dialog
        open={removeType !== null}
        onOpenChange={(open) => { if (!open) setRemoveType(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Adapter</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove the <strong>{removeType}</strong> adapter?
              It will be unregistered and removed from the adapter store.
              {removeType && adapters?.find((a) => a.type === removeType)?.packageName && (
                <> npm packages will be cleaned up from disk.</>
              )}
              {" "}This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveType(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={removeMutation.isPending}
              onClick={() => {
                if (removeType) {
                  removeMutation.mutate(removeType, {
                    onSettled: () => setRemoveType(null),
                  });
                }
              }}
            >
              {removeMutation.isPending ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Reinstall confirmation */}
      <ReinstallDialog
        adapter={reinstallTarget}
        open={reinstallTarget !== null}
        isReinstalling={reinstallMutation.isPending}
        onConfirm={() => {
          if (reinstallTarget) {
            reinstallMutation.mutate(reinstallTarget.type, {
              onSettled: () => setReinstallTarget(null),
            });
          }
        }}
        onCancel={() => setReinstallTarget(null)}
      />
      {/* OmnIA Configuration Dialog */}
      <OmniaConfigDialog
        open={configuringType === "omnia"}
        onOpenChange={(open) => {
          if (!open) setConfiguringType(null);
        }}
      />
    </div>
  );
}
