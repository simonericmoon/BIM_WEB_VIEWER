import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front";
import * as BUI from "@thatopen/ui";
import * as THREE from "three";
import { loadIfc } from "../buttons";
import { classificationTree } from "../tables/ClassificationsTree";
import * as CUI from "@thatopen/ui-obc"
import { load } from "@loaders.gl/core";
import { LASLoader } from "@loaders.gl/las";
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

let currentLine: THREE.Line | null = null;
let lineGeometry: THREE.BufferGeometry | null = null;
let lineMaterial: THREE.LineBasicMaterial | null = null;
let measurementDiv: HTMLDivElement | null = null;

class LayerManager {
  layers: Map<string, { id: string; name: string; visible: boolean; objects: THREE.Object3D[] }> = new Map();

  createLayer(id: string, name: string) {
    this.layers.set(id, { id, name, visible: true, objects: [] });
  }

  addToLayer(layerId: string, object: THREE.Object3D) {
    const layer = this.layers.get(layerId);
    if (layer) {
      layer.objects.push(object);
      this.updateVisibility(layerId);
    }
  }

  setLayerVisibility(layerId: string, visible: boolean) {
    const layer = this.layers.get(layerId);
    if (layer) {
      layer.visible = visible;
      this.updateVisibility(layerId);
    }
  }

  private updateVisibility(layerId: string) {
    const layer = this.layers.get(layerId);
    if (layer) {
      layer.objects.forEach(obj => obj.visible = layer.visible);
    }
  }
}

class ElementSearchSystem {
  private elements: Map<string, any> = new Map();

  addElement(id: string, properties: any) {
    this.elements.set(id, properties);
  }

  search(query: string): { [key: string]: any }[] {
    const results: { [key: string]: any }[] = [];
    for (const [id, props] of this.elements) {
      if (this.matchesSearch(props, query.toLowerCase())) {
        results.push({ id, ...props });
      }
    }
    return results;
  }

  private matchesSearch(properties: any, query: string): boolean {
    return Object.values(properties).some(value => 
      String(value).toLowerCase().includes(query)
    );
  }
}

class AnnotationSystem {
  private annotations: Map<string, {
    id: string;
    position: THREE.Vector3;
    content: string;
    element?: HTMLDivElement;
  }> = new Map();
  
  constructor(private container: HTMLElement) {
    const annotationContainer = document.createElement('div');
    annotationContainer.className = 'annotation-container';
    container.appendChild(annotationContainer);
    this.container = annotationContainer;
  }

  addAnnotation(position: THREE.Vector3, content: string): string {
    const id = crypto.randomUUID();
    const element = document.createElement('div');
    element.className = 'annotation';
    element.innerHTML = `
      <div class="annotation-marker">📌</div>
      <div class="annotation-content">${content}</div>
    `;
    
    this.container.appendChild(element);
    this.annotations.set(id, { id, position, content, element });
    return id;
  }

  updatePositions(camera: THREE.Camera) {
    this.annotations.forEach(annotation => {
      if (annotation.element) {
        const vector = annotation.position.clone();
        vector.project(camera);
        
        const x = ((vector.x + 1) / 2) * this.container.clientWidth;
        const y = ((-vector.y + 1) / 2) * this.container.clientHeight;
        
        annotation.element.style.transform = `translate(${x}px, ${y}px)`;
        annotation.element.style.display = vector.z < 1 ? 'block' : 'none';
      }
    });
  }

  clear() {
    this.annotations.forEach(annotation => {
      annotation.element?.remove();
    });
    this.annotations.clear();
  }
}


// Initialize line material
lineMaterial = new THREE.LineBasicMaterial({ 
  color: 0xff0000,
  depthTest: false,
  depthWrite: false,
  transparent: true,
  opacity: 1.0,
  linewidth: 3
});lineGeometry = new THREE.BufferGeometry();

// Add these declarations at the top
let currentTube: THREE.Mesh | null = null;
const TUBE_RADIUS = 0.05; // Adjust this value to change line thickness

const toScreenPosition = (point: THREE.Vector3, camera: THREE.Camera, viewport: HTMLElement) => {
  const vector = point.clone();
  vector.project(camera);
  
  const x = ((vector.x + 1) / 2) * viewport.clientWidth;
  const y = ((-vector.y + 1) / 2) * viewport.clientHeight;
  
  return { x, y };
};

const clippingPlanes = {
  front: new THREE.Plane(new THREE.Vector3(0, 0, 1), 1000),
  back: new THREE.Plane(new THREE.Vector3(0, 0, -1), 1000),
  left: new THREE.Plane(new THREE.Vector3(1, 0, 0), 1000),
  right: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1000),
  top: new THREE.Plane(new THREE.Vector3(0, -1, 0), 1000),
  bottom: new THREE.Plane(new THREE.Vector3(0, 1, 0), 1000)
};

// Initialize clipping states
const clippingStates = {
  front: false,
  back: false,
  left: false,
  right: false,
  top: false,
  bottom: false
};

const MIN_ZOOM = 0.01;
const MAX_ZOOM = 0.5;
//const ZOOM_SPEED = 0.001;
const DEBUG = true;

// Add styles for the popup
const style = document.createElement('style');
style.textContent = `
  .popup-dialog {
    position: fixed !important;
    top: 30% !important;
    left: 80% !important;
    transform: translate(-50%, -50%) !important;
    z-index: 1000 !important;
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    min-width: 400px;
    max-width: 80%;
  }
  
  #propertiesContainer {
    font-family: Arial, sans-serif;
  }

  #minimap {
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 200px;
    height: 200px;
    background: rgba(255, 255, 255, 0.9);
    border-radius: 12px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    z-index: 1000;
  }
`;
document.head.appendChild(style);

// Add minimap container
const minimapContainer = document.createElement('div');
minimapContainer.id = 'minimap';
document.body.appendChild(minimapContainer);

// Initialize BUI
BUI.Manager.init();

const components = new OBC.Components();

// Create viewport
const viewport = document.createElement("bim-viewport");
viewport.name = "viewer";

// Setup world and components with proper typing
const worlds = components.get(OBC.Worlds);
const world = worlds.create<
  OBC.SimpleScene,
  OBC.SimpleCamera,
  OBCF.PostproductionRenderer
>();

// Setup renderer first
const rendererComponent = new OBCF.PostproductionRenderer(components, viewport);
world.renderer = rendererComponent;

// Setup scene
const sceneComponent = new OBC.SimpleScene(components);
sceneComponent.setup();
world.scene = sceneComponent;
world.scene.three.background = null;

// Setup camera after renderer
const cameraComponent = new OBC.SimpleCamera(components);
world.camera = cameraComponent;

// Initialize components
components.init();

// Setup minimap
const maps = new OBC.MiniMaps(components);
const map = maps.create(world);

// Configure minimap
const canvas = map.renderer.domElement;
canvas.style.borderRadius = "12px";
minimapContainer.appendChild(canvas);
map.resize()

// Set default minimap configuration
map.config.frontOffset = 2;
map.config.sizeX = 200;
map.config.sizeY = 200;
map.config.lockRotation = true;

const mapSize = map.getSize();


// Now it's safe to set camera position and enable postproduction
cameraComponent.controls.setLookAt(12, 6, 8, 0, 0, -10);
rendererComponent.postproduction.enabled = true;

// Helper function to update material clipping
const updateMaterialClipping = () => {
  world.scene.three.traverse((node) => {
    if (node.material) {
      if (Array.isArray(node.material)) {
        node.material.forEach(mat => {
          mat.clippingPlanes = Object.entries(clippingStates)
            .filter(([_, enabled]) => enabled)
            .map(([key, _]) => clippingPlanes[key]);
        });
      } else {
        node.material.clippingPlanes = Object.entries(clippingStates)
          .filter(([_, enabled]) => enabled)
          .map(([key, _]) => clippingPlanes[key]);
      }
    }
  });
};

// Create popup element
const popupHTML = `
  <div id="customPopup" class="popup-dialog" style="display: none;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
      <h3>Element Properties</h3>
      <button onclick="this.parentElement.parentElement.style.display='none'" 
              style="padding: 5px 10px; border-radius: 4px; border: none; background: #e0e0e0; cursor: pointer;">
        Close
      </button>
    </div>
    <div id="propertiesContainer" style="max-height: 400px; overflow-y: auto;"></div>
  </div>
`;

document.body.insertAdjacentHTML('beforeend', popupHTML);
const popup = document.getElementById('customPopup');
const propertiesContainer = document.getElementById('propertiesContainer');



// Setup grids and exclude from postprocessing
const viewerGrids = components.get(OBC.Grids);
const grid = viewerGrids.create(world);
rendererComponent.postproduction.customEffects.excludedMeshes.push(grid.three);

const [propertiesTable, updatePropertiesTable] = CUI.tables.elementProperties({
  components,
  fragmentIdMap: {},
});

propertiesTable.preserveStructureOnFilter = true;
propertiesTable.indentationInText = false;

const indexer = components.get(OBC.IfcRelationsIndexer);

// Setup highlighting
const highlighter = components.get(OBCF.Highlighter);
highlighter.setup({ world });

let showPropertiesEnabled = true;
highlighter.zoomToSelection = true;

const outliner = components.get(OBCF.Outliner);
outliner.world = world;
outliner.enabled = true;

outliner.create(
  "example",
  new THREE.MeshBasicMaterial({
    color: 0xbcf124,
    transparent: true,
    opacity: 0.5,
  })
);

// Modified highlight events with popup
highlighter.events.select.onHighlight.add((data) => {
    outliner.clear("example");
    outliner.add("example", data);
    
    // Update properties table with selected element data
    updatePropertiesTable({ fragmentIdMap: data });
    
    if (showPropertiesEnabled && popup) {
      popup.style.display = 'block';
    }
  });
  
  highlighter.events.select.onClear.add(() => {
    outliner.clear("example");
    if (popup) {
      popup.style.display = 'none';
    }
  });

// Handle viewport resizing
viewport.addEventListener("resize", () => {
  rendererComponent.resize();
  cameraComponent.updateAspect();
  map.resize();
})

// Add the properties table to the container
if (propertiesContainer) {
  propertiesContainer.appendChild(propertiesTable);
}

// Setup IFC loader
const ifcLoader = components.get(OBC.IfcLoader);
await ifcLoader.setup();

const fragmentsManager = components.get(OBC.FragmentsManager);
fragmentsManager.onFragmentsLoaded.add((model) => {
  if (world.scene) {
    world.scene.three.add(model);
    updateMaterialClipping(); // Apply current clipping state to new model
  }
});

// Setup classifications tree
const [classificationsTree, updateClassificationsTree] = classificationTree({
  components,
  classifications: [],
});

const classifier = components.get(OBC.Classifier);

fragmentsManager.onFragmentsLoaded.add(async (model) => {
  // Existing classifications
  classifier.byEntity(model);
  await classifier.byPredefinedType(model);

  // Process relations for the model
  await indexer.process(model);

  const classifications = [
    { system: "entities", label: "Entities" },
    { system: "predefinedTypes", label: "Predefined Types" },
  ];

  updateClassificationsTree({ classifications });
});


const updateMapzoom = () => {
  // Get the camera's position from the Three.js camera
  const cameraPosition = cameraComponent.three.position;
  const distance = cameraPosition.length();
  
  // Calculate zoom based on camera distance
  // As camera gets further, minimap zoom decreases
  let newZoom = 0.05 / (distance / 10);
  
  // Clamp the zoom value between min and max
  newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
  
  // Update minimap zoom
  map.config.zoom = newZoom;
};

// Add wheel event listener to the viewport
viewport.addEventListener('wheel', (event) => {
  // Call updateMapzoom after a small delay to ensure camera position has updated
  requestAnimationFrame(updateMapzoom);
});

cameraComponent.three.addEventListener('change', () => {
  requestAnimationFrame(updateMapzoom);
});

const layerManager = new LayerManager();
const searchSystem = new ElementSearchSystem();
const annotationSystem = new AnnotationSystem(viewport);

// 4. Add camera presets
const cameraPresets = {
  front: () => cameraComponent.controls.setLookAt(0, 0, 10, 0, 0, 0),
  back: () => cameraComponent.controls.setLookAt(0, 0, -10, 0, 0, 0),
  top: () => cameraComponent.controls.setLookAt(0, 10, 0, 0, 0, 0),
  bottom: () => cameraComponent.controls.setLookAt(0, -10, 0, 0, 0, 0),
  left: () => cameraComponent.controls.setLookAt(-10, 0, 0, 0, 0, 0),
  right: () => cameraComponent.controls.setLookAt(10, 0, 0, 0, 0, 0)
};

const newStyles = document.createElement('style');
newStyles.textContent = `
  .annotation-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 1000;
  }

  .annotation {
    position: absolute;
    pointer-events: all;
    cursor: pointer;
  }

  .annotation-marker {
    font-size: 24px;
  }

  .annotation-content {
    position: absolute;
    background: white;
    padding: 8px;
    border-radius: 4px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    display: none;
    white-space: nowrap;
    z-index: 1000;
  }

  .annotation:hover .annotation-content {
    display: block;
  }

  .search-result {
    padding: 4px 8px;
    cursor: pointer;
    border-bottom: 1px solid #eee;
  }

  .search-result:hover {
    background: #f5f5f5;
  }
`;
document.head.appendChild(newStyles);

const dimensions = components.get(OBCF.LengthMeasurement);
dimensions.world = world;
dimensions.enabled = false;
dimensions.snapDistance = 0.5;
dimensions.visible = true;
dimensions.color.set("#ff0000");

// Add measurement event handling
let startPoint: THREE.Vector3 | null = null;
let measurementLine: THREE.Line | null = null;
let measurementLabel: HTMLDivElement | null = null;

const labelContainer = document.createElement('div');
labelContainer.style.position = 'absolute';
labelContainer.style.top = '0';
labelContainer.style.left = '0';
labelContainer.style.width = '100%';
labelContainer.style.height = '100%';
labelContainer.style.pointerEvents = 'none';
labelContainer.style.zIndex = '1000';
viewport.appendChild(labelContainer);

// Update measurement type
type Measurement = {
  tube: THREE.Mesh;
  label: HTMLDivElement;
  distance: number;
};

let measurements: Measurement[] = [];


const measurementStyle = document.createElement('style');
measurementStyle.textContent = `
  .measurement-label {
    position: absolute;
    background-color: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: bold;
    pointer-events: none;
    z-index: 1000;
    transform: translate(-50%, -100%);
    white-space: nowrap;
  }
`;
document.head.appendChild(measurementStyle);

// Add this function to update label positions
// Update label positions
const updateMeasurementLabels = () => {
  measurements.forEach(({ tube, label, distance }) => {
    const positions = tube.geometry.getAttribute('position').array;
    const endPoint = new THREE.Vector3(positions[3], positions[4], positions[5]);
    
    // Project point to screen space
    const screenPos = toScreenPosition(endPoint, world.camera.three, viewport);
    
    // Update label position and ensure it's visible
    label.style.left = `${screenPos.x}px`;
    label.style.top = `${screenPos.y}px`;
    label.style.display = 'block';
    label.textContent = `${distance.toFixed(2)} units`;
  });
};

// Simplified mousemove handler
viewport.addEventListener('mousemove', (event) => {
  if (!dimensions.enabled || !startPoint) return;

  const rect = viewport.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / viewport.clientWidth) * 2 - 1;
  const y = -((event.clientY - rect.top) / viewport.clientHeight) * 2 + 1;
  
  const mouse = new THREE.Vector2(x, y);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, world.camera.three);
  const intersects = raycaster.intersectObjects(world.scene.three.children, true);

  if (intersects.length > 0) {
    const currentPoint = intersects[0].point;
    
    if (!currentTube) {
      const curve = new THREE.LineCurve3(startPoint, currentPoint);
      const geometry = new THREE.TubeGeometry(curve, 1, TUBE_RADIUS, 8, false);
      currentTube = new THREE.Mesh(geometry, lineMaterial);
      currentTube.renderOrder = 999;
      world.scene.three.add(currentTube);
    } else {
      const curve = new THREE.LineCurve3(startPoint, currentPoint);
      const geometry = new THREE.TubeGeometry(curve, 1, TUBE_RADIUS, 8, false);
      currentTube.geometry.dispose();
      currentTube.geometry = geometry;
    }

    if (!measurementDiv) {
      measurementDiv = document.createElement('div');
      measurementDiv.className = 'measurement-label';
      document.body.appendChild(measurementDiv);
    }

    const distance = startPoint.distanceTo(currentPoint);
    measurementDiv.textContent = `${distance.toFixed(2)} units`;

    // Position label at current point (endpoint)
    const screenPos = toScreenPosition(currentPoint, world.camera.three, viewport);
    measurementDiv.style.left = `${screenPos.x}px`;
    measurementDiv.style.top = `${screenPos.y}px`;
  }
});

// Update click handler
viewport.addEventListener('click', (event) => {
  if (!dimensions.enabled) return;

  const rect = viewport.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / viewport.clientWidth) * 2 - 1;
  const y = -((event.clientY - rect.top) / viewport.clientHeight) * 2 + 1;
  
  const mouse = new THREE.Vector2(x, y);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, world.camera.three);
  const intersects = raycaster.intersectObjects(world.scene.three.children, true);
  
  if (intersects.length > 0) {
    const point = intersects[0].point;
    
    if (!startPoint) {
      startPoint = point;
    } else {
      const distance = startPoint.distanceTo(point);
      
      // Create tube
      const curve = new THREE.LineCurve3(startPoint, point);
      const geometry = new THREE.TubeGeometry(curve, 1, TUBE_RADIUS, 8, false);
      const tube = new THREE.Mesh(geometry, lineMaterial.clone());
      tube.renderOrder = 999;
      world.scene.three.add(tube);

      // Create label
      const label = document.createElement('div');
      label.className = 'measurement-label';
      label.textContent = `${distance.toFixed(2)} units`;
      labelContainer.appendChild(label);

      // Store measurement
      measurements.push({ tube, label, distance });
      
      // Clean up temporary elements
      if (currentTube) {
        world.scene.three.remove(currentTube);
        currentTube.geometry.dispose();
        currentTube = null;
      }
      if (measurementDiv && measurementDiv.parentNode) {
        measurementDiv.parentNode.removeChild(measurementDiv);
        measurementDiv = null;
      }
      startPoint = null;

      // Update labels
      updateMeasurementLabels();
    }
  }
});

// Update delete handler
window.addEventListener('keydown', (event) => {
  if (event.code === "Delete" || event.code === "Backspace") {
    measurements.forEach(({ tube, label }) => {
      world.scene.three.remove(tube);
      tube.geometry.dispose();
      if (label.parentNode) {
        label.parentNode.removeChild(label);
      }
    });
    measurements = [];
    
    if (currentTube) {
      world.scene.three.remove(currentTube);
      currentTube.geometry.dispose();
      currentTube = null;
    }
    if (measurementDiv && measurementDiv.parentNode) {
      measurementDiv.parentNode.removeChild(measurementDiv);
      measurementDiv = null;
    }
    startPoint = null;
  }
});

// Make sure we update labels on camera change
cameraComponent.controls.addEventListener('update', () => {
  requestAnimationFrame(updateMeasurementLabels);
});

// Add render loop update
rendererComponent.onBeforeUpdate.add(() => {
  updateMeasurementLabels();
});

// Update labels on window resize
window.addEventListener('resize', () => {
  requestAnimationFrame(updateMeasurementLabels);
});


fragmentsManager.onFragmentsLoaded.add((model) => {
  if (world.scene) {
    world.scene.three.add(model);
    updateMaterialClipping();
    if (DEBUG) console.log("Model loaded - measurements configured");
  }
});

const collapseButtonStyle = document.createElement('style');
collapseButtonStyle.textContent = `
  .collapse-button {
    position: absolute;
    right: -25px;
    top: 50%;
    transform: translateY(-50%);
    background: white;
    border: 1px solid #ddd;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    cursor: pointer;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    box-shadow: 2px 0 4px rgba(0,0,0,0.2);
    transition: background-color 0.2s;
  }

  .collapse-button:hover {
    background-color: #f0f0f0;
  }

  bim-panel {
    overflow: visible !important;
  }
`;
document.head.appendChild(collapseButtonStyle);

const app = document.createElement("bim-grid");
app.style.width = '100vw';
app.style.height = '100vh';
app.style.display = 'grid';

// Add styles for viewport and panel
const layoutStyle = document.createElement('style');
layoutStyle.textContent = `
  bim-viewport {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  
  bim-panel {
    height: 100%;
    transition: width 0.3s ease;
    overflow-y: auto !important;
    overflow-x: hidden !important;
  }

  bim-panel > div {
    height: 100%;
    overflow-y: auto;
    padding-right: 8px; /* Add some padding for the scrollbar */
  }

  /* Style the scrollbar */
  bim-panel::-webkit-scrollbar {
    width: 8px;
  }

  bim-panel::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 4px;
  }

  bim-panel::-webkit-scrollbar-thumb {
    background: #888;
    border-radius: 4px;
  }

  bim-panel::-webkit-scrollbar-thumb:hover {
    background: #555;
  }
`;
document.head.appendChild(layoutStyle);

interface MeshAttribute {
  value: Float32Array | Uint8Array;
  size?: number;
  normalized?: boolean;
  type?: number;
}

interface LASMesh {
  header: {
    vertexCount: number;
    boundingBox?: {
      min: number[];
      max: number[];
    };
  };
  attributes: {
    [attributeName: string]: MeshAttribute;
  };
}

class PointCloudManager {
  private pointClouds: Map<string, THREE.Points> = new Map();
  private material: THREE.PointsMaterial;

  constructor(private scene: THREE.Scene) {
    this.material = new THREE.PointsMaterial({
      size: 0.5, // Increased default size
      sizeAttenuation: true,
      vertexColors: true
    });
  }

  async loadLASFile(file: File): Promise<string> {
    try {
      const data = await load(file, LASLoader) as LASMesh;
      
      if (!data?.header?.vertexCount || !data?.attributes?.POSITION?.value) {
        throw new Error('Invalid LAS file format');
      }
  
      console.log('Loading point cloud with', data.header.vertexCount, 'points');
  
      const positions = data.attributes.POSITION.value as Float32Array;
      const colors = new Float32Array(data.header.vertexCount * 3);
      const normalizedPositions = new Float32Array(positions.length);
      
      // Find bounds
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  
      // First pass: find min/max
      for (let i = 0; i < data.header.vertexCount; i++) {
        const baseIndex = i * 3;
        const x = positions[baseIndex];
        const y = positions[baseIndex + 1];
        const z = positions[baseIndex + 2];
  
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        minZ = Math.min(minZ, z);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        maxZ = Math.max(maxZ, z);
      }
  
      // Calculate center and scale
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const centerZ = (minZ + maxZ) / 2;
      
      const maxExtent = Math.max(
        maxX - minX,
        maxY - minY,
        maxZ - minZ
      );
      
      const scale = 2 / maxExtent * 20;
  
      // Create rotation matrix
      const rotationMatrix = new THREE.Matrix4();
      // Rotate 90 degrees around Y axis
      rotationMatrix.makeRotationY(-Math.PI / 2);
  
      // Second pass: normalize positions with rotation
      for (let i = 0; i < data.header.vertexCount; i++) {
        const baseIndex = i * 3;
        
        // Center the point
        const x = (positions[baseIndex] - centerX) * scale;
        const y = (positions[baseIndex + 2] - centerZ) * scale; // Z becomes Y
        const z = -(positions[baseIndex + 1] - centerY) * scale; // Negated Y becomes Z
        
        // Create a vector for the point
        const point = new THREE.Vector3(x, y, z);
        // Apply rotation
        point.applyMatrix4(rotationMatrix);
        
        // Store transformed point
        normalizedPositions[baseIndex] = point.x;
        normalizedPositions[baseIndex + 1] = point.y;
        normalizedPositions[baseIndex + 2] = point.z;
        
        // Set color based on height
        const heightValue = positions[baseIndex + 2];
        const normalizedHeight = (heightValue - minZ) / (maxZ - minZ);
        const heightColor = new THREE.Color();
        heightColor.setHSL(0.3 + normalizedHeight * 0.5, 1.0, 0.5);
        
        colors[baseIndex] = heightColor.r;
        colors[baseIndex + 1] = heightColor.g;
        colors[baseIndex + 2] = heightColor.b;
  
        if (data.attributes.intensity?.value) {
          const intensityArray = data.attributes.intensity.value as Float32Array;
          const intensity = intensityArray[i] / 65535;
          colors[baseIndex] *= intensity;
          colors[baseIndex + 1] *= intensity;
          colors[baseIndex + 2] *= intensity;
        }
      }
  
      // Create geometry
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(normalizedPositions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  
      // Create point cloud object
      const material = this.material.clone();
      material.size = 0.05;
      const pointCloud = new THREE.Points(geometry, material);
      
      // Additional transformation for fine-tuning
      pointCloud.rotation.x = Math.PI / 2; // Rotate 90 degrees around X
      pointCloud.position.y = 0; // Adjust height if needed
      
      const cloudId = `cloud-${crypto.randomUUID()}`;
      
      // Add to scene
      this.scene.add(pointCloud);
      this.pointClouds.set(cloudId, pointCloud);
  
      // Position camera to better view the rotated point cloud
      cameraComponent.controls.setLookAt(20, 20, 20, 0, 0, 0);
  
      console.log('Point cloud added to scene:', cloudId);
      return cloudId;
  
    } catch (error) {
      console.error('Error loading LAS file:', error);
      throw error;
    }
  }
  
  // Add these methods to the PointCloudManager class for interactive adjustment
  setCloudRotation(id: string, axis: 'x' | 'y' | 'z', angle: number) {
    const cloud = this.pointClouds.get(id);
    if (cloud) {
      cloud.rotation[axis] = angle;
    }
  }
  
  setCloudPosition(id: string, axis: 'x' | 'y' | 'z', position: number) {
    const cloud = this.pointClouds.get(id);
    if (cloud) {
      cloud.position[axis] = position;
    }
  }

  setPointSize(size: number) {
    this.pointClouds.forEach(cloud => {
      (cloud.material as THREE.PointsMaterial).size = size;
    });
  }

  setPointColor(color: string) {
    const newColor = new THREE.Color(color);
    this.pointClouds.forEach(cloud => {
      (cloud.material as THREE.PointsMaterial).color = newColor;
    });
  }

  removePointCloud(id: string) {
    const cloud = this.pointClouds.get(id);
    if (cloud) {
      this.scene.remove(cloud);
      cloud.geometry.dispose();
      (cloud.material as THREE.Material).dispose();
      this.pointClouds.delete(id);
    }
  }

  clear() {
    this.pointClouds.forEach((cloud, id) => {
      this.removePointCloud(id);
    });
  }
}

const pointCloudManager = new PointCloudManager(world.scene.three);

interface BimFileInput extends HTMLElement {
  value: string;
  files?: FileList;
}

// Modify the lasControls to ensure it returns a proper BUI Component
const lasControls = () => {
  let currentCloudId = '';
  
  return BUI.html`
    <div style="display: flex; flex-direction: column; gap: 8px;">
      <bim-button label="Load LAS/LAZ File" @click="${() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.las,.laz';
        input.style.display = 'none';
        input.onchange = async (event) => {
          const target = event.target as HTMLInputElement;
          if (target.files && target.files[0]) {
            try {
              currentCloudId = await pointCloudManager.loadLASFile(target.files[0]);
              console.log('Point cloud loaded successfully');
              alert('Point cloud loaded successfully');
            } catch (error) {
              console.error('Failed to load point cloud:', error);
              alert('Failed to load point cloud file. Please check console for details.');
            }
          }
        };
        document.body.appendChild(input);
        input.click();
        document.body.removeChild(input);
      }}"></bim-button>

      <div style="margin-top: 8px;">
        <h4 style="margin: 4px 0;">Rotation Adjustment</h4>
        <bim-number-input
          slider
          label="X Rotation"
          value="${Math.PI/2}"
          min="0"
          max="${Math.PI*2}"
          step="0.1"
          @change="${({ target }: { target: BUI.NumberInput }) => {
            if (currentCloudId) {
              pointCloudManager.setCloudRotation(currentCloudId, 'x', target.value);
            }
          }}"
        ></bim-number-input>

        <bim-number-input
          slider
          label="Y Rotation"
          value="0"
          min="0"
          max="${Math.PI*2}"
          step="0.1"
          @change="${({ target }: { target: BUI.NumberInput }) => {
            if (currentCloudId) {
              pointCloudManager.setCloudRotation(currentCloudId, 'y', target.value);
            }
          }}"
        ></bim-number-input>

        <bim-number-input
          slider
          label="Z Rotation"
          value="0"
          min="0"
          max="${Math.PI*2}"
          step="0.1"
          @change="${({ target }: { target: BUI.NumberInput }) => {
            if (currentCloudId) {
              pointCloudManager.setCloudRotation(currentCloudId, 'z', target.value);
            }
          }}"
        ></bim-number-input>
      </div>

      <div style="margin-top: 8px;">
        <h4 style="margin: 4px 0;">Position Adjustment</h4>
        <bim-number-input
          slider
          label="X Position"
          value="0"
          min="-50"
          max="50"
          step="1"
          @change="${({ target }: { target: BUI.NumberInput }) => {
            if (currentCloudId) {
              pointCloudManager.setCloudPosition(currentCloudId, 'x', target.value);
            }
          }}"
        ></bim-number-input>

        <bim-number-input
          slider
          label="Y Position"
          value="0"
          min="-50"
          max="50"
          step="1"
          @change="${({ target }: { target: BUI.NumberInput }) => {
            if (currentCloudId) {
              pointCloudManager.setCloudPosition(currentCloudId, 'y', target.value);
            }
          }}"
        ></bim-number-input>

        <bim-number-input
          slider
          label="Z Position"
          value="0"
          min="-50"
          max="50"
          step="1"
          @change="${({ target }: { target: BUI.NumberInput }) => {
            if (currentCloudId) {
              pointCloudManager.setCloudPosition(currentCloudId, 'z', target.value);
            }
          }}"
        ></bim-number-input>
      </div>

      <bim-number-input
        slider
        label="Point Size"
        value="0.05"
        min="0.01"
        max="0.5"
        step="0.01"
        @change="${({ target }: { target: BUI.NumberInput }) => {
          pointCloudManager.setPointSize(target.value);
        }}"
      ></bim-number-input>

      <bim-color-input
        label="Point Color"
        color="#ffffff"
        @input="${({ target }: { target: BUI.ColorInput }) => {
          pointCloudManager.setPointColor(target.color);
        }}"
      ></bim-color-input>

      <bim-button
        label="Clear Point Clouds"
        @click="${() => {
          pointCloudManager.clear();
          currentCloudId = '';
          console.log('Point clouds cleared');
        }}"
      ></bim-button>
    </div>
  `;
};


const panel = BUI.Component.create(() => {
  const [loadIfcBtn] = loadIfc({ components });

  return BUI.html`
   <bim-panel label="Model Inspector" style="position: relative; overflow: hidden;">
      <button class="collapse-button" @click="${(e: MouseEvent) => {
        const panelElement = document.querySelector('bim-panel');
        const gridElement = document.querySelector('bim-grid');
        const button = e.currentTarget as HTMLButtonElement;
        
        if (!panelElement || !gridElement) {
          console.error('Required elements not found');
          return;
        }
      
        const isCollapsed = panelElement.style.width === '0px';
        
        if (isCollapsed) {
          panelElement.style.width = '23rem';
          button.innerHTML = '◀';
          gridElement.style.gridTemplateColumns = '23rem 1fr';
        } else {
          panelElement.style.width = '0px';
          button.innerHTML = '▶';
          gridElement.style.gridTemplateColumns = '0 1fr';
        }
        
        window.dispatchEvent(new Event('resize'));
        rendererComponent.resize();
        cameraComponent.updateAspect();
      }}">◀</button>
      <div>
        <bim-panel-section label="Import">
          ${loadIfcBtn}
        </bim-panel-section>
        <bim-panel-section label="Interaction Settings">
          <bim-checkbox checked="true" label="Show Properties & Zoom" 
            @change="${({ target }: { target: BUI.Checkbox }) => {
              showPropertiesEnabled = target.value;
              highlighter.zoomToSelection = target.value;
              if (!target.value && popup) {
                popup.style.display = 'none';
              }
            }}">  
          </bim-checkbox>
        </bim-panel-section>

        <bim-panel-section label="Point Cloud">
        ${lasControls()}
      </bim-panel-section>
        
        <!-- Add new Measurements section -->
        <bim-panel-section label="Measurements">
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <bim-checkbox label="Enable Measurements" 
              @change="${({ target }: { target: BUI.Checkbox }) => {
                dimensions.enabled = target.value;
              }}">
            </bim-checkbox>
            <bim-color-input 
              label="Measurement Color" color="#202932" 
              @input="${({ target }: { target: BUI.ColorInput }) => {
                dimensions.color.set(target.color);
              }}">
            </bim-color-input>
            <bim-button label="Delete All Measurements"
              @click="${() => dimensions.deleteAll()}">
            </bim-button>
            <bim-label>Double click to measure</bim-label>
            <bim-label>Press Delete to remove measurement</bim-label>
          </div>
        </bim-panel-section>

        <!-- Add new Navigation section -->
      <bim-panel-section label="Navigation">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <bim-button label="Front" @click="${cameraPresets.front}"></bim-button>
          <bim-button label="Back" @click="${cameraPresets.back}"></bim-button>
          <bim-button label="Top" @click="${cameraPresets.top}"></bim-button>
          <bim-button label="Bottom" @click="${cameraPresets.bottom}"></bim-button>
          <bim-button label="Left" @click="${cameraPresets.left}"></bim-button>
          <bim-button label="Right" @click="${cameraPresets.right}"></bim-button>
        </div>
      </bim-panel-section>
      <!-- Add Annotations section -->
      <bim-panel-section label="Annotations">
        <div style="display: flex; gap: 8px;">
          <bim-button label="Add Annotation" 
            @click="${() => {
              viewport.style.cursor = 'crosshair';
              enableAnnotationMode();
            }}">
          </bim-button>
          <bim-button label="Clear All" 
            @click="${() => annotationSystem.clear()}">
          </bim-button>
        </div>
      </bim-panel-section>
    <bim-panel-section label="Clipping Planes">
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <!-- X-Axis Controls -->
        <div>
          <h4 style="margin: 4px 0;">X-Axis Clipping</h4>
          <div style="display: flex; gap: 8px; margin-bottom: 8px;">
            <bim-checkbox label="Left" 
              @change="${({ target }: { target: BUI.Checkbox }) => {
                clippingStates.left = target.value;
                updateMaterialClipping();
              }}">
            </bim-checkbox>
            <bim-number-input 
              slider label="Position" value="1000" min="-1000" max="1000" step="10"
              @change="${({ target }: { target: BUI.NumberInput }) => {
                clippingPlanes.left.constant = target.value;
              }}">
            </bim-number-input>
          </div>
          <div style="display: flex; gap: 8px; margin-bottom: 8px;">
            <bim-checkbox label="Right"
              @change="${({ target }: { target: BUI.Checkbox }) => {
                clippingStates.right = target.value;
                updateMaterialClipping();
              }}">
            </bim-checkbox>
            <bim-number-input 
              slider label="Position" value="1000" min="-1000" max="1000" step="10"
              @change="${({ target }: { target: BUI.NumberInput }) => {
                clippingPlanes.right.constant = target.value;
              }}">
            </bim-number-input>
          </div>
        </div>
        
        <!-- Y-Axis Controls -->
        <div>
          <h4 style="margin: 4px 0;">Y-Axis Clipping</h4>
          <div style="display: flex; gap: 8px; margin-bottom: 8px;">
            <bim-checkbox label="Top"
              @change="${({ target }: { target: BUI.Checkbox }) => {
                clippingStates.top = target.value;
                updateMaterialClipping();
              }}">
            </bim-checkbox>
            <bim-number-input 
              slider label="Position" value="1000" min="-1000" max="1000" step="10"
              @change="${({ target }: { target: BUI.NumberInput }) => {
                clippingPlanes.top.constant = target.value;
              }}">
            </bim-number-input>
          </div>
          <div style="display: flex; gap: 8px; margin-bottom: 8px;">
            <bim-checkbox label="Bottom"
              @change="${({ target }: { target: BUI.Checkbox }) => {
                clippingStates.bottom = target.value;
                updateMaterialClipping();
              }}">
            </bim-checkbox>
            <bim-number-input 
              slider label="Position" value="1000" min="-1000" max="1000" step="10"
              @change="${({ target }: { target: BUI.NumberInput }) => {
                clippingPlanes.bottom.constant = target.value;
              }}">
            </bim-number-input>
          </div>
        </div>
        
        <!-- Z-Axis Controls -->
        <div>
          <h4 style="margin: 4px 0;">Z-Axis Clipping</h4>
          <div style="display: flex; gap: 8px; margin-bottom: 8px;">
            <bim-checkbox label="Front"
              @change="${({ target }: { target: BUI.Checkbox }) => {
                clippingStates.front = target.value;
                updateMaterialClipping();
              }}">
            </bim-checkbox>
            <bim-number-input 
              slider label="Position" value="1000" min="-1000" max="1000" step="10"
              @change="${({ target }: { target: BUI.NumberInput }) => {
                clippingPlanes.front.constant = target.value;
              }}">
            </bim-number-input>
          </div>
          <div style="display: flex; gap: 8px; margin-bottom: 8px;">
            <bim-checkbox label="Back"
              @change="${({ target }: { target: BUI.Checkbox }) => {
                clippingStates.back = target.value;
                updateMaterialClipping();
              }}">
            </bim-checkbox>
            <bim-number-input 
              slider label="Position" value="1000" min="-1000" max="1000" step="10"
              @change="${({ target }: { target: BUI.NumberInput }) => {
                clippingPlanes.back.constant = target.value;
              }}">
            </bim-number-input>
          </div>
        </div>
      </div>
    </bim-panel-section>
    <bim-panel-section label="Classifications">
      ${classificationsTree}
    </bim-panel-section>
    <bim-panel-section collapsed label="Minimap Controls">
      
      
      <bim-checkbox checked label="Lock rotation" 
        @change="${({ target }: { target: BUI.Checkbox }) => {
          map.config.lockRotation = target.value;
        }}">  
      </bim-checkbox>
      
      <bim-number-input 
        slider label="Zoom" value="0.05" min="0.01" max="0.5" step="0.01" 
        @change="${({ target }: { target: BUI.NumberInput }) => {
          map.config.zoom = target.value;
        }}">
      </bim-number-input>
      
      <bim-number-input 
        slider label="Front offset" value="2" min="0" max="5" step="1" 
        @change="${({ target }: { target: BUI.NumberInput }) => {
          map.config.frontOffset = target.value;
        }}">
      </bim-number-input>
              
      <div style="display: flex; gap: 12px">
        <bim-number-input 
          slider value="200" pref="Size X" min="100" max="500" step="10"              
          @change="${({ target }: { target: BUI.NumberInput }) => {
            map.config.sizeX = target.value;
            map.resize();
          }}">
        </bim-number-input>        
      
        <bim-number-input 
          slider value="200" pref="Size Y" min="100" max="500" step="10"            
          @change="${({ target }: { target: BUI.NumberInput }) => {
            map.config.sizeY = target.value;
            map.resize();
          }}">
        </bim-number-input>
      </div>
    </bim-panel-section>
   </bim-panel> 
  `;
});



let annotationMode = false;

function enableAnnotationMode() {
  annotationMode = true;
  
  const handleClick = (event: MouseEvent) => {
    if (!annotationMode) {
      viewport.removeEventListener('click', handleClick);
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / viewport.clientWidth) * 2 - 1;
    const y = -((event.clientY - rect.top) / viewport.clientHeight) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), world.camera.three);
    const intersects = raycaster.intersectObjects(world.scene.three.children, true);

    if (intersects.length > 0) {
      const point = intersects[0].point;
      const content = prompt('Enter annotation text:');
      if (content) {
        annotationSystem.addAnnotation(point, content);
      }
    }

    annotationMode = false;
    viewport.style.cursor = 'default';
    viewport.removeEventListener('click', handleClick);
  };

  viewport.addEventListener('click', handleClick);
}


// Add to your render loop
rendererComponent.onBeforeUpdate.add(() => {
  annotationSystem.updatePositions(world.camera.three);
});

// Setup main application layout
app.layouts = {
  main: {
    template: `
      "panel viewport"
      / 23rem 1fr
    `,
    elements: { panel, viewport },
  },
};

app.layout = "main";
document.body.append(app);