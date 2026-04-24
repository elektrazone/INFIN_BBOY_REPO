// src/main.ts
import "./styles/main.css";
import { babylonRunner } from "./components/babylonRunner";
import { initReactOverlay } from "./components/ui/bootstrap";
import { messagingService } from "./services/messagingService";

// Initialize messaging service early
messagingService.init();


window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement | null;

  if (!canvas) {
    console.error("❌ Errore: Canvas #game-canvas non trovato.");
    return;
  }

  // Set sky background image dynamically (avoids webpack CSS url() resolution)
  const skyEl = document.getElementById('sky-background');
  if (skyEl) {
    skyEl.style.backgroundImage = "url('/scene/assets/sky_clouds.jpg')";
  }

  // Initialize React overlay first (before Babylon)
  initReactOverlay();

  // Avvia la scena Babylon
  babylonRunner(canvas);
  
  // Register Service Worker for PWA
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js').then(registration => {
        console.log('SW registered: ', registration);
      }).catch(registrationError => {
        console.log('SW registration failed: ', registrationError);
      });
    });
  }
});

