
// Persistent storage for visual objects
const TELEPORT_THRESHOLD = 100; // Pixels
const TILE_SIZE = globalThis.runtimeScene.getGame().getGameResolutionHeight()/12; // Pixels
const ALPHA = 0.1; // Interpolation speed
const renderMap = new Map();

function lerp(a, b, t=0.1) {
  return a + (b - a) * t;
}

// This must be run in the client frame render loop to make sure its recieving a non skipped version
function syncVariablesToRender(logicState, tileSize=100) {
    const activeKeys = new Set();

    logicState.forEach(item => {
        const id = item.key;
        const data = item.value;
        activeKeys.add(id);

        // Convert tiles → pixels
        const px = data.x * tileSize;
        const py = data.y * tileSize;

        if (!renderMap.has(id)) {
            renderMap.set(id, {
                visual: createVisualElement(data.type, id),
                interpolate: canInterpolate(data.type),
                prevX: px,
                prevY: py,
                currX: px,
                currY: py,
                renderX: px,
                renderY: py,

                type: data.type,
                behavior: data.behavior,
                hp: data.hp,
            });
        } else {
            const proxy = renderMap.get(id);

            const dx = px - proxy.currX;
            const dy = py - proxy.currY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > TELEPORT_THRESHOLD * tileSize || proxy.interpolate == false) {
                proxy.prevX = px;
                proxy.prevY = py;
                proxy.renderX = px;
                proxy.renderY = py;
            } else {
                proxy.prevX = proxy.currX;
                proxy.prevY = proxy.currY;
            }

            proxy.currX = px;
            proxy.currY = py;
            proxy.behavior = data.behavior;
            proxy.hp = data.hp;
        }
    });

    // --- RENDER INTERPOLATION ---
    for (let [, proxy] of renderMap) {
        proxy.renderX = lerp(proxy.renderX, proxy.currX, ALPHA);
        proxy.renderY = lerp(proxy.renderY, proxy.currY, ALPHA);
    }

    // --- DELETE ---
    for (let [id, proxy] of renderMap) {
        if (!activeKeys.has(id)) {
            deleteVisualElement(proxy.visual);
            renderMap.delete(id);
        }
    }
}

function canInterpolate(spriteType) {
    if(spriteType=="Wall") return false;

    return true;
}

function createVisualElement(spriteType, id) {
    const unit = runtimeScene.createObject(spriteType);
    unit.setSize(TILE_SIZE,TILE_SIZE);
    if(spriteType=="Wall") {
        unit.setLayer("Floor");
    }
    unit.getVariables().get('Id').setNumber(id);
    // const health = runtimeScene.createObject('MetalRedBar');
    return {
        unit,
        // health,
    };
}

function deleteVisualElement(obj) {
    console.log('delete')
    runtimeScene.markObjectForDeletion(obj.unit);
    // runtimeScene.markObjectForDeletion(obj.health);
}

function applyRender() {
    if(!globalThis.logicState) return;

    syncVariablesToRender(logicState, TILE_SIZE);

    renderMap.forEach((proxy) => {
        const renderX = proxy.renderX;
        const renderY = proxy.renderY;

        proxy.visual.unit.setPosition(renderX, renderY);
        // proxy.visual.health.setPosition(renderX, renderY + 20);
        // proxy.visual.tank.getVariables().get('behavior').setString(proxy.behavior);
        // proxy.visual.health.getVariables().get('hp').setString(proxy.hp);
    });
}

globalThis.applyRender = applyRenderl

/*
// Testing
function createVisualElement(spriteType, id) {
    return {type: 'orc', x:0, y:0, id:id};
}

function deleteVisualElement(obj) {
    console.log('delete');
    delete obj;
}

globalThis.createVisualElement = createVisualElement;
globalThis.deleteVisualElement = deleteVisualElement;

const logicStateA = [
            {
                "key": 1,
                "value": {
                  'type': 'Tank',
                  "x": 602,
                  "y": 553,
                  "behavior": "idle",
                }
            }
        ];

const logicStateB = [
            {
                "key": 1,
                "value": {
                  'type': 'Tank',
                  "x": 603,
                  "y": 553,
                  "behavior": "idle",
                }
            },
            {
                "key": 2,
                "value": {
                  'type': 'Tank',
                  "x": 1,
                  "y": 12,
                  "behavior": "idle",
                }
            }
        ];


const logicStateC = [
            {
                "key": 1,
                "value": {
                  'type': 'Tank',
                  "x": 603,
                  "y": 553,
                  "behavior": "idle",
                }
            },
            {
                "key": 2,
                "value": {
                  'type': 'Tank',
                  "x": 1,
                  "y": 12,
                  "behavior": "idle",
                }
            }
        ];

// Manipulate the visual object
syncVariablesToRender(logicStateA)
renderMap.forEach((proxy) => {
    // --- INTERPOLATE ---
    const renderX = proxy.renderX;
    const renderY = proxy.renderY;

    // Apply to style/transform (No clearing screen required)
    proxy.visual.x = renderX;
    proxy.visual.y = renderY;
    console.log(proxy)
});

syncVariablesToRender(logicStateB)
renderMap.forEach((proxy) => {
    // --- INTERPOLATE ---
    const renderX = proxy.renderX;
    const renderY = proxy.renderY;

    // Apply to style/transform (No clearing screen required)
    proxy.visual.x = renderX;
    proxy.visual.y = renderY;
    console.log(proxy)
});

syncVariablesToRender(logicStateC)
renderMap.forEach((proxy) => {
    // --- INTERPOLATE ---
    const renderX = proxy.renderX;
    const renderY = proxy.renderY;

    // Apply to style/transform (No clearing screen required)
    proxy.visual.x = renderX;
    proxy.visual.y = renderY;
    console.log(proxy)
});*/