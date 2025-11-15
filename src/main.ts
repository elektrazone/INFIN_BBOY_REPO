// src/main.ts
import "./styles/main.css";
import { babylonRunner } from "./components/babylonRunner";


window.addEventListener("DOMContentLoaded", () => {
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement | null;

  if (!canvas) {
    console.error("❌ Errore: Canvas #game-canvas non trovato.");
    return;
  }

  // Avvia la scena Babylon
  babylonRunner(canvas);
});
