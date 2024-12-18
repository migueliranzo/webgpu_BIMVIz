import { INTEGER } from "web-ifc";

export function createDataViewModel(detailedPropertiesCallbacks: { getDetailedProperties: (id: number) => Promise<{ props: any[], itemProp: any }> }) {
  let selectedId = 0;
  const rightSidePropertiesPanel = document.getElementById('rightSidePropertiesPanel');
  let itemsProperties = [];

  //So this is here thats cool but we should probably choose some basic properties to avoid calling openModel
  //SO THIS IS FOR TESTING PURPOSES
  const updateRightSidePropertiesPanel = async function() {
    const fetchedProperties = await detailedPropertiesCallbacks.getDetailedProperties(selectedId);
    rightSidePropertiesPanel!.innerHTML = JSON.stringify(fetchedProperties);
  }

  const updateRightSidePropsSync = function() {
    console.log(selectedId / 100)
    //OKAY LIKE SAVE A NORMAL ID HERE PLEASE
    rightSidePropertiesPanel!.innerHTML = JSON.stringify(itemsProperties[parseInt((selectedId / 100) + "")])
  }

  const setSelectedId = function(id: number) {
    if (id != selectedId && id > 0) {
      selectedId = id;
      updateRightSidePropsSync();
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
