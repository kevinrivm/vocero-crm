import { es, catalogs, type MessageKey } from "./messages";
import { intlLocale, type Locale } from "./locale";
export * from "./locale";
export type { MessageKey } from "./messages";
export type Values = Record<string, string | number | null | undefined>;
export type Translator = ((key: MessageKey, values?: Values) => string) & { locale: Locale; intl: string };
export function interpolate(message: string, values: Values = {}): string {
  return message.replace(/\{([a-zA-Z]\w*)\}/g, (token, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name] ?? "") : token);
}
export function translator(locale: Locale): Translator {
  const messages = catalogs[locale];
  return Object.assign((key: MessageKey, values?: Values) => interpolate(messages[key] ?? es[key], values),
    { locale, intl: intlLocale(locale) });
}
// Patrones inmutables: no contienen estado de peticiones ni de usuarios.
const patterns = (Object.keys(es) as MessageKey[]).filter(key => /\{v\d+\}/.test(key)).map(key => {
  const names: string[] = [];
  const escaped = key.split(/(\{v\d+\})/).map(part => {
    if (/^\{v\d+\}$/.test(part)) { names.push(part.slice(1, -1)); return "([\\s\\S]*?)"; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("");
  return { key, names, regex: new RegExp("^" + escaped + "$") };
}).sort((a,b)=>b.key.replace(/\{v\d+\}/g,"").length-a.key.replace(/\{v\d+\}/g,"").length);
/** Exclusivamente etiquetas conocidas del sistema y errores. Nunca contenido de clientes. */
export function systemText(locale: Locale, value: string | null | undefined): string {
  if (value == null) return "";
  if (Object.prototype.hasOwnProperty.call(es, value)) return translator(locale)(value as MessageKey);
  if (locale === "es") return value;
  for (const pattern of patterns) {
    const match = pattern.regex.exec(value);
    if (match) return translator(locale)(pattern.key, Object.fromEntries(pattern.names.map((name,i) => [name, match[i+1]])));
  }
  return value;
}
export function plural(locale: Locale, count: number, forms: { one: MessageKey; other: MessageKey }, values: Values = {}): string {
  const category = new Intl.PluralRules(intlLocale(locale)).select(count);
  return translator(locale)(category === "one" ? forms.one : forms.other, { ...values, count });
}
