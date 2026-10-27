// The three dated logs a member keeps (spec 11) share one shape: a date, some fields, list, add, delete.
// Each kind is a row in this registry instead of a copy of the handlers.
export type FieldType = 'date' | 'text' | 'decimal' | 'int' | 'select';
export interface Field {
  name: string; // form field
  col: string; // column
  label: string;
  type: FieldType;
  required?: boolean;
  scale?: number; // stored = round(value * scale), e.g. kg to grams
  min?: number;
  max?: number;
  options?: [value: string, label: string][];
}
export interface LogKind { table: string; path: string; title: string; dateCol: string; fields: Field[] }

export const MEALS: [string, string][] = [['breakfast', 'Desayuno'], ['lunch', 'Almuerzo'], ['dinner', 'Cena'], ['snack', 'Snack']];

export const LOGS: Record<'weights' | 'workouts' | 'nutrition', LogKind> = {
  weights: {
    table: 'weights', path: '/app/peso/', title: 'Peso', dateCol: 'measured_on',
    fields: [
      { name: 'date', col: 'measured_on', label: 'Fecha', type: 'date', required: true },
      { name: 'kg', col: 'weight_g', label: 'Peso (kg)', type: 'decimal', required: true, scale: 1000, min: 20, max: 400 },
      { name: 'fat', col: 'body_fat_pct_x10', label: 'Grasa (%)', type: 'decimal', scale: 10, min: 1, max: 80 },
      { name: 'waist', col: 'waist_mm', label: 'Cintura (cm)', type: 'decimal', scale: 10, min: 30, max: 250 },
      { name: 'note', col: 'note', label: 'Nota', type: 'text' },
    ],
  },
  workouts: {
    table: 'workouts', path: '/app/entrenos/', title: 'Entrenos', dateCol: 'performed_on',
    fields: [
      { name: 'date', col: 'performed_on', label: 'Fecha', type: 'date', required: true },
      { name: 'title', col: 'title', label: 'Entreno', type: 'text', required: true },
      { name: 'minutes', col: 'minutes', label: 'Minutos', type: 'int', min: 1, max: 600 },
      { name: 'effort', col: 'effort', label: 'Esfuerzo (1 a 10)', type: 'int', min: 1, max: 10 },
      { name: 'notes', col: 'notes', label: 'Notas', type: 'text' },
    ],
  },
  nutrition: {
    table: 'nutrition_logs', path: '/app/nutricion/', title: 'Nutrición', dateCol: 'eaten_on',
    fields: [
      { name: 'date', col: 'eaten_on', label: 'Fecha', type: 'date', required: true },
      { name: 'meal', col: 'meal', label: 'Comida', type: 'select', required: true, options: MEALS },
      { name: 'description', col: 'description', label: 'Qué comiste', type: 'text', required: true },
      { name: 'kcal', col: 'kcal', label: 'kcal', type: 'int', min: 0, max: 10000 },
      { name: 'protein', col: 'protein_g', label: 'Proteína (g)', type: 'int', min: 0, max: 1000 },
      { name: 'carbs', col: 'carbs_g', label: 'Carbohidratos (g)', type: 'int', min: 0, max: 2000 },
      { name: 'fat', col: 'fat_g', label: 'Grasa (g)', type: 'int', min: 0, max: 1000 },
    ],
  },
};

export const isDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

// Parses one submitted entry into column values, or the first problem in Spanish.
export function parseEntry(kind: LogKind, input: Record<string, string>): { values: Record<string, string | number | null> } | { error: string } {
  const values: Record<string, string | number | null> = {};
  for (const f of kind.fields) {
    const raw = (input[f.name] ?? '').trim();
    if (!raw) {
      if (f.required) return { error: `Falta ${f.label.toLowerCase()}.` };
      values[f.col] = null;
      continue;
    }
    if (f.type === 'date') {
      if (!isDate(raw)) return { error: `${f.label} no es una fecha válida.` };
      values[f.col] = raw;
    } else if (f.type === 'select') {
      if (!f.options!.some(([v]) => v === raw)) return { error: `${f.label} no es válida.` };
      values[f.col] = raw;
    } else if (f.type === 'text') {
      values[f.col] = raw.slice(0, 500);
    } else {
      const n = Number(raw.replace(',', '.'));
      if (!Number.isFinite(n) || (f.type === 'int' && !Number.isInteger(n))) return { error: `${f.label} debe ser un número.` };
      if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) return { error: `${f.label} está fuera de rango.` };
      values[f.col] = f.scale ? Math.round(n * f.scale) : n;
    }
  }
  return { values };
}

// Shows a stored value the way the member typed it, with a decimal comma.
export function display(f: Field, v: unknown): string {
  if (v === null || v === undefined) return '';
  if (f.type === 'select') return f.options!.find(([k]) => k === v)?.[1] ?? String(v);
  if (f.type === 'decimal') return (Number(v) / (f.scale ?? 1)).toLocaleString('es-CO', { maximumFractionDigits: 1 });
  return String(v);
}
