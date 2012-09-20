// REFERENCES:

// WebGL
// http://www.khronos.org/registry/webgl/specs/latest/
// http://learningwebgl.com/blog/?page_id=1217

// GLSL
// http://www.opengl.org/documentation/glsl/
// http://www.khronos.org/registry/gles/specs/2.0/GLSL_ES_Specification_1.0.17.pdf

// MC
// http://codeflow.org/entries/2010/dec/09/minecraft-like-rendering-experiments-in-opengl-4/

// Rendering to textures
// http://stackoverflow.com/questions/9046643/webgl-create-texture
// http://learningwebgl.com/blog/?p=1786

// Indexed DB
// http://www.html5rocks.com/en/tutorials/offline/storage/
// http://www.w3.org/TR/IndexedDB/
// https://developer.mozilla.org/en-US/docs/IndexedDB/Using_IndexedDB

// VAOs
// http://people.eecs.ku.edu/~miller/Courses/OpenGL/HelloOpenGL/index.html
// http://www.swiftless.com/tutorials/opengl4/4-opengl-4-vao.html
// http://www.opengl.org/wiki/Tutorial2:_VAOs,_VBOs,_Vertex_and_Fragment_Shaders_(C_/_SDL)
// http://stackoverflow.com/questions/7420092/efficient-vbo-allocation-in-webgl

// Blur
// http://www.gamerendering.com/2008/10/11/gaussian-blur-filter-shader/
// http://www.geeks3d.com/20100909/shader-library-gaussian-blur-post-processing-filter-in-glsl/
// http://encelo.netsons.org/2008/03/23/i-love-depth-of-field/

// Sky
// http://www.flipcode.com/archives/Sky_Domes.shtml

// Gamma
// http://http.developer.nvidia.com/GPUGems3/gpugems3_ch24.html
// http://www.4p8.com/eric.brasseur/gamma.html
// http://stackoverflow.com/questions/10843321/should-webgl-shader-output-be-adjusted-for-gamma

// Pointer lock
// http://www.html5rocks.com/en/tutorials/pointerlock/intro/
// chrome://flags/

// Fullscreen
// https://developer.mozilla.org/en-US/docs/DOM/Using_full-screen_mode

// TODO: race cars
// TODO: flags
// TODO: tonkatsu
// TODO: rice
// TODO: edamame
// TODO: miso soup

// OpenGL rendering things!

var gl;

var mvMatrix = mat4.create();  // model-view matrix
var mvMatrixStack = [];
var pMatrix = mat4.create();   // projection matrix

var DB;
var DB_VERSION = 6;

var GAME;
var AVATAR;  // hack-o alias for GAME.avatar because we use it so much

var GRASSY = false;       // true to use decal-style grass
var SPREAD_OUT = false;   // create nearby chunks

var PICKED = null;
var PICKED_FACE = 0;
var PICK_MAX = 8;
var WIREFRAME;

var PARTICLES;

var SHADER;

var FRAMEBUFFER;

// Map chunk dimensions
var LOGNX = 4;
var LOGNY = 5;
var LOGNZ = 4;
var NX = 1 << LOGNX;
var NY = 1 << LOGNY;
var NZ = 1 << LOGNZ;
var CHUNK_RADIUS = Math.sqrt(NX * NX + NZ * NZ);
var UPDATE_PERIOD = 0.1;  // sec
var SY = 0.5;      // vertical size of blocks
var HY = NY * SY;  // vertical height of chunk in m

var RENDER_STAT = new Stat('Render');
var UPDATE_STAT = new Stat('Update');
var FPS_STAT = new Stat('FPS');
FPS_STAT.invert = true;

var lastFrame = 0;
var lastUpdate = 0;

var GRAVITY = 23;  // m/s/s
var PARTICLE_GRAVITY = 6.4; // m/s/s
var VJUMP = 7.7;   // m/s

var LIGHT_SUN = 6;

var TERRAIN_TEXTURE;
var EYE_HEIGHT = 1.62;

var KEYS = {};

var lastX, lastY;

var FACE_FRONT = 0;
var FACE_BACK = 1;
var FACE_BOTTOM = 2;
var FACE_TOP = 3;
var FACE_RIGHT = 4;
var FACE_LEFT = 5;

var DISTANCE = [1, 1, SY, SY, 1, 1];



var BLOCK_TYPES = {
  air: {
    tile: 0,
    empty: true,
    opaque: false,
  },
  rock: {
    tile: 1,
    solid: true,
    opaque: true,
    geometry: geometryBlock,
  },
  dirt: {
    tile: 2,
    solid: true,
    opaque: true,
    geometry: geometryBlock,
  },
  grass: {
    tile: 3,
    solid: true,
    opaque: true,
    geometry: geometryBlock,
  },
  flag: {
    tile: 4,
    solid: true,
    opaque: true,
    stack: 1,
    geometry: geometryBlock,
  },
  testpattern: {
    tile: 5,
    solid: true,
    opaque: true,
    stack: 1,
    geometry: geometryBlock,
  },
  bedrock: {
    tile:6,
    solid: true,
    opaque: true,
    geometry: geometryBlock,
  },
  ice: {
    tile: 7,
    solid: true,
    translucent: [36,205,205,0.5],
    geometry: geometryBlock,
  },
  flower: {
    tile: 8,
    geometry: geometryHash,
    margin: 0.2,
    height: 1,
    update: updateResting,
  },
  grassy: {
    tile: [4,2],
    geometry: geometryHash,
    hashes: 2,
  },
  lamp: {
    tile: 9,
    geometry: geometryHash,
    luminosity: [8,2,2],
    margin: 0.2,
    height: 1,
    update: updateResting,
  },
  candy: {
    tile: 10,
    solid: true,
    opaque: true,
    geometry: geometryBlock,
  },
  'grape jelly': {
    tile: 14,
    liquid: true,
    translucent: [154,40,155,0.85],
    geometry: geometryBlock,
    viscosity: 0.85,
  },
  'strawberry jelly': {
    tile: 13,
    liquid: true,
    translucent: [200,81,83,0.85],
    geometry: geometryBlock,
    viscosity: 0.85,
  },
  'apricot jelly': {
    tile: 15,
    liquid: true,
    translucent: [191,124,66,0.85],
    geometry: geometryBlock,
    viscosity: 0.85,
  },
  'water': {
    tile: [6, 2],
    liquid: true,
    translucent: [30, 137, 157, 0.5],
    geometry: geometryBlock,
    viscosity: 0.5,
    unpickable: true,
  },
  rope: {
    tile: [1, 2],
    liquid: true,
    geometry: geometryHash,
    update: function updateHanging() {
      this.tile = [(this.neighbor(FACE_BOTTOM).type === this.type) ? 0 : 1, 2];
      var nt = this.neighbor(FACE_TOP).type;
      if (!nt.solid && nt !== this.type)
        this.breakBlock();
    },
    afterPlacement: function growDown() {
      var n = this.neighbor(FACE_BOTTOM);
      var nn = n.neighbor(FACE_BOTTOM);
      if (!nn.outofbounds && n.type.empty && nn.type.empty)
        n.placeBlock(this.type);
    },
  },
  mystery: {
    tile: [2, 2],
    opaque: true,
    solid: true,
    stack: 1,
    geometry: geometryBlock,
  },
  hal9000: {
    tile: [3, 2],
    opaque: true,
    solid: true,
    stack: 1,
    geometry: geometryBlock,
    update: function () {
      if (!this.horizontalFieldOfView)
        initCamera(this);
      if (!this.framebuffer) {
        this.framebuffer = makeFramebufferForTile(TERRAIN_TEXTURE, 2, 2);
      }
      renderToFramebuffer(this, this.framebuffer);
    }
  },
  obelisk: {
    tile: [5, 2],
    stack: 2,
    solid: true,
    opaque: true,
    geometry: geometryBlock,
  },
};
var NBLOCKTYPES = 0;
for (var i in BLOCK_TYPES) {
  BLOCK_TYPES[i].index = NBLOCKTYPES++;
  BLOCK_TYPES[i].name = i;
}
for (var i in BLOCK_TYPES)
  BLOCK_TYPES[BLOCK_TYPES[i].index] = BLOCK_TYPES[i];


var ENTITY_TYPES = {
  player: {
  },
  block: {
    geometry: cube,
    tile: 1,
    init: function () {
      this.dyaw = 1;
      this.dx = 2 * tweak();
      this.dz = 2 * tweak();
      this.dy = 6;
      this.falling = true;
      this.height = SY * this.type.scale;
      this.radius = 0.5 * this.type.scale;
      this.rebound = 0.75;
    },
    update: function (e) {
      if (age(e) > 1 && distance(AVATAR, e) < 2)
        e.die();
    },
    scale: 0.25,
  },
};
var NENTITYTYPES = 0;
for (var i in ENTITY_TYPES) {
  ENTITY_TYPES[i].index = NENTITYTYPES++;
  ENTITY_TYPES[i].name = i;
}
for (var i in ENTITY_TYPES)
  ENTITY_TYPES[ENTITY_TYPES[i].index] = ENTITY_TYPES[i];


function updateResting() {
  var nt = this.neighbor(FACE_BOTTOM).type;
  if (!nt.solid)
    this.breakBlock();
}


function initGL(canvas) {
  var problem = '';
  try {
    gl = canvas.getContext('experimental-webgl') ||
      canvas.getContext('webgl');
    if (gl) {
      gl.viewportWidth = canvas.width;
      gl.viewportHeight = canvas.height;
    }
  } catch (e) {
    problem = e;
  }
  if (!gl) {
    alert('Unable to initialize WebGL...\n' + problem);
  }
}

function $(id) { return document.getElementById(id) }


function getShader(gl, id) {
  var shaderScript = $(id);
  if (!shaderScript) return null;

  var str = '';
  var k = shaderScript.firstChild;
  while (k) {
    if (k.nodeType == 3) {
      str += k.textContent;
    }
    k = k.nextSibling;
  }

  var shader;
  if (shaderScript.type == 'x-shader/x-fragment') {
    shader = gl.createShader(gl.FRAGMENT_SHADER);
  } else if (shaderScript.type == 'x-shader/x-vertex') {
    shader = gl.createShader(gl.VERTEX_SHADER);
  } else {
    return null;
  }

  gl.shaderSource(shader, str);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert(gl.getShaderInfoLog(shader));
    return null;
  }

  return shader;
}


function Shader(shaders, fragShader) {
  var vertexShader   = getShader(gl, shaders + '-vs');
  var fragmentShader = getShader(gl, (fragShader||shaders) + '-fs');

  this.program = gl.createProgram();
  gl.attachShader(this.program, vertexShader);
  gl.attachShader(this.program, fragmentShader);
  gl.linkProgram(this.program);

  if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
    alert('Could not initialize shaders');
  }
}

Shader.prototype.use = function () {
  gl.useProgram(this.program);
}

Shader.prototype.locate = function(variable) {
  var type = { a: 'Attrib', u: 'Uniform' }[variable[0]];
  this[variable] = gl['get' + type + 'Location'](this.program, variable);
  if (type === 'Attrib')
    gl.enableVertexAttribArray(this[variable]);
}



function mvPushMatrix() {
  var copy = mat4.create();
  mat4.set(mvMatrix, copy);
  mvMatrixStack.push(copy);
}

function mvPopMatrix() {
  if (mvMatrixStack.length == 0) {
    throw 'Invalid popMatrix!';
  }
  mvMatrix = mvMatrixStack.pop();
}


function Chunk(data) {
  var x = data.chunkx;
  var z = data.chunkz;
  x &= ~(NX - 1);
  z &= ~(NZ - 1);
  this.chunkx = x;
  this.chunkz = z;

  this.blocks = Array(NX * NY * NZ);

  this.lastUpdate = 0;
  this.nDirty = 0;

  this.opaqueBuffers = new BufferSet();
  this.translucentBuffers = new BufferSet();

  GAME.chunks[this.chunkx + ',' + this.chunkz] = this;

  if (data.blocks) {
    // Loading from storage
    for (var i = 0; i < NX * NY * NZ; ++i) {
      var c = coords(i);
      c = coords(this.chunkx + c.x, c.y, this.chunkz + c.z);
      c.data = data.blocks[i];
      this.blocks[i] = new Block(c, this);
      if (this.blocks[i].dirtyLight || this.blocks[i].dirtyGeometry)
        this.nDirty++;
    }
  }
}


Chunk.prototype.data = function () {
  var result = {
    key: this.chunkx + ',' + this.chunkz,
    chunkx: this.chunkx,
    chunkz: this.chunkz,
    blocks: new Array(NX * NY * NZ)
  };
  for (var i = 0; i < NX * NY * NZ; ++i)
    result.blocks[i] = this.blocks[i].data();
  return result;
}


Chunk.prototype.generateTerrain = function () {
  // Generate blocks
  for (var ix = 0; ix < NX; ++ix) {
    var x = ix + this.chunkx;
    for (var y = 0; y < NY; ++y) {
      for (var iz = 0; iz < NZ; ++iz) {
        var z = iz + this.chunkz;
        var c = coords(x, y*SY, z);
        var b = this.blocks[c.i] = new Block(c, this);
        b.generateTerrain();
      }
    }
  }

  // Plant some flowers
  for (var n = 0; n < 4; ++n) {
    var x = this.chunkx + 
      Math.round(Math.abs(noise(this.chunkx, this.chunkz, n)) * NX);
    var z = this.chunkz + 
      Math.round(Math.abs(noise(this.chunkx, this.chunkz, n + 23.4)) * NZ);
    var t = topmost(x, z);
    if (t && t.y < HY-SY)
      t.neighbor(FACE_TOP).type = BLOCK_TYPES.flower;
  }

  // Initial quick lighting update, some of which we can know accurately
  this.nDirty = 0;
  for (var x = 0; x < NX; ++x) {
    for (var z = 0; z < NZ; ++z) {
      var sheltered = false;
      for (var y = NY-1; y >= 0; --y) {
        var c = coords(x, y*SY, z);
        var b = this.blocks[c.i];
        b.light[0] = b.light[1] = b.light[2] = 0;
        b.light[3] = b.type.opaque ? 0 : sheltered ? 0 : LIGHT_SUN;
        b.dirtyLight = false;
        if (b.type.luminosity) b.dirtyLight = true;
        if (sheltered && !b.type.opaque) b.dirtyLight = true;
        if (b.dirtyLight) ++this.nDirty;
        sheltered = sheltered || b.type.opaque;
      }
    }
  }

  // Plant grass
  if (GRASSY) {
    for (var i = 0; i < NX; ++i) {
      for (var j = 0; j < NZ; ++j) {
        var t = topmost(this.chunkx + i, this.chunkz + j);
        if (t && t.y < HY-SY && t.type === BLOCK_TYPES.dirt)
          t.neighbor(FACE_TOP).type = BLOCK_TYPES.grassy;
      }
    }
  }
  

  // Do a few updates to avoid having to recreate the geometry a bunch of 
  // times when we're updating in bulk
  //for (var i = 0; i < 10 && this.nDirty > 50; ++i)
  //  this.updateLight();
}


Chunk.prototype.generateBuffers = function (justUpdateLight) {
  justUpdateLight = justUpdateLight &&
    !(this.opaqueBuffers.empty() && this.translucentBuffers.empty());
  var opaques = {}, translucents = {};
  for (var i = 0; i < this.blocks.length; ++i) {
    var b = this.blocks[i];
    if (b.type.geometry) {
      if (!b.vertices) 
        b.type.geometry(b);
      var dest = b.type.translucent ? translucents : opaques;
      if (!dest.indices) {
        dest.aVertexPosition = [];
        dest.aTextureCoord = [];
        dest.aLighting = [];
        dest.indices = [];
      }
      dest.aLighting.push.apply(dest.aLighting, b.vertices.lighting);
      if (justUpdateLight)
        continue;
      var pindex = dest.aVertexPosition.length / 3;
      dest.aVertexPosition.push.apply(dest.aVertexPosition, 
                                      b.vertices.positions);
      dest.aTextureCoord.push.apply(dest.aTextureCoord, b.vertices.textures);
      for (var j = 0; j < b.vertices.indices.length; ++j)
        dest.indices.push(pindex + b.vertices.indices[j]);
    }
  }
  
  if (justUpdateLight) {
    this.opaqueBuffers.updateLight(opaques);
    this.translucentBuffers.updateLight(translucents);
  } else {
    this.opaqueBuffers.update(opaques);
    this.translucentBuffers.update(translucents);
  }
}


function makebufs(set) {
  if (!set.indices) return null;
  return {
    aVertexPosition: makeBuffer(set.aVertexPosition, 3),
    aTextureCoord:   makeBuffer(set.aTextureCoord, 2),
    aLighting:       makeBuffer(set.aLighting, 4, true),
    indices:         makeBuffer(set.indices, 1, false, true)
  };
}


function pointToAttribute(shader, buffers, attribute) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffers[attribute]);
  gl.vertexAttribPointer(shader[attribute],
                         buffers[attribute].itemSize,
                         gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
}


Chunk.prototype.updatePeriod = function () {
  return Math.max(UPDATE_PERIOD, 2 * this.hdistance / AVATAR.viewDistance);
}

Chunk.prototype.update = function () {
  if (this.nDirty > 0 && GAME.clock() > this.lastUpdate+this.updatePeriod()){
    this.nDirty = 0;
    var uplights = 0, upgeoms = 0;
    
    // This shitty method will propagate block updates faster in some
    // directions than others
    var tops = {};
    for (var i = this.blocks.length-1; i >= 0; --i) {  
      // iteration runs from high y's to low
      var b = this.blocks[i];
      var xz = b.x + NX * b.z;
      b.sheltered = !!tops[xz];
      if (!b.sheltered && b.type.opaque)
        tops[xz] = b;
      if (b.dirtyLight || b.dirtyGeometry) {
        if (b.dirtyLight) uplights++;
        if (b.dirtyGeometry) upgeoms++;
        b.update();
      }
    }

    this.lastUpdate = GAME.clock();
    this.generateBuffers(upgeoms === 0);
    console.log('Update: ', this.chunkx, this.chunkz, ':', 
                uplights, upgeoms, '->', this.nDirty);
  }
}


Chunk.prototype.centerPoint = function () {
  return {x: this.chunkx + NX / 2,
          y: HY / 2,
          z: this.chunkz + NZ / 2};
}


function hDistance(p, q) {
  return Math.sqrt((p.x - q.x) * (p.x - q.x) + 
                   (p.z - q.z) * (p.z - q.z));
}

function distance(p, q) {
  return Math.sqrt((p.x - q.x) * (p.x - q.x) + 
                   (p.y - q.y) * (p.y - q.y) + 
                   (p.z - q.z) * (p.z - q.z));
}

function age(e) {
  return GAME.clock() - e.birthday;
}

function signedHDistanceFromLine(a, angle, p) {
  // returns distance from line through point A at given angle to point P
  return (p.z - a.z) * Math.sin(angle) - (p.x - a.x) * Math.cos(angle);
}


function choice(n) {
  if (!n) n = 2;
  return Math.floor(Math.random() * n);
}


function coords(x, y, z) {
  var result;
  if (typeof x === 'object') {
    if (typeof x.x === 'undefined') {
      // assuming array or vector
      result = {
        x: x[0],
        y: x[1],
        z: x[2]
      };
    } else {
      result = {
        x: x.x,
        y: x.y,
        z: x.z
      };
    }
    result.z = Math.floor(result.z);
    result.y = Math.floor(result.y/SY)*SY;
    result.x = Math.floor(result.x);
  } else if (typeof y === 'undefined') {
    result = {
      x: x % NX,
      y: ((x >> LOGNX) % NY) * SY,
      z: (x >> (LOGNX + LOGNY)) % NZ
    }
  } else {
    result = {
      x: Math.floor(x),
      y: Math.floor(y/SY)*SY,
      z: Math.floor(z)
    }
  }

  result.chunkx = result.x & ~(NX - 1);
  result.chunkz = result.z & ~(NZ - 1);

  var dx = result.x - result.chunkx;
  var dz = result.z - result.chunkz;
  result.i = dx + ((result.y/SY) << LOGNX) + (dz << (LOGNX + LOGNY));

  if (result.y < 0 || result.y >= HY)
    result.outofbounds = true;

  return result;
}


function chunk(chunkx, chunkz) {
  chunkx &= ~(NX - 1);
  chunkz &= ~(NZ - 1);
  return GAME.chunks[chunkx + ',' + chunkz];
}


function makeChunk(chunkx, chunkz) {
  chunkx &= ~(NX - 1);
  chunkz &= ~(NZ - 1);
  var result = chunk(chunkx, chunkz);
  if (!result) {
    // New chunk needed
    result = new Chunk({chunkx:chunkx, chunkz:chunkz});
    result.generateTerrain();

    // Invalidate edges of neighboring chunks. Have to invalidate the 
    // whole geometry or the light and other arrays will be out of sync
    if (chunk(chunkx - NX, chunkz))
      for (var y = 0; y < NY; ++y)
        for (var z = 0; z < NZ; ++z)
          block(chunkx - 1, y*SY, chunkz + z).invalidateGeometry();
    if (chunk(chunkx + NX, chunkz))
      for (var y = 0; y < NY; ++y)
        for (var z = 0; z < NZ; ++z)
          block(chunkx + NX, y*SY, chunkz + z).invalidateGeometry();
    if (chunk(chunkx, chunkz - NZ))
      for (var y = 0; y < NY; ++y)
        for (var x = 0; x < NX; ++x)
          block(chunkx + x, y*SY, chunkz - 1).invalidateGeometry();
    if (chunk(chunkx, chunkz + NZ))
      for (var y = 0; y < NY; ++y)
        for (var x = 0; x < NX; ++x)
          block(chunkx + x, y*SY, chunkz + NZ).invalidateGeometry();
  }
  return result;
}


function block(x, y, z) {
  var co = coords(x, y, z);
  if (!co.outofbounds) {
    var ch = chunk(co.chunkx, co.chunkz);
    if (ch) return ch.blocks[co.i];
  }
  // Manufacture an ad hoc temporary block
  return new Block(co);
}

var _DZ = NX * NY;
var _DY = NX;
var _DX = 1;
Block.prototype.neighbor = function (face) {
  switch (face) {
  case FACE_FRONT: 
    return this.z-this.chunk.chunkz > 0 ? 
      this.chunk.blocks[this.i - _DZ] : block(this.x, this.y,this. z-1);
  case FACE_BACK:  
    return this.z-this.chunk.chunkz < NZ-1 ? 
      this.chunk.blocks[this.i + _DZ] : block(this.x, this.y, this.z+1);
  case FACE_BOTTOM:
    return this.y > 0 ? 
      this.chunk.blocks[this.i - _DY] : block(this.x, this.y-SY, this.z);
  case FACE_TOP:   
    return this.y < HY-SY ? 
      this.chunk.blocks[this.i + _DY] : block(this.x, this.y+SY, this.z);
  case FACE_RIGHT: 
    return this.x-this.chunk.chunkx > 0 ? 
      this.chunk.blocks[this.i - _DX] : block(this.x-1, this.y, this.z);
  case FACE_LEFT:  
    return this.x-this.chunk.chunkx < NX-1 ? 
      this.chunk.blocks[this.i + _DX] : block(this.x+1, this.y, this.z);
  }
}

// Calls back callback(neighbor, face)
Block.prototype.eachNeighbor = function (callback) {
  callback(this.neighbor(FACE_FRONT),  FACE_FRONT);
  callback(this.neighbor(FACE_BACK),   FACE_BACK);
  callback(this.neighbor(FACE_BOTTOM), FACE_BOTTOM);
  callback(this.neighbor(FACE_TOP),    FACE_TOP);
  callback(this.neighbor(FACE_RIGHT),  FACE_RIGHT);
  callback(this.neighbor(FACE_LEFT),   FACE_LEFT);
}



function drawScene(camera) {

  RENDER_STAT.start();

  SHADER.use();

  // Start from scratch
  if (camera.y + EYE_HEIGHT >= 0)
    gl.clearColor(0.5 * GAME.sunlight, 
                  0.8 * GAME.sunlight, 
                  0.98 * GAME.sunlight, 1);  // Clear color is sky blue
  else
    gl.clearColor(0,0,0,1);  // Look into the void
  gl.enable(gl.DEPTH_TEST);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Set up the projection
  var aspectRatio = gl.viewportWidth / gl.viewportHeight;
  mat4.perspective(camera.horizontalFieldOfView / aspectRatio * 180 / Math.PI, 
                   aspectRatio,
                   0.1,                  // near clipping plane
                   camera.viewDistance,  // far clipping plane
                   pMatrix);

  // Position for camera
  mat4.identity(mvMatrix);
  mat4.rotateX(mvMatrix, camera.pitch);
  mat4.rotateY(mvMatrix, camera.yaw);
  mat4.translate(mvMatrix, [-camera.x, -camera.y, -camera.z]);
  mat4.translate(mvMatrix, [0, -EYE_HEIGHT, 0]);

  // Render the world

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, TERRAIN_TEXTURE);
  gl.uniform1i(SHADER.uSampler, 0);
  gl.uniform1f(SHADER.uFogDistance, 2 * AVATAR.viewDistance / 5);
  gl.uniform1f(SHADER.uSunlight, GAME.sunlight);

  var headblock = block(AVATAR.x, AVATAR.y + EYE_HEIGHT, AVATAR.z);
  if (headblock.type.translucent) {
    var rgba = headblock.type.translucent;
    $('stats').style.backgroundColor = 'rgba(' + rgba.join(',') + ')';
  } else {
    $('stats').style.backgroundColor = '';
  }
  
  // Set matrix uniforms
  gl.uniformMatrix4fv(SHADER.uPMatrix,  false,  pMatrix);
  gl.uniformMatrix4fv(SHADER.uMVMatrix, false, mvMatrix);
  

  // Render opaque blocks
  gl.disable(gl.CULL_FACE);  // don't cull backfaces (decals are 1-sided)
  for (var i in GAME.chunks) {
    var c = GAME.chunks[i];
    if (c.visible)
      c.opaqueBuffers.render(SHADER);
  }

  // Render entities
  // For now generate all the info each time
  var nttSet = {
    aVertexPosition: [],
    aTextureCoord: [],
    aLighting: [],
    indices: [],
  };
  var justUpdateLight = false;
  for (var i in GAME.entities) {
    var ntt = GAME.entities[i];
    if (ntt.type.geometry) {
      var geo = ntt.type.geometry(ntt);
      nttSet.aLighting.push.apply(nttSet.aLighting, geo.lighting);
      if (justUpdateLight)
        continue;
      var pindex = nttSet.aVertexPosition.length / 3;
      nttSet.aVertexPosition.push.apply(nttSet.aVertexPosition, geo.positions);
      nttSet.aTextureCoord.push.apply(nttSet.aTextureCoord, geo.textures);
      for (var j = 0; j < geo.indices.length; ++j)
        nttSet.indices.push(pindex + geo.indices[j]);
    }
  }
  var nttBuffers = new BufferSet(nttSet);
  nttBuffers.render(SHADER);


  // Render particles
  PARTICLES.render();

  // Render translucent blocks
  SHADER.use();
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.BLEND);
  gl.enable(gl.CULL_FACE);  // cull backfaces!
  for (var i in GAME.chunks) {
    var c = GAME.chunks[i];
    if (c.visible)
      c.translucentBuffers.render(SHADER);
  }
  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);

  // Render block selection indicator
  if (PICKED) {
    mvPushMatrix();
    mat4.translate(mvMatrix, [PICKED.x, PICKED.y, PICKED.z]);

    WIREFRAME.shader.use();

    gl.lineWidth(2);

    gl.uniformMatrix4fv(WIREFRAME.shader.uPMatrix,  false,  pMatrix);
    gl.uniformMatrix4fv(WIREFRAME.shader.uMVMatrix, false, mvMatrix);

    gl.bindBuffer(gl.ARRAY_BUFFER, WIREFRAME.aPosBuffer);
    gl.vertexAttribPointer(WIREFRAME.shader.aPos,
                           WIREFRAME.aPosBuffer.itemSize,
                           gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, WIREFRAME.indexBuffer);
    gl.drawElements(gl.LINES, 
                    WIREFRAME.indexBuffer.numItems,
                    gl.UNSIGNED_SHORT, 
                    0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

    gl.enable(gl.DEPTH_TEST);
    mvPopMatrix();
  }

  RENDER_STAT.end();
}

quat4.rotateX = function (quat, angle, dest) {
  if (!dest) dest = quat;
  quat4.multiply(quat, [Math.sin(angle/2), 0, 0, Math.cos(angle/2)]);
}
quat4.rotateY = function (quat, angle, dest) {
  if (!dest) dest = quat;
  quat4.multiply(quat, [0, Math.sin(angle/2), 0, Math.cos(angle/2)]);
}


function frac(x) { return x - Math.floor(x); }
function carf(x) { return Math.ceil(x) - x; }


function updateWorld() {
  UPDATE_STAT.start();
  var waspicked = PICKED;
  var wasface = PICKED_FACE;
  PICKED = pickp();
  
  if (SPREAD_OUT) {
    var d = CHUNK_RADIUS;//AVATAR.viewDistance;
    for (var dx = -d; dx < d; dx += NX)
      for (var dz = -d; dz < d; dz += NZ)
        makeChunk(AVATAR.x + dx, AVATAR.z + dz);
  }
  
  for (var i in GAME.chunks) {
    var c = GAME.chunks[i];
    c.hdistance = Math.max(0, hDistance(AVATAR, c.centerPoint())-CHUNK_RADIUS);
    c.visible = (c.hdistance < AVATAR.viewDistance);
    c.update();
  }  

  for (var i in GAME.entities) {
    var ntt = GAME.entities[i];
    if (ntt.type.update) ntt.type.update.apply(ntt, [ntt]);
  }

  UPDATE_STAT.end();
}


function processInput(avatar, elapsed) {
  if (KEYS.O) {
    GAME.timeOfDay = (GAME.timeOfDay + elapsed) % (2*Math.PI);
    GAME.sunlight = 0.5 - Math.cos(GAME.timeOfDay) / 2;
  }

  // Movement keys
  avatar.ddx = avatar.ddz = 0;
  if (KEYS.W) avatar.ddz -= avatar.ACCELERATION;
  if (KEYS.A) avatar.ddx -= avatar.ACCELERATION;
  if (KEYS.S) avatar.ddz += avatar.ACCELERATION;
  if (KEYS.D) avatar.ddx += avatar.ACCELERATION;
  
  avatar.ddy = 0;
  if (avatar.flying || avatar.swimming) {
    // Fly up and down
    var ddp = avatar.ACCELERATION * elapsed;
    if (KEYS[' '])
      avatar.ddy += avatar.ACCELERATION;
    else if (KEYS[16]) // shift
      avatar.ddy -= avatar.ACCELERATION;
  }
}


function toggleMouselook() {
  AVATAR.mouselook = !AVATAR.mouselook;
  document.body.style.cursor = AVATAR.mouselook ? 'none' : '';
  $('warning').style.display = AVATAR.mouselook ? 'none' : '';
  if (!AVATAR.mouselook) lastX = null;
}


function ballistics(e, elapsed) {
  // Apply the laws of pseudo-physics

  e.swimming = e.falling && block(e).type.liquid;

  if (e.ddx || e.ddz) {
    // Accelerate in the XZ plane
    var ddp = e.ACCELERATION * elapsed;
    var cos = Math.cos(e.yaw);
    var sin = Math.sin(e.yaw);
    e.dx += elapsed * (e.ddx * cos - e.ddz * sin);
    e.dz += elapsed * (e.ddx * sin + e.ddz * cos);
  } else if (!e.falling) {
    // Drag. Not quite correct - needs to be applied in opp of dir of travel
    var ddp = e.ACCELERATION * elapsed;
    if (e.dx > 0) e.dx = Math.max(0, e.dx - ddp);
    if (e.dx < 0) e.dx = Math.min(0, e.dx + ddp);
    if (e.dz > 0) e.dz = Math.max(0, e.dz - ddp);
    if (e.dz < 0) e.dz = Math.min(0, e.dz + ddp);
  }

  if (e.ddy) {
    e.dy += elapsed * e.ddy;
  } else if (e.flying || e.swimming) {
    // Drag
    if (e.dy > 0) 
      e.dy = Math.max(0, e.dy - elapsed * e.ACCELERATION);
    else
      e.dy = Math.min(0, e.dy + elapsed * e.ACCELERATION);
  }

  // Limit speed
  var h = sqr(e.dx) + sqr(e.dz);
  if (e.flying || e.swimming) h += sqr(e.dy);
  h = Math.sqrt(h);
  
  var vmax = (e.flying ? e.FLY_MAX : e.WALK_MAX) *
    (1 - (block(e).type.viscosity||0));
  var f = h / vmax;
  if (f > 1) {
    e.dx /= f;
    e.dz /= f;
    if (e.flying || e.swimming) e.dy /= f;
  }

  if (e.dyaw) e.yaw += elapsed * e.dyaw;
  if (e.dpitch) e.pitch += elapsed * e.dpitch;

  if (e.dx || e.dz) {
    // Move and check collisions
    var ox = e.x, oy = e.y, oz = e.z;
    e.x += e.dx * elapsed;
    e.z += e.dz * elapsed;

    var stepup = (!e.swimming && (e.falling || e.flying)) ? 0 : 0.5;
    function blocked(x,y,z) { 
      for (var i = SY*Math.floor((y+stepup)/SY); i < y + e.height; i += SY)
        if (block(x, i, z).type.solid)
          return true;
      if (stepup && 
          block(x, y, z).type.solid && 
          block(x, y + e.height + stepup, z).type.solid)
        return true;  // Special case for steppin' up to not quite enough room
      return false;
    }

    // Check NSEW collisions
    if (e.dx < 0 && blocked(e.x - e.radius, e.y, e.z)) {
      e.x = Math.max(e.x, Math.floor(e.x) + e.radius);
      e.dx = (e.rebound || 0) * -e.dx;
    } else if (e.dx > 0 && blocked(e.x + e.radius, e.y, e.z)) {
      e.x = Math.min(e.x, Math.ceil(e.x) - e.radius);
      e.dx = (e.rebound || 0) * -e.dx;
    }
    if (e.dz < 0 && blocked(e.x, e.y, e.z - e.radius)) {
      e.z = Math.max(e.z, Math.floor(e.z) + e.radius);
      e.dz = (e.rebound || 0) * -e.dz;
    } else if (e.dz > 0 && blocked(e.x, e.y, e.z + e.radius)) {
      e.z = Math.min(e.z, Math.ceil(e.z) - e.radius);
      e.dz = (e.rebound || 0) * -e.dz;
    }
    
    // Check corner collisions
    var cw = (e.dx < 0 && frac(e.x) < e.radius);
    var ce = (e.dx > 0 && carf(e.x) > e.radius);
    var cs = (e.dz < 0 && frac(e.z) < e.radius);
    var cn = (e.dz > 0 && carf(e.z) > e.radius);
    if (cw && cs && blocked(e.x - e.radius, e.y, e.z - e.radius)) {
      // sw corner collision
      if (frac(e.x) > frac(e.z))
        e.x = Math.max(e.x, Math.floor(e.x) + e.radius);
      else
        e.z = Math.max(e.z, Math.floor(e.z) + e.radius);
    } else if (cw && cn && blocked(e.x - e.radius, e.y, e.z + e.radius)) {
      // nw corner collision
      if (frac(e.x) > carf(e.z))
        e.x = Math.max(e.x, Math.floor(e.x) + e.radius);
      else
        e.z = Math.min(e.z, Math.ceil(e.z) - e.radius);
    } else if (ce && cn && blocked(e.x + e.radius, e.y, e.z + e.radius)) {
      // ne corner collision
      if (carf(e.x) > carf(e.z))
        e.x = Math.min(e.x, Math.ceil(e.x) - e.radius);
      else
        e.z = Math.min(e.z, Math.ceil(e.z) - e.radius);
    } else if (ce && cs && blocked(e.x + e.radius, e.y, e.z - e.radius)) {
      // se corner collision
      if (carf(e.x) > frac(e.z))
        e.x = Math.min(e.x, Math.ceil(e.x) - e.radius);
      else
        e.z = Math.max(e.z, Math.floor(e.z) + e.radius);
    }
  }

  // Fall
  if (e.falling && !(e.swimming && (KEYS[' '] || KEYS[16])))
    e.dy -= GRAVITY * elapsed;

  e.y += e.dy * elapsed;

  if (block(e).type.solid) {
    if (e.flying || e.falling) {
      // Hit bottom
      if (e.rebound && e.falling && e.dy < 0) {
        // Bounce up
        e.dy = e.rebound * -e.dy - 3;
        e.dx /= 2;
        e.dz /= 2;
        if (e.dy < 0) {
          e.falling = false;
          e.dy = 0;
        }
      } else {
        // Landed
        e.flying = e.falling = false;
        e.dy = 0;
      }
      e.y = SY * Math.floor(e.y/SY + 1);
    } else {
      // Taking a half-step up, presumably
      e.y = Math.min(SY * Math.floor(e.y/SY + 1), e.y + elapsed * 5);
    }
  }

  if (!e.falling && !e.flying && !block(e.x, e.y-SY, e.z).type.solid) {
    // Fall off cliff
    e.falling = true;
    e.y = SY * Math.floor(e.y/SY) - 0.001;  // be in empty block below
    e.dy = 0;
  }
  
  if ((e.flying || e.falling) &&
      (e.dy > 0 && block(e.x, e.y + e.height, e.z).type.solid)) {
    // Bump head
    e.y = Math.min(e.y, SY * Math.floor((e.y + e.height)/SY) - e.height);
    e.dy = 0;
  }
}


function pickp() { 
  return pick(AVATAR.x, 
              AVATAR.y + EYE_HEIGHT, 
              AVATAR.z, 
              AVATAR.pitch, 
              AVATAR.yaw);
}
function pick(x, y, z, pitch, yaw) {
  // Compute length of ray which projects to length 1 on each axis
  var py = -1 / Math.sin(pitch);
  var ph =  1 / Math.cos(pitch);
  var px =  ph / Math.sin(yaw);
  var pz = -ph / Math.cos(yaw);

  var dist = 0;

  function next(w, pw) { 
    return pw * (pw < 0 ? Math.ceil(w-1) - w : Math.floor(w+1) - w);
  }
  function upy(y) { return SY*Math.ceil(y/SY-1) }
  function dny(y) { return SY*Math.floor(y/SY+1) }
  
  for (var i = 0; i < 3000; ++i) {
    // check out of bounds
    if (py < 0 ? y < 0 : y >= HY)
      break;
    if (dist > PICK_MAX)
      break;
    var b = block(x,y,z);
    if (!b.type.empty && !b.type.unpickable) 
      return b;

    var dx = next(x, px);
    var dy = py * (py < 0 ? upy(y) - y : dny(y) - y);
    var dz = next(z, pz);
    var h = 1.001;
    if (dz < dx && dz < dy) {
      h *= dz;
      PICKED_FACE = pz > 0 ? 0 : 1;
    } else if (dy < dx) {
      h *= dy;
      PICKED_FACE = py > 0 ? 2 : 3;
    } else {
      h *= dx;
      PICKED_FACE = px > 0 ? 4 : 5;
    }
    dist += h;
    x += h / px;
    y += h / py;
    z += h / pz;
  }
  return null;
}


window.requestAnimationFrame =
  window.requestAnimationFrame ||
  window.webkitRequestAnimationFrame ||
  window.mozRequestAnimationFrame ||
  window.oRequestAnimationFrame ||
  window.msRequestAnimationFrame;

function tick() {
  requestAnimationFrame(tick);

  // Monkey with the clock
  var timeNow = GAME.clock();
  if (!lastFrame) lastFrame = timeNow;
  var elapsed = timeNow - lastFrame;
  FPS_STAT.add(elapsed);
  if (elapsed > 0.1) elapsed = 0.05;  // Limit lagdeath
  lastFrame = timeNow;

  if (TERRAIN_TEXTURE.loaded) {
    if (KEYS.B) {
      blur(AVATAR, 256, 256);
    } else {
      gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
      drawScene(AVATAR);
    }
  }

  processInput(AVATAR, elapsed);

  for (var i in GAME.entities) {
    var ntt = GAME.entities[i];
    if (ntt.type.tick) ntt.type.tick.apply(ntt, [ntt]);
    ballistics(ntt, elapsed);
  }

  PARTICLES.tick(elapsed);

  if (timeNow > lastUpdate + UPDATE_PERIOD) {
    updateWorld();
    lastUpdate = timeNow;
  }

  var feedback = 
    RENDER_STAT + '<br>' + 
    FPS_STAT + '<br>' + 
    UPDATE_STAT + '<br>' +
    'Player: ' + AVATAR + '<br>' +
    'Time: ' + readableTime(GAME.timeOfDay) + ' &#9788;' + GAME.sunlight.toFixed(2);
  if (PICKED) {
    feedback += '<br>Picked: ' + PICKED + ' @' + PICKED_FACE;
    var pf = PICKED.neighbor(PICKED_FACE);
    if (pf) feedback += ' &rarr; ' + pf;
  }
  var keys = '';
  for (var k in KEYS) if (KEYS[k]) keys += ' ' + escape(k);
  if (keys.length > 0) feedback += '<br>Keys: ' + keys;
  $('stats').innerHTML = feedback;
}


function readableTime(t) {
  var ampm = t < Math.PI ? 'am' : 'pm';
  t = t % Math.PI;
  var h = Math.floor(12 * t / Math.PI);
  var m = Math.floor(60 * (12 * t / Math.PI - h));
  if (m < 10) m = '0' + m;
  if (h === 0) h = 12;
  if (h < 10) h = '&nbsp;' + h;
  return h + ':' + m + ' ' + ampm;
}


function handleLoadedTexture(texture) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  //gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, 
                gl.UNSIGNED_BYTE, texture.image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  // These help not at all with texture atlas bleeding problem
  //gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  //gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  texture.loaded = true;
}


function topmost(x, z) {
  for (var y = NY-1; y >= 0; --y) {
    var b = block(x, y*SY, z);
    if (b.type.solid) return b;
  }
  return null;
}


function Block(coord, chunk) {
  this.x = coord.x;
  this.y = coord.y;
  this.z = coord.z;

  this.i = coord.i;
  this.outofbounds = coord.outofbounds;
  this.chunk = chunk;

  this.light = [0, 0, 0, coord.y >= HY ? LIGHT_SUN : 0];

  this.dirtyLight = false;
  this.dirtyGeometry = false;

  this.type = BLOCK_TYPES.air;

  if (coord.data) {
    this.light = coord.data.light;
    this.dirtyLight = coord.data.dirtyLight;
    this.dirtyGeometry = coord.data.dirtyGeometry;
    this.type = BLOCK_TYPES[coord.data.type];
  }
}


Block.prototype.data = function () {
  return {
    light: this.light,
    dirtyLight: this.dirtyLight,
    dirtyGeometry: this.dirtyGeometry,
    type: this.type.name,
  };
}


Block.prototype.generateTerrain = function () {
  if (this.y == 0) {
    this.type = BLOCK_TYPES.bedrock;
  } else {
    var n = pinkNoise(this.x, this.y, this.z, 32, 2) + 
      (2 * this.y/SY - NY) / NY;
    if (n < -0.2) this.type = BLOCK_TYPES.rock;
    else if (n < -0.1) this.type = BLOCK_TYPES.dirt;
    else if (n < 0) this.type = GRASSY ? BLOCK_TYPES.dirt : BLOCK_TYPES.grass;
    else if (this.y < HY / 4) this.type = BLOCK_TYPES['apricot jelly'];
    //else if (this.y < HY / 2) this.type = BLOCK_TYPES.water;
    else this.type = BLOCK_TYPES.air;

    if (Math.pow(noise(this.x/10, this.y/10, this.z/10 + 1000), 3) < -0.12)
      this.type = BLOCK_TYPES.candy;

    // Caves
    if (Math.pow(noise(this.x/20, this.y/20, this.z/20), 3) < -0.1)
      this.type = BLOCK_TYPES.air;
  }
}

Block.prototype.invalidateLight = function (andNeighbors) {
  if (!this.dirtyLight) {
    this.dirtyLight = true;
    delete this.vertices;
    if (this.chunk)
      ++this.chunk.nDirty;
  }
  if (andNeighbors)
    this.eachNeighbor(function (n) { n.invalidateLight() });
}

Block.prototype.invalidateGeometry = function (andNeighbors) {
  if (!this.dirtyGeometry) {
    this.dirtyLight = true;
    this.dirtyGeometry = true;
    if (this.chunk)
      ++this.chunk.nDirty;
  }
  if (andNeighbors)
    this.eachNeighbor(function (n) { n.invalidateGeometry() });
}

Block.prototype.update = function () {
  if (this.dirtyGeometry)
    delete this.vertices;
  if (this.type.update)
    this.type.update.apply(this);
  this.dirtyLight = this.dirtyGeometry = false;
  var light = [0,0,0,0];
  if (this.type.opaque) {
    // Zero will do nicely
  } else {
    if (this.type.luminosity)
      for (var l = 0; l < 3; ++l)
        light[l] = this.type.luminosity[l];
    if (!this.sheltered)
      light[3] = LIGHT_SUN;
    this.eachNeighbor(function (n, face) {
      for (var l = 0; l < 4; ++l)
        light[l] = Math.max(light[l], n.light[l] - DISTANCE[face]);
    });
  }
  if (changeArray(this.light, light))
    this.eachNeighbor(function (n) { n.invalidateLight() });
}

function changeArray(a1, a2) {
  var changed = false;
  for (var i = 0; i < a1.length; ++i) {
    if (a1[i] !== a2[i]) {
      changed = true;
      a1[i] = a2[i];
    }
  }
  return changed;
}

Block.prototype.breakBlock = function () {
  var type = this.type;
  var pos = this.stackPos;
  this.type = BLOCK_TYPES.air;
  delete this.stackPos;
  this.invalidateGeometry(true);
  var drop = new Entity({ type: 'block', 
    x: this.x + 0.5, 
    y: this.y + (this.stack || this.height || SY)/2,
    z: this.z + 0.5
    }, this);
  drop.tile = type.tile;
  for (var i = 0; i < 20; ++i) {
    var p = PARTICLES.spawn({
      x0: PICKED.x + 0.5, 
      y0: PICKED.y + 0.5, 
      z0: PICKED.z + 0.5});
    //PARTICLES.bounceParticle(p);
  }
  if (type.stack) {
    if (pos > 0)
      this.neighbor(FACE_BOTTOM).breakBlock();
    if (pos + SY < type.stack)
      this.neighbor(FACE_TOP).breakBlock();
  }
}

Block.prototype.placeBlock = function (newType, stackPos) {
  if (typeof newType === 'string') BLOCK_TYPES[newType];
  this.type = newType;
  delete this.stackPos;
  this.invalidateGeometry(true);
  if (this.type.afterPlacement) 
    this.type.afterPlacement.apply(this);
  if (this.type.stack) {
    this.stackPos = stackPos || 0;
    if (this.stackPos + SY < this.type.stack)
      this.neighbor(FACE_TOP).placeBlock(newType, this.stackPos + SY);
  }
}

function tile(obj) {
  var t = obj.tile || obj.type.tile;
  if (typeof t === 'number') 
    return {s: t,    t: 0};
  else // assume array
    return {s: t[0], t:t[1]};
}

Block.prototype.toString = function () {
  var result = this.type.name + 
    ' [' + this.x + ',' + this.y + ',' + this.z + '] ' +
    '&#9788;' + this.light.join(',');
  if (this.outofbounds) result += ' &#9760;';
  if (this.sheltered) result += ' &#9730;';
  return result;
}


var ZERO = 0.01, ONE = 1-ZERO;


function geometryHash(b) {
  var v = b.vertices = {
    positions: [],
    lighting: [],
    textures: [],
    indices: [],
  };

  var L = b.type.margin || 0;
  var R = 1 - L;
  var H = b.type.height || Math.min(SY, R - L);
  var HASHES = b.type.hashes || 1;
  for (var i = 0; i < HASHES; ++i) {
    var s = (0.5 + i) / HASHES;
    var n = v.positions.length / 3;
    v.positions.push(b.x + L, b.y,     b.z + s,
                     b.x + R, b.y,     b.z + s,
                     b.x + R, b.y + H, b.z + s,
                     b.x + L, b.y + H, b.z + s,
                     b.x + s, b.y,     b.z + L,
                     b.x + s, b.y,     b.z + R,
                     b.x + s, b.y + H, b.z + R,
                     b.x + s, b.y + H, b.z + L);
    v.indices.push(n+0, n+1, n+2,  n+0, n+2, n+3,
                   n+4, n+5, n+6,  n+4, n+6, n+7);

    var tyle = tile(b);
    var bottom = 1;
    var top = bottom - H;

    // Keep away from edges of texture so as to not bleed the one next door
    if (bottom % 1 === 0) bottom -= ZERO;
    if (top % 1 === 0) top += ZERO;

    for (var j = 0; j < 2; ++j)
      v.textures.push(tyle.s + ZERO, tyle.t + bottom, 
                      tyle.s + ONE,  tyle.t + bottom, 
                      tyle.s + ONE,  tyle.t + top, 
                      tyle.s + ZERO, tyle.t + top);
  }
  for (var i = 0; i < v.positions.length/3; ++i)
    v.lighting.push.apply(v.lighting, b.light);
}


var _FACES = [
  [[0,0,0], [1,0,0], [1,1,0], [0,1,0]],  // front
  [[1,0,1], [0,0,1], [0,1,1], [1,1,1]],  // back
  [[0,0,1], [1,0,1], [1,0,0], [0,0,0]],  // bottom
  [[0,1,0], [1,1,0], [1,1,1], [0,1,1]],  // top
  [[0,0,1], [0,0,0], [0,1,0], [0,1,1]],  // right
  [[1,0,0], [1,0,1], [1,1,1], [1,1,0]]]; // left

function geometryBlock(b) {
  var v = b.vertices = {
    positions: [],
    lighting: [],
    textures: [],
    indices: [],
  };

  for (var face = 0; face < 6; ++face) {
    var n = b.neighbor(face);
    var omit = n.type.opaque;
    // This test isnt reliable until invalidate() invalidates neighbors 
    // of translucents better...I think maybe?
    omit = omit || (b.type.translucent && b.type === n.type);
    if (!omit) {
      // Add vertices
      var pindex = v.positions.length / 3;
      var f = _FACES[face];
      for (var i = 3; i >= 0; --i) {
        v.positions.push(b.x + f[i][0], b.y + f[i][1]*SY, b.z + f[i][2]);
        // One RGB lighting triple for each XYZ in the position buffer
        v.lighting.push.apply(v.lighting, n.light);
      }
      
      // Set textures per vertex: one ST pair for each vertex
      var tyle = tile(b);
      var bottom, top;
      if (face === FACE_TOP || face === FACE_BOTTOM) {
        bottom = 0;
        top = 1;
      } else {
        var pos = (typeof b.stackPos === 'undefined') ? frac(b.y) : b.stackPos;
        pos = SY - pos;
        bottom = pos;
        top = bottom + SY;
      }

      // Keep away from edges of texture so as to not bleed the one next door
      if (bottom % 1 === 0) bottom += ZERO;
      if (top % 1 === 0) top -= ZERO;

      v.textures.push(tyle.s + ONE,  tyle.t + bottom, 
                      tyle.s + ZERO, tyle.t + bottom, 
                      tyle.s + ZERO, tyle.t + top, 
                      tyle.s + ONE,  tyle.t + top);

      // Describe triangles
      v.indices.push(pindex, pindex + 1, pindex + 2,
                     pindex, pindex + 2, pindex + 3);
    }
  }
}


function cube(ntt) {
  var v = {
    positions: [],
    lighting: [],
    textures: [],
    indices: [],
  };

  var light = block(ntt).light;
  for (var face = 0; face < 6; ++face) {
    // Add vertices
    var pindex = v.positions.length / 3;
    var f = _FACES[face];
    for (var i = 3; i >= 0; --i) {
      var ff = Array(3);
      for (var j = 0; j < f[i].length; ++j) 
        ff[j] = ntt.type.scale * (f[i][j] - (j === 1 ? 0 : 0.5));
      var cos = Math.cos(ntt.yaw), sin = Math.sin(ntt.yaw);
      var dx = ff[0] * cos - ff[2] * sin;
      var dy = ff[1] * SY;
      var dz = ff[0] * sin + ff[2] * cos;
      v.positions.push(ntt.x + dx, ntt.y + dy, ntt.z + dz);
      v.lighting.push.apply(v.lighting, light);
    }
    
    var tyle = tile(ntt);
    v.textures.push(tyle.s + ONE,  tyle.t + ONE, 
                    tyle.s + ZERO, tyle.t + ONE, 
                    tyle.s + ZERO, tyle.t + ZERO, 
                    tyle.s + ONE,  tyle.t + ZERO);

    // Describe triangles
    v.indices.push(pindex, pindex + 1, pindex + 2,
                   pindex, pindex + 2, pindex + 3);
  }

  return v;
}


function Wireframe() {
  var vertices = [
    0,0,0, 1,0,0, 1,0,1, 0,0,1,  // bottom
    0,1,0, 1,1,0, 1,1,1, 0,1,1]; // top
  var indices = [
    4,5, 5,6, 6,7, 7,4,  // top
    0,1, 1,2, 2,3, 3,0,  // bottom
    0,4, 1,5, 2,6, 3,7]; // sides

  for (var i = 1; i < vertices.length; i += 3) vertices[i] *= SY;
  this.aPosBuffer = makeBuffer(vertices, 3);
  this.indexBuffer = makeBuffer(indices, 1, false, true);
}


function Entity(init1, init2) {
  var that = this;
  init1 = init1 || {};
  init2 = init2 || {};
  function init(prop, defa) {
    that[prop] = (typeof init1[prop] !== 'undefined') ? init1[prop] :
                 (typeof init2[prop] !== 'undefined') ? init2[prop] : defa;
  }
  init('x', 0);
  init('y', HY);
  init('z', 0);
  init('dx', 0);
  init('dy', 0);
  init('dz', 0);
  init('yaw', 0);
  init('pitch', 0);
  init('dyaw', 0);
  init('dpitch', 0);
  init('falling', false);
  init('type');
  if (typeof this.type === 'string') this.type = ENTITY_TYPES[this.type];
  this.birthday = GAME.clock();
  this.flying = this.falling = false;
  this.radius = 0.3;
  this.height = 1.8;
  this.WALK_MAX = 4.3; // m/s
  this.FLY_MAX = 10.8; // m/s
  this.SPIN_RATE = 2;  // radians/s
  this.ACCELERATION = 20;  // m/s^2
  this.id = GAME.nextEntityID++;
  GAME.entities[this.id] = this;
  if (this.type.init) this.type.init.apply(this);
}


Entity.prototype.die = function () {
  delete GAME.entities[this.id];
}

Entity.prototype.toString = function () {
  var result = '[' + this.x.toFixed(2) + ',' + this.y.toFixed(2) + ',' +
                 this.z.toFixed(2) + '] ';
  result += '&lt;' + this.yaw.toFixed(2) + ',' + this.pitch.toFixed(2) + '&gt';
  result += ' +[' + this.dx.toFixed(2) + ',' + this.dy.toFixed(2) + ',' + 
                this.dz.toFixed(2) + '] ';
  result += (this.flying ? 'F' : this.falling ? 'f' : 'w');
  if (this.swimming) result += 's';
  return result;
}


function initCamera(cam) {
  // Initialize parameters neccessary for cameras
  function i(p,v) { if (typeof cam[p] === 'undefined') cam[p] = v; }
  i('horizontalFieldOfView', Math.PI / 3);
  i('viewDistance', 20);
  i('pitch', 0);
  i('yaw', 0);
}


function onLoad() {
  var cancan = $('cancan');
  var canvas = $('canvas');

  // Create game
  GAME = new Game();
  makeChunk(0, 0);

  // Create player
  AVATAR = GAME.avatar = new Entity({type:'player', 
                                     x:NX/2 - 0.5, y:HY/2, z:NZ/2 + 0.5});
  initCamera(AVATAR);
  AVATAR.mouselook = false;
  AVATAR.lastHop = 0;
  AVATAR.viewDistance = 100;

  var b = topmost(AVATAR.x, AVATAR.z);
  if (b)
    AVATAR.y = b.y + 1;
  else 
    AVATAR.flying = true;

  initGL(canvas);

  SHADER = new Shader('shader');
  SHADER.use();
  SHADER.locate('aVertexPosition');
  SHADER.locate('aTextureCoord');
  SHADER.locate('aLighting');
  SHADER.locate('uSampler');
  SHADER.locate('uMVMatrix');
  SHADER.locate('uPMatrix');
  SHADER.locate('uFogDistance');
  SHADER.locate('uSunlight');

  WIREFRAME = new Wireframe();
  WIREFRAME.shader = new Shader('wireframe');
  WIREFRAME.shader.locate('aPos');
  WIREFRAME.shader.locate('uMVMatrix');
  WIREFRAME.shader.locate('uPMatrix');

  PARTICLES = new ParticleSystem();

  // Init texture

  TERRAIN_TEXTURE = gl.createTexture();
  TERRAIN_TEXTURE.image = new Image();
  TERRAIN_TEXTURE.image.onload = function() {
    handleLoadedTexture(TERRAIN_TEXTURE)
  }
  TERRAIN_TEXTURE.image.src = 'terrain.png';

  window.addEventListener('keydown', onkeydown, true);
  window.addEventListener('keyup',   onkeyup,   true);
  window.addEventListener('mousemove', onmousemove, true);
  window.addEventListener('mousedown', onmousedown, true);
  document.oncontextmenu = function () { return false };
  window.addEventListener('mouseout', function (event) {
    if (AVATAR.mouselook) {
      event = event || window.event;
      var from = event.relatedTarget || event.toElement;
      if (!from)
        toggleMouselook();
    }
  });
  $('reticule').addEventListener('mousemove', function (event) {
    if (!AVATAR.mouselook) {
      toggleMouselook();
      document.body.focus();  // get focus out of debug tools area
    }
  }, true);

  document.addEventListener('fullscreenchange', fullscreenChange, false);
  document.addEventListener('mozfullscreenchange', fullscreenChange, false);
  document.addEventListener('webkitfullscreenchange', fullscreenChange, false);
  
  document.addEventListener('pointerlockchange', pointerLockChange, false);
  document.addEventListener('mozpointerlockchange', pointerLockChange, false);
  document.addEventListener('webkitpointerlockchange',pointerLockChange,false);
  
  document.addEventListener('pointerlockerror', pointerLockError, false);
  document.addEventListener('mozpointerlockerror', pointerLockError, false);
  document.addEventListener('webkitpointerlockerror', pointerLockError, false);

  cancan.requestFullscreen = 
    cancan.requestFullscreen || 
    cancan.mozRequestFullscreen || 
    cancan.mozRequestFullScreen ||
    cancan.webkitRequestFullscreen;

  cancan.requestPointerLock = 
    cancan.requestPointerLock ||
    cancan.mozRequestPointerLock || 
    cancan.webkitRequestPointerLock;

  if (cancan.requestPointerLock)
    $('warning').innerHTML += '<br>...or hit L to go fullscreen and lock pointer';
  
  tick();
}


function onkeyup(event) { onkeydown(event, 0); }

function onkeydown(event, count) {
  event = event || window.event;
  if (event.preventDefault)
    event.preventDefault();

  var k = event.keyCode;
  var c = String.fromCharCode(k).toUpperCase();

  if (typeof count === 'undefined') 
    count = (KEYS[k] || 0) + 1;

  KEYS[k] = KEYS[c] = count;

  if (count === 1) {
    if (c === ' ') {
      if (GAME.clock() < AVATAR.lastHop + 0.25) {
        // Toggle flying
        AVATAR.flying = !AVATAR.flying;
        if (AVATAR.flying) AVATAR.falling = false;
      } else if (!AVATAR.flying && !AVATAR.falling) {
        // Jump!
        AVATAR.dy = VJUMP;
        AVATAR.falling = true;
      }
      AVATAR.lastHop = GAME.clock();
    }

    if (c === '0') 
      AVATAR.yaw = AVATAR.pitch = 0;
  
    if (c === '\t' || k === 27) // tab or escape
      toggleMouselook();

    if (c === 'L' && cancan.requestFullscreen && cancan.requestPointerLock)
      cancan.requestFullscreen();
    
    if (c === 'K' && PICKED) {
      for (var i = 0; i < 10; ++i) {
        var f = PICKED.neighbor(PICKED_FACE);
        var p = PARTICLES.spawn({x0: f.x+0.5, y0: f.y+0.5, z0: f.z+0.5});
        PARTICLES.bounceParticle(p);
      }
    }

    if (c === 'H') // Toggle chunk generation
      SPREAD_OUT = !SPREAD_OUT;

    // 'I', right paren/brace/bracket means select next tool
    if (k === 190 || k === 221 || c === 'I') { 
      var tooli = AVATAR.tool ? (AVATAR.tool.index + 1) % NBLOCKTYPES : 1;
      pickTool(tooli);
    }
    
    // Left paren/brace//bracket means select previous tool
    if (k === 188 || k === 219) {  
      var tooli = AVATAR.tool ? 
        (NBLOCKTYPES + AVATAR.tool.index - 1) % NBLOCKTYPES : NBLOCKTYPES - 1;
      pickTool(tooli);
    }

    // Number keys select first 10 tools
    var t = k - '0'.charCodeAt(0);
    if (0 <= t && t <= 9)
      pickTool(t || 10);
  }
}

function onmousemove(event) {
  if (AVATAR.mouselook) {
    var movementX, movementY;
    if (typeof lastX === 'undefined' || lastX === null) {
      movementX = movementY = 0;
    } else {
      movementX = event.movementX || 
        event.mozMovementX || 
        event.webkitMovementX ||
        (event.pageX - lastX);
      movementY = event.movementY || 
        event.mozMovementY ||
        event.webkitMovementY ||
        (event.pageY - lastY);
    }
    var spinRate = 0.01;
    AVATAR.yaw += movementX * spinRate;
    AVATAR.pitch += movementY * spinRate;
    AVATAR.pitch = Math.max(Math.min(Math.PI/2, AVATAR.pitch), -Math.PI/2);
    lastX = event.pageX;
    lastY = event.pageY;
  }
}


function onmousedown(event) {
  event = event || window.event;
  if (event.preventDefault) event.preventDefault();
  if (PICKED && AVATAR.mouselook) {
    if (event.button === 0) {
      PICKED.breakBlock();
    } else {
      var b = PICKED.neighbor(PICKED_FACE);
      if (!b.outofbounds)
        b.placeBlock(AVATAR.tool || PICKED.type);
    }
  }
  return false;
}


function Stat(name, alpha, beta) {
  this.name = name;
  this.alpha = alpha || 0.95;
  this.beta = beta || 0.99;
  this.low = 0;
  this.high = 0;
  this.value = 0;
  this.places = 1;
}

Stat.prototype.start = function () {
  this.startTime = +new Date();
}

Stat.prototype.end = function (startTime) {
  if (typeof startTime === 'undefined') startTime = this.startTime;
  this.add(+new Date() - startTime);
}

Stat.prototype.add = function (value) {
  this.value = this.alpha * this.value + (1-this.alpha) * value;
  this.low = value < this.low ? value : 
    this.beta * this.low + (1 - this.beta) * this.value;
  this.high = value > this.high ? value : 
    this.beta * this.high + (1 - this.beta) * this.value;
}

Stat.prototype.toString = function () {
  var v = this.value, l = this.low, h = this.high;
  if (this.invert) {
    v = 1/v;
    l = 1/h;
    h = 1/l;
  }
  return this.name + ': ' + v.toFixed(this.places) +  
    ' (' + l.toFixed(this.places) + ' ' + h.toFixed(this.places) + ')';
}

function fullscreenChange() {
  if ((document.webkitFullscreenElement || 
       document.mozFullscreenElement ||
       document.mozFullScreenElement) === cancan) {
    // Element is fullscreen, now we can request pointer lock
    //cancan.requestPointerLock();
  }
}


function pointerLockChange() {
  if ((document.mozPointerLockElement ||
       document.webkitPointerLockElement) === canvas) {
    console.log("Pointer Lock was successful.");
  } else {
    console.log("Pointer Lock was lost.");
  }
}


function pointerLockError() {
  console.log("Error while locking pointer.");
}

function tweak() { return (Math.random() - 0.5) }

ParticleSystem.prototype.spawn = function (init) {
  var rewind = Math.random();
  var p = {
    dx: 2 * tweak(),
    dy: 0.5 + 3 * Math.random(),
    dz: 2 * tweak(),
    x0: 0,
    y0: 0,
    z0: 0,
    id: PARTICLES.nextID++,
    birthday: GAME.clock() - rewind,
    life: rewind + 0.5 + Math.random() / 2,
  };
  for (var i in p)
    if (typeof init[i] !== 'undefined')
      p[i] = init[i];
  this.add(p);
  return p;
}

function ParticleSystem() {
  this.nextID = 1;
  this.particles = {};
  this.shader = new Shader('particle');
  this.shader.locate('aInitialPos');
  this.shader.locate('aVelocity');
  this.shader.locate('aBirthday');
  this.shader.locate('uClock');
  this.shader.locate('uGravity');
  this.shader.locate('uMVMatrix');
  this.shader.locate('uPMatrix');
}

ParticleSystem.prototype.add = function (p) {
  this.particles[p.id] = p;
  delete this.buffers;
}

ParticleSystem.prototype.remove = function (p) {
  delete this.particles[p.id];
  delete this.buffers;
}

ParticleSystem.prototype.tick = function (elapsed) {
  for (var i in this.particles) {
    var p = this.particles[i];
    p.life -= elapsed;
    if (p.life < 0)
      PARTICLES.remove(p);
  }
}

ParticleSystem.prototype.bounceParticle = function (p) {
  // Collide with whatever face will get hit first
  var tx = ((p.dx > 0) ? carf(p.x0) : frac(p.x0)) / p.dx;
  var tz = ((p.dz > 0) ? carf(p.z0) : frac(p.z0)) / p.dz;
  var ty = p.dy + Math.sqrt(p.dy * p.dy + 2 * PARTICLE_GRAVITY * frac(p.y0)) / 
    2 * PARTICLE_GRAVITY;
  var t = Math.min(tx, ty, tz);
  if (t < p.life) {
    var np = this.spawn({
      x0: p.x0 + t * p.dx,
      y0: p.y0 + t * p.dy - 0.5 * PARTICLE_GRAVITY * t * t,
      z0: p.z0 + t * p.dz,
      dy: p.dy - PARTICLE_GRAVITY * t,
      life: p.life - t,
      birthday: p.birthday + t});
    p.life -= t;
    var DAMPING = 0.5;
    if (t === tx)
      np.dx *= -DAMPING;
    else if (t === tz)
      np.dz *= -DAMPING;
    else
      np.dy *= -DAMPING;
    return np;
  }
}

function makeBuffer(data, itemsize, dynamic, elementArray) {
  var buffer = gl.createBuffer();
  var hint = dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW;
  var type = elementArray ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
  var Type = elementArray ? Uint16Array : Float32Array;
  gl.bindBuffer(type, buffer);
  gl.bufferData(type, new Type(data), hint);
  gl.bindBuffer(type, null);
  buffer.itemSize = itemsize;
  buffer.numItems = data.length / itemsize;
  return buffer;
}

function updateBuffer(buffer, data, itemsize, elementArray) {
  if (!data || data.length === 0)
    return null;
  var type = elementArray ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER;
  var Type = elementArray ? Uint16Array : Float32Array;
  if (!buffer || 
      buffer.itemSize !== itemsize ||
      buffer.itemSize * buffer.numItems < data.length) {
    buffer = gl.createBuffer();
    gl.bindBuffer(type, buffer);
    gl.bufferData(type, new Type(data), gl.DYNAMIC_DRAW);
    buffer.itemSize = itemsize;
    buffer.numItems = data.length / itemsize;
  } else {
    gl.bindBuffer(type, buffer);
    gl.bufferSubData(type, 0, new Float32Array(data));
  }
  gl.bindBuffer(type, null);
  return buffer;
}

// Encapsulates the set of buffers needed to render the world
function BufferSet(arrays) { 
  this.elementCount = 0;
  if (arrays) this.update(arrays);
}

BufferSet.prototype.empty = function () { return !this.elementCount }

BufferSet.prototype.update = function (arrays) {
  this.aVertexPosition = 
    updateBuffer(this.aVertexPosition, arrays.aVertexPosition, 3);
  this.aTextureCoord =   
    updateBuffer(this.aTextureCoord, arrays.aTextureCoord, 2);
  this.aLighting =
    updateBuffer(this.aLighting, arrays.aLighting, 4);
  this.indices =         
    updateBuffer(this.indices, arrays.indices, 1, true);
  this.elementCount = (arrays && arrays.indices) ? arrays.indices.length : 0;
}

BufferSet.prototype.updateLight = function (arrays) {
  this.aLighting = updateBuffer(this.aLighting, arrays.aLighting, 4);
}

BufferSet.prototype.render = function (shader) {
  if (this.empty()) return;
  pointToAttribute(shader, this, 'aVertexPosition');
  pointToAttribute(shader, this, 'aTextureCoord');
  pointToAttribute(shader, this, 'aLighting');
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indices);
  gl.drawElements(gl.TRIANGLES, this.elementCount, gl.UNSIGNED_SHORT, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
}


ParticleSystem.prototype.render = function () {

  this.shader.use();

  if (!this.buffers) {
    var aInitialPos = [];
    var aVelocity = [];
    var aBirthday = [];
    for (var i in this.particles) {
      var p = this.particles[i];
      aInitialPos.push(p.x0, p.y0, p.z0);
      aVelocity.push(p.dx, p.dy, p.dz);
      aBirthday.push(p.birthday);
    }
    this.buffers = {};
    this.buffers.aInitialPos = makeBuffer(aInitialPos, 3);
    this.buffers.aVelocity = makeBuffer(aVelocity, 3);
    this.buffers.aBirthday = makeBuffer(aBirthday, 1);
  }

  gl.uniform1f(this.shader.uClock, parseFloat(GAME.clock()));
  gl.uniform1f(this.shader.uGravity, PARTICLE_GRAVITY);
  gl.uniformMatrix4fv(this.shader.uPMatrix,  false,  pMatrix);
  gl.uniformMatrix4fv(this.shader.uMVMatrix, false, mvMatrix);

  gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.aInitialPos);
  gl.vertexAttribPointer(this.shader.aInitialPos,
                         this.buffers.aInitialPos.itemSize,
                         gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.aVelocity);
  gl.vertexAttribPointer(this.shader.aVelocity,
                         this.buffers.aVelocity.itemSize,
                         gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.aBirthday);
  gl.vertexAttribPointer(this.shader.aBirthday,
                         this.buffers.aBirthday.itemSize,
                         gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, null);
 
  gl.drawArrays(gl.POINTS, 0, this.buffers.aInitialPos.numItems);
}


function pickTool(blocktype) {
  if (typeof blocktype !== 'object') 
    blocktype = BLOCK_TYPES[blocktype];
  if (blocktype === BLOCK_TYPES.air)
    blocktype = null;
  AVATAR.tool = blocktype;
  $('toolname').innerText = blocktype ? blocktype.name : '';
  var toolcan = $('tool');
  var ctx = toolcan.getContext('2d');
  ctx.clearRect(0, 0, toolcan.width, toolcan.height);
  if (blocktype) {
    var tyle = tile(blocktype);
    ctx.drawImage($('terrain'), 
                  16 * tyle.s, 16 * tyle.t,  16, 16,
                  0, 0,                      toolcan.width, toolcan.height);
  }
}


function sqr(x) { return x * x }


function Game() {
  this.id = 1;
  this.chunks = {};
  this.entities = {};
  this.timeOfDay = Math.PI;  // 0 is midnight, PI is noon
  this.sunlight = 1;         // full daylight
  this.birthday = +new Date()/1000;
  this.nextEntityID = 1;
}


Game.prototype.clock = function () {
  return +new Date()/1000 - this.birthday;
}


Game.prototype.save = function (callback) {
  prepStorage(function () {
    var trans = DB.transaction(['games', 'chunks'], 'readwrite');
    var games = trans.objectStore('games');
    var chunks = trans.objectStore('chunks');
    var ckeys = Object.keys(this.chunks);
    var data = {
      timeOfDay: GAME.timeOfDay,
      nextEntityID: GAME.nextEntityID,
    };
    var req = (typeof GAME.id === 'unknown') ? games.add(data) : 
      games.put(data, GAME.id);
    function putone() {
      if (ckeys.length === 0)
        chunks.put(ckeys.pop());
      else
        callback();
    }        
    req.onsuccess = putone;
  });
}


function loadGame(gameid, callback) {
  prepStorage(function () {
    var trans = DB.transaction(['games', 'chunks'], 'readonly');
    var games = trans.objectStore('games');
    games.get(gameid).onsuccess = function (e) {
      var data = req.result.value;
      GAME = new Game();
      GAME.id = req.result.key;
      GAME.timeOfDay = data.timeOfDay;

      var chunks = trans.objectStore('chunks');
      chunks.openCursor().onsuccess = function(event) {
        var cursor = event.target.result;
        if (cursor) {
          new Chunk(cursor.value);
          cursor.continue();
        } else {
          callback();
        }
      };
    };      
  });
}
    
 
 
function prepStorage(callback) {
  if (DB) {
    setTimeout(callback, 0);
    return;
  }
  window.indexedDB = window.indexedDB || window.webkitIndexedDB || 
    window.mozIndexedDB || window.msIndexedDB;
  var req = window.indexedDB.open('dadacraft', 'Dadacraft');
  req.onsuccess = function (e) {
    DB = e.target.result;
    DB.onerror = function (e) {
      console.log('STORAGE ERROR: ' + e.target.errorCode, e);
    };
    if (DB.version === DB_VERSION) {
      setTimeout(callback, 0);
    } else {
      resetStorage(callback);
    }
  }
}

function resetStorage(callback) {
  var req = DB.setVersion(DB_VERSION);
  req.onsuccess = function(e) {
    // remove the store if it exists
    if (DB.objectStoreNames.contains('games'))
      DB.deleteObjectStore('games');
    if (DB.objectStoreNames.contains('chunks'))
      DB.deleteObjectStore('chunks');

    DB.createObjectStore('chunks', { keyPath: 'key' });
    DB.createObjectStore('games', { autoIncrement: true });
    
    // now call the handler outside of the 'versionchange' callstack
    var transaction = e.target.result;
    transaction.oncomplete = callback;
  };
}

function saveChunk(chunk, callback) {
  var chunks = DB.transaction(['chunks'], 'readwrite').objectStore('chunks');
  var req = chunks.put(chunk.data());
  req.onsuccess = callback;
}

function loadChunk(chunkid) {
  var chunks = DB.transaction(['chunks'], 'readonly').objectStore('chunks');
  var req = chunks.get(chunkid);
  req.onsuccess = function(e) {
    var cursor = req.result;
    if (cursor) {
      console.log(cursor.value);
      var c = new Chunk(cursor.value);
      console.log(c);
      cursor.continue();
    }
  };
  req.onerror = function (e) {
    console.log('ERROR LOADING', chunkid, e);
  }
}

function makeFramebuffer(w, h, depthBuffer, mipmap) {
  var fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  fb.left = 0;
  fb.top = 0;
  fb.width = w;  // stash dimensions for later
  fb.height = h;

  var fbt = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, fbt);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, 
                   mipmap ? gl.LINEAR_MIPMAP_NEAREST : gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fb.width, fb.height, 0, 
                gl.RGBA, gl.UNSIGNED_BYTE, null);
  if (mipmap)  gl.generateMipmap(gl.TEXTURE_2D);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, 
                          gl.TEXTURE_2D, fbt, 0);
  fb.texture = fbt;
  
  if (depthBuffer) {
    var rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, 
                           fb.width, fb.height);

    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, 
                               gl.RENDERBUFFER, rb);
  }

  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fb;
}

function makeFramebufferForTile(texture, s, t) {
  var fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  fb.left = s * 16 + 2;  // stash dimensions for later
  fb.top = t * 16 + 2;
  fb.width = 16 - 4;
  fb.height = 16 - 4;

  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, 
                          gl.TEXTURE_2D, texture, 0);

  var rb = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, 
                         texture.image.width, texture.image.height);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, 
                             gl.RENDERBUFFER, rb);

  gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fb;
}

function renderToFramebuffer(camera, fb) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.viewport(fb.left, fb.top, fb.width, fb.height);
  gl.scissor(fb.left, fb.top, fb.width, fb.height);
  gl.enable(gl.SCISSOR_TEST);
  drawScene(camera);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.disable(gl.SCISSOR_TEST);
}

var FB1, FB2, BLURH, BLURV, SAQ;
//var BLIT;
function blur(camera, w, h) {
  w = w || gl.viewportWidth;
  h = h || gl.viewportHeight;
  if (!FB1) {
    FB1 = makeFramebuffer(w, h, true, false);
    FB2 = makeFramebuffer(w, h, false, false);
    BLURH = new Shader('blur', 'blur-horizontal');
    BLURH.locate('aPos');
    BLURH.locate('uSrc');
    BLURV = new Shader('blur', 'blur-vertical');
    BLURV.locate('aPos');
    BLURV.locate('uSrc');
    SAQ = makeBuffer([-1,-1, +1,-1, +1,+1, -1,+1], 2);
    //BLIT = new Shader('blit');
    //BLIT.locate('aPos');
    //BLIT.locate('uSrc');
  }
  
  gl.enable(gl.DEPTH_TEST);

  renderToFramebuffer(camera, FB1);
  
  gl.disable(gl.DEPTH_TEST);
  
  //drawScreenAlignedQuad(BLIT, FB1);
  drawScreenAlignedQuad(BLURH, FB1, FB2);
  drawScreenAlignedQuad(BLURV, FB2);
}

function drawScreenAlignedQuad(shader, sourceFB, destFB) {
  shader.use();
  
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sourceFB.texture);
  gl.uniform1i(shader.uSrc, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, destFB);  // maybe be null
  gl.viewport(0, 0, 
              destFB ? destFB.width : gl.viewportWidth, 
              destFB ? destFB.height : gl.viewportHeight);

  gl.bindBuffer(gl.ARRAY_BUFFER, SAQ);
  gl.vertexAttribPointer(shader.aPos, SAQ.itemSize, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLE_FAN, 0, SAQ.numItems);
}
