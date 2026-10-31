// Compatibility facade: every view uses the shared Mayor reaction model.
export { ReactionQueue, reactionFromEffect, reactionLabels, reactionPriority } from "../mayor/reactions";
export type { ReactionKind, ReactionCue as OverlayReaction } from "../mayor/reactions";
