// src/components/world/worldSegments.ts
import * as BABYLON from "@babylonjs/core";
import { getGroundMaterial, getBuildingMaterial } from "../materials/MaterialFactory";

export interface WorldSegments {
  groundSegments: BABYLON.TransformNode[];
  buildingSegments: BABYLON.TransformNode[];
  groundSpacing: number;
  buildingSpacing: number;

  // Road texture control
  getRoadOffset(): number;
  setRoadOffset(v: number): void;
  updateRoadTextureOffset(): void;

  // Movement helpers (used by env_scroll.ts)
  advanceGround(movement: number): void;
  advanceBuildings(movement: number): void;

  // Rebuild for spacing change
  rebuildGround(spacing: number, count: number): void;

  dispose(): void;
}

export function createWorldSegments(
  scene: BABYLON.Scene,
  shadowGenerator: BABYLON.ShadowGenerator,
  modelRoot: string,
  textureRoot: string,
  onSpacingReady?: (spacing: number) => void // <--- Added optional callback
): WorldSegments {
  // CONFIG
  const targetSegmentCount = 2; // OPTIMIZED: Reduced from 4 to reduce draw calls
  const groundWidth = 350;   // Widened to add sidewalk space for parked cars
  const groundLength = 160;
  const environmentScale = 8;

  const groundSegments: BABYLON.TransformNode[] = [];
  const buildingSegments: BABYLON.TransformNode[] = [];

  let groundSpacing = groundLength;
  let buildingSpacing = 0;

  // ---------------------------------------------
  // ROAD MATERIAL (from MaterialFactory)
  // ---------------------------------------------
  const groundMaterial = getGroundMaterial(scene);

  const roadTextureState = { offset: 0 };
  const stripePattern = {
    widthFraction: 0.005,
    heightFraction: 0.01,
    gapMultiplier: 1.0,
    startOffsetFraction: 0.0,
  };

  const repeatPerSeg = 2;
  const getVScale = () => Math.max(1, targetSegmentCount * repeatPerSeg);

  function applyRoadTextureSettings(t: BABYLON.Texture) {
    t.uScale = 1;
    t.vScale = getVScale();
    t.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
    t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
  }

  function createFallbackTextures() {
    const packagedUrl = `${textureRoot}fallback-road-texture.png`;

    const packagedTex = new BABYLON.Texture(
      packagedUrl,
      scene,
      undefined,
      false,
      BABYLON.Texture.TRILINEAR_SAMPLINGMODE
    );

    const dyn = new BABYLON.DynamicTexture(
      "roadDyn",
      { width: 1024, height: 1024 },
      scene,
      false
    );

    const ctx = dyn.getContext();
    if (ctx) {
      const size = 1024;
      ctx.fillStyle = "#201f2b";
      ctx.fillRect(0, 0, size, size);

      ctx.fillStyle = "#14131d";
      ctx.fillRect(0, size * 0.08, size, size * 0.84);

      ctx.fillStyle = "#fcd75a";
      const w = Math.round(size * stripePattern.widthFraction);
      const h = Math.round(size * stripePattern.heightFraction);
      const gap = Math.round(h * stripePattern.gapMultiplier);
      const x = (size - w) / 2;

      for (let y = 0; y < size; y += h + gap) {
        ctx.fillRect(x, y, w, h);
      }
    }
    dyn.update(false);

    packagedTex.onLoadObservable.addOnce(() => {
      applyRoadTextureSettings(packagedTex);
      groundMaterial.albedoTexture = packagedTex;
    });

    return { packagedTex, dynamicTex: dyn };
  }

  const { packagedTex, dynamicTex } = createFallbackTextures();

  // Use dynamic texture by default
  groundMaterial.albedoTexture = dynamicTex;
  applyRoadTextureSettings(dynamicTex);

  let activeRoadTexture = dynamicTex;

  // ---------------------------------------------
  // GROUND SEGMENTS
  // ---------------------------------------------
  // NOTE: Ground is now hidden because fallingCubeRoad.ts provides the visible road surface
  function createGroundSegment(i: number, spacing: number) {
    const g = BABYLON.MeshBuilder.CreateGround(
      `ground-${i}`,
      { width: groundWidth, height: spacing },
      scene
    );
    g.material = groundMaterial;
    g.receiveShadows = true;
    g.position.z = -i * spacing;
    g.isVisible = false; // Hidden - falling cubes replace visual road
    return g;
  }

  function rebuildGround(spacing: number, count: number) {
    groundSegments.forEach((s) => s.dispose());
    groundSegments.length = 0;

    groundSpacing = spacing;

    for (let i = 0; i < count; i++) {
      const seg = createGroundSegment(i, spacing);
      groundSegments.push(seg);
    }

    roadTextureState.offset = 0;
    applyRoadTextureSettings(activeRoadTexture);
  }

  rebuildGround(groundSpacing, targetSegmentCount);

  function advanceGround(movement: number) {
    for (const g of groundSegments) g.position.z += movement;

    let minZ = Infinity;
    for (const g of groundSegments)
      if (g.position.z < minZ) minZ = g.position.z;

    for (const g of groundSegments) {
      if (g.position.z > groundSpacing)
        g.position.z = minZ - groundSpacing;
    }
  }

  // ---------------------------------------------
  // BUILDINGS (b1...b10)
  // ---------------------------------------------
  const buildingFiles = Array.from({ length: 10 }, (_, i) => `b${i + 1}.glb`);
  const meshDefaults = new Map<BABYLON.Mesh, any>();

  function applyTransform(inst: BABYLON.AbstractMesh, src: BABYLON.Mesh) {
    const t = meshDefaults.get(src);
    if (!t) return;

    inst.position = t.pos.clone();
    inst.scaling = t.scale.clone();

    if (t.rotQ) {
      inst.rotationQuaternion = t.rotQ.clone();
      inst.rotation = BABYLON.Vector3.Zero();
    } else if (t.rot) {
      inst.rotation = t.rot.clone();
      inst.rotationQuaternion = null;
    }
  }

  function createGroup(
    parent: BABYLON.TransformNode,
    name: string,
    rotY: number,
    meshes: BABYLON.Mesh[]
  ) {
    const group = new BABYLON.TransformNode(name, scene);
    group.parent = parent;
    group.rotation = new BABYLON.Vector3(0, rotY, 0);

    meshes.forEach((m) => {
      const inst = m.createInstance(`${m.name}-${name}`);
      inst.parent = group;
      applyTransform(inst, m);
      inst.receiveShadows = true;
      shadowGenerator.addShadowCaster(inst, true);
    });

    return group;
  }

  Promise.all(
    buildingFiles.map((f) =>
      BABYLON.SceneLoader.ImportMeshAsync(null, modelRoot, f, scene).then(
        (r) => r.meshes.filter((m): m is BABYLON.Mesh => m instanceof BABYLON.Mesh)
      )
    )
  )
    .then((groups) => {
      const meshes = groups.flat();
      if (meshes.length === 0) return;

      meshes.forEach((m) => {
        m.scaling = m.scaling.scale(environmentScale);
        meshDefaults.set(m, {
          pos: m.position.clone(),
          rot: m.rotation?.clone() ?? null,
          rotQ: m.rotationQuaternion?.clone() ?? null,
          scale: m.scaling.clone(),
        });
        if (!(m.material instanceof BABYLON.PBRMaterial)) {
          const orig: any = m.material;
          const pbr = getBuildingMaterial(scene, orig?.diffuseColor);
          m.material = pbr;
        }
        m.isVisible = false;
        m.setEnabled(false);
      });

      const base = new BABYLON.TransformNode("buildSeg-0", scene);
      const groupA = createGroup(base, "B_A0", 0, meshes);
      groupA.position.x = -90; // Buildings on outer sidewalk edge
      const leftGroup = createGroup(base, "B_B0", Math.PI, meshes);
      // Buildings on outer sidewalk edge
      leftGroup.position.x = 90;

      const bbox = base.getHierarchyBoundingVectors();
      // bbox height/length might be smaller, but we want to ENFORCE 42 cubes long (42 * 25 = 1050)
      // So we set spacing to 1050. 
      // User asked for 5x42x1 to ensure hole pattern (gridZ % 3) tiles perfectly.
      buildingSpacing = 1050;

      // Notify that spacing is ready so road can match it
      if (onSpacingReady) {
        onSpacingReady(buildingSpacing);
      }

      rebuildGround(buildingSpacing, targetSegmentCount);

      function register(seg: BABYLON.TransformNode, i: number) {
        // Raise buildings slightly (Y=3)
        seg.position = new BABYLON.Vector3(0, 3, -i * buildingSpacing);
        buildingSegments.push(seg);
      }

      register(base, 0);

      for (let i = 1; i < targetSegmentCount; i++) {
        const seg = new BABYLON.TransformNode(`buildSeg-${i}`, scene);
        const gA = createGroup(seg, `B_A${i}`, 0, meshes);
        gA.position.x = -90;
        const gB = createGroup(seg, `B_B${i}`, Math.PI, meshes);
        gB.position.x = 90;
        register(seg, i);
      }
    })
    .catch((e) => console.error("Buildings load error:", e));

  function advanceBuildings(movement: number) {
    for (const b of buildingSegments) b.position.z += movement;

    let minZ = Infinity;
    for (const b of buildingSegments)
      if (b.position.z < minZ) minZ = b.position.z;

    for (const b of buildingSegments) {
      if (b.position.z > buildingSpacing)
        b.position.z = minZ - buildingSpacing;
    }

    // Also move sidewalks
    for (const s of sidewalkSegments) s.position.z += movement;
    let minSZ = Infinity;
    for (const s of sidewalkSegments)
      if (s.position.z < minSZ) minSZ = s.position.z;
    for (const s of sidewalkSegments) {
      if (s.position.z > sidewalkSpacing)
        s.position.z = minSZ - sidewalkSpacing;
    }

    // Also move road markers
    for (const m of roadMarkers) m.position.z += movement;
    let minMZ = Infinity;
    for (const m of roadMarkers)
      if (m.position.z < minMZ) minMZ = m.position.z;
    for (const m of roadMarkers) {
      if (m.position.z > markerSpacing)
        m.position.z = minMZ - markerSpacing;
    }

    // Also move trees
    for (const t of treeRoots) t.position.z += movement;
    let minTZ = Infinity;
    for (const t of treeRoots)
      if (t.position.z < minTZ) minTZ = t.position.z;
    for (const t of treeRoots) {
      if (t.position.z > treeSpacing)
        t.position.z = minTZ - treeSpacing;
    }
  }

  // ---------------------------------------------
  // SIDEWALKS (Simple cubes to cover skydome gaps)
  // ---------------------------------------------
  const sidewalkSegments: BABYLON.AbstractMesh[] = [];
  const sidewalkSpacing = 1050; // Match road length
  const sidewalkWidth = 100;   // Width of each sidewalk
  const sidewalkHeight = 5;    // Thickness
  const sidewalkY = -sidewalkHeight / 2 + 3; // Raise sidewalks up by 3 units

  // Sidewalk material (gray concrete)
  const sidewalkMat = new BABYLON.PBRMaterial("sidewalkMat", scene);
  sidewalkMat.albedoColor = new BABYLON.Color3(0.4, 0.4, 0.4);
  sidewalkMat.roughness = 1.0;
  sidewalkMat.metallic = 0.0;
  sidewalkMat.freeze(); // Freeze material for performance

  // Road is 150 units wide centered at 0. Sidewalks go from road edge outward.
  const roadHalfWidth = 75; // Match actual road width (150/2)
  const leftSidewalkX = -roadHalfWidth - sidewalkWidth / 2;
  const rightSidewalkX = roadHalfWidth + sidewalkWidth / 2;

  function createSidewalks() {
    const segmentCount = 4; // Extended to cover full road horizon

    // Create base mesh for instancing
    const sidewalkBase = BABYLON.MeshBuilder.CreateBox(
      "sidewalkBase",
      { width: sidewalkWidth, height: sidewalkHeight, depth: sidewalkSpacing },
      scene
    );
    sidewalkBase.material = sidewalkMat;
    sidewalkBase.receiveShadows = true;
    sidewalkBase.isVisible = false; // Hide base mesh

    sidewalkBase.isVisible = false; // Hide base mesh
    // sidewalkMat.freeze(); // Optimize: frozen removed for mobile stability

    for (let i = 0; i < segmentCount; i++) {
      // Left sidewalk instance
      const leftInstance = sidewalkBase.createInstance(`sidewalk_left_${i}`);
      leftInstance.position.set(leftSidewalkX, sidewalkY, -i * sidewalkSpacing);
      leftInstance.checkCollisions = false; // Optim: collision handled elsewhere if needed
      sidewalkSegments.push(leftInstance);

      // Right sidewalk instance
      const rightInstance = sidewalkBase.createInstance(`sidewalk_right_${i}`);
      rightInstance.position.set(rightSidewalkX, sidewalkY, -i * sidewalkSpacing);
      rightInstance.checkCollisions = false;
      sidewalkSegments.push(rightInstance);
    }
  }

  createSidewalks();

  // ---------------------------------------------
  // ROAD EXTENSION PLANE (Lightweight visual fill)
  // ---------------------------------------------
  // A simple static plane that extends the road visually beyond the falling cubes
  // without adding complex geometry. Much lighter than adding more falling cubes.
  function createRoadExtension() {
    const roadWidth = 150;  // Match falling cube road width
    const extensionLength = 3000; // Long enough to cover horizon
    const startZ = -1050; // Start where falling cube road ends (approx)

    // Create road extension material (same color as road)
    const extensionMat = new BABYLON.PBRMaterial("roadExtensionMat", scene);
    extensionMat.albedoColor = new BABYLON.Color3(0.08, 0.075, 0.11); // Dark road color
    extensionMat.roughness = 0.9;
    extensionMat.metallic = 0.0;
    extensionMat.freeze(); // Freeze material for performance

    // Create the extension plane
    const extension = BABYLON.MeshBuilder.CreateBox(
      "roadExtension",
      { width: roadWidth, height: 1, depth: extensionLength },
      scene
    );
    extension.material = extensionMat;
    extension.position.set(0, -0.5, startZ - extensionLength / 2);
    extension.receiveShadows = true;
    extension.isPickable = false;
    extension.freezeWorldMatrix(); // Freeze transform for static mesh

    // Add center line stripes using INSTANCING (much fewer draw calls)
    const stripeMat = new BABYLON.StandardMaterial("stripeMat", scene);
    stripeMat.diffuseColor = new BABYLON.Color3(1, 0.84, 0.35); // Yellow stripe
    stripeMat.emissiveColor = new BABYLON.Color3(0.2, 0.17, 0.07);
    stripeMat.freeze(); // Freeze material for performance

    // Create base stripe mesh (hidden, used for instancing)
    const stripeBase = BABYLON.MeshBuilder.CreateBox(
      "stripeBase",
      { width: 2, height: 0.1, depth: 25 },
      scene
    );
    stripeBase.material = stripeMat;
    stripeBase.isVisible = false;
    stripeBase.isPickable = false;

    // Create stripe instances using GPU instancing
    const stripeCount = Math.floor(extensionLength / 60);
    for (let i = 0; i < stripeCount; i++) {
      const stripe = stripeBase.createInstance(`stripe_${i}`);
      stripe.position.set(0, 0.1, startZ - 30 - i * 60);
      stripe.isPickable = false;
      stripe.freezeWorldMatrix(); // Freeze each instance
    }
  }

  createRoadExtension();

  // ---------------------------------------------
  // STYLIZED TREES ALONG SIDEWALKS (GLB Model)
  // ---------------------------------------------
  const treeRoots: BABYLON.TransformNode[] = [];
  const treeSpacing = 160;  // OPTIMIZED: Increased from 80 to reduce tree count
  const treeY = 3;         // Raise trees to sit on sidewalk
  const treeScale = 9.56;   // Scaled down by another 75% (current: 9.56)
  let treeContainer: BABYLON.AssetContainer | null = null;

  // Position trees on the sidewalk near the road (Road ends at ±75, Buildings start at ±90)
  const leftTreeX = leftSidewalkX + 42;  // Closer to road (approx -83)
  const rightTreeX = rightSidewalkX - 42; // Closer to road (approx 83)

  function createTreeFromGLB(x: number, z: number): BABYLON.TransformNode | null {
    if (!treeContainer) return null;

    const treeRoot = new BABYLON.TransformNode(`tree_${treeRoots.length}`, scene);
    treeRoot.position.set(x, treeY, z);

    // Random scale variation (0.85 to 1.15)
    const scaleVariation = 0.85 + Math.random() * 0.3;
    treeRoot.scaling.setAll(treeScale * scaleVariation);

    // Random Y rotation for variety
    treeRoot.rotation.y = Math.random() * Math.PI * 2;

    // Instantiate the GLB model
    const entries = treeContainer.instantiateModelsToScene(
      (name) => `tree_${treeRoots.length}_${name}`,
      false
    );

    // Parent all nodes to our root
    for (const node of entries.rootNodes) {
      node.parent = treeRoot;

      // Add shadow casting for all meshes
      const meshes = (node as BABYLON.TransformNode).getChildMeshes?.(true) || [];
      if (node instanceof BABYLON.Mesh) {
        meshes.push(node);
      }
      for (const mesh of meshes) {
        mesh.receiveShadows = true;
        shadowGenerator.addShadowCaster(mesh, true);
      }
    }

    return treeRoot;
  }

  function createTreeRows() {
    if (!treeContainer) return;

    const totalDistance = 1600;
    const numTrees = Math.ceil(totalDistance / treeSpacing);

    for (let i = 0; i < numTrees; i++) {
      // Add random offset for natural placement (-20 to +20 units)
      const randomOffset = (Math.random() - 0.5) * 40;
      const z = -i * treeSpacing + randomOffset;

      // Left side trees (with slight X variation)
      const leftXVariation = (Math.random() - 0.5) * 8;
      const leftTree = createTreeFromGLB(leftTreeX + leftXVariation, z);
      if (leftTree) treeRoots.push(leftTree);

      // Right side trees (with slight X variation)
      const rightXVariation = (Math.random() - 0.5) * 8;
      const rightTree = createTreeFromGLB(rightTreeX + rightXVariation, z);
      if (rightTree) treeRoots.push(rightTree);
    }

    console.log(`🌳 Created ${treeRoots.length} trees from GLB`);
  }

  // Load tree GLB model
  BABYLON.SceneLoader.LoadAssetContainerAsync("/scene/assets/model/tree.glb", "", scene)
    .then((container) => {
      console.log("🌳 Tree GLB loaded successfully");
      treeContainer = container;
      createTreeRows();
    })
    .catch((err) => {
      console.error("Failed to load tree.glb:", err);
    });

  // ---------------------------------------------
  // YELLOW CENTER LINE MARKERS
  // ---------------------------------------------
  const roadMarkers: BABYLON.AbstractMesh[] = [];
  const markerLength = 8;    // Length of each dash
  const markerGap = 12;      // Gap between dashes
  const markerWidth = 1.5;   // Width of the line
  const markerHeight = 0.2;  // Slight height above road
  const markerY = 0.1;       // Just above road surface
  const markerSpacing = markerLength + markerGap;

  // Yellow material
  const markerMat = new BABYLON.PBRMaterial("roadMarkerMat", scene);
  markerMat.albedoColor = new BABYLON.Color3(1, 0.85, 0.1); // Bright yellow
  markerMat.emissiveColor = new BABYLON.Color3(0.3, 0.25, 0.0); // Slight glow
  markerMat.roughness = 0.6;
  markerMat.metallic = 0.0;
  markerMat.freeze(); // Freeze material for performance

  function createRoadMarkers() {
    const totalDistance = 2000; // Cover a long stretch
    const numMarkers = Math.ceil(totalDistance / markerSpacing);

    // Create base mesh for instancing
    const markerBase = BABYLON.MeshBuilder.CreateBox(
      "markerBase",
      { width: markerWidth, height: markerHeight, depth: markerLength },
      scene
    );
    markerBase.material = markerMat;
    markerBase.receiveShadows = true;
    markerBase.isVisible = false; // Hide base mesh

    markerBase.isVisible = false; // Hide base mesh
    // markerMat.freeze(); // Optimize: frozen removed for mobile stability

    for (let i = 0; i < numMarkers; i++) {
      const marker = markerBase.createInstance(`roadMarker_${i}`);
      marker.position.set(0, markerY, -i * markerSpacing);
      // Shadows for tiny road markers are expensive and barely visible, disable for instances
      // marker.receiveShadows = false; 
      roadMarkers.push(marker);
    }
  }

  createRoadMarkers();

  // Advance road markers with scroll
  function advanceRoadMarkers(movement: number) {
    for (const m of roadMarkers) m.position.z += movement;

    let minZ = Infinity;
    for (const m of roadMarkers)
      if (m.position.z < minZ) minZ = m.position.z;

    const totalLength = roadMarkers.length * markerSpacing;
    for (const m of roadMarkers) {
      if (m.position.z > markerSpacing)
        m.position.z = minZ - markerSpacing;
    }
  }

  // ---------------------------------------------
  // DISPOSE
  // ---------------------------------------------
  function dispose() {
    groundSegments.forEach((g) => g.dispose());
    buildingSegments.forEach((b) => b.dispose());
    sidewalkSegments.forEach((s) => s.dispose());
    roadMarkers.forEach((m) => m.dispose());
    treeRoots.forEach((t) => t.dispose());
    sidewalkMat.dispose();
    markerMat.dispose();
    dynamicTex.dispose();
    packagedTex.dispose();
    activeRoadTexture.dispose();
  }

  return {
    groundSegments,
    buildingSegments,
    groundSpacing,
    buildingSpacing,

    getRoadOffset: () => roadTextureState.offset,
    setRoadOffset: (v: number) => {
      roadTextureState.offset = v % 1;
      if (roadTextureState.offset < 0) roadTextureState.offset += 1;
    },
    updateRoadTextureOffset: () => {
      activeRoadTexture.vOffset = roadTextureState.offset;
    },

    advanceGround,
    advanceBuildings,

    rebuildGround,
    dispose,
  };
}
