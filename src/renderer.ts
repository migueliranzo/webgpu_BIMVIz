import ifcModelShaderCode from './shaders/PASS_LOADMODEL.wgsl?raw';
import computeForwardCode from './shaders/COMPUTE_HOVER.wgsl?raw'
import mainPassShaderCode from './shaders/PASS_DIRECTLIGHT.wgsl?raw'
import { cubeVertexData, } from './geometry/cube.ts';
import { getMVPMatrix, getProjectionMatrix, getViewMatrix, getWorldMatrix } from './math_utils.ts';
import { createInputHandler } from './deps/input.ts';
import { OrbitCamera } from './deps/camera.ts';
import { createActionsHandler } from './actions.ts'
import { vec3, mat4 } from 'wgpu-matrix'

export function renderer(device: GPUDevice, loadedModel: Map<number, { baseGeometry: { indexArray, vertexArray }, instances: [] }>, actionHandler: any) {
  const ALIGNED_SIZE = 256;
  const MAT4_SIZE = 4 * 16;
  const VEC4_SIZE = 4 * 4;
  const VEC3_SIZE = 4 * 3;
  const VEC2_SIZE = 4 * 2;

  //Getting the context stuff here for now, not sure where it will go
  const canvas = document.getElementById('canvas_main_render_target') as HTMLCanvasElement;
  const context = canvas.getContext('webgpu')!;

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

  const gBufferUniformsBuffer = device.createBuffer({
    size: instancesCountLd * ALIGNED_SIZE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    label: 'instanceUniformsBuffer'
  })

  //G Buffer textures
  const positionTexture = device.createTexture({
    size: { width: 800, height: 600 },
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    format: 'rgba16float',
  });

  const albedoTexture = device.createTexture({
    size: { width: 800, height: 600 },
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    format: 'rgba8unorm',
  });
  const normalTexture = device.createTexture({
    size: { width: 800, height: 600 },
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    format: 'rgba16float',
  });
  const idTexture = device.createTexture({
    size: { width: 800, height: 600 },
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    format: 'r32uint'
  })

  const depthTexture = device.createTexture({
    size: [canvas.width, canvas.height],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });



  //Bind groups - layouts
  const gBufferBindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'read-only-storage', hasDynamicOffset: false, minBindingSize: MAT4_SIZE + MAT4_SIZE + MAT4_SIZE + VEC4_SIZE }
    }]
  });

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
  const gBufferBindGroup = device.createBindGroup({
    layout: gBufferBindGroupLayout,
    entries: [{
      binding: 0,
      resource: {
        buffer: gBufferUniformsBuffer,
        //size: MAT4_SIZE + MAT4_SIZE + MAT4_SIZE + VEC4_SIZE,
        offset: 0
      }
    }]
  });

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
      stepMode: 'instance'
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
        bindGroupLayouts: [gBufferBindGroupLayout],
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

  let _offsetGeo = 0;
  let _offsetIndex = 0;
  const commandArray = new Uint32Array(loadedModel.size * 3);
  let testI = 0;
  loadedModel.forEach((instanceGroup) => {
    commandArray[testI] = instanceGroup.baseGeometry.indexArray.length; //Index count
    commandArray[testI + 1] = instanceGroup.instances.length; //Instance count
    // commandArray[testI + 2] = _offsetIndex; //Index buffer offset
    //commandArray[testI + 3] = _offsetGeo//base vertex?
    //commandArray[_offsetGeo *_i+ 4] =  //first instance?
    device.queue.writeBuffer(ifcModelVertexBuffer, _offsetGeo, instanceGroup.baseGeometry.vertexArray);
    device.queue.writeBuffer(ifcModelIndexBuffer, _offsetIndex, instanceGroup.baseGeometry.indexArray);
    _offsetGeo += instanceGroup.baseGeometry.vertexArray.byteLength;
    _offsetIndex += instanceGroup.baseGeometry.indexArray.length;
    console.log(instanceGroup, _offsetGeo)
    testI += 5;
  })
  device.queue.writeBuffer(drawIndirectCommandBuffer, 0, commandArray);
  console.log("commandBuff size", (loadedModel.size * 5) * 4);
  console.log(commandArray);


  //(() => {
  //  let _offsetGeo = 0;
  //  let _offsetIndex = 0;
  //  loadedModel.geometries.forEach((geo, _i) => {
  //    device.queue.writeBuffer(ifcModelVertexBuffer, _offsetGeo, geo.vertexArray);
  //    device.queue.writeBuffer(ifcModelIndexBuffer, _offsetIndex, geo.indexArray);
  //    _offsetGeo += geo.vertexArray.byteLength;
  //    _offsetIndex += geo.indexArray.byteLength;
  //  });
  //})()

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
    let vertexByteOffset = 0;
    let indexByteOffset = 0;

    let cameraMatrix = camera.update(deltaTime, { ...inputHandler() });
    const proMat = getProjectionMatrix(800, 600);
    let incr = 0;
    let _dynamicOffset = 0;
    loadedModel.forEach((instanceGroup) => {
      //so why offset here if we may be able to offset on the draw command?
      //Or we could avoid this constant setting of vertice and dindeces buffers if we can add the offsets on the draw command
      //TODO: another thing is that the uniform data we see in the draw call like that should be instance per instance and not draw call by draw call?
      gBufferPassEncoder.setVertexBuffer(0, ifcModelVertexBuffer, vertexByteOffset, instanceGroup.baseGeometry.vertexArray.byteLength)
      gBufferPassEncoder.setIndexBuffer(ifcModelIndexBuffer, 'uint32', indexByteOffset, instanceGroup.baseGeometry.indexArray.byteLength);
      vertexByteOffset += instanceGroup.baseGeometry.vertexArray.byteLength;
      indexByteOffset += instanceGroup.baseGeometry.indexArray.byteLength;

      let incrIns = 0;
      //console.log(instanceGroup.instances.length, instanceGroup.instances.length * (ALIGNED_SIZE / 4));
      const instanceData = new Float32Array(instanceGroup.instances.length * (ALIGNED_SIZE / 4));
      instanceGroup.instances.forEach((instance: { color, flatTransform, lookUpId, meshExpressId }) => {
        //flat matrix, projection matrix and lookupId dont need frame updates btw
        let currOffset = 64 * incrIns;
        instanceData.set(cameraMatrix, currOffset);
        instanceData.set(proMat, currOffset + 16);
        instanceData.set(instance.flatTransform, currOffset + 16 * 2);
        instanceData.set([instance.color.x, instance.color.y, instance.color.z], currOffset + 16 * 3);
        instanceData.set([instance.meshExpressId], currOffset + (16 * 3) + 3);
        incrIns++;
      })

      //TODO: offsets here are probably wrong they dont increment like per array? 
      console.log(instanceData);
      device.queue.writeBuffer(gBufferUniformsBuffer, _dynamicOffset, instanceData);
      gBufferPassEncoder.setBindGroup(0, gBufferBindGroup);
      gBufferPassEncoder.drawIndexedIndirect(drawIndirectCommandBuffer, incr * (4 * 5));

      //TODO: check here maybe
      _dynamicOffset += (instanceGroup.instances.length * ALIGNED_SIZE);
      //const flatMatrix = geo.flatTransform;
      //const proMat = getProjectionMatrix(800, 600);
      //const mvpMatrix = mat4.identity();

      //device.queue.writeBuffer(gBufferUniformsBuffer, _dynamicOffset, cameraMatrix);
      //device.queue.writeBuffer(gBufferUniformsBuffer, _dynamicOffset + MAT4_SIZE, proMat);
      //device.queue.writeBuffer(gBufferUniformsBuffer, _dynamicOffset + MAT4_SIZE * 2, new Float32Array(flatMatrix));
      //device.queue.writeBuffer(gBufferUniformsBuffer, _dynamicOffset + MAT4_SIZE * 3, new Float32Array(Object.values(geo.color)));
      //device.queue.writeBuffer(gBufferUniformsBuffer, _dynamicOffset + MAT4_SIZE * 3 + VEC3_SIZE, Int32Array.of(geo.lookUpId));
      //gBufferPassEncoder.setBindGroup(0, gBufferBindGroup, [i * ALIGNED_SIZE]);
      //gBufferPassEncoder.drawIndexed(geo.indexArray.length);
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

    updateId(new Float32Array(data)[0] - 1)
    //let currentId = new Float32Array(data)[0] - 1;
    //if (currentId != previousSelectedId) {
    //  actionHandler.updateSelectedId(new Float32Array(data)[0] - 1);
    //  previousSelectedId = new Float32Array(data)[0] - 1;
    //}
    //console.log(new Float32Array(data)[0] - 1);
    //console.log(loadedModel.geometries[new Float32Array(data)[0] - 1]);
    computeSelectedIdStagingBuffer.unmap();
    //console.log(lastFrameMS / 1000);
    //console.log(frameCount % curre);
    //requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

}
