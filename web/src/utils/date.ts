/**
 * Parses Hikvision wall-clock timestamp string ("YYYY-MM-DD HH:mm:ss" or ISO) 
 * into a local Date object without unexpected timezone offset shifts.
 */
export function parseSegmentTime(dateStr: string): Date {
  if (!dateStr) return new Date();
  const clean = dateStr.replace('T', ' ').replace('Z', '');
  const parts = clean.split(' ');
  const datePart = parts[0] || '';
  const timePart = parts[1] || '00:00:00';
  
  const [y, m, d] = datePart.split('-').map(Number);
  const [h, min, s] = timePart.split(':').map(Number);
  
  return new Date(y || 1970, (m || 1) - 1, d || 1, h || 0, min || 0, s || 0);
}

/**
 * Formats a Date to 24-hour time string "HH:mm:ss"
 */
export function format24hTime(date: Date, includeSeconds: boolean = true): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const h = pad(date.getHours());
  const m = pad(date.getMinutes());
  if (!includeSeconds) return `${h}:${m}`;
  const s = pad(date.getSeconds());
  return `${h}:${m}:${s}`;
}
