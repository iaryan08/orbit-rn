import { useState } from "react";
import { Dialog } from "@capacitor/dialog";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

type ApkUpdateResponse = {
  version?: string;
  version_code?: number;
  url?: string;
  release_notes?: string;
  bucket?: string;
  path?: string;
};

type UpdateFetchFailure = {
  endpoint: string;
  reason: string;
};

type ApkUpdateFetchResult = {
  data: ApkUpdateResponse | null;
  failures: UpdateFetchFailure[];
};

function isNewerVersion(a: string, b: string): boolean {
  try {
    const parse = (v: string) => v.replace(/[^0-9.]/g, "").split(".").map(Number);
    const [aMaj, aMin, aPatch] = parse(a);
    const [bMaj, bMin, bPatch] = parse(b);
    if (aMaj !== bMaj) return aMaj > bMaj;
    if (aMin !== bMin) return aMin > bMin;
    return (aPatch ?? 0) > (bPatch ?? 0);
  } catch {
    return a !== b;
  }
}

function isNewerBuild(latestBuild?: number, currentBuild?: string): boolean | null {
  if (!latestBuild || !currentBuild) return null;
  const current = Number(currentBuild);
  if (!Number.isFinite(current) || !Number.isFinite(latestBuild)) return null;
  return latestBuild > current;
}

import { getPublicStorageUrl } from "@/lib/storage";

function buildPublicApkUrl(bucket?: string, path?: string): string {
  if (!bucket || !path) return "";
  return getPublicStorageUrl(path, bucket as any) || "";
}

export function useApkUpdater() {
  const [isChecking, setIsChecking] = useState(false);
  const isNative = Capacitor.isNativePlatform();

  const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_DB_PROXY_URL || "").replace(/\/$/, "");
  const isLocalhostBase = /localhost|127\.0\.0\.1/i.test(API_BASE);
  const UPDATE_ENDPOINTS = isNative
    ? Array.from(
      new Set(
        [
          API_BASE ? `${API_BASE}/api/apk-update` : null,
          API_BASE ? `${API_BASE}/updates.json` : null,
        ].filter(Boolean) as string[]
      )
    )
    : ["/api/apk-update"];

  const UPDATE_FETCH_TIMEOUT_MS = 25000;
  const UPDATE_FETCH_RETRIES = 2;

  const wait = (ms: number) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });

  const tryFetchEndpoint = async (endpoint: string): Promise<ApkUpdateFetchResult> => {
    const failures: UpdateFetchFailure[] = [];

    for (let attempt = 1; attempt <= UPDATE_FETCH_RETRIES; attempt += 1) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), UPDATE_FETCH_TIMEOUT_MS);
        const response = await fetch(`${endpoint}?t=${Date.now()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          failures.push({
            endpoint,
            reason: `HTTP ${response.status} ${response.statusText || ""}`.trim(),
          });
          if (attempt < UPDATE_FETCH_RETRIES) await wait(350 * attempt);
          continue;
        }

        const data = (await response.json()) as ApkUpdateResponse;
        if (data?.version) return { data, failures };
        failures.push({ endpoint, reason: "Invalid JSON payload (missing version)" });
      } catch {
        failures.push({ endpoint, reason: "Network error or request timed out" });
        if (attempt < UPDATE_FETCH_RETRIES) await wait(350 * attempt);
      }
    }

    return { data: null, failures };
  };

  const fetchLatestApk = async (): Promise<ApkUpdateFetchResult> => {
    const failures: UpdateFetchFailure[] = [];
    for (const endpoint of UPDATE_ENDPOINTS) {
      const result = await tryFetchEndpoint(endpoint);
      failures.push(...result.failures);
      if (result.data?.version) return { data: result.data, failures };
    }
    return { data: null, failures };
  };

  const resolveDownloadUrl = (latest: ApkUpdateResponse): string => {
    if (latest.url) return latest.url;
    return buildPublicApkUrl(latest.bucket, latest.path);
  };

  const checkForApkUpdate = async () => {
    if (!isNative) return;

    setIsChecking(true);
    try {
      const { data: latest, failures } = await fetchLatestApk();

      if (!latest) {
        const uniqueFailures = Array.from(new Set(failures.map((item) => item.reason)));
        const reasonText =
          uniqueFailures.length > 0
            ? `\n\nDetails:\n${uniqueFailures
              .slice(0, 3)
              .map((reason) => `- ${reason}`)
              .join("\n")}`
            : "";
        await Dialog.alert({
          title: "Update Check Failed",
          message: `Could not reach update server. Please try again shortly.${reasonText}`,
        });
        return;
      }

      const appInfo = await App.getInfo();
      const currentVersion = appInfo.version;
      const byBuild = isNewerBuild(latest.version_code, appInfo.build);
      const hasUpdate = byBuild === null
        ? isNewerVersion(latest.version!, currentVersion)
        : byBuild;

      if (!hasUpdate) {
        await Dialog.alert({
          title: "You're up to date",
          message: `You're already on the latest version (${currentVersion}${appInfo.build ? ` / build ${appInfo.build}` : ""}).`,
        });
        return;
      }

      const downloadUrl = resolveDownloadUrl(latest);
      if (!downloadUrl) {
        await Dialog.alert({
          title: "Update Not Ready",
          message: `Version ${latest.version} is available but the download link isn't configured yet. Please check back shortly.`,
        });
        return;
      }

      const { value } = await Dialog.confirm({
        title: `Update Available - v${latest.version}`,
        message: `You're on v${currentVersion}${appInfo.build ? ` (build ${appInfo.build})` : ""}. Version ${latest.version}${latest.version_code ? ` (build ${latest.version_code})` : ""} is ready.\n\nTap Install to download and apply the update.\n\n${latest.release_notes || ""}`.trim(),
        okButtonTitle: "Install Update",
        cancelButtonTitle: "Later",
      });

      if (!value) return;

      try {
        window.open(downloadUrl, "_blank", "noopener,noreferrer");
        await Dialog.alert({
          title: "Download Started",
          message: "Once the APK downloads, open it from your notifications or Downloads folder and tap Install.",
        });
      } catch {
        await Dialog.alert({
          title: "Manual Download",
          message: `Your browser couldn't open the link automatically.\n\nCopy this URL to download:\n${downloadUrl}`,
        });
      }
    } catch (error) {
      console.error("APK update check failed:", error);
      await Dialog.alert({
        title: "Error",
        message: "Failed to check or open APK update.",
      });
    } finally {
      setIsChecking(false);
    }
  };

  const downloadLatestApkForWeb = async (): Promise<boolean> => {
    if (isNative) return false;
    setIsChecking(true);
    try {
      const { data: latest } = await fetchLatestApk();
      if (!latest) return false;
      const downloadUrl = resolveDownloadUrl(latest);
      if (!downloadUrl) return false;
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
      return true;
    } finally {
      setIsChecking(false);
    }
  };

  return {
    checkForApkUpdate,
    downloadLatestApkForWeb,
    isChecking,
    isNative,
  };
}
