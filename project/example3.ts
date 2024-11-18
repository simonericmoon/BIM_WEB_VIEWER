import * as OBC from "@thatopen/components";
import * as OBCF from "@thatopen/components-front";
import * as BUI from "@thatopen/ui";
import * as THREE from "three";
import { loadIfc } from "../buttons";
import { classificationTree } from "../tables/ClassificationsTree";
import * as CUI from "@thatopen/ui-obc"


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

const panel = BUI.Component.create(() => {
  const [loadIfcBtn] = loadIfc({ components });

  return BUI.html`
   <bim-panel label="Model Inspector">
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
      <bim-checkbox checked="true" label="Enabled" 
        @change="${({ target }: { target: BUI.Checkbox }) => {
          map.enabled = target.value;
        }}">  
      </bim-checkbox>
      
      <bim-checkbox checked="true" label="Visible" 
        @change="${({ target }: { target: BUI.Checkbox }) => {
          map.config.visible = target.value;
        }}">  
      </bim-checkbox>
      
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

// Setup main application layout
const app = document.createElement("bim-grid");
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