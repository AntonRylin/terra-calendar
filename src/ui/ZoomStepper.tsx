import { ToolbarButton } from './ToolbarButton';
import './zoomStepper.css';

interface Props {
  value: number;
  onZoomIn(): void;
  onZoomOut(): void;
  onFit(): void;
  fitDisabled: boolean;
  zoomInDisabled?: boolean;
  zoomOutDisabled?: boolean;
}

/** Clean zoom capsule (− value +) plus a separate fit-to-width button. */
export function ZoomStepper({ value, onZoomIn, onZoomOut, onFit, fitDisabled, zoomInDisabled, zoomOutDisabled }: Props) {
  return (
    <div className="zoomstep">
      <div className="zoomstep-cap">
        <button className="zoomstep-btn" aria-label="Zoom out" onClick={onZoomOut} disabled={zoomOutDisabled}>−</button>
        <span className="zoomstep-val">{Math.round(value * 100)}%</span>
        <button className="zoomstep-btn" aria-label="Zoom in" onClick={onZoomIn} disabled={zoomInDisabled}>+</button>
      </div>
      <ToolbarButton variant="icon" aria-label="Fit to width" onClick={onFit} disabled={fitDisabled}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="9 9 4 9 4 4" /><polyline points="15 9 20 9 20 4" />
          <polyline points="9 15 4 15 4 20" /><polyline points="15 15 20 15 20 20" />
        </svg>
      </ToolbarButton>
    </div>
  );
}
