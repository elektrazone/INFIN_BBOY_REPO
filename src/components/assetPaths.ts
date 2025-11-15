// src/components/assetPaths.ts

export interface AssetRoots {
  assetBase: string;
  modelRoot: string;
  textureRoot: string;
}

export function getAssetRoots(): AssetRoots {
  const isGithubPages =
    typeof window !== "undefined" &&
    window.location.hostname.endsWith("github.io");

  const assetBase = isGithubPages
    ? "https://media.githubusercontent.com/media/elektrazone/INFIN_BBOY_REPO/main/public/scene/assets/"
    : "scene/assets/";

  const modelRoot = `${assetBase}model/`;
  const textureRoot = `${assetBase}road/`;

  return { assetBase, modelRoot, textureRoot };
}
