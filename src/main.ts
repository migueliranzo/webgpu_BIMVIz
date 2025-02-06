import { createActionsHandler } from './actions.ts';
import { renderer } from './renderer.ts'
import { IfcAPI, ms, IFCUNITASSIGNMENT } from 'web-ifc';
import { setUpRightPanelItemProperties, createItemspropertyarrayhandle, setUpLeftPanelTreeView } from './dataViewModel.ts';
import { createFileHandler } from './ifcLoader.ts';
import { createModelService } from './modelService.ts';

//WebGPU Setup
async function initializeWebGPU(): Promise<any> {
  if (!navigator.gpu) {
    throw Error("WebGPU not supported");
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw Error("Couldn't request WebGPU adapter");
  }

  const device = await adapter.requestDevice();
  const canvas = document.getElementById('canvas_main_render_target') as HTMLCanvasElement;
  canvas.width = document.body.clientWidth;
  canvas.height = document.body.clientHeight;

  return { device, canvas };
}

//Model Loading
async function loadModelFiles(): Promise<Uint8Array[]> {
  const fileBuffer = await fetch('ifc/NBU_Duplex/NBU_Duplex-Apt_Eng-MEP.ifc')
    .then((response) => response.arrayBuffer());
  const fileBufferArch = await fetch('ifc/NBU_Duplex/NBU_Duplex-Apt_Arch.ifc')
    .then((response) => response.arrayBuffer());

  return [
    new Uint8Array(fileBuffer),
    new Uint8Array(fileBufferArch)
  ];
}

//Process models
async function processModels(filesToParse: Uint8Array[]) {
  const modelInstancesPromises = [];
  const modelPropertiesPromises = [];
  const modelItemsPropertiesPromises = [];
  const meshLookUpIdOffsets = [0];

  for (const fileBuffer of filesToParse) {
    const fileHandler = createFileHandler(fileBuffer)().parseIfcFileWithWorker;
    modelInstancesPromises.push(fileHandler().geoPromise);
    modelItemsPropertiesPromises.push(fileHandler().itemPropertiesPromise);
    modelPropertiesPromises.push(fileHandler().generalPropertiesPromise);
  }

  //Process model instances
  const modelInstances = await Promise.all(modelInstancesPromises);
  const { parsedModelInstancesMap, parsedModelMeshCount } = modelInstances.reduce((merged, obj) => {
    meshLookUpIdOffsets.push(merged.parsedModelMeshCount);
    return {
      parsedModelInstancesMap: new Map([...merged.parsedModelInstancesMap, ...obj.parsedModelInstancesMap]),
      parsedModelMeshCount: merged.parsedModelMeshCount + obj.parsedModelMeshCount
    };
  });

  return {
    parsedModelInstancesMap,
    parsedModelMeshCount,
    meshLookUpIdOffsets,
    modelItemsPropertiesPromises,
    modelPropertiesPromises
  };
}

function processGeneralProperties(mergedModelGeneralProperties, parsedModelInstancesMap) {
  const typeIdInstanceGroupId = new Map<any, any>;
  mergedModelGeneralProperties.typesIdStateMap.forEach((typeStateObject) => {
    typeIdInstanceGroupId.set(typeStateObject.typeId, []);
  })

  parsedModelInstancesMap.forEach((instanceGroup, _i) => {
    instanceGroup.instances?.forEach((instance) => {
      const instanceTypeStrings = mergedModelGeneralProperties.meshTypeIdMap.get(instance.meshExpressId);
      if (instanceTypeStrings != undefined) {
        const meshTypesStrings = instanceTypeStrings.split(',');
        for (let typeString of meshTypesStrings) {
          const instanceTypeId = mergedModelGeneralProperties.typesIdStateMap.get(typeString)?.typeId;
          if ((instanceTypeId != undefined) && !typeIdInstanceGroupId.get(instanceTypeId).includes(_i)) {
            typeIdInstanceGroupId.get(instanceTypeId).push(_i);
          }
        }
      }
    })
  })

  return { ...mergedModelGeneralProperties, typeIdInstanceGroupId };
}

//View Models setup
async function setupViewModels(
  parsedModelInstancesMap: any,
  modelItemsPropertiesPromises: Promise<any>[],
  modelPropertiesPromises: Promise<any>[],
  actionHandler: any
) {
  //Process item properties
  const modelItemsProperties = await Promise.all(modelItemsPropertiesPromises);
  const { itemPropertiesMap, typesList } = modelItemsProperties.reduce((merged, obj) => {
    Object.entries(obj).forEach(([key, value]) => {
      if (value instanceof Map) {
        merged[key] = merged[key] instanceof Map ? new Map([...merged[key], ...value]) : new Map(value);
      } else if (Array.isArray(value)) {
        merged[key] = merged[key] ? [...merged[key], ...value] : [...value];
      } else {
        merged[key] = value;
      }
    });
    return merged;
  });

  //Property handlers setup
  const itemspropertyarrayhandle = createItemspropertyarrayhandle(itemPropertiesMap);
  const viewModelHandler = setUpRightPanelItemProperties(typesList);
  actionHandler.onSelectedIdChange((newSelectedId: number) => {
    viewModelHandler.updateRightSidePropsSync(itemspropertyarrayhandle.getItemProperties(newSelectedId));
  });

  //Process general properties
  const modelGeneralProperties = await Promise.all(modelPropertiesPromises);
  const mergedModelGeneralProperties = modelGeneralProperties.reduce((merged, obj) => {
    Object.entries(obj).forEach(([key, value]) => {
      if (value instanceof Map) {
        merged[key] = merged[key] instanceof Map ? new Map([...merged[key], ...value]) : new Map(value);
      }
      else if (Array.isArray(value)) {
        merged[key] = merged[key] ? [...merged[key], ...value] : [...value];
      }
      else if (value.hasOwnProperty('children')) {
        merged[key] = !merged[key] ? [value] : Array.isArray(merged[key]) ? [...merged[key], value] : [merged[key], value];
      }
      else {
        merged[key] = value;
      }
    });
    return merged;
  })

  actionHandler.setUpMepSelectionPanel(mergedModelGeneralProperties.typesIdStateMap)
  return processGeneralProperties(mergedModelGeneralProperties, parsedModelInstancesMap);
}

async function init() {
  const start = ms();

  //Initialize WebGPU context
  const { device, canvas } = await initializeWebGPU();

  //Process file models
  const filesToParse = await loadModelFiles();
  const {
    parsedModelInstancesMap,
    parsedModelMeshCount,
    meshLookUpIdOffsets,
    modelItemsPropertiesPromises,
    modelPropertiesPromises
  } = await processModels(filesToParse);

  //Action handler and renderer setup
  const actionHandler = createActionsHandler();
  console.log("🖌️", ms() - start);
  renderer(
    device,
    canvas,
    parsedModelInstancesMap,
    actionHandler,
    parsedModelMeshCount,
    meshLookUpIdOffsets
  );

  //View models and properties setup
  const mergedModelGeneralProperties = await setupViewModels(
    parsedModelInstancesMap,
    modelItemsPropertiesPromises,
    modelPropertiesPromises,
    actionHandler
  );

  //Tree view and model service setup
  const leftPanelTreeEvents = setUpLeftPanelTreeView(mergedModelGeneralProperties.modelTreeStructure);
  createModelService({
    ...mergedModelGeneralProperties,
    dataEvents: leftPanelTreeEvents
  });
}

init();
