export const mayorLooks = ["cream", "orange", "gray", "dark"] as const;
export type MayorLook = typeof mayorLooks[number];
export const personalityNames = ["playful", "curious", "calm", "mischievous"] as const;
export type PersonalityName = typeof personalityNames[number];
export type MayorPersonality = { curiosity: number; energy: number; preset?: PersonalityName };
export const personalities: Record<PersonalityName, { label: string; description: string; curiosity: number; energy: number }> = {
  playful: { label: "Playful", description: "Short pauses and frequent strolls toward the plaza.", curiosity: 0.6, energy: 0.9 },
  curious: { label: "Curious", description: "Often explores paths to neighborhood doorsteps.", curiosity: 0.9, energy: 0.6 },
  calm: { label: "Calm", description: "Longer quiet pauses, with occasional visits to the town center.", curiosity: 0.3, energy: 0.2 },
  mischievous: { label: "Mischievous", description: "Short pauses and playful changes of direction on walks.", curiosity: 0.8, energy: 0.8 },
};
export function personalityFor(preset: PersonalityName): MayorPersonality {
  const { curiosity, energy } = personalities[preset]; return { preset, curiosity, energy };
}
export const mayorPalettes = {
  cream: { label: "Cream cat", body: 0xf6d7a6, face: 0xffe7c1, paws: 0xffe9c5, ears: 0xf5d6a7, tail: 0xf7ddb3, eyes: 0x46584d, stripes: null },
  orange: { label: "Orange tabby", body: 0xdca06b, face: 0xf0ba81, paws: 0xffe9c5, ears: 0xda9a62, tail: 0xdca06b, eyes: 0x46584d, stripes: 0xa9663c },
  gray: { label: "Gray cat", body: 0x929ca6, face: 0xb9c2c9, paws: 0xe1e3df, ears: 0x939fa8, tail: 0x929ca6, eyes: 0x3e5350, stripes: null },
  dark: { label: "Dark cat", body: 0x414c50, face: 0x566167, paws: 0x7e898b, ears: 0x414c50, tail: 0x414c50, eyes: 0xf7da93, stripes: null },
} as const;
/** Legacy 'default' and absent appearance retain the original cream Mayor. */
export function mayorLook(value?: string): MayorLook { return mayorLooks.includes(value as MayorLook) ? value as MayorLook : "cream"; }
export function mayorPalette(value?: string) { return mayorPalettes[mayorLook(value)]; }
export function hex(color: number) { return `#${color.toString(16).padStart(6, "0")}`; }
