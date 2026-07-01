// src/main.ts
import "./styles/main.css";
import { babylonRunner } from "./components/babylonRunner";
import { initReactOverlay } from "./components/ui/bootstrap";
import { messagingService } from "./services/messagingService";

// Initialize messaging service early
messagingService.init();


function initGame() {
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement | null;

  if (!canvas) {
    console.error("❌ Errore: Canvas #game-canvas non trovato.");
    return;
  }

  // Flat blue sky (3D cloud models provide the visual variety instead of a painted texture)
  const skyEl = document.getElementById('sky-background');
  if (skyEl) {
    skyEl.style.backgroundColor = '#4a90d9';
  }

  // Initialize React overlay first (before Babylon)
  initReactOverlay();

  // Avvia la scena Babylon
  babylonRunner(canvas);
  
  // Register Service Worker for PWA (production only - see webpack.config.js).
  // In dev mode, unregister any stale SW from a previous production build so it
  // can't seize control mid-session and serve stale cached bundles during HMR.
  if ('serviceWorker' in navigator) {
    if (process.env.NODE_ENV === 'production') {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js').then(registration => {
          console.log('SW registered: ', registration);
        }).catch(registrationError => {
          console.log('SW registration failed: ', registrationError);
        });
      });
    } else {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(registration => registration.unregister());
      });
    }
  }
}

// If the document has already finished parsing by the time this script runs
// (e.g. a slow-loading bundle delays evaluation), DOMContentLoaded has already
// fired and would never call back - so run immediately in that case instead.
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", initGame);
} else {
  initGame();
}

