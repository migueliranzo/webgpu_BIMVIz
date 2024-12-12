import shaderCode from './shaders/PASS_GEOMETRY.wgsl?raw';
import forwardShaderCode from './shaders/FORWARD_HOVER.wgsl?raw';
import computeForwardCode from './shaders/COMPUTE_HOVER.wgsl?raw'
import directLightShaderCode from './shaders/PASS_DIRECTLIGHT.wgsl?raw'
import { cubeVertexData, } from './geometry/cube.ts';
import { getMVPMatrix, getProjectionMatrix, getViewMatrix, getWorldMatrix } from './math_utils.ts';
import { createInputHandler } from './deps/input.ts';
import { ArcballCamera } from './deps/camera.ts';
import { vec3, mat4 } from 'wgpu-matrix'
import { meshUtils, createPipelineManager, geometryUtils } from './rejectclassesreturnmonkeTOBENAMEDPROPERLY.ts';

export function renderer(device: GPUDevice) {

  const ALIGNED_SIZE = 256;
  const MAT4_SIZE = 4 * 16;
  const VEC4_SIZE = 4 * 4;
  const VEC3_SIZE = 4 * 3;
  const VEC2_SIZE = 4 * 2;

  //Getting the context stuff here for now, not sure where it will go
  const canvas = document.getElementById('canvas_main_render_target') as HTMLCanvasElement;
  const context = canvas.getContext('webgpu')!;
  const inputHandler = createInputHandler(window, canvas);

  //Shaders
  const shaderModule = device.createShaderModule({
    code: shaderCode,
  });

  const forwardShaderModule = device.createShaderModule({
    code: forwardShaderCode,
  });

  const computeHoverShaderModule = device.createShaderModule({
    code: computeForwardCode,
  })

  const directLightShaderModule = device.createShaderModule({
    code: directLightShaderCode
  })

  context.configure({
    device: device,
    format: navigator.gpu.getPreferredCanvasFormat(),
    alphaMode: 'premultiplied',
  })

  const meshUtilsManager = meshUtils();
  const cubeGeometry = geometryUtils.createBufferGeometry(cubeVertexData, device); //TODO this cant be THBOIT
  const cubeMesh = meshUtilsManager.createMesh(cubeGeometry, { color: vec3.create(1, 0, 0) });
  const cubeMesh1 = meshUtilsManager.createMesh(cubeGeometry, { color: vec3.create(0, 1, 0) });
  const cubeMesh2 = meshUtilsManager.createMesh(cubeGeometry, { color: vec3.create(0, 0, 1) });

  //after creating and before adding them to the obj list, stuff like their positions should be added
  cubeMesh.setPosition(3, 0, 1);
  cubeMesh1.setPosition(-1, 0, 0);
  cubeMesh1.setRotation(1, 0, 0);
  cubeMesh2.setScale(2, 1, 1);
  cubeMesh2.setPosition(1, 0, 0);

  const pipManager = createPipelineManager();
  pipManager.addDeferred(cubeMesh);
  pipManager.addDeferred(cubeMesh1);
  pipManager.addDeferred(cubeMesh2);

  pipManager.addForward(cubeMesh1);

  const uniformBuffer = device.createBuffer({
    size: ALIGNED_SIZE * pipManager.getDeferred().length,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
  const forwardPassUniformBuffer = device.createBuffer({
    size: ALIGNED_SIZE * pipManager.getForward().length,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  })

  const mouseCoordsBuffer = device.createBuffer({
    size: VEC4_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  })

  const computeHoverOutputBuffer = device.createBuffer({
    size: 10 * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
  })

  const computeHoverstagingBuffer = device.createBuffer({
    size: 10 * 4,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
  })

  const positionTexture = device.createTexture({
    size: { width: 800, height: 600 },
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    format: 'rgba16float',
  });

  const directLightTexture = device.createTexture({
    size: { width: 800, height: 600 },
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    format: 'rgba16float'
  })
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

  const cameraSettings = {
    eye: vec3.create(2., 2.2, 8.0),
    target: vec3.create(0., 0.8, 2.)
  }

  const initialCameraPosition = cameraSettings.eye;
  const camera = new ArcballCamera({ position: initialCameraPosition })

  //Buffer write
  const depthTexture = device.createTexture({
    size: [canvas.width, canvas.height],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });


  const uniformBindGroupLayout = device.createBindGroupLayout({
    entries: [{
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: MAT4_SIZE + MAT4_SIZE + VEC4_SIZE }
    }]
  });

  const forwardPassBindGroupLayout = device.createBindGroupLayout({
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
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: MAT4_SIZE + VEC4_SIZE }
      },
      {
        binding: 4,
        visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
        buffer: { type: 'read-only-storage', minBindingSize: 10 * 4 }
      }
    ]
  });

  const directLightPassBindgroupLayout = device.createBindGroupLayout({
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
    }]
  })

  const uniformBindGroup = device.createBindGroup({
    layout: uniformBindGroupLayout,
    entries: [{
      binding: 0,
      resource: {
        buffer: uniformBuffer,
        offset: 0,
        size: MAT4_SIZE + MAT4_SIZE + VEC4_SIZE,
      }
    },
    ]
  })

  const directLightPassBindgroup = device.createBindGroup({
    layout: directLightPassBindgroupLayout,
    entries: [
      { binding: 0, resource: positionTexture.createView() },
      { binding: 1, resource: normalTexture.createView() },
      { binding: 2, resource: albedoTexture.createView() },
    ]
  })

  const forwardPassBindgroup = device.createBindGroup({
    layout: forwardPassBindGroupLayout,
    entries: [
      { binding: 0, resource: positionTexture.createView() },
      { binding: 1, resource: normalTexture.createView() },
      { binding: 2, resource: albedoTexture.createView() },
      {
        binding: 3, resource: {
          buffer: forwardPassUniformBuffer,
          offset: 0,
          size: MAT4_SIZE + VEC4_SIZE,
        }
      },
      {
        binding: 4, resource: {
          buffer: computeHoverOutputBuffer,
        }
      }
    ],
  });


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
      }
    ]
  })

  const directLightPassPipeline = function() {
    const directLightPassPipelineLayout: GPURenderPipelineDescriptor = {
      vertex: {
        module: directLightShaderModule,
        entryPoint: 'vertex_main',
      },
      fragment: {
        module: directLightShaderModule,
        entryPoint: 'fragment_main',
        targets: [
          { format: navigator.gpu.getPreferredCanvasFormat() }],
      },
      layout: device.createPipelineLayout({
        bindGroupLayouts: [directLightPassBindgroupLayout],
      })
    }
    return device.createRenderPipeline(directLightPassPipelineLayout)
  }();

  const forwardPipeline = function() {
    const vertexBuffers: GPUVertexBufferLayout[] = [{
      attributes: [{
        shaderLocation: 0,
        offset: 0,
        format: 'float32x3',
      },
      {
        shaderLocation: 1,
        offset: 4 * 3,
        format: 'float32x3',
      },
      {
        shaderLocation: 2,
        offset: 4 * (3 + 3),
        format: 'float32x2'
      }
      ],
      arrayStride: 4 * (3 + 3 + 2),
      stepMode: 'vertex',
    }];

    const pipelineDescriptor: GPURenderPipelineDescriptor = {
      vertex: {
        module: forwardShaderModule,
        entryPoint: 'vertex_main',
        buffers: vertexBuffers,
      },
      fragment: {
        module: forwardShaderModule,
        entryPoint: 'fragment_main',
        targets: [
          {
            format: navigator.gpu.getPreferredCanvasFormat(), // worldPos
            blend: {
              color: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              },
              alpha: {
                srcFactor: 'one',
                dstFactor: 'one-minus-src-alpha',
                operation: 'add',
              }
            }
          }
        ]
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back'
      },
      depthStencil: {
        depthWriteEnabled: false,
        depthCompare: 'less-equal',
        format: 'depth24plus',
        depthBias: -1,
      },
      layout: device.createPipelineLayout({
        bindGroupLayouts: [forwardPassBindGroupLayout],
      }),
    };
    return device.createRenderPipeline(pipelineDescriptor);
  }();

  const geoPassPipeline = function() {
    const vertexBuffers: GPUVertexBufferLayout[] = [{
      attributes: [{
        shaderLocation: 0,
        offset: 0,
        format: 'float32x3',
      },
      {
        shaderLocation: 1,
        offset: 4 * 3,
        format: 'float32x3',
      },
      {
        shaderLocation: 2,
        offset: 4 * (3 + 3),
        format: 'float32x2'
      }
      ],
      arrayStride: 4 * (3 + 3 + 2),
      stepMode: 'vertex',
    }];

    const pipelineDescriptor: GPURenderPipelineDescriptor = {
      vertex: {
        module: shaderModule,
        entryPoint: 'vertex_main',
        buffers: vertexBuffers,
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fragment_main',
        targets: [
          { format: 'rgba16float' }, // worldPos
          { format: 'rgba16float' }, // worldNormal
          { format: 'rgba8unorm' }, // albedo
          { format: 'r32uint' }, // albedo
        ]
      },
      primitive: {
        topology: 'triangle-list',
        cullMode: 'back'
      },
      depthStencil: {
        depthWriteEnabled: true,
        depthCompare: 'less-equal',
        format: 'depth24plus',
        depthBias: -1,
      },
      layout: device.createPipelineLayout({
        bindGroupLayouts: [uniformBindGroupLayout],
      }),
    };
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
  }()

  const clearColor = { r: 0.0, g: 0.5, b: 1.0, a: 1.0 }

  const directLightPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [{
      clearValue: clearColor,
      loadOp: 'clear',
      storeOp: 'store',
      view: context.getCurrentTexture().createView()
      //      view: directLightTexture.createView(),
    }]
  }

  const geometryPassDescriptor: GPURenderPassDescriptor = {
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

  const renderPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [{
      clearValue: clearColor,
      loadOp: 'load',
      storeOp: 'store',
      view: context.getCurrentTexture().createView(),
    }],
    depthStencilAttachment: {
      view: depthTexture.createView(),
      depthClearValue: 1,
      depthLoadOp: 'load',
      depthStoreOp: 'store',
    },
  }


  let lastFrameMS = Date.now();
  //Create structure that holds geo and color so we can render any geo points with attached color

  async function render() {
    const now = Date.now();
    const deltaTime = (now - lastFrameMS) / 1000;
    const commandEnconder = device.createCommandEncoder();
    const passEncoder = commandEnconder.beginRenderPass(geometryPassDescriptor);
    lastFrameMS = now;

    let canvasView = context.getCurrentTexture().createView();
    directLightPassDescriptor.colorAttachments[0].view = canvasView;
    renderPassDescriptor.colorAttachments[0].view = canvasView;

    ////la nueva era
    passEncoder.setPipeline(geoPassPipeline);
    pipManager.getDeferred().forEach((mesh, i) => {
      const dynamicOffset = i * ALIGNED_SIZE;

      const modelMatrix = mesh.getModelMatrix();
      const proMat = getProjectionMatrix(800, 600);
      const mvpMatrix = mat4.identity();
      const material = mesh.material.color;
      mat4.multiply(proMat, camera.update(deltaTime, inputHandler()), mvpMatrix);
      mat4.multiply(mvpMatrix, modelMatrix, mvpMatrix);

      device.queue.writeBuffer(uniformBuffer, dynamicOffset, mvpMatrix);
      device.queue.writeBuffer(uniformBuffer, dynamicOffset + MAT4_SIZE, modelMatrix);
      device.queue.writeBuffer(uniformBuffer, dynamicOffset + MAT4_SIZE * 2, material);
      device.queue.writeBuffer(uniformBuffer, dynamicOffset + MAT4_SIZE * 2 + VEC3_SIZE, Int32Array.of(i + 1));

      passEncoder.setVertexBuffer(0, mesh.geometry.vertexBuffer);
      passEncoder.setBindGroup(0, uniformBindGroup, [i * ALIGNED_SIZE]);
      passEncoder.draw(mesh.geometry.vertexData.length / 8) //This is verDat length / bytes per ver
    })
    passEncoder.end();

    const computePassEncoder = commandEnconder.beginComputePass();
    computePassEncoder.setPipeline(computeHoverPipeline);
    device.queue.writeBuffer(mouseCoordsBuffer, 0, Float32Array.of(inputHandler().mouseHover.x, inputHandler().mouseHover.y));
    computePassEncoder.setBindGroup(0, computeHoverBindGroup);
    computePassEncoder.dispatchWorkgroups(Math.ceil(1000 / 64));
    computePassEncoder.end();

    const directLightPassEncoder = commandEnconder.beginRenderPass(directLightPassDescriptor);
    directLightPassEncoder.setPipeline(directLightPassPipeline);
    directLightPassEncoder.setBindGroup(0, directLightPassBindgroup);
    directLightPassEncoder.draw(3)
    directLightPassEncoder.end();

    const forwardPassEncoder = commandEnconder.beginRenderPass(renderPassDescriptor);

    forwardPassEncoder.setPipeline(forwardPipeline);
    pipManager.getForward().forEach((mesh, i) => {
      const dynamicOffset = i * ALIGNED_SIZE;
      forwardPassEncoder.setVertexBuffer(0, mesh.geometry.vertexBuffer);
      const modelMatrix = mesh.getModelMatrix();
      const proMat = getProjectionMatrix(800, 600);
      const mvpMatrix = mat4.identity();
      mat4.multiply(proMat, camera.update(deltaTime, inputHandler()), mvpMatrix);
      mat4.multiply(mvpMatrix, modelMatrix, mvpMatrix);
      device.queue.writeBuffer(forwardPassUniformBuffer, dynamicOffset, mvpMatrix);
      forwardPassEncoder.setBindGroup(0, forwardPassBindgroup, [i * ALIGNED_SIZE]);
      forwardPassEncoder.draw(mesh.geometry.vertexData.length / 8)
    })

    forwardPassEncoder.end();
    commandEnconder.copyBufferToBuffer(
      computeHoverOutputBuffer,
      0,
      computeHoverstagingBuffer,
      0,
      10 * 4,
    )

    device.queue.submit([commandEnconder.finish()]);

    await computeHoverstagingBuffer.mapAsync(
      GPUMapMode.READ,
      0,
      10 * 4,
    );

    const copyArrayBuffer = computeHoverstagingBuffer.getMappedRange(0, 10 * 4);
    const data = copyArrayBuffer.slice();
    computeHoverstagingBuffer.unmap();
    //console.log(new Float32Array(data));
    requestAnimationFrame(render);

  }
  requestAnimationFrame(render);

}

