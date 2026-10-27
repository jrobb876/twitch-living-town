export type Point = { x: number; y: number };
export type House = Point & {
  id: string;
  roof: number;
  wall: number;
  style: number;
  flowers: number;
};
export type Tree = Point & { size: number; variant: number };
export type PathNode = Point & { id: string; neighbors: string[] };
export type Town = {
  seed: number;
  width: number;
  height: number;
  plaza: Point;
  hall: Point;
  houses: House[];
  trees: Tree[];
  roads: { from: Point; to: Point; width: number }[];
  expansion: Point[];
  navigation: PathNode[];
  flowers: (Point & { color: number })[];
};
