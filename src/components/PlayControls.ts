/**
 * PlayControls Component.
 * STRICT RULE: Only imports from helpers/ or other components/.
 */
import { formatFrame } from '../helpers/format.helper';

export interface PlayControlsOptions {
  onTogglePlay?: () => void;
  onSeek?: (frame: number) => void;
  onStep?: (delta: number) => void;
}

export class PlayControls {
  private element: HTMLElement;
  private btnPlay: HTMLButtonElement;
  private btnPrev: HTMLButtonElement;
  private btnNext: HTMLButtonElement;
  private slider: HTMLInputElement;
  private label: HTMLSpanElement;

  constructor(options: PlayControlsOptions = {}) {
    this.element = document.createElement('div');
    this.element.className = 'controls-bar';
    this.element.innerHTML = `
      <button class="btn-step btn-prev" title="Step Back">⏮</button>
      <button class="btn-play primary" title="Play/Pause">▶ Play</button>
      <button class="btn-step btn-next" title="Step Forward">⏭</button>
      <input type="range" class="scrubber" min="0" max="24" step="0.1" value="0" />
      <span class="frame-label">Frame: 0.0 / 24</span>
    `;

    this.btnPlay = this.element.querySelector('.btn-play')!;
    this.btnPrev = this.element.querySelector('.btn-prev')!;
    this.btnNext = this.element.querySelector('.btn-next')!;
    this.slider = this.element.querySelector('.scrubber')!;
    this.label = this.element.querySelector('.frame-label')!;

    this.btnPlay.addEventListener('click', () => options.onTogglePlay?.());
    this.btnPrev.addEventListener('click', () => options.onStep?.(-1));
    this.btnNext.addEventListener('click', () => options.onStep?.(1));
    this.slider.addEventListener('input', (e) => {
      const val = parseFloat((e.target as HTMLInputElement).value);
      options.onSeek?.(val);
    });
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public update(currentFrame: number, totalFrames: number, isPlaying: boolean): void {
    this.slider.max = totalFrames.toString();
    this.slider.value = currentFrame.toFixed(1);
    this.btnPlay.textContent = isPlaying ? '⏸ Pause' : '▶ Play';
    this.label.textContent = `Frame: ${formatFrame(currentFrame, totalFrames)}`;
  }
}
