export function createItemspropertyarrayhandle(items: Map<any, any>) {

  return {
    getItemProperties(id) {
      return { ...items.get(id) };
    },
  }
}

export function createDataViewModel(typesList: []) {
  const RIGHTSIDEPANELELEMENT = document.getElementById('rightSidePropertiesPanel')!;

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
