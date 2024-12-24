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
    const items = itemsProperties[selectedId];
    console.log(items)
    //let htmlList = {};
    const htmlList = document.createElement('div');
    recursion(items, htmlList);
    console.log(htmlList)
    RIGHTSIDEPANELELEMENT.appendChild(htmlList)
    //RIGHTSIDEPANELELEMENT.innerHTML = JSON.stringify(itemsProperties[selectedId])
  }

  function recursion(list: any, htmlist: HTMLDivElement) {
    for (const value in list) {
      //htmlist[value] = [];
      const holder = document.createElement('div');
      holder.innerText = value;
      if (typeof list[value] === 'object' && list[value] !== null) {
        //htmlist[value].push(list[value])
        const spanValue = document.createElement('span');
        spanValue.innerText = list[value];
        htmlist.appendChild(spanValue);
        recursion(list[value], holder)
      } else {
        const spanValue = document.createElement('span');
        spanValue.innerText = list[value];
        holder.classList.add('header')
        htmlist.appendChild(spanValue);
        //htmlist[value].push(list[value])
      }

      htmlist.appendChild(holder)
    }
  }

  const hidePanel = function() {
    RIGHTSIDEPANELELEMENT.classList.add('translateFullyRigthX');
    //console.log(RIGHTSIDEPANELELEMENT.classList)
  }
  const showPanel = function() {
    RIGHTSIDEPANELELEMENT.classList.remove('translateFullyRigthX');
    //console.log(RIGHTSIDEPANELELEMENT.classList)
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
