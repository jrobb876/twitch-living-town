import { seededRandom } from "../town/generate";
import type { PathNode } from "../town/types";
import type { ActorState, MayorState, TownWorld } from "./types";

// Layout arrays are immutable between expansions. Weak keys release old graphs.
const graphs = new WeakMap<PathNode[], Map<string, PathNode>>();
function graphFor(nodes: PathNode[]) {
  let graph = graphs.get(nodes);
  if (!graph) { graph = new Map(nodes.map((node) => [node.id, node])); graphs.set(nodes, graph); }
  return graph;
}

/** Breadth-first routing is logical graph traversal, independent of any renderer. */
export function routeBetween(nodes: PathNode[], from: string, to: string): string[] {
  if (from === to) return [];
  const graph = graphFor(nodes);
  const previous = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    for (const id of graph.get(current)?.neighbors ?? []) {
      if (previous.has(id)) continue;
      previous.set(id, current); queue.push(id);
      if (id === to) {
        const route = [id];
        let cursor = current;
        while (cursor !== from) { route.unshift(cursor); cursor = previous.get(cursor)!; }
        return route;
      }
    }
  }
  return [];
}

export function advanceActor(actor: ActorState, world: TownWorld, now: number, dt: number, score: number, salt: number, destination?: string): ActorState {
  const next = { ...actor, position: { ...actor.position } };
  const nodes = world.layout.navigation;
  const graph = graphFor(nodes);
  if (!next.targetNodeId && now >= next.restUntil) {
    const current = graph.get(next.nodeId)!;
    const choices = current.neighbors.filter((id) => id !== next.previousNodeId);
    const candidates = choices.length ? choices : current.neighbors;
    next.targetNodeId = destination
      ? routeBetween(nodes, current.id, destination)[0] ?? null
      : candidates[Math.floor(seededRandom(world.seed ^ salt ^ next.steps)() * candidates.length)];
    next.steps++;
  }
  if (next.targetNodeId) {
    const target = graph.get(next.targetNodeId)!;
    const dx = target.x - next.position.x, dy = target.y - next.position.y;
    const distance = Math.hypot(dx, dy), travel = (36 + score * 0.45) * dt / 1000;
    if (distance <= travel) {
      next.position = { x: target.x, y: target.y }; next.previousNodeId = next.nodeId;
      next.nodeId = target.id; next.targetNodeId = null;
      next.restUntil = now + (destination ? 0 : 1800 - score * 14);
    } else {
      next.position.x += dx / distance * travel; next.position.y += dy / distance * travel;
    }
  }
  return next;
}

export function advanceMayor(mayor: MayorState, world: TownWorld, now: number, dt: number, score: number): MayorState {
  const tasks = mayor.tasks.filter((task) => task.expiresAt > now);
  if (now < mayor.celebrationUntil) return { ...mayor, tasks };
  const task = tasks[0];
  if (task && mayor.nodeId === task.nodeId && !mayor.targetNodeId) {
    return { ...mayor, tasks: tasks.slice(1), behavior: task.kind === "welcome" ? "welcoming" : "celebrating", celebrationUntil: now + 4000, restUntil: now + 4000 };
  }
  const next = advanceActor(mayor, world, now, dt, score, 0xcafe, task?.nodeId);
  return { ...next, tasks, celebrationUntil: mayor.celebrationUntil,
    behavior: task ? "approaching" : next.targetNodeId ? "wandering" : "idle" };
}
