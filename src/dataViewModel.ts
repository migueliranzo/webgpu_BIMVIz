interface treeNode {
  name: string,
  type: string,
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
let hoverToggledIdSet: Set<number> = new Set();
const modelTreeChildParentMap = new Map();
const toggledEventEmitter = createLocalEventEmitter('toggledEventEmitter');
const hoverToggledEventEmitter = createLocalEventEmitter('hoverToggledEventEmitter');
const hoveredEventEmitter = createLocalEventEmitter('hoveredEventEmitter');
const LEFTSIDETREESTRUCTUREPANELELEMENTSCROLLVIEW = document.getElementById('leftSideTreeStructurePanelScrollView');

export function setUpLeftPanelTreeView(modelTreeStructure) {
  LEFTSIDETREESTRUCTUREPANELELEMENTSCROLLVIEW!.replaceChildren();
  modelTreeStructure.forEach((level) => {
    const treeNodeIconsMap = new Map();
    createTreeNode(level, LEFTSIDETREESTRUCTUREPANELELEMENTSCROLLVIEW, 0, 0, treeNodeIconsMap);
  })

  function createTreeNode(node: treeNode, rootElement: HTMLElement, treeLevel: number, parentNodeId: number, localTreeNodeIconsMap: Map<any, any>) {
    const nodeActionBtnsSection = document.createElement('div');
    nodeActionBtnsSection.classList.add('flex', 'flex-row', 'gap-1')
    nodeActionBtnsSection.style.flex = '1';
    nodeActionBtnsSection.style.justifyContent = 'flex-end';
    nodeActionBtnsSection.style.gap = '1rem';
    nodeActionBtnsSection.style.paddingRight = '10px';
    const nodeContainer = document.createElement('div');
    nodeContainer.classList.add('hidden', 'nodeContainer')


    const nodeHeaderTextSection = document.createElement('div');
    nodeHeaderTextSection.classList.add('flex', 'flex-col', 'gap-1')
    const nodeType = document.createElement('p');
    nodeType.innerText = node.type;
    const nodeName = document.createElement('p');
    nodeName.innerText = node.name + ' ' + node.expressId;
    nodeName.classList.add('nodeName');
    nodeName.title = node.name;
    nodeHeaderTextSection.appendChild(nodeType);
    nodeHeaderTextSection.appendChild(nodeName);


    const itemIcon = document.createElement('div');

    if (node.children.length > 0) {
      treeLevel++;
      itemIcon.classList.add('nodeArrow')
    } else {
      itemIcon.classList.add('nodeDot')
    }


    const nodeHeader = document.createElement('div');
    nodeHeader.classList.add('nodeHeader')
    nodeHeader.appendChild(itemIcon);
    nodeHeader.appendChild(nodeHeaderTextSection);


    nodeHeader.style.paddingLeft = `${treeLevel * 5}px`;
    nodeContainer.addEventListener(('click'), (event) => {
      event.stopPropagation()
      Array.from(nodeContainer.children).slice(1, nodeContainer.children.length).forEach((child) => {
        child.classList.toggle('hidden');
      })
      if (itemIcon.classList.contains('nodeDot')) return;
      itemIcon.classList.toggle('nodeArrowDown');
    })

    const toggleViewBtn = document.createElement('button');
    toggleViewBtn.classList.add('nodeActionVisibility');
    toggleViewBtn.addEventListener(('click'), (event) => {
      event.stopPropagation();
      getToggledIds({ ...node, toggleNodeIcon: () => toggleViewBtn.classList.add('nodeActionVisibilityHidden') }, toggledMeshesIdSet);
      toggledEventEmitter.emit(toggledMeshesIdSet);

      localTreeNodeIconsMap.forEach((nodeIcons, _i) => {
        toggledMeshesIdSet.has(_i) ? nodeIcons.toggleViewBtn.classList.add('nodeActionVisibilityHidden') : nodeIcons.toggleViewBtn.classList.remove('nodeActionVisibilityHidden');
      })
    })

    const hoverToggleBtn = document.createElement('button');
    hoverToggleBtn.classList.add('nodeActionHighlightToggle');
    hoverToggleBtn.addEventListener(('click'), (event) => {
      event.stopPropagation();
      getToggledIds(node, hoverToggledIdSet);
      hoverToggledEventEmitter.emit(hoverToggledIdSet);

      localTreeNodeIconsMap.forEach((nodeIcons, _i) => {
        hoverToggledIdSet.has(_i) ? nodeIcons.hoverToggleBtn.classList.add('nodeActionHighlightToggleActive') : nodeIcons.hoverToggleBtn.classList.remove('nodeActionHighlightToggleActive');
      })
    })

    nodeHeader.addEventListener(('mouseenter'), (event) => {
      event.stopPropagation();
      getToggledIds(node, hoveredMeshesIdSet);
      hoveredEventEmitter.emit(new Set([...hoveredMeshesIdSet, ...hoverToggledIdSet]));
    })

    nodeHeader.addEventListener(('mouseleave'), (event) => {
      event.stopPropagation();
      hoveredMeshesIdSet.clear()
      hoveredEventEmitter.emit(hoverToggledIdSet);
    })


    localTreeNodeIconsMap.set(node.expressId, { hoverToggleBtn, toggleViewBtn });

    nodeActionBtnsSection.appendChild(toggleViewBtn);
    nodeActionBtnsSection.appendChild(hoverToggleBtn);
    nodeHeader.appendChild(nodeActionBtnsSection);
    nodeContainer.appendChild(nodeHeader)
    rootElement.appendChild(nodeContainer);

    modelTreeChildParentMap.set(node.expressId, parentNodeId);
    node.children.forEach((child) => createTreeNode(child, nodeContainer, treeLevel, node.expressId, localTreeNodeIconsMap))
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

  LEFTSIDETREESTRUCTUREPANELELEMENTSCROLLVIEW?.children[0]?.classList.remove('hidden')
  LEFTSIDETREESTRUCTUREPANELELEMENTSCROLLVIEW?.children[1]?.classList.remove('hidden')

  return {
    treeListSelectionOnChange: toggledEventEmitter.subscribe,
    treeListHoverOnChange: hoveredEventEmitter.subscribe,
    treeListHoverToggleOnChange: hoverToggledEventEmitter.subscribe
  }
}

const RIGHTSIDEPANELELEMENT = document.getElementById('rightSidePropertiesPanel')!;
export function setUpRightPanelItemProperties(typesList: []) {

  const updateRightSidePropsSync = function(itemPropertiesObject: { itemProperties: {}, processedPropertySets: {} }) {
    const htmlList = document.createElement('div');
    const htmlContainer = document.createElement('div');
    mapPropertiesToHtml(itemPropertiesObject, htmlList);
    htmlList.classList.add('gap-5', 'flex', 'flex-col', 'htmlList');

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
      propertyRow.style.maxWidth = '305px'
      propertyRow.style.gap = '1rem';
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
          propertySetRowHeader.style.maxWidth = '305px';
          propertySetRowHeader.style.gap = '1rem';

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
    htmlist.appendChild(document.createElement('div'))
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
