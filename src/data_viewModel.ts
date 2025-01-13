import { INTEGER } from "web-ifc";

export function createItemspropertyarrayhandle(items) {

  return {
    getItemProperties(id) {
      return { ...items[id] };
    },
  }
}

export function createDataViewModel(generalProperties: { typesList: [], pipeGroups: Map<any, any> }) {
  const RIGHTSIDEPANELELEMENT = document.getElementById('rightSidePropertiesPanel')!;

  const updateRightSidePropsSync = function(propertyList) {
    let itemsProperties = propertyList.itemProperties;
    const itemPropertiesObject = itemsProperties;
    const htmlList = document.createElement('div');
    mapPropertiesToHtml(itemPropertiesObject, htmlList);
    htmlList.classList.add('gap-5', 'flex', 'flex-col');
    RIGHTSIDEPANELELEMENT.appendChild(htmlList)
  }

  //TODO: could use some work probably
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
      if (typeof list[value] === 'object' && list[value]) {
        propertyValue.innerText = list[value].value ? list[value].value : list[value].expressID;
      } else {
        propertyValue.innerText = list[value];
      }

      if (value == 'type') {
        propertyValue.innerText = generalProperties.typesList.find((type) => type.typeID == list[value]).typeName;
      }

      propertyRow.appendChild(propertyTitle);
      propertyRow.appendChild(propertyValue);
      htmlist.appendChild(propertyRow);
    }
  }


  return {
    updateRightSidePropsSync
  }
}
