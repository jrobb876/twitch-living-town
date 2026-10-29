import { hex, mayorPalette } from "@/lib/mayor/presets";

export default function MayorPortrait({ name, preset }: { name: string; preset?: string }) {
  const p = mayorPalette(preset);
  return <svg viewBox="0 0 100 100" role="img" aria-label={`${name}, ${p.label.toLowerCase()} Mayor`}>
    <circle cx="50" cy="50" r="49" fill="#e9eddb" />
    <path d="M69 75Q94 72 83 52" fill="none" stroke={hex(p.tail)} strokeWidth="9" strokeLinecap="round" />
    <ellipse cx="49" cy="76" rx="23" ry="20" fill={hex(p.body)} />
    <path d="M24 43 23 16 43 29M75 43 77 16 58 29" fill={hex(p.ears)} />
    <path d="m29 32-1-10 10 10m31 0 3-10-10 10" fill="#dda7a0" />
    <ellipse cx="50" cy="47" rx="30" ry="25" fill={hex(p.face)} />
    {p.stripes !== null && <path d="M40 24l3 10m7-12v11m10-9-3 10" stroke={hex(p.stripes)} strokeWidth="4" strokeLinecap="round" />}
    <ellipse cx="32" cy="51" rx="6" ry="3" fill="#dba59e" /><ellipse cx="68" cy="51" rx="6" ry="3" fill="#dba59e" />
    <path d="M36 44q3-4 6 0m16 0q3-4 6 0" fill="none" stroke={hex(p.eyes)} strokeWidth="3" strokeLinecap="round" />
    <path d="m47 50 6 0-3 4Z" fill="#b98e7c" /><path d="M43 57q7 6 14 0" fill="none" stroke="#a17e68" strokeWidth="2" strokeLinecap="round" />
    <path d="m26 52-12-3m60 3 12-3" stroke="#c3a584" strokeWidth="2" />
    <path d="M31 69q19 9 38 0l-4 10-12-2-1 15-12-13-9-2Z" fill="#72988a" /><circle cx="49" cy="76" r="4" fill="#f3cc7d" />
  </svg>;
}
