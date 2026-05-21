"use client";

/**
 * SectionsTab — F2b (Checkpoint 1b).
 *
 * Standalone Sections tab — wraps the shared SectionsCard component
 * full-width. Shares state with MetadataTab's right-column card via the
 * parent TemplateEditorTabbed (single sections-dirty flag).
 *
 * Per plan grill Q5: the same SectionsCard component is rendered on
 * its own tab, full-width, no two-column grid.
 */

import React from "react";
import { SectionsCard, type SectionDraft } from "./SectionsCard";

export interface SectionsTabProps {
  sections: SectionDraft[];
  questionCountByStableKey: Record<string, number>;
  onSectionsAdd: () => void;
  onSectionsRename: (uid: string, name: string) => void;
  onSectionsDelete: (uid: string) => void;
  onSectionsMoveUp: (uid: string) => void;
  onSectionsMoveDown: (uid: string) => void;
  onSectionsReorder?: (newOrderUids: string[]) => void;
  isReadOnly: boolean;
}

export function SectionsTab({
  sections,
  questionCountByStableKey,
  onSectionsAdd,
  onSectionsRename,
  onSectionsDelete,
  onSectionsMoveUp,
  onSectionsMoveDown,
  onSectionsReorder,
  isReadOnly,
}: SectionsTabProps) {
  return (
    <div className="max-w-4xl">
      <SectionsCard
        sections={sections}
        questionCountByStableKey={questionCountByStableKey}
        onAdd={onSectionsAdd}
        onRename={onSectionsRename}
        onDelete={onSectionsDelete}
        onMoveUp={onSectionsMoveUp}
        onMoveDown={onSectionsMoveDown}
        onReorder={onSectionsReorder}
        isReadOnly={isReadOnly}
        layout="wide"
      />
    </div>
  );
}
