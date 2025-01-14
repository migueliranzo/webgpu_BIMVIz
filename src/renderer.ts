import ifcModelShaderCode from './shaders/PASS_LOADMODEL.wgsl?raw';
import computeForwardCode from './shaders/COMPUTE_HOVER.wgsl?raw'
import mainPassShaderCode from './shaders/PASS_DIRECTLIGHT.wgsl?raw'
import { cubeVertexData, } from './geometry/cube.ts';
import { getMVPMatrix, getProjectionMatrix, getViewMatrix, getWorldMatrix } from './math_utils.ts';
import { createInputHandler } from './deps/input.ts';
import { OrbitCamera } from './deps/camera.ts';
import { createActionsHandler } from './actions.ts'
import { vec3, mat4 } from 'wgpu-matrix'
import { createModelServiceHandle, getMeshGroupsHandler } from './testHandler.ts';

export function renderer(device: GPUDevice, canvas: HTMLCanvasElement, loadedModel: Map<number, { baseGeometry: { indexArray, vertexArray }, instances: [] }>, actionHandler: any, meshCount: number) {
  console.log("render script starts")
  const ALIGNED_SIZE = 256;
  const MAT4_SIZE = 4 * 16;
  const VEC4_SIZE = 4 * 4;
  const VEC3_SIZE = 4 * 3;
  const VEC2_SIZE = 4 * 2;

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
  let verCountLd = 0;
  let indCountLd = 0;
  let instancesCountLd = 0;
  loadedModel.forEach((x) => {
    verCountLd += x.baseGeometry.vertexArray.byteLength;
    indCountLd += x.baseGeometry.indexArray.byteLength;
    instancesCountLd += x.instances.length;
  })

  //Buffer creation
  const drawIndirectCommandBuffer = device.createBuffer({
    size: (loadedModel.size * 5) * 4,
    usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST,
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
    size: ALIGNED_SIZE * loadedModel.size, //Couldnt this be smaller? is over 128?
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    label: 'gBufferInstanceOffsetBuffer'
  })

  const gBufferInstnaceConstantsBuffer = device.createBuffer({
    size: instancesCountLd * (ALIGNED_SIZE / 2),
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'gBufferInstnaceConstantsBuffer'
  })

  const gBufferMeshUniformBuffer = device.createBuffer({
    size: meshCount * 8,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'gBufferMeshUniformBuffer'
  })

  const typeStatesBuffer = device.createBuffer({
    size: ALIGNED_SIZE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'typeStatesBuffer'
  })

  //G Buffer textures
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
      buffer: { type: 'uniform', minBindingSize: VEC4_SIZE, hasDynamicOffset: true }
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
    }
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
      {
        binding: 4,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {
          type: 'read-only-storage'
        }
      }
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
      { binding: 4, resource: { buffer: computeSelectedIdBuffer } },
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
          { format: navigator.gpu.getPreferredCanvasFormat() }],
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
        targets: [
          { format: 'rgba16float' }, // worldPos
          { format: 'rgba16float' }, // worldNormal
          { format: 'rgba8unorm' }, // albedo
          { format: 'r32uint' }, // Ids 
        ]
      },
      primitive: {
        topology: 'triangle-list',
        //frontFace: 'ccw',
        cullMode: 'back'
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less-equal',
        format: 'depth24plus',
        depthBias: -1,
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
  const clearColor = { r: 0.0, g: 0.5, b: 1.0, a: 1.0 }
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
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    },
  };

  let colorGroupTest = [[0.2, 0.67, 0.], [0.6, 0.3, 0.6], [0., 0.1, 0.6], [0.4, 0.8, 0.2], [0.9, 0., 0.], [0., 0.39, 0.2], [0.1, 0.1, 0.1], [0.9, 0.8, 0.8], [0.2, 0.2, 0.8]]

  //TODO: Cleanup and/or encapsulation, and couldnt we do this in a worker? since we write everythig into arrays we then write to buffers
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
  const commandArray = new Uint32Array(loadedModel.size * 5);
  let indexDataArray = new Uint32Array(indCountLd / 4);
  let instanceDataArray = new ArrayBuffer(instancesCountLd * (16 * 4 + 3 * 4 + 1 * 4 + 12 * 4));
  let instanceDataArrayFloatView = new Float32Array(instanceDataArray);
  let instanceDataArrayUintView = new Uint32Array(instanceDataArray);
  let instanceUniformOffsetDataArray = new Float32Array((loadedModel.size * ALIGNED_SIZE) / 4);
  const meshGroupsIds = new Float32Array(loadedModel.size * MAT4_SIZE);
  loadedModel.forEach((instanceGroup) => {
    commandArray[testI] = instanceGroup.baseGeometry.indexArray.length; //Index count
    commandArray[testI + 1] = instanceGroup.instances.length; //Instance count
    commandArray[testI + 2] = _offsetIndex; //Index buffer offset was  _offsetIndex
    commandArray[testI + 3] = _offsetGeo//base vertex? was _offsetGeo
    commandArray[testI + 4] = 0;  //first instance? was firstInstanceOffset

    instanceUniformOffsetDataArray.set(Float32Array.of(firstInstanceOffset, 0, 0, 0), instanceGroupI * (ALIGNED_SIZE / 4));
    vertexDataArray.set(instanceGroup.baseGeometry.vertexArray, _offsetGeoBytes / 4);
    indexDataArray.set(instanceGroup.baseGeometry.indexArray, _offsetIndexBytes / 4);
    firstInstanceOffset += instanceGroup.instances.length;

    instanceGroup.instances.forEach((instance: { color, flatTransform, lookUpId, meshExpressId }) => {
      let currOffset = ((16 * 4 + 3 * 4 + 1 * 4 + 12 * 4) / 4) * instanceI;
      instanceDataArrayFloatView.set(instance.flatTransform, currOffset);
      instanceDataArrayFloatView.set([instance.color.x, instance.color.y, instance.color.z], currOffset + 16)
      instanceDataArrayUintView.set([instance.lookUpId], currOffset + 16 + 3);
      instanceI++;
    })

    _offsetGeo += instanceGroup.baseGeometry.vertexArray.length / 6;
    _offsetIndexBytes += instanceGroup.baseGeometry.indexArray.byteLength;
    _offsetIndex += instanceGroup.baseGeometry.indexArray.length;
    _offsetGeoBytes += instanceGroup.baseGeometry.vertexArray.byteLength
    instanceGroupI++;
    testI += 5;
  })

  //Static buffers write
  device.queue.writeBuffer(gBufferInstanceOffsetBuffer, 0, instanceUniformOffsetDataArray)
  device.queue.writeBuffer(gBufferInstnaceConstantsBuffer, 0, instanceDataArray)
  device.queue.writeBuffer(drawIndirectCommandBuffer, 0, commandArray);
  device.queue.writeBuffer(gBufferConstantsUniform, 64, proMat);
  device.queue.writeBuffer(ifcModelVertexBuffer, 0, vertexDataArray);
  device.queue.writeBuffer(ifcModelIndexBuffer, 0, indexDataArray);
  console.log(instancesCountLd)

  let typesStatesBufferStrides = new Map<any, any>;
  {
    getMeshGroupsHandler().getMeshGroups().then(({ meshLookUpIdsList, meshTypeIdMap, typesIdStateMap }) => {
      console.log(meshLookUpIdsList, meshTypeIdMap, typesIdStateMap);
      const meshUniformsDataArray = new Uint32Array((2) * meshLookUpIdsList.length);
      for (let i = 0; i < meshLookUpIdsList.length; i++) {
        let offset = ((2 * 4) / 4) * i;
        //TODO: The ternary operator with other/any type as fallback is probably the reason we get artifacts on groups >:)
        let stringType = meshTypeIdMap.get(meshLookUpIdsList[i]) ? meshTypeIdMap.get(meshLookUpIdsList[i]) : 'Electrical';
        meshUniformsDataArray[offset] = meshLookUpIdsList[i];
        meshUniformsDataArray[offset + 1] = typesIdStateMap.get(stringType).typeId;
      }

      const typeStatesDataArray = new Float32Array(typesIdStateMap.size * 4); //uint State + vec3 color for now
      let i = 0;
      typesIdStateMap.forEach((typeIdObject) => {
        let offset = (i * 4)
        typeStatesDataArray.set([...typeIdObject.color], offset);
        typeStatesDataArray.set([typeIdObject.state], offset + 3);
        typesStatesBufferStrides.set(typeIdObject.typeId, { stride: offset * 4, stringType: typeIdObject.stringType })
        i++
      })

      device.queue.writeBuffer(typeStatesBuffer, 0, typeStatesDataArray)
      device.queue.writeBuffer(gBufferMeshUniformBuffer, 0, meshUniformsDataArray)

      //So this is how we will do the dynamic toggle of types-> works for pipeTypes for now
      //let testType = typesStatesBufferStrides.get(2);
      //device.queue.writeBuffer(typeStatesBuffer, testType.stride + 12, new Float32Array([1]))
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

    const gBufferPassEncoder = commandEnconder.beginRenderPass(ifcModelPassDescriptor);
    gBufferPassEncoder.setPipeline(gBufferPipeline);
    let _dynamicOffset = 0;
    let cameraMatrix = camera.update(deltaTime, { ...inputHandler() });
    device.queue.writeBuffer(gBufferConstantsUniform, 0, cameraMatrix);

    gBufferPassEncoder.setVertexBuffer(0, ifcModelVertexBuffer, 0);
    gBufferPassEncoder.setIndexBuffer(ifcModelIndexBuffer, 'uint32', 0);
    gBufferPassEncoder.setBindGroup(0, gBufferConstantsBindGroup);
    gBufferPassEncoder.setBindGroup(1, gBufferInstanceConstantsBindGroup);
    gBufferPassEncoder.setBindGroup(3, gBufferMeshUniformBindGroup);

    let incr = 0;
    loadedModel.forEach((instanceGroup) => {
      gBufferPassEncoder.setBindGroup(2, gBufferInstanceOffsetBindGroup, [_dynamicOffset * ALIGNED_SIZE]);
      _dynamicOffset++;
      gBufferPassEncoder.drawIndexedIndirect(drawIndirectCommandBuffer, incr * (4 * 5));
      incr++;
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
    //console.log(new Float32Array(data)[0] - 1);
    updateId(new Float32Array(data)[0])
    computeSelectedIdStagingBuffer.unmap();

    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

}
