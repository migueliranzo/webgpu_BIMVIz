interface treeNode {
  name: string,
  expressId: number,
  children: treeNode[]
}

export function createItemspropertyarrayhandle(items: Map<any, any>) {

  return {
    getItemProperties(id) {
      return { ...items.get(id) };
    },
  }
}


let toggledMeshesIdSet: Set<number> = new Set();
let hoveredMeshesIdSet: Set<number> = new Set();
const modelTreeChildParentMap = new Map();
const toggledEventEmitter = createLocalEventEmitter('toggledEventEmitter');
const hoveredEventEmitter = createLocalEventEmitter('hoveredEventEmitter');
const LEFTSIDETREESTRUCTUREPANELELEMENT = document.getElementById('leftSideTreeStructurePanel');

export function setUpLeftPanelTreeView(modelTreeStructure) {

  modelTreeStructure.forEach((level) => {
    createTreeNode(level, LEFTSIDETREESTRUCTUREPANELELEMENT, 0);
  })

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

  LEFTSIDETREESTRUCTUREPANELELEMENT?.children[0]?.classList.remove('hidden')
  LEFTSIDETREESTRUCTUREPANELELEMENT?.children[1]?.classList.remove('hidden')

  return {
    treeListSelectionOnChange: toggledEventEmitter.subscribe,
    treeListHoverOnChange: hoveredEventEmitter.subscribe
  }
}

const RIGHTSIDEPANELELEMENT = document.getElementById('rightSidePropertiesPanel')!;
export function setUpRightPanelItemProperties(typesList: []) {

  const updateRightSidePropsSync = function(itemPropertiesObject: { itemProperties: {}, processedPropertySets: {} }) {
    const htmlList = document.createElement('div');
    mapPropertiesToHtml(itemPropertiesObject, htmlList);
    htmlList.classList.add('gap-5', 'flex', 'flex-col');
    RIGHTSIDEPANELELEMENT.appendChild(htmlList)
  }

  function mapPropertiesToHtml({ itemProperties, processedPropertySets }, htmlist: HTMLDivElement) {
    RIGHTSIDEPANELELEMENT.childNodes[0]?.remove()
    const itemPropertiesTitle = document.createElement('div');
    itemPropertiesTitle.classList.add('item-properties-title');
    itemPropertiesTitle.innerText = 'Object properties'
    htmlist.appendChild(itemPropertiesTitle);
    for (const value in itemProperties) {
      const propertyRow = document.createElement('div');
      propertyRow.classList.add('flex', 'flex-row', 'justify-between');
      const propertyTitle = document.createElement('div');
      const propertyValue = document.createElement('div');
      propertyTitle.classList.add('property-title')
      propertyValue.classList.add('property-value')
      propertyTitle.innerText = value;
      if (typeof itemProperties[value] === 'object' && itemProperties[value]) {
        propertyValue.innerText = itemProperties[value].value ? itemProperties[value].value : itemProperties[value].expressID;
      } else {
        propertyValue.innerText = itemProperties[value];
      }
      if (value == 'type') {
        propertyValue.innerText = typesList.find((type) => type.typeID == itemProperties[value]).typeName;
      }

      propertyRow.appendChild(propertyTitle);
      propertyRow.appendChild(propertyValue);
      htmlist.appendChild(propertyRow);
    }

    if (!processedPropertySets) return;
    const itemPropertySetsTitle = document.createElement('div');
    itemPropertySetsTitle.classList.add('item-propertySets-title');
    itemPropertySetsTitle.innerText = 'Object property sets'
    htmlist.appendChild(itemPropertySetsTitle);

    for (const propertySetKey in processedPropertySets) {
      const propertySetRow = document.createElement('div');
      propertySetRow.classList.add('set-row-open')
      const propertySetHeader = document.createElement('div');
      propertySetHeader.innerText = propertySetKey;
      propertySetHeader.classList.add('property-set-header')
      propertySetRow.appendChild(propertySetHeader);

      propertySetHeader.addEventListener(('click'), () => {
        propertySetRow.classList.toggle('set-row-open');
      })

      const propertySetValues = processedPropertySets[propertySetKey]
      propertySetValues.forEach((propertySetValuePair) => {
        for (const propertySetValueKey in propertySetValuePair) {
          const propertySetRowHeader = document.createElement('div');
          propertySetRowHeader.classList.add('flex', 'flex-row', 'justify-between', 'property-set-value-row');

          const propertySetTitle = document.createElement('div');
          const propertySetValue = document.createElement('div');

          propertySetTitle.classList.add('property-title')
          propertySetValue.classList.add('property-value')

          propertySetTitle.innerText = propertySetValueKey;
          propertySetValue.innerText = propertySetValuePair[propertySetValueKey];

          propertySetRowHeader.appendChild(propertySetTitle);
          propertySetRowHeader.appendChild(propertySetValue)
          propertySetRow.appendChild(propertySetRowHeader);
        }

      })

      htmlist.appendChild(propertySetRow);
    }
  }

  return {
    updateRightSidePropsSync
  }
}

function createLocalEventEmitter(eventName: string) {
  const eventTarget = new EventTarget();

  return {
    emit(value) {
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
