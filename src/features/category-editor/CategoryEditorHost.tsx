import { useUiStore } from '../../app/uiStore';
import { AnchoredPopover } from '../../ui/AnchoredPopover';
import { CategoryEditor } from './CategoryEditor';
import { useIsMobile } from '../../ui/useMediaQuery';
import { SheetHeader } from '../../ui/SheetParts';
import './categoryEditor.css';

/** Anchored popover entry point for category editing (chip double-click).
 *  All editing UI lives in the shared CategoryEditor. */
export function CategoryEditorHost() {
  const target = useUiStore((s) => s.categoryEditor);
  const close = useUiStore((s) => s.closeOverlays);
  const isMobile = useIsMobile();

  if (!target) return null;

  return (
    <AnchoredPopover anchorEl={target.anchorEl} onClose={close} placement="right">
      {isMobile && <SheetHeader title="Edit category" action={{ label: 'Done' }} />}
      <div className="category-editor">
        <CategoryEditor category={target.category} variant="popover" />
      </div>
    </AnchoredPopover>
  );
}
