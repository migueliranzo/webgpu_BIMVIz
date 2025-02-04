import ifcModelShaderCode from './shaders/PASS_LOADMODEL.wgsl?raw';
import computeForwardCode from './shaders/COMPUTE_HOVER.wgsl?raw';
import mainPassShaderCode from './shaders/PASS_DIRECTLIGHT.wgsl?raw';
import { getMVPMatrix, getProjectionMatrix, getViewMatrix, getWorldMatrix } from './math_utils.ts';
import { createInputHandler } from './deps/input.ts';
import { OrbitCamera } from './deps/camera.ts';
import { createActionsHandler } from './actions.ts'
import { vec3, mat4 } from 'wgpu-matrix'
import { createModelServiceHandle, getMeshGroupsHandler } from './testHandler.ts';

export function renderer(device: GPUDevice, canvas: HTMLCanvasElement, loadedModel: Map<number, { baseGeometry: { indexArray, vertexArray }, instances: [] }>, actionHandler: any, meshCount: number, meshLookUpIdOffsets: number[]) {
  const ALIGNED_SIZE = 256;
  const MAT4_SIZE = 4 * 16;
  const VEC4_SIZE = 4 * 4;
  const VEC3_SIZE = 4 * 3;
  const VEC2_SIZE = 4 * 2;
  const MESHTYPEUNDEFINED = 99;

  //Getting the context stuff here for now, not sure where it will go
  const context = canvas.getContext('webgpu')!;
  let canvasW = canvas.width;
  let canvasH = canvas.height;

  //Camera 
  const cameraSettings = {
    eye: vec3.create(2., 2.2, 8.0),
    target: vec3.create(0., 0.8, 2.)
  }

  const initialCameraPosition = cameraSettings.eye;
  const camera = new OrbitCamera({ position: initialCameraPosition })
  const inputHandler = createInputHandler(window, canvas);
  actionHandler.createLeftActions(camera);

  const ifcModelshaderModule = device.createShaderModule({
    code: ifcModelShaderCode,
  })

  const computeHoverShaderModule = device.createShaderModule({
    code: computeForwardCode,
  })

  const mainPassShaderModule = device.createShaderModule({
    code: mainPassShaderCode
  })

  context.configure({
    device: device,
    format: navigator.gpu.getPreferredCanvasFormat(),
    alphaMode: 'premultiplied',
  })

  //we loop here unless we need this data somehwere else as well
  //TODO: Make them use caps so its clear they are like magic number placeholders
  let verCountLd = 0;
  let indCountLd = 0;
  let instancesCountLd = 0;
  let instanceGroupCount = loadedModel.size;
  loadedModel.forEach((instanceGroup) => {
    verCountLd += instanceGroup.baseGeometry.vertexArray.byteLength;
    indCountLd += instanceGroup.baseGeometry.indexArray.byteLength;
    instancesCountLd += instanceGroup.instances ? instanceGroup.instances.length : instanceGroup.transparentInstances.length;
  })

  //Buffer creation
  const drawIndirectCommandBuffer = device.createBuffer({
    size: (loadedModel.size * 5) * 4,
    usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    label: 'drawCommandBuffer'
  })

  const mouseCoordsBuffer = device.createBuffer({
    size: VEC4_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  })

  const computeHoverOutputBuffer = device.createBuffer({
    size: loadedModel.size * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
  })

  const computeSelectedIdStagingBuffer = device.createBuffer({
    size: VEC4_SIZE,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
  })

  const computeSelectedIdBuffer = device.createBuffer({
    size: VEC4_SIZE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
  })

  const ifcModelVertexBuffer = device.createBuffer({
    size: verCountLd,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    label: 'instanceVertexBuffer'
  })

  const ifcModelIndexBuffer = device.createBuffer({
    size: indCountLd,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    label: 'instanceIndexBuffer'
  })

  const gBufferConstantsUniform = device.createBuffer({
    size: MAT4_SIZE + MAT4_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    label: 'gBufferConstantUniformsBuffer'
  })

  const gBufferInstanceOffsetBuffer = device.createBuffer({
    size: ALIGNED_SIZE * loadedModel.size,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    label: 'gBufferInstanceOffsetBuffer'
  })

  //TODO: Rename properly, no constants , AND THERE IS ACTUALLY A TIPO LMAOOO
  const gBufferInstnaceConstantsBuffer = device.createBuffer({
    size: instancesCountLd * (ALIGNED_SIZE / 2),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    label: 'gBufferInstnaceConstantsBuffer'
  })

  const gBufferMeshUniformBuffer = device.createBuffer({
    size: meshCount * VEC4_SIZE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'gBufferMeshUniformBuffer'
  })

  const typeStatesBuffer = device.createBuffer({
    size: ALIGNED_SIZE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'typeStatesBuffer'
  })

  //G Buffer textures
  //TODO: Rename has highlight
  const positionTexture = device.createTexture({
    size: { width: canvasW, height: canvasH },
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    format: 'rgba16float',
  });

  const albedoTexture = device.createTexture({
    size: { width: canvasW, height: canvasH },
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    format: 'rgba8unorm',
  });
  const normalTexture = device.createTexture({
    size: { width: canvasW, height: canvasH },
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    format: 'rgba16float',
  });
  const idTexture = device.createTexture({
    size: { width: canvasW, height: canvasH },
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    format: 'r32uint'
  })

  const depthTexture = device.createTexture({
    size: [canvas.width, canvas.height],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });


  //Bind groups - layouts
  const gBufferConstantsBindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'uniform', minBindingSize: MAT4_SIZE + MAT4_SIZE }
    }],
    label: 'gBufferConstantsBindGroupLayout'
  });

  const gBufferInstanceOffsetBindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'uniform', hasDynamicOffset: true }
    }],
    label: 'gBufferInstanceOffsetBindGroupLayout'
  });

  const gBufferInstanceConstantFormsBindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'read-only-storage' },
    }],
    label: 'gBufferInstanceConstantFormsBindGroupLayout'
  });

  const gBufferMeshUniformBindgroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'read-only-storage' }
    }, {
      binding: 1,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'read-only-storage' }
    },
    {
      binding: 2,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'read-only-storage' },
    },

    ]
  })


  const mainPassBindgroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
          sampleType: 'float',
        },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
          sampleType: 'float',
        },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
          sampleType: 'float',
        },
      },
      {
        binding: 3,
        visibility: GPUShaderStage.FRAGMENT,
        texture: {
          sampleType: 'uint',
        },
      },
    ]
  })

  const computeHoverBindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.COMPUTE,
      buffer: {
        type: 'storage'
      }
    },
    {
      binding: 1,
      visibility: GPUShaderStage.COMPUTE,
      buffer: {
        type: 'uniform', minBindingSize: VEC4_SIZE
      }
    },
    {
      binding: 2,
      visibility: GPUShaderStage.COMPUTE,
      texture: {
        sampleType: 'uint'
      }
    },
    {
      binding: 3,
      visibility: GPUShaderStage.COMPUTE,
      buffer: {
        type: 'storage',
      }
    },
    ]
  })

  //Bind groups - creation
  const gBufferConstantsBindGroup = device.createBindGroup({
    layout: gBufferConstantsBindGroupLayout,
    entries: [{
      binding: 0,
      resource: {
        buffer: gBufferConstantsUniform,
        size: MAT4_SIZE + MAT4_SIZE,
        offset: 0
      }
    }]
  });

  const gBufferInstanceOffsetBindGroup = device.createBindGroup({
    layout: gBufferInstanceOffsetBindGroupLayout,
    entries: [{
      binding: 0,
      resource: {
        buffer: gBufferInstanceOffsetBuffer,
        size: ALIGNED_SIZE,
        offset: 0
      }
    }]
  });

  const gBufferInstanceConstantsBindGroup = device.createBindGroup({
    layout: gBufferInstanceConstantFormsBindGroupLayout,
    entries: [{
      binding: 0,
      resource: {
        buffer: gBufferInstnaceConstantsBuffer,
      }
    }]
  });

  const gBufferMeshUniformBindGroup = device.createBindGroup({
    layout: gBufferMeshUniformBindgroupLayout,
    entries: [{
      binding: 0,
      resource: {
        buffer: gBufferMeshUniformBuffer,
      }
    },
    {
      binding: 1,
      resource: {
        buffer: typeStatesBuffer,
      }
    },
    {
      binding: 2,
      resource: {
        buffer: computeSelectedIdBuffer
      },
    }
    ]
  })


  const mainPassBindgroup = device.createBindGroup({
    layout: mainPassBindgroupLayout,
    entries: [
      { binding: 0, resource: positionTexture.createView() },
      { binding: 1, resource: normalTexture.createView() },
      { binding: 2, resource: albedoTexture.createView() },
      { binding: 3, resource: idTexture.createView() },
    ]
  })

  const computeHoverBindGroup = device.createBindGroup({
    layout: computeHoverBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: computeHoverOutputBuffer,
        }
      },
      {
        binding: 1,
        resource: {
          buffer: mouseCoordsBuffer,
          offset: 0,
          size: VEC4_SIZE,
        }
      },
      {
        binding: 2,
        resource: idTexture.createView()
      },
      {
        binding: 3,
        resource: {
          buffer: computeSelectedIdBuffer,
        }
      }
    ]
  })

  //Pipelines
  const mainPassPipeline = function() {
    const mainPassPipelineLayout: GPURenderPipelineDescriptor = {
      vertex: {
        module: mainPassShaderModule,
        entryPoint: 'vertex_main',
      },
      fragment: {
        module: mainPassShaderModule,
        entryPoint: 'fragment_main',
        targets: [
          {
            format: navigator.gpu.getPreferredCanvasFormat(),
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              }
            }
          }],
      },
      layout: device.createPipelineLayout({
        bindGroupLayouts: [mainPassBindgroupLayout],
      })
    }
    return device.createRenderPipeline(mainPassPipelineLayout)
  }();

  const gBufferPipeline = function() {
    const vertexBuffers: GPUVertexBufferLayout[] = [{
      attributes: [{
        shaderLocation: 0,
        offset: 0,
        format: 'float32x3',
      }, {
        shaderLocation: 1,
        offset: 4 * 3,
        format: 'float32x3'
      }],
      arrayStride: 4 * (3 + 3),
      stepMode: 'vertex'
    }];

    const pipelineDescriptor: GPURenderPipelineDescriptor = {
      vertex: {
        module: ifcModelshaderModule,
        entryPoint: 'vertex_main',
        buffers: vertexBuffers,
      },
      fragment: {
        module: ifcModelshaderModule,
        entryPoint: 'fragment_main',
        targets: [{
          format: 'rgba16float',
          blend: {
            color: {
              srcFactor: 'src-alpha',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
            alpha: {
              srcFactor: 'one',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            }
          }
        },
        { format: 'rgba16float' }, // worldNormal
        {
          format: 'rgba8unorm',
          blend: {
            color: {
              srcFactor: "src-alpha",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            },
            alpha: {
              srcFactor: "one",
              dstFactor: "one-minus-src-alpha",
              operation: "add",
            }
          }
        }, // albedo
        { format: 'r32uint' }, // Ids ,
        ]
      },
      primitive: {
        topology: 'triangle-list',
        frontFace: 'ccw',
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less-equal',
        format: 'depth24plus',
        depthBias: -100,
        depthBiasSlopeScale: 1,
        depthBiasClamp: 0,
      },
      layout: device.createPipelineLayout({
        bindGroupLayouts: [gBufferConstantsBindGroupLayout, gBufferInstanceConstantFormsBindGroupLayout, gBufferInstanceOffsetBindGroupLayout, gBufferMeshUniformBindgroupLayout],
      }),
    }
    return device.createRenderPipeline(pipelineDescriptor);
  }();

  const computeHoverPipeline = function() {
    const computePipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({
        bindGroupLayouts: [computeHoverBindGroupLayout],
      }),
      compute: {
        module: computeHoverShaderModule,
        entryPoint: 'main'
      }
    })
    return computePipeline;
  }();

  //Render passes
  const clearColor = { r: 0.0, g: 0.0, b: 0.0, a: 0.0 }
  const mainPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [{
      clearValue: clearColor,
      loadOp: 'clear',
      storeOp: 'store',
      view: context.getCurrentTexture().createView()
    }]
  }

  const ifcModelPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        view: positionTexture.createView(),
        clearValue: clearColor,
        loadOp: 'clear',
        storeOp: 'store',
      },
      {
        view: normalTexture.createView(),
        clearValue: clearColor,
        loadOp: 'clear',
        storeOp: 'store',
      },
      {
        view: albedoTexture.createView(),
        clearValue: clearColor,
        loadOp: 'clear',
        storeOp: 'store',
      },
      {
        view: idTexture.createView(),
        clearValue: clearColor,
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
    depthStencilAttachment: {
      view: depthTexture.createView(),
      depthClearValue: 1.,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  };

  //TODO: Cleanup and/or encapsulation
  let _offsetGeo = 0;
  let _offsetIndex = 0;
  let _offsetIndexBytes = 0;
  let _offsetGeoBytes = 0;
  let testI = 0;
  let instanceI = 0;
  let instanceGroupI = 0;
  let firstInstanceOffset = 0;
  const proMat = getProjectionMatrix(canvasW, canvasH);
  let vertexDataArray = new Float32Array(verCountLd / 4);
  const drawCommandsArray = new Uint32Array(loadedModel.size * 5);
  let indexDataArray = new Uint32Array(indCountLd / 4);
  let instanceDataArray = new ArrayBuffer(instancesCountLd * (16 * 4 + 3 * 4 + 1 * 4 + 12 * 4));
  let instanceDataArrayFloatView = new Float32Array(instanceDataArray);
  let instanceDataArrayUintView = new Uint32Array(instanceDataArray);
  let instanceUniformOffsetDataArray = new Uint32Array((loadedModel.size * ALIGNED_SIZE) / 4);
  let meshLookUpIdOffsetIndex = 0;
  const transparentInstancesGroups = new Map();

  const priorityDrawCalls = new Map();
  let standardDrawCalls = new Map();

  //TODO: should also be renamed and refactored
  const processInstanceGroups = (instanceGroup, _i) => {
    standardDrawCalls.set(_i, { offset: instanceGroupI });
    const instanceType = instanceGroup.instances ? 'instances' : 'transparentInstances';
    drawCommandsArray[testI] = instanceGroup.baseGeometry.indexArray.length; //Index count
    drawCommandsArray[testI + 1] = instanceGroup[instanceType].length; //Instance count
    drawCommandsArray[testI + 2] = _offsetIndex; //Index buffer offset was  _offsetIndex
    drawCommandsArray[testI + 3] = _offsetGeo//base vertex? was _offsetGeo
    drawCommandsArray[testI + 4] = 0;  //first instance? was firstInstanceOffset

    instanceUniformOffsetDataArray[instanceGroupI * (ALIGNED_SIZE / 4)] = firstInstanceOffset;
    vertexDataArray.set(instanceGroup.baseGeometry.vertexArray, _offsetGeoBytes / 4);
    indexDataArray.set(instanceGroup.baseGeometry.indexArray, _offsetIndexBytes / 4);
    firstInstanceOffset += instanceGroup[instanceType].length;

    instanceGroup[instanceType].forEach((instance: { color, flatTransform, lookUpId, meshExpressId }) => {
      let currOffset = ((16 * 4 + 3 * 4 + 1 * 4 + 12 * 4) / 4) * instanceI;
      instanceDataArrayFloatView.set(instance.flatTransform, currOffset);
      instanceDataArrayFloatView.set([instance.color.x, instance.color.y, instance.color.z, instance.color.w], currOffset + 16)
      instanceDataArrayUintView.set([(instance.lookUpId) + meshLookUpIdOffsets[meshLookUpIdOffsetIndex]], currOffset + 16 + 4);
      if (instance.lookUpId + 1 == meshLookUpIdOffsets[meshLookUpIdOffsetIndex + 1] && instanceI != 0) meshLookUpIdOffsetIndex += 1;
      instanceI++;
    })

    _offsetGeo += instanceGroup.baseGeometry.vertexArray.length / 6;
    _offsetIndexBytes += instanceGroup.baseGeometry.indexArray.byteLength;
    _offsetIndex += instanceGroup.baseGeometry.indexArray.length;
    _offsetGeoBytes += instanceGroup.baseGeometry.vertexArray.byteLength
    instanceGroupI++;
    testI += 5;

  }

  //TODO: refactor, since adding priority draw calls this is even more unnecessary 
  loadedModel.forEach((instanceGroup, _i) => {
    if (!instanceGroup.instances) {
      transparentInstancesGroups.set(_i, instanceGroup);
      return;
    }
    processInstanceGroups(instanceGroup, _i);
  })

  transparentInstancesGroups.forEach((instanceGroup, _i) => processInstanceGroups(instanceGroup, _i))

  console.log(standardDrawCalls)

  //Static buffers write
  device.queue.writeBuffer(gBufferInstanceOffsetBuffer, 0, instanceUniformOffsetDataArray)
  device.queue.writeBuffer(gBufferInstnaceConstantsBuffer, 0, instanceDataArray)
  device.queue.writeBuffer(drawIndirectCommandBuffer, 0, drawCommandsArray);
  device.queue.writeBuffer(gBufferConstantsUniform, 64, proMat);
  device.queue.writeBuffer(ifcModelVertexBuffer, 0, vertexDataArray);
  device.queue.writeBuffer(ifcModelIndexBuffer, 0, indexDataArray);

  console.log(instancesCountLd)

  let typesStatesBufferStrides = new Map<any, any>;
  {
    const meshGroupServiceHandler = getMeshGroupsHandler();
    let fetchedMeshLookUpIdsList = [];
    let fetchedMeshUniformsDataArray = [];
    const multiTypeMeshes = new Map<any, any>;
    let multiTypeMeshesTypesState = [];
    meshGroupServiceHandler.getMeshGroups().then(({ meshLookUpIdsList, meshTypeIdMap, typesIdStateMap, typeIdInstanceGroupId }) => {
      console.log(meshLookUpIdsList, meshTypeIdMap, typesIdStateMap, typeIdInstanceGroupId);
      fetchedMeshLookUpIdsList = meshLookUpIdsList;
      const meshUniformsDataArray = new Uint32Array((4) * meshLookUpIdsList.length);
      //TODO: Should be Uint not float
      const typeStatesDataArray = new Float32Array(typesIdStateMap.size * 4); //uint State + vec3 color for now 

      let i = 0;
      typesIdStateMap.forEach((typeIdObject) => {
        multiTypeMeshes.set(typeIdObject.stringType, []);
        const offset = (i * 4)
        typeStatesDataArray.set([...typeIdObject.color], offset);
        typeStatesDataArray.set([typeIdObject.state], offset + 3);
        typesStatesBufferStrides.set(typeIdObject.typeId, { stride: offset * 4, stringType: typeIdObject.stringType })
        i++
      })

      //TODO: Need to change the way we handle multitypes
      for (let i = 0; i < meshLookUpIdsList.length; i++) {
        const offset = ((4 * 4) / 4) * i;
        const meshExpressId = meshLookUpIdsList[i];
        const meshTypesString = meshTypeIdMap.get(meshExpressId);
        let meshTypeId = MESHTYPEUNDEFINED;

        if (meshTypesString) {
          const meshTypesStrings = meshTypeIdMap.get(meshExpressId).split(',');
          if (meshTypesStrings.length > 1) {
            for (let typeString of meshTypesStrings) {
              multiTypeMeshes.get(typeString)?.push(offset + 1);
            }
          }

          meshTypeId = typesIdStateMap.get(meshTypesStrings[0]).typeId;
        }

        meshUniformsDataArray[offset] = meshExpressId;
        meshUniformsDataArray[offset + 1] = meshTypeId;
        meshUniformsDataArray[offset + 2] = 1;
        meshUniformsDataArray[offset + 3] = 1;
      }


      fetchedMeshUniformsDataArray = meshUniformsDataArray;
      device.queue.writeBuffer(typeStatesBuffer, 0, typeStatesDataArray)
      device.queue.writeBuffer(gBufferMeshUniformBuffer, 0, meshUniformsDataArray)

      actionHandler.onMepSystemChange((value) => {
        let testType = typesStatesBufferStrides.get(value);

        standardDrawCalls = new Map([...standardDrawCalls, ...priorityDrawCalls]);
        priorityDrawCalls.clear();
        typeIdInstanceGroupId.get(value).forEach((instanceGroupId) => {
          const drawCallData = standardDrawCalls.get(instanceGroupId);
          priorityDrawCalls.set(instanceGroupId, drawCallData);
          standardDrawCalls.delete(instanceGroupId);
        });

        multiTypeMeshesTypesState = [];
        multiTypeMeshes.get(testType.stringType).forEach((multiTypeMeshOffset) => {
          multiTypeMeshesTypesState.push({ multiTypeMeshOffset, value });
          device.queue.writeBuffer(gBufferMeshUniformBuffer, (multiTypeMeshOffset * 4), Uint32Array.of(value));
        })

        const updatedTypeStatesDataArray = new Float32Array(typeStatesDataArray);
        updatedTypeStatesDataArray[testType.stride / 4 + 3] = 1;
        device.queue.writeBuffer(typeStatesBuffer, 0, updatedTypeStatesDataArray)
      });
    })

    meshGroupServiceHandler.treeListSelectionOnChange((toggledMeshesIdSet: Set<number>) => {
      for (let e = 0; e < fetchedMeshUniformsDataArray.length; e += 4) {
        fetchedMeshUniformsDataArray[e + 2] = 1;
        if (toggledMeshesIdSet.has(fetchedMeshUniformsDataArray[e])) {
          fetchedMeshUniformsDataArray[e + 2] = 0;
        }
      }
      device.queue.writeBuffer(gBufferMeshUniformBuffer, 0, fetchedMeshUniformsDataArray);

      //TODO: Refactor multitypes
      multiTypeMeshesTypesState.forEach((typeState) => {
        device.queue.writeBuffer(gBufferMeshUniformBuffer, (typeState.multiTypeMeshOffset * 4), Uint32Array.of(typeState.value));
      })
    })

    meshGroupServiceHandler.treeListHoverOnChange((hoveredMeshesIdSet: Set<number>) => {
      for (let e = 0; e < fetchedMeshUniformsDataArray.length; e += 4) {
        if (hoveredMeshesIdSet.has(fetchedMeshUniformsDataArray[e])) {
          fetchedMeshUniformsDataArray[e + 3] = 0;
        } else {
          fetchedMeshUniformsDataArray[e + 3] = 1;
        }
      }
      device.queue.writeBuffer(gBufferMeshUniformBuffer, 0, fetchedMeshUniformsDataArray);

      //TODO: Refactor multitypes
      multiTypeMeshesTypesState.forEach((typeState) => {
        device.queue.writeBuffer(gBufferMeshUniformBuffer, (typeState.multiTypeMeshOffset * 4), Uint32Array.of(typeState.value));
      })
    })

  }

  let previousSelectedId = 0;
  const updateId = (currentId: number) => {
    if (currentId != previousSelectedId) {
      actionHandler.updateSelectedId(currentId);
      previousSelectedId = currentId;
    }
  }

  let lastFrameMS = Date.now()
  const fpsElem = document.querySelector("#fps")!;
  let frameCount = 0;
  //TODO: Refine the render function
  async function render() {

    frameCount++;
    const now = Date.now();
    const deltaTime = (now - lastFrameMS) / 1000;
    const commandEnconder = device.createCommandEncoder();
    lastFrameMS = now;
    const fps = 1 / deltaTime;             // compute frames per second
    fpsElem.textContent = fps.toFixed(1);

    let canvasView = context.getCurrentTexture().createView();
    mainPassDescriptor.colorAttachments[0].view = canvasView;

    let cameraMatrix = camera.update(deltaTime, { ...inputHandler() });
    device.queue.writeBuffer(gBufferConstantsUniform, 0, cameraMatrix);

    const gBufferPassEncoder = commandEnconder.beginRenderPass(ifcModelPassDescriptor);
    gBufferPassEncoder.setPipeline(gBufferPipeline);


    gBufferPassEncoder.setBindGroup(0, gBufferConstantsBindGroup);
    gBufferPassEncoder.setBindGroup(1, gBufferInstanceConstantsBindGroup);
    gBufferPassEncoder.setBindGroup(3, gBufferMeshUniformBindGroup);
    gBufferPassEncoder.setVertexBuffer(0, ifcModelVertexBuffer, 0);
    gBufferPassEncoder.setIndexBuffer(ifcModelIndexBuffer, 'uint32', 0);

    priorityDrawCalls.forEach((drawCall) => {
      gBufferPassEncoder.setBindGroup(2, gBufferInstanceOffsetBindGroup, [drawCall.offset * ALIGNED_SIZE]);
      gBufferPassEncoder.drawIndexedIndirect(drawIndirectCommandBuffer, drawCall.offset * (4 * 5));
    });

    standardDrawCalls.forEach((drawCall) => {
      gBufferPassEncoder.setBindGroup(2, gBufferInstanceOffsetBindGroup, [drawCall.offset * ALIGNED_SIZE]);
      gBufferPassEncoder.drawIndexedIndirect(drawIndirectCommandBuffer, drawCall.offset * (4 * 5));
    });

    gBufferPassEncoder.end();

    const computePassEncoder = commandEnconder.beginComputePass();
    computePassEncoder.setPipeline(computeHoverPipeline);
    device.queue.writeBuffer(mouseCoordsBuffer, 0, Float32Array.of(inputHandler().mouseHover.x, inputHandler().mouseHover.y, inputHandler().mouseClickState.clickReg, inputHandler().mouseClickState.lastClickReg));
    computePassEncoder.setBindGroup(0, computeHoverBindGroup);
    computePassEncoder.dispatchWorkgroups(Math.ceil(1000 / 64));
    computePassEncoder.end();

    const mainPassEncoder = commandEnconder.beginRenderPass(mainPassDescriptor);
    mainPassEncoder.setPipeline(mainPassPipeline);
    mainPassEncoder.setBindGroup(0, mainPassBindgroup);
    mainPassEncoder.draw(3)
    mainPassEncoder.end();

    //This just handles reading the data on JS for testing purposes
    commandEnconder.copyBufferToBuffer(
      computeSelectedIdBuffer,
      0,
      computeSelectedIdStagingBuffer,
      0,
      VEC4_SIZE,
    )

    device.queue.submit([commandEnconder.finish()]);

    await computeSelectedIdStagingBuffer.mapAsync(
      GPUMapMode.READ,
      0,
      VEC4_SIZE
    );

    const copyArrayBuffer = computeSelectedIdStagingBuffer.getMappedRange(0, VEC4_SIZE);
    const data = copyArrayBuffer.slice();
    //console.log(new Float32Array(data));
    updateId(new Float32Array(data)[0])
    computeSelectedIdStagingBuffer.unmap();

    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

}
