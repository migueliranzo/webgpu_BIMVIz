import { INTEGER } from "web-ifc";

export function createDataViewModel(detailedPropertiesCallbacks: { getDetailedProperties: (id: number) => Promise<{ props: any[], itemProp: any }> }) {
  let selectedId = 0;
  const RIGHTSIDEPANELELEMENT = document.getElementById('rightSidePropertiesPanel')!;
  let itemsProperties = [];

  //So this is here thats cool but we should probably choose some basic properties to avoid calling openModel
  //SO THIS IS FOR TESTING PURPOSES
  const updateRightSidePropertiesPanel = async function() {
    const fetchedProperties = await detailedPropertiesCallbacks.getDetailedProperties(selectedId);
    RIGHTSIDEPANELELEMENT!.innerHTML = JSON.stringify(fetchedProperties);
  }

  const updateRightSidePropsSync = function() {
    const itemPropertiesObject = itemsProperties[selectedId].itemProperties;
    const htmlList = document.createElement('div');
    mapPropertiesToHtml(itemPropertiesObject, htmlList);
    htmlList.classList.add('gap-5', 'flex', 'flex-col');
    RIGHTSIDEPANELELEMENT.appendChild(htmlList)
    //RIGHTSIDEPANELELEMENT.innerHTML = JSON.stringify(itemsProperties[selectedId])
  }

  function mapPropertiesToHtml(list: any, htmlist: HTMLDivElement) {
    RIGHTSIDEPANELELEMENT.childNodes[0]?.remove()
    for (const value in list) {
      const propertyRow = document.createElement('div');
      propertyRow.classList.add('flex', 'flex-row', 'justify-between');
      const propertyTitle = document.createElement('div');
      const propertyValue = document.createElement('div');
      propertyTitle.classList.add('property-title')
      propertyValue.classList.add('property-value')
      propertyTitle.innerText = value;
      if (typeof list[value] === 'object') {
        propertyValue.innerText = list[value].value ? list[value].value : list[value].expressID;
      } else {
        propertyValue.innerText = list[value];
      }
      propertyRow.appendChild(propertyTitle);
      propertyRow.appendChild(propertyValue);
      htmlist.appendChild(propertyRow);
    }
  }

  const hidePanel = function() {
    RIGHTSIDEPANELELEMENT.classList.add('translateFullyRigthX');
  }
  const showPanel = function() {
    RIGHTSIDEPANELELEMENT.classList.remove('translateFullyRigthX');
  }

  const setSelectedId = function(id: number) {
    hidePanel();
    if (id != selectedId && id > 0) {
      selectedId = id;
      updateRightSidePropsSync();
      showPanel();
      //updateRightSidePropertiesPanel();
    }
  }

  const getSelectedId = function() {
    return selectedId;
  }

  const setItemPropertiesArray = function(x) {
    itemsProperties = x;
  }

  return (() => {
    return {
      setSelectedId,
      updateRightSidePropertiesPanel,
      getSelectedId,
      setItemPropertiesArray,
    }
  })
}
