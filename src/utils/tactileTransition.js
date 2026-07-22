import { flushSync } from 'react-dom';

const PRESS_MS = 90;
const RELEASE_MS = 70;
const FALLBACK_MS = 440;

let transitionRunning = false;

function wait(duration) {
  return new Promise((resolve) => window.setTimeout(resolve, duration));
}

function commitImmediately(update) {
  flushSync(update);
}

async function runFallbackSurfaceTransition(sourceElement, transitionName, commit) {
  const sourceRect = sourceElement.getBoundingClientRect();
  const sourceRadius = window.getComputedStyle(sourceElement).borderRadius || '16px';
  const clone = sourceElement.cloneNode(true);
  clone.classList.remove('is-tactile-pressed', 'is-tactile-releasing');
  clone.classList.add('tactile-transition-clone');
  Object.assign(clone.style, {
    position: 'fixed',
    inset: 'auto',
    top: `${sourceRect.top}px`,
    left: `${sourceRect.left}px`,
    width: `${sourceRect.width}px`,
    height: `${sourceRect.height}px`,
    margin: '0',
    transform: 'none',
    transformOrigin: 'top left',
    pointerEvents: 'none',
    zIndex: '140',
  });
  document.body.appendChild(clone);
  let destination = null;
  try {
    document.documentElement.classList.add('tactile-fallback-transition');
    commit();

    destination = document.querySelector(`[data-transition-surface="${transitionName}"]`);
    if (!destination || typeof clone.animate !== 'function') {
      await wait(160);
      return;
    }

    const destinationRect = destination.getBoundingClientRect();
    const destinationRadius = window.getComputedStyle(destination).borderRadius || '20px';
    const translateX = destinationRect.left - sourceRect.left;
    const translateY = destinationRect.top - sourceRect.top;
    const scaleX = destinationRect.width / Math.max(1, sourceRect.width);
    const scaleY = destinationRect.height / Math.max(1, sourceRect.height);

    destination.style.opacity = '0';
    const timing = {
      duration: FALLBACK_MS,
      easing: 'cubic-bezier(.22, 1, .36, 1)',
      fill: 'both',
    };
    const cloneAnimation = clone.animate([
      { transform: 'translate(0, 0) scale(1)', borderRadius: sourceRadius, opacity: 1 },
      { transform: `translate(${translateX * 0.72}px, ${translateY * 0.72}px) scale(${1 + ((scaleX - 1) * 0.72)}, ${1 + ((scaleY - 1) * 0.72)})`, opacity: 0.9, offset: 0.58 },
      { transform: `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`, borderRadius: destinationRadius, opacity: 0 },
    ], timing);
    const destinationAnimation = destination.animate([
      { opacity: 0 },
      { opacity: 0.12, offset: 0.42 },
      { opacity: 1 },
    ], timing);

    await Promise.all([cloneAnimation.finished, destinationAnimation.finished]);
  } finally {
    if (destination) destination.style.opacity = '';
    clone.remove();
  }
}

export async function runTactileTransition(sourceElement, transitionName, update) {
  if (transitionRunning) return false;

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!sourceElement || reduceMotion) {
    commitImmediately(update);
    return true;
  }

  transitionRunning = true;
  let committed = false;

  const commitOnce = () => {
    if (committed) return;
    committed = true;
    commitImmediately(update);
  };

  try {
    sourceElement.classList.add('is-tactile-pressed');
    await wait(PRESS_MS);
    sourceElement.classList.remove('is-tactile-pressed');
    sourceElement.classList.add('is-tactile-releasing');
    await wait(RELEASE_MS);
    sourceElement.classList.remove('is-tactile-releasing');

    if (typeof document.startViewTransition === 'function') {
      sourceElement.style.viewTransitionName = transitionName;
      const transition = document.startViewTransition(() => {
        sourceElement.style.viewTransitionName = 'none';
        commitOnce();
      });
      await transition.finished;
    } else {
      await runFallbackSurfaceTransition(sourceElement, transitionName, commitOnce);
    }
  } catch {
    commitOnce();
  } finally {
    sourceElement.classList.remove('is-tactile-pressed', 'is-tactile-releasing');
    sourceElement.style.viewTransitionName = '';
    document.documentElement.classList.remove('tactile-fallback-transition');
    transitionRunning = false;
  }

  return true;
}
