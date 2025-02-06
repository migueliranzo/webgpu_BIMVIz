import gBufferShaderCode from './shaders/PASS_GBUFFER.wgsl?raw';
import computeForwardCode from './shaders/COMPUTE_HOVER.wgsl?raw';
import mainPassShaderCode from './shaders/PASS_MAIN.wgsl?raw';
import { getMVPMatrix, getProjectionMatrix, getViewMatrix, getWorldMatrix } from './math_utils.ts';
import { createInputHandler } from './deps/input.ts';
import { OrbitCamera } from './deps/camera.ts';
import { vec3, mat4 } from 'wgpu-matrix'
import { getMeshGroupsHandler, createMultitypeMeshesHandler } from './modelService.ts';
import { processInstanceGroups } from './DataManager.ts';

const RENDERER_CONSTANTS = {
  ALIGNED_SIZE: 256,
  MAT4_SIZE: 4 * 16,
  VEC4_SIZE: 4 * 4,
  VEC3_SIZE: 4 * 3,
  VEC2_SIZE: 4 * 2,
} as const;

class BufferManager {
  private device: GPUDevice;
  private buffers: Map<string, GPUBuffer> = new Map();

  constructor(device: GPUDevice) {
    this.device = device;
  }

  createBuffer(name: string, descriptor: GPUBufferDescriptor): GPUBuffer {
    const buffer = this.device.createBuffer(descriptor);
    this.buffers.set(name, buffer);
    return buffer;
  }

  getBuffer(name: string): GPUBuffer {
    return this.buffers.get(name)!;
  }
}

class PipelineManager {
  private device: GPUDevice;
  private pipelines: Map<string, GPURenderPipeline | GPUComputePipeline> = new Map();

  constructor(device: GPUDevice) {
    this.device = device;
  }

  createRenderPipeline(name: string, descriptor: GPURenderPipelineDescriptor): GPURenderPipeline {
    const pipeline = this.device.createRenderPipeline(descriptor);
    this.pipelines.set(name, pipeline);
    return pipeline;
  }

  createComputePipeline(name: string, descriptor: GPUComputePipelineDescriptor): GPUComputePipeline {
    const pipeline = this.device.createComputePipeline(descriptor);
    this.pipelines.set(name, pipeline);
    return pipeline;
  }

  getPipeline(name: string): GPURenderPipeline | GPUComputePipeline {
    return this.pipelines.get(name)!
  }
}


export function renderer(device: GPUDevice, canvas: HTMLCanvasElement, loadedModel: Map<number, { baseGeometry: { indexArray, vertexArray }, instances: [] }>, actionHandler: any, meshCount: number, meshLookUpIdOffsets: number[]) {

  //Init context and managers
  const contextSettings = initializeContext(device, canvas);
  const bufferManager = new BufferManager(device);
  const pipelineManager = new PipelineManager(device);
  const { camera, inputHandler } = initializeInputAndCamera(canvas);
  const { modelAttributes, shortedInstanceGroups } = calculateModelAttributesAndShortInstanceGroups(loadedModel);
  actionHandler.createLeftActions(camera);

  //Create webgpu resources
  createBuffers(bufferManager, { ...modelAttributes, meshCount });
  const textures = createTextures(device, canvas);
  const bindGroupLayouts = createBindGroupLayouts(device);
  const bindGroups = createBindGroups(device, bufferManager, textures, bindGroupLayouts);
  createPipelines(pipelineManager, device, bindGroupLayouts);
  const passDescriptors = createPassDescriptors(contextSettings, textures);

  //Static buffer writes
  const proMat = getProjectionMatrix(canvas.width, canvas.height);
  device.queue.writeBuffer(bufferManager.getBuffer('gBufferConstantsUniform'), 64, proMat);

  //Process instance groups
  const processedInstanceGroups = processInstanceGroups(shortedInstanceGroups, meshLookUpIdOffsets, modelAttributes);
  device.queue.writeBuffer(bufferManager.getBuffer('gBufferInstanceUniformsOffsetsBuffer'), 0, processedInstanceGroups.instanceUniformsOffsetsDataArray)
  device.queue.writeBuffer(bufferManager.getBuffer('gBufferInstanceUniformsBuffer'), 0, processedInstanceGroups.instanceDataArray)
  device.queue.writeBuffer(bufferManager.getBuffer('drawIndirectCommandBuffer'), 0, processedInstanceGroups.drawCommandsDataArray);
  device.queue.writeBuffer(bufferManager.getBuffer('ifcModelVertexBuffer'), 0, processedInstanceGroups.vertexDataArray);
  device.queue.writeBuffer(bufferManager.getBuffer('ifcModelIndexBuffer'), 0, processedInstanceGroups.indexDataArray);

  //Setup draw calls
  const priorityDrawCalls = new Map();
  let standardDrawCalls = processedInstanceGroups.drawCalls;

  //Handle async model properties
  const meshGroupServiceHandler = getMeshGroupsHandler();
  const getMultitypeMeshHandler = createMultitypeMeshesHandler();

  meshGroupServiceHandler.getMeshUniformsData().then((meshDataResponse) => {
    device.queue.writeBuffer(bufferManager.getBuffer('gBufferMeshUniformBuffer'), 0, meshDataResponse.meshUniformsDataArray)
  });

  meshGroupServiceHandler.getTypeData().then((typeDataResponse) => {
    device.queue.writeBuffer(bufferManager.getBuffer('typeStatesBuffer'), 0, typeDataResponse.typesDataArray)
  })

  //Setup events
  meshGroupServiceHandler.getDataEvents().then((dataEvents: { treeListSelectionOnChange, treeListHoverOnChange }) => {
    dataEvents.treeListSelectionOnChange((toggledMeshesIdSet: Set<number>) => {
      try {
        const storedMeshUniformsDataArray = meshGroupServiceHandler.getStoredMeshData().meshUniformsDataArray;
        for (let e = 0; e < storedMeshUniformsDataArray.length; e += 4) {
          storedMeshUniformsDataArray[e + 2] = 1;
          if (toggledMeshesIdSet.has(storedMeshUniformsDataArray[e])) {
            storedMeshUniformsDataArray[e + 2] = 0;
          }
        }
        device.queue.writeBuffer(bufferManager.getBuffer('gBufferMeshUniformBuffer'), 0, storedMeshUniformsDataArray);
        getMultitypeMeshHandler().bufferWriteQueueState.applyQueue();
      } catch (error) {
        console.log("Data still loading...")
      }
    })

    dataEvents.treeListHoverOnChange((hoveredMeshesIdSet: Set<number>) => {
      try {
        const storedMeshUniformsDataArray = meshGroupServiceHandler.getStoredMeshData().meshUniformsDataArray;
        for (let e = 0; e < storedMeshUniformsDataArray.length; e += 4) {
          if (hoveredMeshesIdSet.has(storedMeshUniformsDataArray[e])) {
            storedMeshUniformsDataArray[e + 3] = 0;
          } else {
            storedMeshUniformsDataArray[e + 3] = 1;
          }
        }
        device.queue.writeBuffer(bufferManager.getBuffer('gBufferMeshUniformBuffer'), 0, storedMeshUniformsDataArray);
        getMultitypeMeshHandler().bufferWriteQueueState.applyQueue();
      } catch (error) {
        console.log("Data still loading...")
      }
    })
  })

  actionHandler.onMepSystemChange((newSelectedTypeId: number) => {
    try {
      let selectedTypeData = meshGroupServiceHandler.getStoredTypeData().typesBufferStrides.get(newSelectedTypeId);
      standardDrawCalls = new Map([...standardDrawCalls, ...priorityDrawCalls]);
      priorityDrawCalls.clear();
      meshGroupServiceHandler.getCachedResults().typeIdInstanceGroupId.get(newSelectedTypeId).forEach((instanceGroupIdWithNewType) => {
        const drawCallData = standardDrawCalls.get(instanceGroupIdWithNewType);
        priorityDrawCalls.set(instanceGroupIdWithNewType, drawCallData);
        standardDrawCalls.delete(instanceGroupIdWithNewType);
      });

      getMultitypeMeshHandler().bufferWriteQueueState.clearQueue();
      meshGroupServiceHandler.storedMultiTypeMeshes.get(selectedTypeData.stringType).forEach((multiTypeMeshOffset) => {
        getMultitypeMeshHandler().bufferWriteQueueState.addToQueue(() => device.queue.writeBuffer(bufferManager.getBuffer('gBufferMeshUniformBuffer'), (multiTypeMeshOffset * 4), Uint32Array.of(newSelectedTypeId)));
      })
      getMultitypeMeshHandler().bufferWriteQueueState.applyQueue();
      const updatedTypeStatesDataArray = new Float32Array(meshGroupServiceHandler.getStoredTypeData().typesDataArray);
      updatedTypeStatesDataArray[selectedTypeData.stride / 4 + 3] = 1;
      device.queue.writeBuffer(bufferManager.getBuffer('typeStatesBuffer'), 0, updatedTypeStatesDataArray)
    } catch (error) {
      console.log("Data still loading...")
    }
  });

  //Setup object hover selection
  let previousSelectedId = 0;
  const updateId = (currentId: number) => {
    if (currentId != previousSelectedId) {
      actionHandler.updateSelectedId(currentId);
      previousSelectedId = currentId;
    }
  }

  //Setup fps counter
  let lastFrameMS = Date.now()
  const fpsElem = document.querySelector("#fps")!;

  //Render loop
  async function renderLoop() {
    const now = Date.now();
    const deltaTime = (now - lastFrameMS) / 1000;
    const commandEnconder = device.createCommandEncoder();
    lastFrameMS = now;
    const fps = 1 / deltaTime;
    fpsElem.textContent = fps.toFixed(1);

    const canvasView = contextSettings.getCurrentTexture().createView();
    passDescriptors.mainPassDescriptor.colorAttachments[0].view = canvasView;

    device.queue.writeBuffer(bufferManager.getBuffer('gBufferConstantsUniform'), 0, camera.update(deltaTime, { ...inputHandler() }));

    const gBufferPassEncoder = commandEnconder.beginRenderPass(passDescriptors.ifcModelPassDescriptor);
    gBufferPassEncoder.setPipeline(pipelineManager.getPipeline('gBufferPipeline'));

    gBufferPassEncoder.setBindGroup(0, bindGroups.gBufferConstantsBindGroup);
    gBufferPassEncoder.setBindGroup(1, bindGroups.gBufferInstanceUniformsBindGroup);
    gBufferPassEncoder.setBindGroup(3, bindGroups.gBufferMeshUniformBindGroup);
    gBufferPassEncoder.setVertexBuffer(0, bufferManager.getBuffer('ifcModelVertexBuffer'), 0);
    gBufferPassEncoder.setIndexBuffer(bufferManager.getBuffer('ifcModelIndexBuffer'), 'uint32', 0);

    priorityDrawCalls.forEach((drawCall) => {
      gBufferPassEncoder.setBindGroup(2, bindGroups.gBufferInstanceUniformsOffsetsBindGroup, [drawCall.offset * RENDERER_CONSTANTS.ALIGNED_SIZE]);
      gBufferPassEncoder.drawIndexedIndirect(bufferManager.getBuffer('drawIndirectCommandBuffer'), drawCall.offset * (4 * 5));
    });

    standardDrawCalls.forEach((drawCall) => {
      gBufferPassEncoder.setBindGroup(2, bindGroups.gBufferInstanceUniformsOffsetsBindGroup, [drawCall.offset * RENDERER_CONSTANTS.ALIGNED_SIZE]);
      gBufferPassEncoder.drawIndexedIndirect(bufferManager.getBuffer('drawIndirectCommandBuffer'), drawCall.offset * (4 * 5));
    });

    gBufferPassEncoder.end();

    const computePassEncoder = commandEnconder.beginComputePass();
    computePassEncoder.setPipeline(pipelineManager.getPipeline('computeHoverPipeline'));
    device.queue.writeBuffer(bufferManager.getBuffer('mouseCoordsBuffer'), 0, Float32Array.of(
      inputHandler().mouseHover.x,
      inputHandler().mouseHover.y,
      inputHandler().mouseClickState.clickReg,
      inputHandler().mouseClickState.lastClickReg)
    );
    computePassEncoder.setBindGroup(0, bindGroups.computeHoverBindGroup);
    computePassEncoder.dispatchWorkgroups(1);
    computePassEncoder.end();

    const mainPassEncoder = commandEnconder.beginRenderPass(passDescriptors.mainPassDescriptor);
    mainPassEncoder.setPipeline(pipelineManager.getPipeline('mainPassPipeline'));
    mainPassEncoder.setBindGroup(0, bindGroups.mainPassBindgroup);
    mainPassEncoder.draw(3)
    mainPassEncoder.end();

    commandEnconder.copyBufferToBuffer(
      bufferManager.getBuffer('computeSelectedIdBuffer'),
      0,
      bufferManager.getBuffer('computeSelectedIdStagingBuffer'),
      0,
      RENDERER_CONSTANTS.VEC4_SIZE,
    )

    device.queue.submit([commandEnconder.finish()]);

    await bufferManager.getBuffer('computeSelectedIdStagingBuffer').mapAsync(
      GPUMapMode.READ,
      0,
      RENDERER_CONSTANTS.VEC4_SIZE
    );

    const copyArrayBuffer = bufferManager.getBuffer('computeSelectedIdStagingBuffer').getMappedRange(0, RENDERER_CONSTANTS.VEC4_SIZE);
    const data = copyArrayBuffer.slice();
    //console.log(new Float32Array(data));
    updateId(new Float32Array(data)[0])
    bufferManager.getBuffer('computeSelectedIdStagingBuffer').unmap();

    requestAnimationFrame(renderLoop);
  }
  requestAnimationFrame(renderLoop);

}

//Supporting functions
function initializeContext(device: GPUDevice, canvas: HTMLCanvasElement) {
  const contextSettings = canvas.getContext('webgpu')!;
  contextSettings.configure({
    device: device,
    format: navigator.gpu.getPreferredCanvasFormat(),
    alphaMode: 'premultiplied',
  })
  return contextSettings;
}

function initializeInputAndCamera(canvas: HTMLCanvasElement) {
  const cameraSettings = {
    eye: vec3.create(2., 2.2, 8.0),
    target: vec3.create(0., 0.8, 2.)
  }
  const camera = new OrbitCamera({ position: cameraSettings.eye })
  const inputHandler = createInputHandler(window, canvas);

  return { camera, inputHandler }
}

function calculateModelAttributesAndShortInstanceGroups(loadedModel: Map<number, { baseGeometry: { indexArray, vertexArray }, instances?: [], transparentInstances?: [] }>) {
  const modelAttributes = { verCount: 0, indCount: 0, instancesCount: 0, instanceGroupsCount: loadedModel.size };
  const shortedInstanceGroups = function(): Map<any, any> {
    const transparentInstanceGroups = new Map();
    const opaqueInstanceGroups = new Map();

    loadedModel.forEach((instanceGroup, _i) => {
      modelAttributes.verCount += instanceGroup.baseGeometry.vertexArray.byteLength;
      modelAttributes.indCount += instanceGroup.baseGeometry.indexArray.byteLength;
      modelAttributes.instancesCount += instanceGroup.instances ? instanceGroup.instances.length : instanceGroup.transparentInstances!.length;
      instanceGroup.instances ? opaqueInstanceGroups.set(_i, instanceGroup) : transparentInstanceGroups.set(_i, instanceGroup);
    })
    return new Map([...opaqueInstanceGroups, ...transparentInstanceGroups]);
  }();

  return { modelAttributes, shortedInstanceGroups };
}

function createBuffers(bufferManager: BufferManager, modelAttributes: { verCount, indCount, instancesCount, instanceGroupsCount, meshCount }) {

  bufferManager.createBuffer('drawIndirectCommandBuffer', {
    size: (modelAttributes.instanceGroupsCount * 5) * 4,
    usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    label: 'drawIndirectCommandBuffer'
  })

  bufferManager.createBuffer('mouseCoordsBuffer', {
    size: RENDERER_CONSTANTS.VEC4_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  })

  bufferManager.createBuffer('computeHoverOutputBuffer', {
    size: modelAttributes.instanceGroupsCount * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
  })

  bufferManager.createBuffer('computeSelectedIdStagingBuffer', {
    size: RENDERER_CONSTANTS.VEC4_SIZE,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
  })

  bufferManager.createBuffer('computeSelectedIdBuffer', {
    size: RENDERER_CONSTANTS.VEC4_SIZE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
  })

  bufferManager.createBuffer('ifcModelVertexBuffer', {
    size: modelAttributes.verCount,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    label: 'instanceVertexBuffer'
  })

  bufferManager.createBuffer('ifcModelIndexBuffer', {
    size: modelAttributes.indCount,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    label: 'instanceIndexBuffer'
  })

  bufferManager.createBuffer('gBufferConstantsUniform', {
    size: RENDERER_CONSTANTS.MAT4_SIZE + RENDERER_CONSTANTS.MAT4_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    label: 'gBufferConstantUniformsBuffer'
  })

  bufferManager.createBuffer('gBufferInstanceUniformsOffsetsBuffer', {
    size: RENDERER_CONSTANTS.ALIGNED_SIZE * modelAttributes.instanceGroupsCount,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    label: 'gBufferInstanceUniformsOffsetsBuffer'
  })

  bufferManager.createBuffer('gBufferInstanceUniformsBuffer', {
    size: modelAttributes.instancesCount * (RENDERER_CONSTANTS.ALIGNED_SIZE / 2),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    label: 'gBufferInstanceUniformsBuffer'
  })

  bufferManager.createBuffer('gBufferMeshUniformBuffer', {
    size: modelAttributes.meshCount * RENDERER_CONSTANTS.VEC4_SIZE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'gBufferMeshUniformBuffer'
  })

  bufferManager.createBuffer('typeStatesBuffer', {
    size: RENDERER_CONSTANTS.ALIGNED_SIZE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'typeStatesBuffer'
  })

}

function createTextures(device: GPUDevice, canvas: HTMLCanvasElement) {
  const highlightTexture = device.createTexture({
    size: { width: canvas.width, height: canvas.height },
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    format: 'rgba16float',
  });

  const albedoTexture = device.createTexture({
    size: { width: canvas.width, height: canvas.height },
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    format: 'rgba8unorm',
  });
  const normalTexture = device.createTexture({
    size: { width: canvas.width, height: canvas.height },
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    format: 'rgba16float',
  });
  const idTexture = device.createTexture({
    size: { width: canvas.width, height: canvas.height },
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    format: 'r32uint'
  })

  const depthTexture = device.createTexture({
    size: { width: canvas.width, height: canvas.height },
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });

  return { highlightTexture, albedoTexture, normalTexture, idTexture, depthTexture };
}

function createBindGroupLayouts(device: GPUDevice) {

  const gBufferConstantsBindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'uniform', minBindingSize: RENDERER_CONSTANTS.MAT4_SIZE + RENDERER_CONSTANTS.MAT4_SIZE }
    }],
    label: 'gBufferConstantsBindGroupLayout'
  });

  const gBufferInstanceUniformsOffsetsBindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'uniform', hasDynamicOffset: true }
    }],
    label: 'gBufferInstanceUniformsOffsetsBindGroupLayout'
  });


  const gBufferInstanceUniformsBindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'read-only-storage' },
    }],
    label: 'gBufferInstanceUniformsBindGroupLayout'
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
        type: 'uniform', minBindingSize: RENDERER_CONSTANTS.VEC4_SIZE
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

  return { gBufferConstantsBindGroupLayout, gBufferInstanceUniformsOffsetsBindGroupLayout, gBufferInstanceUniformsBindGroupLayout, gBufferMeshUniformBindgroupLayout, mainPassBindgroupLayout, computeHoverBindGroupLayout }

}

function createBindGroups(device: GPUDevice, bufferManager: BufferManager, textures, bindGroupLayouts) {

  const gBufferConstantsBindGroup = device.createBindGroup({
    layout: bindGroupLayouts.gBufferConstantsBindGroupLayout,
    entries: [{
      binding: 0,
      resource: {
        buffer: bufferManager.getBuffer('gBufferConstantsUniform'),
        size: RENDERER_CONSTANTS.MAT4_SIZE + RENDERER_CONSTANTS.MAT4_SIZE,
        offset: 0
      }
    }]
  });

  const gBufferInstanceUniformsOffsetsBindGroup = device.createBindGroup({
    layout: bindGroupLayouts.gBufferInstanceUniformsOffsetsBindGroupLayout,
    entries: [{
      binding: 0,
      resource: {
        buffer: bufferManager.getBuffer('gBufferInstanceUniformsOffsetsBuffer'),
        size: RENDERER_CONSTANTS.ALIGNED_SIZE,
        offset: 0
      }
    }]
  });

  const gBufferInstanceUniformsBindGroup = device.createBindGroup({
    layout: bindGroupLayouts.gBufferInstanceUniformsBindGroupLayout,
    entries: [{
      binding: 0,
      resource: {
        buffer: bufferManager.getBuffer('gBufferInstanceUniformsBuffer'),
      }
    }]
  });

  const gBufferMeshUniformBindGroup = device.createBindGroup({
    layout: bindGroupLayouts.gBufferMeshUniformBindgroupLayout,
    entries: [{
      binding: 0,
      resource: {
        buffer: bufferManager.getBuffer('gBufferMeshUniformBuffer'),
      }
    },
    {
      binding: 1,
      resource: {
        buffer: bufferManager.getBuffer('typeStatesBuffer'),
      }
    },
    {
      binding: 2,
      resource: {
        buffer: bufferManager.getBuffer('computeSelectedIdBuffer')
      },
    }
    ]
  })


  const mainPassBindgroup = device.createBindGroup({
    layout: bindGroupLayouts.mainPassBindgroupLayout,
    entries: [
      { binding: 0, resource: textures.highlightTexture.createView() },
      { binding: 1, resource: textures.normalTexture.createView() },
      { binding: 2, resource: textures.albedoTexture.createView() },
      { binding: 3, resource: textures.idTexture.createView() },
    ]
  })

  const computeHoverBindGroup = device.createBindGroup({
    layout: bindGroupLayouts.computeHoverBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: bufferManager.getBuffer('computeHoverOutputBuffer'),
        }
      },
      {
        binding: 1,
        resource: {
          buffer: bufferManager.getBuffer('mouseCoordsBuffer'),
          offset: 0,
          size: RENDERER_CONSTANTS.VEC4_SIZE,
        }
      },
      {
        binding: 2,
        resource: textures.idTexture.createView()
      },
      {
        binding: 3,
        resource: {
          buffer: bufferManager.getBuffer('computeSelectedIdBuffer'),
        }
      }
    ]
  })

  return { gBufferConstantsBindGroup, gBufferInstanceUniformsOffsetsBindGroup, gBufferInstanceUniformsBindGroup, gBufferMeshUniformBindGroup, mainPassBindgroup, computeHoverBindGroup }
}

function createPipelines(pipelineManager: PipelineManager, device: GPUDevice, bindGroupLayouts) {

  pipelineManager.createRenderPipeline('mainPassPipeline', {
    vertex: {
      module: device.createShaderModule({
        code: mainPassShaderCode
      })
      ,
      entryPoint: 'vertex_main',
    },
    fragment: {
      module: device.createShaderModule({
        code: mainPassShaderCode
      })
      ,
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
      bindGroupLayouts: [bindGroupLayouts.mainPassBindgroupLayout],
    })
  })

  pipelineManager.createRenderPipeline('gBufferPipeline', {
    vertex: {
      module: device.createShaderModule({
        code: gBufferShaderCode,
      })
      ,
      entryPoint: 'vertex_main',
      buffers: [{
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
      }],
    },
    fragment: {
      module: device.createShaderModule({
        code: gBufferShaderCode,
      })
      ,
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
      bindGroupLayouts: [bindGroupLayouts.gBufferConstantsBindGroupLayout, bindGroupLayouts.gBufferInstanceUniformsBindGroupLayout, bindGroupLayouts.gBufferInstanceUniformsOffsetsBindGroupLayout, bindGroupLayouts.gBufferMeshUniformBindgroupLayout],
    }),
  })


  pipelineManager.createComputePipeline('computeHoverPipeline', {
    layout: device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayouts.computeHoverBindGroupLayout],
    }),
    compute: {
      module: device.createShaderModule({
        code: computeForwardCode,
      })
      ,
      entryPoint: 'main'
    }
  })

}

function createPassDescriptors(contextSettings, textures) {

  const clearColor = { r: 0.0, g: 0.0, b: 0.0, a: 0.0 }
  const mainPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [{
      clearValue: clearColor,
      loadOp: 'clear',
      storeOp: 'store',
      view: contextSettings.getCurrentTexture().createView()
    }]
  }

  const ifcModelPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        view: textures.highlightTexture.createView(),
        clearValue: clearColor,
        loadOp: 'clear',
        storeOp: 'store',
      },
      {
        view: textures.normalTexture.createView(),
        clearValue: clearColor,
        loadOp: 'clear',
        storeOp: 'store',
      },
      {
        view: textures.albedoTexture.createView(),
        clearValue: clearColor,
        loadOp: 'clear',
        storeOp: 'store',
      },
      {
        view: textures.idTexture.createView(),
        clearValue: clearColor,
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
    depthStencilAttachment: {
      view: textures.depthTexture.createView(),
      depthClearValue: 1.,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  };
  return { mainPassDescriptor, ifcModelPassDescriptor }
}

