"use client";

const PENDING_PAIR_INVITE_KEY = "orbit:pending-pair-invite:v1";

export interface PendingPairInvite {
    code: string;
    message?: string;
    createdAt: string;
}

export function normalizePairCode(input: string) {
    return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

export function buildPairInviteLink(code: string, message?: string) {
    const normalized = normalizePairCode(code);
    if (!normalized) return "";
    const url = new URL("/auth/login", window.location.origin);
    url.searchParams.set("pair", normalized);
    if (message?.trim()) {
        url.searchParams.set("msg", message.trim().slice(0, 220));
    }
    return url.toString();
}

export function stashPendingPairInvite(code: string, message?: string) {
    if (typeof window === "undefined") return;
    const normalized = normalizePairCode(code);
    if (!normalized) return;
    const payload: PendingPairInvite = {
        code: normalized,
        message: message?.trim() || undefined,
        createdAt: new Date().toISOString(),
    };
    localStorage.setItem(PENDING_PAIR_INVITE_KEY, JSON.stringify(payload));
}

export function readPendingPairInvite(): PendingPairInvite | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = localStorage.getItem(PENDING_PAIR_INVITE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed.code !== "string") return null;
        return {
            code: normalizePairCode(parsed.code),
            message: typeof parsed.message === "string" ? parsed.message : undefined,
            createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString(),
        };
    } catch {
        return null;
    }
}

export function clearPendingPairInvite() {
    if (typeof window === "undefined") return;
    localStorage.removeItem(PENDING_PAIR_INVITE_KEY);
}

