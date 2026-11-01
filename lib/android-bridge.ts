"use client";

export interface AndroidBridgeInterface {
  showToast(message: string): void;
  vibrate(durationMs: number): void;
  shareText(text: string, title?: string): void;
  showNotification(title: string, message: string): void;
  copyToClipboard(text: string): void;
  getDeviceInfo(): string; // JSON string
  isNativeApp(): boolean;
}

declare global {
  interface Window {
    AndroidBridge?: AndroidBridgeInterface;
  }
}

export function isAndroidApp(): boolean {
  return typeof window !== "undefined" && Boolean(window.AndroidBridge?.isNativeApp?.());
}

export function showAndroidToast(message: string): boolean {
  if (isAndroidApp() && window.AndroidBridge) {
    try {
      window.AndroidBridge.showToast(message);
      return true;
    } catch (e) {
      console.warn("AndroidBridge error", e);
    }
  }
  return false;
}

export function vibrateAndroid(durationMs: number = 50): boolean {
  if (isAndroidApp() && window.AndroidBridge) {
    try {
      window.AndroidBridge.vibrate(durationMs);
      return true;
    } catch (e) {
      console.warn("AndroidBridge error", e);
    }
  }
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(durationMs);
      return true;
    } catch {
      // ignore
    }
  }
  return false;
}

export function shareAndroidText(text: string, title: string = "Q7 Chat"): boolean {
  if (isAndroidApp() && window.AndroidBridge) {
    try {
      window.AndroidBridge.shareText(text, title);
      return true;
    } catch (e) {
      console.warn("AndroidBridge error", e);
    }
  }
  if (typeof navigator !== "undefined" && "share" in navigator) {
    try {
      navigator.share({ title, text }).catch(() => {});
      return true;
    } catch {
      // ignore
    }
  }
  return false;
}

export function notifyAndroid(title: string, message: string): boolean {
  if (isAndroidApp() && window.AndroidBridge) {
    try {
      window.AndroidBridge.showNotification(title, message);
      return true;
    } catch (e) {
      console.warn("AndroidBridge error", e);
    }
  }
  return false;
}
