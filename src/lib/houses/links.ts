export const townVisitPath = (townId: string) => `/towns/${encodeURIComponent(townId)}`;
export const houseEditorPath = (townId: string, houseId: string) => `/my-houses/${encodeURIComponent(townId)}/${encodeURIComponent(houseId)}`;
