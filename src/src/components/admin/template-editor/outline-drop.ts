/**
 * outline-drop — ED5 T19 (B-3). The PURE decision at the heart of the outline's
 * multi-container drag: given the active + over ids and the current per-section
 * uid lists, decide whether the drop is a within-section REORDER or a
 * cross-section MOVE (and where). Kept dependency-free + exhaustively unit-
 * tested because jsdom cannot drive real dnd-kit pointer drag — the dnd-kit
 * wiring in EditorOutline (T20) stays thin and delegates the decision here.
 */

export type OutlineDropResult =
  | { kind: "reorder"; sectionKey: string; order: string[] }
  | { kind: "move"; uid: string; targetSectionKey: string; index: number }
  | null;

function arrayMove<T>(arr: readonly T[], from: number, to: number): T[] {
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

/**
 * @param activeId   the dragged question uid
 * @param overId     the drop target — either a question uid OR a section
 *                   container id (a key of `containers`, used when dropping onto
 *                   an empty section or its header)
 * @param containers per-section ordered uid lists, keyed by section stableKey
 */
export function resolveOutlineDrop(
  activeId: string,
  overId: string,
  containers: Record<string, readonly string[]>,
): OutlineDropResult {
  if (!activeId || activeId === overId) return null;

  const activeSection = Object.keys(containers).find((k) =>
    containers[k].includes(activeId),
  );
  if (activeSection === undefined) return null;

  const overIsContainer = Object.prototype.hasOwnProperty.call(
    containers,
    overId,
  );

  let targetSection: string | undefined;
  if (overIsContainer) {
    targetSection = overId;
  } else {
    targetSection = Object.keys(containers).find((k) =>
      containers[k].includes(overId),
    );
  }
  if (targetSection === undefined) return null;

  if (targetSection === activeSection) {
    const list = containers[activeSection];
    const from = list.indexOf(activeId);
    const to = overIsContainer ? list.length - 1 : list.indexOf(overId);
    if (from < 0 || to < 0 || from === to) return null;
    return { kind: "reorder", sectionKey: activeSection, order: arrayMove(list, from, to) };
  }

  const index = overIsContainer
    ? containers[targetSection].length
    : containers[targetSection].indexOf(overId);
  return {
    kind: "move",
    uid: activeId,
    targetSectionKey: targetSection,
    index: Math.max(0, index),
  };
}
