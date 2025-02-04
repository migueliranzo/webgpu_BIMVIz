interface treeNode {
  name: string,
  expressId: number,
  children: treeNode[]
}

let meshGroupsResolve;

const meshGroupsPromise = new Promise(resolve => {
  meshGroupsResolve = resolve;
})

let toggledMeshesIdSet: Set<number> = new Set();
let hoveredMeshesIdSet: Set<number> = new Set();
const modelTreeChildParentMap = new Map();

const toggledEventEmitter = createLocalEventEmitter('toggledEventEmitter');
const hoveredEventEmitter = createLocalEventEmitter('hoveredEventEmitter');

export function createModelServiceHandle({ instanceExpressIds, meshTypeIdMap, typesIdStateMap, modelTreeStructure, typeIdInstanceGroupId }) {
  const LEFTSIDETREESTRUCTUREPANELELEMENT = document.getElementById('leftSideTreeStructurePanel');

  meshGroupsResolve({
    meshLookUpIdsList: instanceExpressIds,
    meshTypeIdMap,
    typesIdStateMap,
    typeIdInstanceGroupId,
  });

  console.log(modelTreeStructure)


  modelTreeStructure.forEach((x) => {
    createTreeNode(x, LEFTSIDETREESTRUCTUREPANELELEMENT, 0);
  })

  LEFTSIDETREESTRUCTUREPANELELEMENT?.children[0]?.classList.remove('hidden')
  LEFTSIDETREESTRUCTUREPANELELEMENT?.children[1]?.classList.remove('hidden')
}

//https://img.icons8.com/?size=256w&id=99977&format=png 1x, https://img.icons8.com/?size=512w&id=99977&format=png 2x
//https://img.icons8.com/?size=256w&id=100530&format=png 1x, https://img.icons8.com/?size=512w&id=100530&format=png 2x
//https://img.icons8.com/?size=256w&id=78983&format=png 1x, https://img.icons8.com/?size=512w&id=78983&format=png 2x

function createTreeNode(node: treeNode, rootElement: HTMLElement, treeLevel: number, parentNodeId: number) {
  const nodeContainer = document.createElement('div');
  nodeContainer.classList.add('hidden', 'nodeContainer')

  const nodeHeader = document.createElement('div');
  nodeHeader.innerText = node.name + ' ' + node.expressId;

  if (node.children.length > 0) {
    treeLevel++;
    nodeHeader.classList.add('nodeArrow')
  } else {
    nodeHeader.classList.add('nodeDot')
  }

  nodeContainer.style.paddingLeft = `${treeLevel * 2}px`;
  nodeContainer.addEventListener(('click'), (event) => {
    event.stopPropagation()
    Array.from(nodeContainer.children).slice(1, nodeContainer.children.length).forEach((child) => {
      child.classList.toggle('hidden');
    })
    if (nodeHeader.classList.contains('nodeDot')) return;
    nodeHeader.classList.toggle('nodeArrowDown');
  })

  const toggleViewBtn = document.createElement('button');
  toggleViewBtn.innerText = 'Hide'

  toggleViewBtn.addEventListener(('click'), (event) => {
    event.stopPropagation();
    getToggledIds(node, toggledMeshesIdSet);
    toggledEventEmitter.emit(toggledMeshesIdSet);
  })

  nodeHeader.addEventListener(('mouseenter'), (event) => {
    event.stopPropagation();
    getToggledIds(node, hoveredMeshesIdSet);
    hoveredEventEmitter.emit(hoveredMeshesIdSet);
  })

  nodeHeader.addEventListener(('mouseleave'), (event) => {
    event.stopPropagation();
    hoveredMeshesIdSet.clear()
    hoveredEventEmitter.emit(hoveredMeshesIdSet);
  })

  nodeHeader.appendChild(toggleViewBtn);
  nodeContainer.appendChild(nodeHeader)
  rootElement.appendChild(nodeContainer);


  modelTreeChildParentMap.set(node.expressId, parentNodeId);

  node.children.forEach((child) => createTreeNode(child, nodeContainer, treeLevel, node.expressId))
}

function getToggledIds(node: treeNode, stateMeshesIdSet: Set<number>, isParentOnSet?: boolean) {

  switch (isParentOnSet) {
    case true:

      node.children.forEach((x) => getToggledIds(x, stateMeshesIdSet, isParentOnSet))
      stateMeshesIdSet.delete(node.expressId);
      break;

    case false:

      node.children.forEach((x) => getToggledIds(x, stateMeshesIdSet, isParentOnSet))
      stateMeshesIdSet.add(node.expressId)

      break;

    case undefined:

      node.children.forEach((x) => getToggledIds(x, stateMeshesIdSet, stateMeshesIdSet.has(node.expressId)))
      stateMeshesIdSet.has(node.expressId) ? stateMeshesIdSet.delete(node.expressId) : stateMeshesIdSet.add(node.expressId);
      break;
  }
}

function createLocalEventEmitter(eventName: string) {
  const eventTarget = new EventTarget();

  return {
    emit(value) {
      // Create a new event with our value
      const event = new CustomEvent(eventName, { detail: value });
      eventTarget.dispatchEvent(event);
    },

    subscribe(callback) {
      const handler = (e) => callback(e.detail);
      eventTarget.addEventListener(eventName, handler);
      return () => eventTarget.removeEventListener(eventName, handler);
    }
  };
}

export function getMeshGroupsHandler() {
  return {
    getMeshGroups: () => {
      return meshGroupsPromise;
    },
    treeListSelectionOnChange: toggledEventEmitter.subscribe,
    treeListHoverOnChange: hoveredEventEmitter.subscribe
  }
};
