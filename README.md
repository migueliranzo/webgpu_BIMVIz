## Table of Contents

1.  **Project Overview**
    
2.  **Architecture & Design Patterns**
    
    -   Revealing Module Pattern
        
    -   Event System Implementation
        
3.  **Performance Optimizations**
    
    -   Worker-based Parsing Strategy
        
    -   Memory Management
        
4.  **WebGPU Implementation Details**
    
    -   Custom Instancing System
        
    -   Geometry Instancing
        
    -   Instance Management
        
5.  **State Flow and System Integration**
    
    -   Component Interaction
        
    -   State Update Flow
        
6.  **Future Development Plans**
    
    -   Pipeline Improvements
        
    -   Performance Optimizations
        
7.  **Development Insights**
    
    -   Key Learnings
        
        
![Image](https://github.com/user-attachments/assets/1988214c-9d6f-4270-a7f6-2046235ba776)
----------

## 1. Project Overview

Lately, I have been looking for project ideas to keep improving at graphics programming without forgetting too much about web dev. When I came across BIM visualizations done in major tools like Revit, CAD... I knew it was the perfect idea to give webGPU a try!

I knew I couldn't make a perfect viewer from the get-go, but I was ready to learn, so I focused on exploring what WebGPU had to offer as a modern rendering API and building a custom BIM renderer from scratch. I didn't rely on high-level frameworks as an excuse to refresh the basics a bit, and the overall focus was put on the core rendering, performance, and interactivity, such as model navigation, property inspection, and MEP system selection.

----------

## 2. Architecture & Design Patterns

### 2.1 Revealing Module Pattern

I structured the application around the revealing module pattern instead of the traditional class pattern. This was done to make the code more predictable and isolate states, avoiding global scope pollution.
-   **Isolated state**:  Modules maintain their own state (e.g.,  `actions,` `ifcLoader`)  within a closure, avoiding side effects and making managing their interactions with other modules an easier job.
-   **Predictable State Management**: I decided to not rely on classes and to go with closures aiming for a more functional aproach since having a predictable lifecycle was crucial to avoid errors when switching the input files to render.
    

### 2.2 Event System Implementation
For events and communication between different parts of the application, I went for a custom event system. I used Dom's `EventTarget` API, which made handling state updates and user interactions quite flexible and lightweight.
 
-   **Event Emitters**:  Each module can create its own event emitters, making communication between them less entangled, although a better job could be done to unify the system and create an overall stronger Event system.
    
-   **Subscriptions**:  Modules can subscribe to different events as long as they can hook to the event emitter handler, processing the updates in a much more controlled and encapsulated manner.
    
-   **Data Flow**: This system makes the overall application data flow between UI components, modules, and the rendering engine much more clear and predictable, making propagation of state easier to track.

----------

## 3. Performance Optimizations

### 3.1 Worker-based Parsing Strategy
Since BIM/IFC files can get extremely large and parsing the required data for the application is quite a CPU-intensive task, I ended up using Web Workers to offload all of this processing to avoid blocking the precious main thread. 

-   **Worker Implementation**: The Web Worker used for parsing gets initialized on `ifcLoader.ts,` it communicates back with the main thread using `postMessage,` allowing UI to remain working during the expensive parsing operations.
    
-   **Progressive Loading**: Parsing, as discussed, is quite expensive, and with the geometry being the quickest, it made no sense to make the renderer wait, that's why the worker streams parsed data back to the main thread in chunks, allowing the application to start rendering the geometry and to set up the necessary GPU resources while the remaining data gets parsed.
    
-   **Promise-based System**: Promises are used by the worker to handle the asynchronous nature of the presented progressive loading, as the main thread needs a way to be notified of when and what data is available to sequentially start the different application systems.

### 3.2 Memory Management
Most BIM web-based applications seem to be faced with the issue of memory management, there is a lot of data to hold to and have ready to present, each model can have 3k different objects, and storing each object's properties and its property sets can get expensive really quick. 
    
  -   **Efficiency over speed**:  I decided to lean into memory efficiency over loading speed, taking a bit more time to process the data but reducing the overall size. Progressive loading made the extra time go by much quicker. 

-   **Memory Reduction**: After moving the parser into web workers and aggressively terminating and cleaning up its resources, we were able to reduce memory usage from ~600mb to ~200 MB. This approach makes sure that big data structures and WASM resources from the parsing library are properly liberated after parsing completes.
   
----------

## 4. WebGPU Implementation Details

### 4.1 Custom Instancing System
The rendering engine uses a custom instance system to optimize the rendering of BIM/IFC models, as most graphics APIs, WebGPU allows instance drawing, and I have since ended up going for an indirect drawing approach, leaving the door open for more GPU-driven development, `drawInstanceIndirect`  was the draw call to use.

   -   **Geometry Instancing**: While parsing happens, a geometry key is computed to identify an instance of any identical geometry, this also reduces the amount of unique vertex/index pairs stored in GPU memory. 
    
-   **Instance Management**: A mapping is maintained between instances and their geometries, making rendering quick while keeping individual instance data like colors and transformations... 
    
-   **Performance Gains**: Instancing really helped with performance in the early stages and took rendering performance from 30fps to 120fps on a testing laptop while still allowing for instance-level access to its mesh data and properties.

### 4.2 Geometry Instancing
As mentioned before, the parsing code registers and removes identical geometries, this is achieved by computing a geometry hash for each geometry vertex/index pair, which will then be used to group identical geometries together in an instance group.
The generation of this key is quite conservative, reducing the possible artifacts of obscure models while paying a bit in overall performance, but since the application can load any IFC model, a conservative approach made more sense.

### 4.3 Instance Management
Most BIM models don't come with instance data, and it's left to the rendering engine to choose how to deal with repeated geometry. BIM/IFC models normally have a lot of repeated geometry, and that became the reason for creating an instancing system to optimize the rendering of models. 

Instancing geometries, as opposed to instancing meshes, brings its own set of issues, and the relation between an instance and the mesh it belongs has little to do with its geometry instance group, therefore, a mapping between instances and meshes IDs becomes crucial to interact with each instance meshes independently from its instance group. 
 This is particularly important for BIM models, where many objects share the same geometry but have different positions and orientations.

----------

## 5. State Flow and System Integration

### 5.1 Component Interaction
There are three main interaction systems that bring interactivity to the application.

1.  **Tree View**:  Hierarchical tree structure view of the model, allowing users to navigate the whole model structure and toggle the visibility of different sections and groups, in addition, hovering on the tree view will also highlight its corresponding structure on the rendered geometry, and this hover effect can be toggled by the user as well.
2.  **MEP Selection**:  System for highlighting the different MEP systems within the model, users can enable or disable different MEP systems to highlight, and this one will be rendered over any other geometry to truly enhance its visibility and highlight state.
    
3.  **Property Panel**: A basic panel that displays the item properties and property sets of the active selected object.
    

### 5.2 State Update Flow
    
   
-   **Action Manager**: The  `actions.ts`  file handles the update of the property panel through event listeners, constantly keeping the UI updated to reflect the current state of the user-selected object.
    
-   **Tree View Events**: The mentioned tree view functionality events are coupled with the tree node creation, which makes handling its updates when the model structure changes quite reliable. 
    
-   **MEP Events**: The MEP system is managed through the action handler since it doesn't depend on dynamic data nor dynamic HTML binding to dictate its behavior, unlike the tree view events. 
    

----------

## 6. Future Development Plans

### 6.1 Pipeline Improvements

-   **Pipeline Switching**: Pipeline switching could be implemented, which would allow for better visual feedback on selected and hovered effects without compromising performance, as well as adding more flexibility to the current highlight implementation.
    
-   **Depth Property Modifications**: Depth testing could be improved, and alongside pipeline switching, would make it possible for selected objects to be always visible, even when occluded by other geometry.
    
    

### 6.2 Performance Optimizations

-   **Occlusion Culling**: Implement occlusion culling using an H-Z buffer to reduce the number of draw calls. I would have loved to include occlusion culling; I even spent quite a lot of time working on it and had an initial version, but it wasn't perfect, and it's a technique I would rather take my time with and experiment with outside project time fences.
    
-   **View Culling**: Optimize view culling to reduce the number of objects rendered in each frame. In my discarded occlusion culling, everything was already primed to include view culling in the same compute pass, and there were even some ways I could get my occlusion culling implementation to deal with view culling relatively cheaply so it's a topic I would love to revisit.  
    
-   **Transparent Instance Handling**: Improve transparent instances handling to achieve proper rendering order and blending in any model since the current implementation just shorts instances based on their alpha value but does so at a later stage than it should.
    


    

----------


## 7. Development Insights 
### Key Learnings 
Overall, working on this project has been amazing, the first-hand experience with a graphics API has been extremely fulfilling, my fascination for GPU development has only grown, and I came out from this project with a lot of answers to the questions that initially brought me here. 

It has been truly interesting learning how different a GPU application can be architectured and how its different elements interact with each other in such a harmonic way (until occlusion doesn't work).
 Thanks to this project, I now view rendering and graphics programming from a completely different perspective that better captures its inner workings, and I feel better equipped to tackle new challenges that I could have only dreamt of starting.

It has also been a humbling experience, some systems where I put a lot of effort and interest had to be discarded for the completion of the project, and it has also made even more apparent the deep complexity of graphics programming, but I still took a lot from those experiences, and they really pushed me to get creative with debugging and got me even more familiar with the profiler, I definitely underestimated at earlier project stages how crucial debugging visualizations or tooling are in the realm of graphics, and I have gotten much better and understanding of how to leverage different techniques to understand what's really happening.
