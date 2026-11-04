import { api } from './api';

// Avisos en el teléfono con la app cerrada (Web Push). En iPhone/iPad funciona desde iOS 16.4 y solo con el sistema
// agregado a la pantalla de inicio; en Android y computadoras, también desde el navegador.

export type EstadoPush = 'no-soportado' | 'instalar-primero' | 'bloqueado' | 'activo' | 'inactivo';

const esIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const instalada = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export async function estadoPush(): Promise<EstadoPush> {
  if (!('serviceWorker' in navigator)) return 'no-soportado';
  if (!('PushManager' in window) || !('Notification' in window)) return esIos() && !instalada() ? 'instalar-primero' : 'no-soportado';
  if (Notification.permission === 'denied') return 'bloqueado';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'activo' : 'inactivo';
}

const aBytes = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

/** Pide permiso (tiene que ser con un toque de la persona) y registra este teléfono para recibir sus avisos. */
export async function activarPush(): Promise<void> {
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Sin permiso para avisos. Se habilita en Ajustes del teléfono › Notificaciones.');
  const reg = await navigator.serviceWorker.ready;
  const { clave } = await api<{ clave: string }>('/push/clave');
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(clave) }));
  await api('/push/suscribir', { method: 'POST', body: sub.toJSON() });
}

/** Al entrar: si este teléfono ya tenía avisos activos, pasan a ser de quien entró. */
export async function reafirmarPush(): Promise<void> {
  if ((await estadoPush()) !== 'activo') return;
  const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
  if (sub) await api('/push/suscribir', { method: 'POST', body: sub.toJSON() });
}

/** Al salir: este teléfono deja de recibir los avisos de esa persona. */
export async function desactivarPush(): Promise<void> {
  const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
  if (!sub) return;
  await api('/push/desuscribir', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {});
}
