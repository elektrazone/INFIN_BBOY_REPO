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

  // Initialize React overlay first (before Babylon)
  initReactOverlay();

  // Avvia la scena Babylon
  babylonRunner(canvas);
});

