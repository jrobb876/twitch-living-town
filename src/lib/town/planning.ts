/** Versioned district recipe. Changing geometry requires a new recipe version/migration. */
export const PLANNING = { reserve: 4, districtCapacity: 12, maxDistricts: 40, tileWidth: 1600, tileHeight: 1120, version: 1 } as const;
export const MAX_PLOTS = 14 + PLANNING.maxDistricts * PLANNING.districtCapacity;
