/**
 * Servicio de notificaciones locales — abstrae Capacitor (Android) y Tauri (Desktop).
 *
 * Se usa en `sync.ts` cuando se detectan nuevos personajes tras una sincronización.
 */

import { Capacitor } from '@capacitor/core';

/** Interfaz unificada para notificaciones locales. */
export interface LocalNotification {
  /** Título de la notificación. */
  title: string;
  /** Cuerpo/mensaje de la notificación. */
  body: string;
  /** ID único para actualizar/cancelar. */
  id: number;
  /** Pequeño icono (Android - nombre del drawable sin extensión). */
  smallIcon?: string;
  /** Color del icono (Android). */
  iconColor?: string;
  /** Vibración (Android). */
  vibration?: boolean;
}

/** Estado de permisos. */
export type PermissionState = 'granted' | 'denied' | 'prompt';

/** Solicita permiso de notificaciones (no-op en Tauri desktop). */
export async function requestPermission(): Promise<PermissionState> {
  if (Capacitor.getPlatform() === 'android' || Capacitor.getPlatform() === 'ios') {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const result = await LocalNotifications.requestPermissions();
      return result.display === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }
  // Tauri desktop: permisos gestionados por el SO, asumimos concedido
  return 'granted';
}

/** Verifica si tenemos permiso. */
export async function hasPermission(): Promise<boolean> {
  if (Capacitor.getPlatform() === 'android' || Capacitor.getPlatform() === 'ios') {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const result = await LocalNotifications.checkPermissions();
      return result.display === 'granted';
    } catch {
      return false;
    }
  }
  return true;
}

/** Programa una notificación local inmediata. */
export async function showNotification(notification: LocalNotification): Promise<void> {
  const permitted = await hasPermission();
  if (!permitted) {
    console.warn('[notifications] Sin permiso para notificaciones');
    return;
  }

  const platform = Capacitor.getPlatform();

  if (platform === 'android' || platform === 'ios') {
    // Capacitor LocalNotifications
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      // vibration no está en los types TS actuales pero sí en la API nativa
      const notif: any = {
        title: notification.title,
        body: notification.body,
        id: notification.id,
        schedule: { at: new Date(Date.now() + 1000) },
        isExactNotification: false, // evita pedir permiso SCHEDULE_EXACT_ALARM
        smallIcon: notification.smallIcon ?? 'ic_stat_icon',
        iconColor: notification.iconColor ?? '#FF6B35',
        extra: { source: 'dokkan-sync' },
      };
      if (notification.vibration !== undefined) notif.vibration = notification.vibration;
      await LocalNotifications.schedule({ notifications: [notif] });
    } catch (e) {
      console.error('[notifications] Error programando notificación (Capacitor):', e);
    }
  } else {
    // Tauri desktop - plugin notification
    try {
      const { sendNotification } = await import('@tauri-apps/plugin-notification');
      await sendNotification({
        title: notification.title,
        body: notification.body,
      });
    } catch (e) {
      console.error('[notifications] Error enviando notificación (Tauri):', e);
    }
  }
}

/** Inicializa el canal de notificaciones (Android 8+). */
export async function initNotificationChannel(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;

  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.createChannel({
      id: 'dokkan-new-units',
      name: 'Nuevos Personajes',
      description: 'Notificaciones cuando sale un nuevo personaje en Dokkan Battle',
      importance: 4, // HIGH
      visibility: 1, // PUBLIC
      sound: 'default',
      vibration: true,
      lights: true,
      lightColor: '#FF6B35',
    });
  } catch (e) {
    console.warn('[notifications] No se pudo crear canal (puede ya existir):', e);
  }
}

/** Verifica si las notificaciones de nuevos personajes están activadas (localStorage). */
export function areNotificationsEnabled(): boolean {
  try {
    const stored = localStorage.getItem('notifyNewUnits');
    return stored !== 'false'; // true por defecto
  } catch {
    return true;
  }
}

/** Verifica si la vibración está activada (localStorage). */
export function isNotificationVibrationEnabled(): boolean {
  try {
    const stored = localStorage.getItem('notifyVibration');
    return stored !== 'false'; // true por defecto
  } catch {
    return true;
  }
}

/** Verifica si ya se preguntó al usuario por permisos de notificación. */
export function hasAskedNotificationPermission(): boolean {
  try {
    return localStorage.getItem('notificationPermissionAsked') === 'true';
  } catch {
    return false;
  }
}

/** Marca que ya se preguntó al usuario por permisos de notificación. */
export function setNotificationPermissionAsked(): void {
  try { localStorage.setItem('notificationPermissionAsked', 'true'); } catch {}
}