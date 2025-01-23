export function createItemspropertyarrayhandle(items: Map<any, any>) {

  return {
    getItemProperties(id) {
      return { ...items.get(id) };
    },
  }
}

export function createDataViewModel(typesList: []) {
  const RIGHTSIDEPANELELEMENT = document.getElementById('rightSidePropertiesPanel')!;

  const updateRightSidePropsSync = function(propertyList) {
    const htmlList = document.createElement('div');
    mapPropertiesToHtml(propertyList, htmlList);
    htmlList.classList.add('gap-5', 'flex', 'flex-col');
    RIGHTSIDEPANELELEMENT.appendChild(htmlList)
  }

  //TODO: could use some work probably
  function mapPropertiesToHtml(list: any, htmlist: HTMLDivElement) {
    RIGHTSIDEPANELELEMENT.childNodes[0]?.remove()
    const title = document.createElement('div');
    title.classList.add('rightSidePanelHeader');
    title.innerText = 'Objects properties'
    htmlist.appendChild(title);
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
        propertyValue.innerText = typesList.find((type) => type.typeID == list[value]).typeName;
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
