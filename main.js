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

// Billboards
// http://nehe.gamedev.net/article/billboarding_how_to/18011/

// Web Audio API
// https://dvcs.w3.org/hg/audio/raw-file/tip/webaudio/specification.html
// http://0xfe.blogspot.com/2011/08/generating-tones-with-web-audio-api.html
// https://wiki.mozilla.org/Audio_Data_API (need to shim to Web Audio)


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
    tile: 1,
    color: [233/255, 107/255, 0/255],
    solid: true,
    opaque: true,
    plantable: true,
    geometry: geometryBlock,
  },
  grass: {
    tile: 1,
    color: [0.25, 0.5, 0],
    solid: true,
    opaque: true,
    plantable: true,
    geometry: geometryBlock,
    update: function () {
      if (this.neighbor(FACE_TOP).type.opaque)
        this.placeBlock(BLOCK_TYPES.dirt);
    },
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
    scale: 0.6,
    update: updatePlant,
  },
  grassy: {
    tile: [4,2],
    geometry: geometryHash,
    hashes: 2,
    height: 0.5,
  },
  soybeans: {
    tile: [7,2],
    geometry: geometryHash,
    hashes: 2,
    update: updatePlant,
    drop: 'soybean',
  },
  lamp: {
    tile: 9,
    geometry: geometryHash,
    luminosity: [8,2,2],
    scale: 0.6,
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
    init: function () {
      this.dyaw = 1;
      hopEntity(this);
      this.height = SY * this.type.scale;
      this.radius = 0.5 * this.type.scale;
      this.rebound = 0.75;
    },
    update: function (e) {
      if (age(e) > 1) {
        var d = distance(center(AVATAR), e);
        if (d < AVATAR.radius) {
          new Sound('pop');
          e.die();
        } else if (d < 3) {
          e.flying = true;
          e.dx = AVATAR.x - e.x;
          e.dy = AVATAR.y + 1 - e.y;
          e.dz = AVATAR.z - e.z;
          e.dx *= e.FLY_MAX / d;
          e.dy *= e.FLY_MAX / d;
          e.dz *= e.FLY_MAX / d;
        }
      }
    },
    scale: 0.25,
  },
  soybean: {
    tile: [9,2],
    init: function () {
      hopEntity(this);
    },
    geometry: geometryBillboard,
  },
};
var NENTITYTYPES = 0;
for (var i in ENTITY_TYPES) {
  ENTITY_TYPES[i].index = NENTITYTYPES++;
  ENTITY_TYPES[i].name = i;
}
for (var i in ENTITY_TYPES)
  ENTITY_TYPES[ENTITY_TYPES[i].index] = ENTITY_TYPES[i];


function hopEntity(ntt) {
  ntt.dx = 2 * tweak();
  ntt.dz = 2 * tweak();
  ntt.dy = 6;
  ntt.falling = true;
}

function updateResting() {
  if (!this.neighbor(FACE_BOTTOM).type.solid)
    this.breakBlock();
}


function updatePlant() {
  if (!this.neighbor(FACE_BOTTOM).type.plantable)
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
  return gl;
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

  // Locate all attributes
  var na = gl.getProgramParameter(this.program, gl.ACTIVE_ATTRIBUTES);
  for (var i = 0; i < na; ++i) {
    var a = gl.getActiveAttrib(this.program, i);
    this[a.name] = gl.getAttribLocation(this.program, a.name);
    gl.enableVertexAttribArray(this[a.name]);
  }

  // Locate all uniforms
  var nu = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
  for (var i = 0; i < nu; ++i) {
    var u = gl.getActiveUniform(this.program, i);
    this[u.name] = gl.getUniformLocation(this.program, u.name);
  }
}

Shader.prototype.use = function () {
  gl.useProgram(this.program);
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

  // Plant some soybeans
  for (var xi = 0; xi < NX; ++xi) {
    var x = xi + this.chunkx;
    for (var zi = 0; zi < NZ; ++zi) {
      var z = zi + this.chunkz;
      if (noise(x/10,9938,z/10) < -0.2) {
        var t = topmost(x, z);
        if (t && t.type.plantable)
          t.neighbor(FACE_TOP).type = BLOCK_TYPES.soybeans;
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
    if (t && t.type.plantable)
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
        b.sheltered = sheltered;
        sheltered = sheltered || b.type.opaque || b.type.translucent;
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
        dest.aPos = [];
        dest.aTexCoord = [];
        dest.aLighting = [];
        dest.aColor = [];
        dest.indices = [];
      }
      dest.aLighting.push.apply(dest.aLighting, b.vertices.aLighting);
      if (justUpdateLight)
        continue;
      dest.aColor.push.apply(dest.aColor, b.vertices.aColor);
      var pindex = dest.aPos.length / 3;
      dest.aPos.push.apply(dest.aPos, b.vertices.aPos);
      dest.aTexCoord.push.apply(dest.aTexCoord, b.vertices.aTexCoord);
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
      if (b.type.update)
        b.type.update.apply(b);
      if (b.dirtyLight || b.dirtyGeometry) {
        if (b.dirtyLight) uplights++;
        if (b.dirtyGeometry) upgeoms++;
        b.update();
      }
    }

    this.lastUpdate = GAME.clock();
    this.generateBuffers(upgeoms === 0);
    message('Update: ', this.chunkx, this.chunkz, ':', 
            uplights, upgeoms, '->', this.nDirty);
  } else {
    // Update some random block in this chunk
    var b = this.blocks[Math.floor(Math.random() * NX * NY * NZ)];
    if (b.type.update)
      b.type.update.apply(b);
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
    aPos: [],
    aTexCoord: [],
    aLighting: [],
    aColor: [],
    indices: [],
  };
  var justUpdateLight = false;
  for (var i in GAME.entities) {
    var ntt = GAME.entities[i];
    if (ntt.type.geometry) {
      var color = ntt.type.color || [1,1,1];
      var geo = ntt.type.geometry(ntt);
      nttSet.aLighting.push.apply(nttSet.aLighting, geo.aLighting);
      if (justUpdateLight)
        continue;
      nttSet.aColor.push.apply(nttSet.aColor, geo.aColor);
      var pindex = nttSet.aPos.length / 3;
      nttSet.aPos.push.apply(nttSet.aPos, 
                                        geo.aPos);
      nttSet.aTexCoord.push.apply(nttSet.aTexCoord, 
                                      geo.aTexCoord);
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
  if (cancan.requestPointerLock) {
    if (AVATAR.pointerLocked)
      document.exitPointerLock();
    else
      cancan.requestPointerLock();
  } else {
    AVATAR.mouselook = !AVATAR.mouselook;
    document.body.style.cursor = AVATAR.mouselook ? 'none' : 'default';
    $('warning').style.display = AVATAR.mouselook ? 'none' : 'block';
    if (!AVATAR.mouselook) lastX = null;
  }
  $('logo').style.opacity = '0';
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
    if (b && !b.type.empty && !b.type.unpickable) 
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
    if (b.type.solid || b.type.liquid) return b;
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
  if (this.y < 0.75 + 2*noise(this.x * 23.2, this.y * 938.2, this.z * 28.1)) {
    this.type = BLOCK_TYPES.bedrock;
  } else {
    var n = pinkNoise(this.x, this.y, this.z, 32, 2) + 
      (2 * this.y/SY - NY) / NY;
    if (n < -0.2) this.type = BLOCK_TYPES.rock;
    else if (n < -0.1) this.type = BLOCK_TYPES.dirt;
    else if (n < 0) this.type = GRASSY ? BLOCK_TYPES.dirt : BLOCK_TYPES.grass;
    else if (this.y < HY / 4) this.type = BLOCK_TYPES['apricot jelly'];
    else if (this.y < HY / 2) this.type = BLOCK_TYPES.water;
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
  if (this.type.empty) return;
  var type = this.type;
  var pos = this.stackPos;
  var tyle = tile(this);
  this.type = BLOCK_TYPES.air;
  delete this.stackPos;
  this.invalidateGeometry(true);
  if (!pos) {
    var drop = new Entity({ 
      type: type.drop || 'block',
      x: this.x + 0.5, 
      y: this.y + (this.stack || this.height || SY)/2,
      z: this.z + 0.5
    }, this);
    drop.sourcetype = type;
  }
  for (var i = 0; i < 20; ++i) {
    var p = PARTICLES.spawn({
      x0: this.x + 0.5, 
      y0: this.y + 0.5, 
      z0: this.z + 0.5,
      tile: tyle,
    });
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
  var t = obj.tile || obj.type.tile || obj.sourcetype.tile;
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
    aPos: [],
    aLighting: [],
    aColor: [],
    aTexCoord: [],
    indices: [],
  };

  var L = (1 - (b.type.scale||1)) / 2;
  var R = 1 - L;
  var H = b.type.scale || 1;
  var HASHES = b.type.hashes || 1;
  for (var i = 0; i < HASHES; ++i) {
    var s = (0.5 + i) / HASHES;
    var n = v.aPos.length / 3;
    v.aPos.push(b.x + L, b.y,     b.z + s,
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
    var top = bottom - 1;

    // Keep away from edges of texture so as to not bleed the one next door
    if (bottom % 1 === 0) bottom -= ZERO;
    if (top % 1 === 0) top += ZERO;

    for (var j = 0; j < 2; ++j)
      v.aTexCoord.push(tyle.s + ZERO, tyle.t + bottom, 
                       tyle.s + ONE,  tyle.t + bottom, 
                       tyle.s + ONE,  tyle.t + top, 
                       tyle.s + ZERO, tyle.t + top);
  }
  for (var i = 0; i < v.aPos.length/3; ++i) {
    v.aLighting.push.apply(v.aLighting, b.light || block(b).light);
    v.aColor.push.apply(v.aColor, b.type.color || [1,1,1]);
  }
  return v;
}

function vclamp(v) {
  for (var i = 0; i < v.length; ++i)
    v[i] = Math.min(1, Math.max(0, v[i]));
  return v;
}

function tweaker(pos) {
  //return [0,0,0];
  return [
    0.25 * pinkNoise(pos[0], pos[1], pos[2]+1593.1, 4, 1),
    0.25 * pinkNoise(pos[0], pos[1], pos[2]+2483.7, 4, 1), 
    0.25 * pinkNoise(pos[0], pos[1], pos[2]+9384.3, 4, 1) 
  ];
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
    aPos: [],
    aLighting: [],
    aColor: [],
    aTexCoord: [],
    indices: [],
  };

  for (var face = 0; face < 6; ++face) {
    var n = b.neighbor(face);
    var omit = n.type.opaque;
    omit = omit || (b.type.translucent && b.type === n.type);
    if (!omit) {
      // Add vertices
      var pindex = v.aPos.length / 3;
      var f = _FACES[face];
      for (var i = 3; i >= 0; --i) {
        var coord = [b.x + f[i][0], b.y + f[i][1] * SY, b.z + f[i][2]];
        v.aPos.push.apply(v.aPos, coord);
        v.aLighting.push.apply(v.aLighting, n.light);
        var color = b.type.color || [1,1,1];        
        v.aColor.push.apply(v.aColor, 
                            vclamp(vec3.add(color, tweaker(coord), [0,0,0])));
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
      
      // Keep away from edges of texture so as to not bleed neighboring
      if (bottom % 1 === 0) bottom += ZERO;
      if (top % 1 === 0) top -= ZERO;

      v.aTexCoord.push(tyle.s + ONE,  tyle.t + bottom, 
                       tyle.s + ZERO, tyle.t + bottom, 
                       tyle.s + ZERO, tyle.t + top, 
                       tyle.s + ONE,  tyle.t + top);

      // Describe triangles
      v.indices.push(pindex, pindex + 1, pindex + 2,
                     pindex, pindex + 2, pindex + 3);
    }
  }
}

function hash(ntt) {
  geometryHash(ntt);
  for (var i = 0; i < ntt.vertices.aPos.length; i += 3) {
    ntt.vertices.aPos[i] -= 0.5;
    ntt.vertices.aPos[i+2] -= 0.5;
  }
  return ntt.vertices;
}


function geometryBillboard(b) {
  var v = b.vertices = {
    aPos: [],
    aLighting: [],
    aColor: [1,1,1, 1,1,1, 1,1,1, 1,1,1],
    //aTexCoord: [],
    indices: [0, 1, 2, 0, 2, 3],
  };

  var light = block(b).light;

  // "Look" vector pointing at player
  var l = vec3.create([
    AVATAR.x - b.x, 
    AVATAR.y + EYE_HEIGHT - b.y, 
    AVATAR.z - b.z]);
  vec3.normalize(l);

  // "Right" vector projected on y plane perp to l
  var r = vec3.create([l[2], 0, -l[0]]);
  vec3.normalize(r);

  // "Up" vector
  var u = vec3.cross(l, r, vec3.create());
  vec3.normalize(u);  // probably already unit though, eh?
  //var trans = mat3.create(r.concat(u, l));

  var S = 0.25;
  var quad = [-S,-S, S,-S, S,S, -S,S];
  var bob = (1 + Math.sin(2 * age(b))) / 16;
  var p = [b.x, b.y + S + bob, b.z];
  for (var i = 0; i < quad.length; i += 2) {
    var x = quad[i], y = quad[i+1], z = -0.5;
    for (var t = 0; t < 3; ++t)
      v.aPos.push(x * r[t] + y * u[t] + p[t]);
    v.aLighting.push.apply(v.aLighting, light);
  }
    
  var tyle = tile(b);
  var bottom = 1 - ZERO;
  var top = ZERO;
  v.aTexCoord = [tyle.s + ZERO, tyle.t + ONE, 
                 tyle.s + ONE,  tyle.t + ONE, 
                 tyle.s + ONE,  tyle.t + ZERO, 
                 tyle.s + ZERO, tyle.t + ZERO];
  return v;
}



function cube(ntt) {
  if (ntt.sourcetype.geometry === geometryHash)
    return hash(ntt);

  var v = {
    aPos: [],
    aLighting: [],
    aColor: [],
    aTexCoord: [],
    indices: [],
  };

  var light = block(ntt).light;
  var color = ntt.type.color || (ntt.sourcetype||{}).color || [1,1,1];
  var h = ntt.type.stack || (ntt.sourcetype||{}).stack || SY;
  for (var face = 0; face < 6; ++face) {
    // Add vertices
    var pindex = v.aPos.length / 3;
    var f = _FACES[face];
    var bob = (1 + Math.sin(2 * age(ntt))) / 16;
    for (var i = 3; i >= 0; --i) {
      var ff = Array(3);
      for (var j = 0; j < f[i].length; ++j) 
        ff[j] = ntt.type.scale * (f[i][j] - (j === 1 ? 0 : 0.5));      
      var cos = Math.cos(ntt.yaw), sin = Math.sin(ntt.yaw);
      var dx = ff[0] * cos - ff[2] * sin;
      var dy = ff[1] * h + bob;
      var dz = ff[0] * sin + ff[2] * cos;
      v.aPos.push(ntt.x + dx, ntt.y + dy, ntt.z + dz);
      v.aLighting.push.apply(v.aLighting, light);
      v.aColor.push.apply(v.aColor, color);
    }
    
    var tyle = tile(ntt);
    if (h % 1 === 0) h -= ZERO;
    v.aTexCoord.push(tyle.s + ONE,  tyle.t + ONE, 
                     tyle.s + ZERO, tyle.t + ONE, 
                     tyle.s + ZERO, tyle.t + 1 - h,
                     tyle.s + ONE,  tyle.t + 1 - h);

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
  this.isEntity = true;
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

  // Polyfills
  cancan.requestFullscreen = 
    cancan.requestFullscreen || 
    cancan.mozRequestFullscreen || 
    cancan.mozRequestFullScreen ||
    cancan.webkitRequestFullscreen;
  cancan.requestPointerLock = 
    cancan.requestPointerLock ||
    cancan.mozRequestPointerLock || 
    cancan.webkitRequestPointerLock;
  document.exitPointerLock = document.exitPointerLock ||
    document.mozExitPointerLock ||
    document.webkitExitPointerLock;

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

  if (!initGL(canvas)) {
    $('warning').innerHTML = '<b>Error of errors! Unable to initialize WebGL!</b><br><br><br>Perhaps your browser is hopelessly backwards and out of date. Try the latest Chrome or Firefox.<br><br>If that\'s not the problem, you might try restarting your browser.';
    $('warning').style.display = 'block';
    $('warning').style.width = '80%';
    $('warning').style.left = '10%';
    $('reticule').style.display = 'none';
    $('inventory').style.display = 'none';
  }

  SHADER = new Shader('shader');
  SHADER.use();

  WIREFRAME = new Wireframe();
  WIREFRAME.shader = new Shader('wireframe');

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

  document.addEventListener('fullscreenchange', fullscreenChange, false);
  document.addEventListener('mozfullscreenchange', fullscreenChange, false);
  document.addEventListener('webkitfullscreenchange', fullscreenChange, false);
  
  document.addEventListener('pointerlockchange', pointerLockChange, false);
  document.addEventListener('mozpointerlockchange', pointerLockChange, false);
  document.addEventListener('webkitpointerlockchange',pointerLockChange,false);
  
  document.addEventListener('pointerlockerror', pointerLockError, false);
  document.addEventListener('mozpointerlockerror', pointerLockError, false);
  document.addEventListener('webkitpointerlockerror', pointerLockError, false);

  if (cancan.requestPointerLock) {
    $('warning').innerHTML = 'Click game or hit TAB to activate mouselook';
    pointerLockChange({});
  } else {
    toggleMouselook();
    toggleMouselook();
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
  }

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
        new Sound('jump');
      }
      AVATAR.lastHop = GAME.clock();
    }

    // Q same as left mouse button
    if (c === 'Q' && PICKED)
      PICKED.breakBlock();

    // E same as right mouse button
    if (c === 'E' && PICKED) {
      var b = PICKED.neighbor(PICKED_FACE);
      if (!b.outofbounds)
        b.placeBlock(AVATAR.tool || PICKED.type);
    }

    if (c === '0') 
      AVATAR.yaw = AVATAR.pitch = 0;
  
    if (c === '\t' || k === 27) // tab or escape
      toggleMouselook();

    if (c === 'L' && cancan.requestFullscreen)
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

    if (c === 'T') {
      // Toggle options page
      window.showOptions = !window.showOptions;
      $('options').style.display = window.showOptions ? 'block' : 'none';
      $('hud').style.display = window.showOptions ? 'none' : 'block';
    }

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
  if (AVATAR.mouselook || AVATAR.pointerLocked) {
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
  if (window.showOptions) return;
  event = event || window.event;
  if (event.preventDefault) event.preventDefault();
  if (PICKED && (AVATAR.mouselook || AVATAR.pointerLocked)) {
    if (event.button === 0) {
      PICKED.breakBlock();
      //new Sound('hitHurt');
    } else {
      var b = PICKED.neighbor(PICKED_FACE);
      if (!b.outofbounds)
        b.placeBlock(AVATAR.tool || PICKED.type);
    }
  } else if (cancan.requestPointerLock && !AVATAR.pointerLocked) {
    toggleMouselook();
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
  AVATAR.fullscreen = (document.webkitFullscreenElement || 
                       document.mozFullscreenElement ||
                       document.mozFullScreenElement) === cancan;
}

function pointerLockChange() {
  AVATAR.pointerLocked = (document.mozPointerLockElement ||
                          document.webkitPointerLockElement) === cancan;
  lastX = null;
  $('warning').style.display = AVATAR.pointerLocked ? 'none' : 'block';
  if (!AVATAR.mouselook) lastX = null;

}


function pointerLockError(e) {
  console.log("Error while locking pointer. " + e, e);
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
    tile: {s:10, t:0},
  };
  for (var i in p)
    if (typeof init[i] !== 'undefined')
      p[i] = init[i];
  p.tile = [p.tile.s * 16 + 1 + Math.floor(Math.random() * 14),
            p.tile.t * 16 + 1 + Math.floor(Math.random() * 14)],
  this.add(p);
  return p;
}

function ParticleSystem() {
  this.nextID = 1;
  this.particles = {};
  this.shader = new Shader('particle');
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
    gl.bufferSubData(type, 0, new Type(data));
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
  this.aPos =      updateBuffer(this.aPos, arrays.aPos, 3);
  this.aTexCoord = updateBuffer(this.aTexCoord, arrays.aTexCoord, 2);
  this.aLighting = updateBuffer(this.aLighting, arrays.aLighting, 4);
  this.aColor =    updateBuffer(this.aColor, arrays.aColor, 3);
  this.indices =   updateBuffer(this.indices, arrays.indices, 1, true);
  this.elementCount = (arrays && arrays.indices) ? arrays.indices.length :0;
}

BufferSet.prototype.updateLight = function (arrays) {
  this.aLighting = updateBuffer(this.aLighting, arrays.aLighting, 4);
}

BufferSet.prototype.render = function (shader) {
  if (this.empty()) return;
  pointToAttribute(shader, this, 'aPos');
  pointToAttribute(shader, this, 'aTexCoord');
  pointToAttribute(shader, this, 'aLighting');
  pointToAttribute(shader, this, 'aColor');
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
    var aTexCoord = [];
    for (var i in this.particles) {
      var p = this.particles[i];
      aInitialPos.push(p.x0, p.y0, p.z0);
      aVelocity.push(p.dx, p.dy, p.dz);
      aBirthday.push(p.birthday);
      aTexCoord.push.apply(aTexCoord, p.tile);
    }
    this.buffers = {};
    this.buffers.aInitialPos = makeBuffer(aInitialPos, 3);
    this.buffers.aVelocity = makeBuffer(aVelocity, 3);
    this.buffers.aBirthday = makeBuffer(aBirthday, 1);
    this.buffers.aTexCoord = makeBuffer(aTexCoord, 2);
  }

  gl.uniform1f(this.shader.uClock, parseFloat(GAME.clock()));
  gl.uniform1f(this.shader.uGravity, PARTICLE_GRAVITY);
  gl.uniformMatrix4fv(this.shader.uPMatrix,  false,  pMatrix);
  gl.uniformMatrix4fv(this.shader.uMVMatrix, false, mvMatrix);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, TERRAIN_TEXTURE);
  var ext = gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic");
  if (ext)
    gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 
                     $('anisotropic').checked ? 4 : 1);
  gl.uniform1i(this.shader.uSampler, 0);

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

  gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.aTexCoord);
  gl.vertexAttribPointer(this.shader.aTexCoord,
                         this.buffers.aTexCoord.itemSize,
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
    BLURV = new Shader('blur', 'blur-vertical');
    SAQ = makeBuffer([-1,-1, +1,-1, +1,+1, -1,+1], 2);
    //BLIT = new Shader('blit');
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


function vmult(v, w, result) {
  result = result || Array(v.length);
  for (var i = 0; i < v.length; ++i) 
    result[i] = v[i] * w[i];
  return result;
}


function center(e) {
  return {x:e.x, y:e.y + (e.height||SY)/2, z:e.z};
}


// Wave shapes
var SQUARE = 0;
var SAWTOOTH = 1;
var SINE = 2;
var NOISE = 3;
var masterVolume = 0.2;
var OVERSAMPLING = 8;
function frnd(range) {
  return Math.random() * range;
}

function rndr(from, to) {
  return Math.random() * (to - from) + from;
}

function rnd(max) {
  return Math.floor(Math.random() * (max + 1));
}

var _AUDIO_CONTEXT;
function Sound(sound) {
  var that = this;
  var k = new Knobs();
  if (sound) k[sound]();
  this.init(k);
  if (!_AUDIO_CONTEXT)
    _AUDIO_CONTEXT = new webkitAudioContext();
  var node = _AUDIO_CONTEXT.createJavaScriptNode(4096, 0, 1);
  node.connect(_AUDIO_CONTEXT.destination);
  node.onaudioprocess = function (e) {
    if (that.done) node.disconnect();
    that.generate(e.outputBuffer.getChannelData(0));
  }
  this.node = node;
  this.knobs = k;
}


Sound.prototype.initForRepeat = function(ps) {
  this.elapsedSinceRepeat = 0;
  
  this.period = OVERSAMPLING * 44100 / ps.frequency;
  this.periodMax = OVERSAMPLING * 44100 / ps.frequencyMin;
  this.enableFrequencyCutoff = (ps.frequencyMin > 0);
  this.periodMult = Math.pow(.5, ps.frequencySlide / 44100);
  this.periodMultSlide = ps.frequencySlideSlide * Math.pow(2, -44101/44100)
    / 44100;
  
  this.dutyCycle = ps.dutyCycle;
  this.dutyCycleSlide = ps.dutyCycleSweep / (OVERSAMPLING * 44100);
  
  this.arpeggioMultiplier = 1 / ps.arpeggioFactor;
  this.arpeggioTime = ps.arpeggioDelay * 44100;
}


Sound.prototype.init = function (ps) {
  this.params = ps;
  this.t = 0;

  //
  // Convert user-facing parameter values to units usable by the sound
  // generator
  //

  this.initForRepeat(ps);  // First time through, this is a bit of a misnomer

  // Waveform shape
  this.waveShape = ps.shape;

  // Low pass filter
  this.fltw = ps.lowPassFrequency / (OVERSAMPLING * 44100 + ps.lowPassFrequency);
  this.enableLowPassFilter = ps.lowPassFrequency < 44100;
  this.fltw_d = Math.pow(ps.lowPassSweep, 1/44100);
  this.fltdmp = (1 - ps.lowPassResonance) * 9 * (.01 + this.fltw);

  // High pass filter
  this.flthp = ps.highPassFrequency / (OVERSAMPLING * 44100 + ps.highPassFrequency);
  this.flthp_d = Math.pow(ps.highPassSweep, 1/44100);

  // Vibrato
  this.vibratoSpeed = ps.vibratoRate * 64 / 44100 / 10;
  this.vibratoAmplitude = ps.vibratoDepth;

  // Envelope
  this.envelopeLength = [
    Math.floor(ps.attack * 44100),
    Math.floor(ps.sustain * 44100),
    Math.floor(ps.decay * 44100)
  ];
  this.envelopePunch = ps.punch;

  // Flanger
  this.flangerOffset = ps.flangerOffset * 44100;
  this.flangerOffsetSlide = ps.flangerSweep;

  // Repeat
  this.repeatTime = ps.retriggerRate ? 1 / (44100 * ps.retriggerRate) : 0;

  // Gain
  this.gain = Math.sqrt(Math.pow(10, ps.gain/10));

  this.sampleRate = ps.sampleRate;

  //
  // Fields used in sound generation
  //
  this.fltp = 0;
  this.fltdp = 0;
  this.fltphp = 0;
  this.num_clipped = 0;
  if (this.waveShape === NOISE) {
    this.noise_buffer = Array(32);
    for (var i = 0; i < 32; ++i)
      this.noise_buffer[i] = Math.random() * 2 - 1;
  }
  this.envelopeStage = 0;
  this.envelopeElapsed = 0;
  this.vibratoPhase = 0;
  this.phase = 0;
  this.ipp = 0;
  this.flanger_buffer = Array(1024);
  for (var i = 0; i < 1024; ++i)
    this.flanger_buffer[i] = 0;
}

Sound.prototype.generate = function (buffer) {
  var it = 0;
  for(; !this.done && it < buffer.length; ++this.t, ++it) {
    // Repeats
    if (this.repeatTime != 0 && ++this.elapsedSinceRepeat >= this.repeatTime)
      this.initForRepeat(this.params);
    
    // Arpeggio (single)
    if(this.arpeggioTime != 0 && this.t >= this.arpeggioTime) {
      this.arpeggioTime = 0;
      this.period *= this.arpeggioMultiplier;
    }
    
    // Frequency slide, and frequency slide slide!
    this.periodMult += this.periodMultSlide;
    this.period *= this.periodMult;
    if(this.period > this.periodMax) {
      this.period = this.periodMax;
      if (this.enableFrequencyCutoff) {
        this.done = true;
        break;
      }
    }

    // Vibrato
    var rfperiod = this.period;
    if (this.vibratoAmplitude > 0) {
      this.vibratoPhase += this.vibratoSpeed;
      rfperiod = this.period * (1 + Math.sin(this.vibratoPhase) * this.vibratoAmplitude);
    }
    var iperiod = Math.floor(rfperiod);
    if (iperiod < OVERSAMPLING) iperiod = OVERSAMPLING;

    // Square wave duty cycle
    this.dutyCycle += this.dutyCycleSlide;
    if (this.dutyCycle < 0) this.dutyCycle = 0;
    if (this.dutyCycle > 0.5) this.dutyCycle = 0.5;

    // Volume envelope
    if (++this.envelopeElapsed > this.envelopeLength[this.envelopeStage]) {
      this.envelopeElapsed = 0;
      if (++this.envelopeStage > 2) {
        this.done = true;
        break;
      }
    }
    var env_vol;
    var envf = this.envelopeElapsed / this.envelopeLength[this.envelopeStage];
    if (this.envelopeStage === 0) {         // Attack
      env_vol = envf;
    } else if (this.envelopeStage === 1) {  // Sustain
      env_vol = 1 + (1 - envf) * 2 * this.envelopePunch;
    } else {                           // Decay
      env_vol = 1 - envf;
    }

    // Flanger step
    this.flangerOffset += this.flangerOffsetSlide;
    var iphase = Math.abs(Math.floor(this.flangerOffset));
    if (iphase > 1023) iphase = 1023;

    if (this.flthp_d != 0) {
      this.flthp *= this.flthp_d;
      if (this.flthp < 0.00001)
        this.flthp = 0.00001;
      if (this.flthp > 0.1)
        this.flthp = 0.1;
    }

    // 8x oversampling
    var sample = 0;
    var sample_sum = 0;
    var num_summed = 0;
    var summands = Math.floor(44100 / this.sampleRate);
    for (var si = 0; si < OVERSAMPLING; ++si) {
      var sub_sample = 0;
      this.phase++;
      if (this.phase >= iperiod) {
        this.phase %= iperiod;
        if (this.waveShape === NOISE)
          for(var i = 0; i < 32; ++i)
            this.noise_buffer[i] = Math.random() * 2 - 1;
      }

      // Base waveform
      var fp = this.phase / iperiod;
      if (this.waveShape === SQUARE) {
        if (fp < this.dutyCycle)
          sub_sample=0.5;
        else
          sub_sample=-0.5;
      } else if (this.waveShape === SAWTOOTH) {
        if (fp < this.dutyCycle)
          sub_sample = -1 + 2 * fp/this.dutyCycle;
        else
          sub_sample = 1 - 2 * (fp-this.dutyCycle)/(1-this.dutyCycle);
      } else if (this.waveShape === SINE) {
        sub_sample = Math.sin(fp * 2 * Math.PI);
      } else if (this.waveShape === NOISE) {
        sub_sample = this.noise_buffer[Math.floor(this.phase * 32 / iperiod)];
      } else {
        throw "ERROR: Bad wave type: " + this.waveShape;
      }

      // Low-pass filter
      var pp = this.fltp;
      this.fltw *= this.fltw_d;
      if (this.fltw < 0) this.fltw = 0;
      if (this.fltw > 0.1) this.fltw = 0.1;
      if (this.enableLowPassFilter) {
        this.fltdp += (sub_sample - this.fltp) * this.fltw;
        this.fltdp -= this.fltdp * this.fltdmp;
      } else {
        this.fltp = sub_sample;
        this.fltdp = 0;
      }
      this.fltp += this.fltdp;

      // High-pass filter
      this.fltphp += this.fltp - pp;
      this.fltphp -= this.fltphp * this.flthp;
      sub_sample = this.fltphp;

      // Flanger
      this.flanger_buffer[this.ipp & 1023] = sub_sample;
      sub_sample += this.flanger_buffer[(this.ipp - iphase + 1024) & 1023];
      this.ipp = (this.ipp + 1) & 1023;

      // final accumulation and envelope application
      sample += sub_sample * env_vol;
    }

    // Accumulate samples appropriately for sample rate
    sample_sum += sample;
    if (++num_summed >= summands) {
      num_summed = 0;
      sample = sample_sum / summands;
      sample_sum = 0;
    } else {
      continue;
    }

    sample = sample / OVERSAMPLING * masterVolume;
    sample *= this.gain;

    if (-1 > sample || sample > 1) ++this.num_clipped;
    buffer[it] = sample;
  }

  // Fill with emptiness if sound gen done
  for(; it < buffer.length; ++this.t, ++it)
    buffer[it] = 0;
}

var defaultKnobs = {
  shape: SQUARE, // SQUARE/SAWTOOTH/SINE/NOISE

  attack:  0,   // sec
  sustain: 0.2, // sec
  punch:   0,   // proportion
  decay:   0.2, // sec

  frequency:        1000, // Hz
  frequencyMin:        0, // Hz
  frequencySlide:      0, // 8va/sec
  frequencySlideSlide: 0, // 8va/sec/sec

  vibratoDepth:  0, // proportion
  vibratoRate:  10, // Hz

  arpeggioFactor: 1,   // multiple of frequency
  arpeggioDelay:  0.1, // sec  
  
  dutyCycle:      0.5, // proportion of wavelength
  dutyCycleSweep: 0,   // proportion/second

  retriggerRate: 0, // Hz

  flangerOffset: 0, // sec
  flangerSweep:  0, // offset/sec

  lowPassFrequency: 44100, // Hz
  lowPassSweep:     1,     // ^sec
  lowPassResonance: 0.5,   // proportion

  highPassFrequency: 0, // Hz
  highPassSweep:     0, // ^sec
  
  gain: -10, // dB

  sampleRate: 44100, // Hz
};


function Knobs(settings) {
  settings = settings||{};
  for (var i in defaultKnobs) {
    if (settings.hasOwnProperty(i))
      this[i] = settings[i];
    else
      this[i] = defaultKnobs[i];
  }
}


Knobs.prototype.pickupCoin = function () {
  this.frequency = rndr(568, 2861);
  this.attack = 0;
  this.sustain = frnd(0.227);
  this.decay = rndr(0.227, 0.567);
  this.punch = rndr(0.3, 0.6);
  if (rnd(1)) {
    this.arpeggioFactor = rndr(1.037, 1.479);
    this.arpeggioDelay = rndr(0.042, 0.114);
  }
  return this;
}


Knobs.prototype.laserShoot = function () {
  this.shape = rnd(2);
  if(this.shape === SINE && rnd(1))
    this.shape = rnd(1);
  if (rnd(2) === 0) {
    this.frequency = rndr(321, 2861);
    this.frequencyMin = frnd(38.8);
    this.frequencySlide = rndr(-27.3, -174.5);
  } else {
    this.frequency = rndr(321, 3532);
    this.frequencyMin = rndr(144, 2/3 * this.frequency);
    this.frequencySlide = rndr(-2.15, -27.27);
  }
  if (this.shape === SAWTOOTH)
    this.dutyCycle = 0;
  if (rnd(1)) {
    this.dutyCycle = rndr(1/4, 1/2);
    this.dutyCycleSweep = rndr(0, -3.528);
  } else {
    this.dutyCycle = rndr(0.05, 0.3);
    this.dutyCycleSweep = frnd(12.35);
  }
  this.attack = 0;
  this.sustain = rndr(0.02, 0.2);
  this.decay = frnd(0.36);
  if (rnd(1))
    this.punch = frnd(0.3);
  if (rnd(2) === 0) {
    this.flangerOffset = frnd(0.001);
    this.flangerSweep = -frnd(0.04);
  }
  if (rnd(1))
    this.highPassFrequency = frnd(3204);

  return this;
}

Knobs.prototype.explosion = function () {
  this.shape = NOISE;
  if (rnd(1)) {
    this.frequency = rndr(4, 224);
    this.frequencySlide = rndr(-0.623, 17.2);
  } else {
    this.frequency = rndr(9, 2318);
    this.frequencySlide = rndr(-5.1, -40.7);
  }
  if (rnd(4) === 0)
    this.frequencySlide = 0;
  if (rnd(2) === 0)
    this.retriggerRate = rndr(4.5, 53);
  this.attack = 0;
  this.sustain = rndr(0.0227, 0.363);
  this.decay = frnd(0.567);
  if (rnd(1)) {
    this.flangerOffset = rndr(-0.0021, 0.0083);
    this.flangerSweep = -frnd(0.09);
  }
  this.punch = 0.2 + frnd(0.6);
  if (rnd(1)) {
    this.vibratoDepth = frnd(0.35);
    this.vibratoRate = frnd(24.8);
  }
  if (rnd(2) === 0) {
    this.arpeggioFactor = rndr(0.135, 2.358);
    this.arpeggioDelay = rndr(0.00526, 0.0733);
  }
  return this;
}

Knobs.prototype.powerUp = function () {
  if (rnd(1)) {
    this.shape = SAWTOOTH;
    this.dutyCycle = 0;
  } else {
    this.dutyCycle = rndr(0.2, 0.5);
  }
  this.frequency = rndr(145, 886);
  if (rnd(1)) {
    this.frequencySlide = rndr(0.636, 79.6);
    this.retriggerRate = rndr(6, 53);
  } else {
    this.frequencySlide = rndr(0.0795, 9.94);
    if (rnd(1)) {
      this.vibratoDepth = frnd(0.35);
      this.vibratoRate = frnd(24.8);
    }
  }
  this.attack = 0;
  this.sustain = frnd(0.363);
  this.decay = rndr(0.023, 0.57);

  return this;
}

Knobs.prototype.hitHurt = function () {
  this.shape = rnd(2);
  if (this.shape === SINE)
    this.shape = NOISE;
  if (this.shape === SQUARE)
    this.dutyCycle = rndr(0.2, 0.5);
  if (this.shape === SAWTOOTH)
    this.dutyCycle = 0;
  this.frequency = rndr(145, 2261);
  this.frequencySlide = rndr(-17.2, -217.9);
  this.attack = 0;
  this.sustain = frnd(0.023);
  this.decay = rndr(0.023, 0.2);
  if (rnd(1))
    this.highPassFrequency = frnd(3204);
  return this;
}

Knobs.prototype.jump = function () {
  this.shape = SQUARE;
  this.dutyCycle = rndr(0.2, 0.5);
  this.frequency = rndr(321, 1274);
  this.frequencySlide = rndr(0.64, 17.2);
  this.attack = 0;
  this.sustain = rndr(0.023, 0.36);
  this.decay = rndr(0.023, 0.2);
  if (rnd(1))
    this.highPassFrequency = frnd(3204);
  if (rnd(1))
    this.lowPassFrequency = rndr(2272, 44100);
  return this;
}

Knobs.prototype.blipSelect = function () {
  this.shape = rnd(1);
  if (this.shape === SQUARE)
    this.dutyCycle = rndr(0.2, 0.5);
  else
    this.dutyCycle = 0;
  this.frequency = rndr(145, 1274);
  this.attack = 0;
  this.sustain = rndr(0.023, 0.09);
  this.decay = frnd(0.09);
  this.highPassFrequency = 353;
  return this;
}

Knobs.prototype.pop = function () {
  this.shape = SINE;
  this.attack = 0.01;
  this.sustain = 0.01;
  this.decay = 0.165;
  this.frequency = 300;
  this.frequencySlide = 22;
  this.lowPassFrequency = 8829;
  this.highPassFrequency = 16737;
  return this;
}

Knobs.prototype.random = function () {
  function cube(x) { return x * x * x }
  var pow = Math.pow;
  if (rnd(1))
    this.frequency = rndr(885.5, 7941.5);
  else
    this.frequency = rndr(3.5, 3532);
  this.frequencySlide = rndr(-633, 639);
  if (this.frequency > 1732 && this.frequencySlide > 5)
    this.frequencySlide = -this.frequencySlide;
  if (this.frequency < 145 && this.frequencySlide < -0.088)
    this.frequencySlide = -this.frequencySlide;
  this.frequencySlideSlide = rndr(-0.88, 0.88);
  this.dutyCycle = frnd(1);
  this.dudyCycleSweep = rndr(-17.64, 17.64);
  this.vibratoDepth = rndr(-0.5, 0.5);
  this.vibratoRate = rndr(0, 69);
  this.attack = cube(frnd(1)) * 2.26;
  this.sustain = sqr(frnd(1)) * 2.26 + 0.09;
  this.decay = frnd(1) * 2.26;
  this.punch = sqr(frnd(1)) * 0.64;
  if (this.attack + this.sustain + this.decay < 0.45) {
    this.sustain += rndr(0.5, 1.25);
    this.decay += rndr(0.5, 1.25);
  }
  this.lowPassResonance = rndr(0.444, 0.97);
  this.lowPassFrequency = frnd(39200);
  this.lowPassSweep = rndr(0.012, 82);
  if (this.lowPassFrequency < 35 && this.lowPassSweep < 0.802)
    this.lowPassSweep = 1 - this.lowPassSweep;
  this.highPassFrequency = 39200 * pow(frnd(1), 5);
  this.highPassSweep = 555718 * pow(rndr(-1, 1), 5);
  this.flangerOffset = 0.023 * cube(frnd(2) - 1);
  this.flangerSweep = cube(frnd(2) - 1);
  this.retriggerRate = frnd(1378);
  this.arpeggioDelay = frnd(1.81);
  this.arpeggioFactor = rndr(0.09, 10);
  return this;
}


function message() {
  var div = document.createElement('div');
  m = arguments[0];
  for (var i = 1; i < arguments.length; ++i)
    m += arguments[i];
  div.innerText = '> ' + m;
  $('chat').appendChild(div);
  $('chat').hider = setTimeout(function () { div.style.display = 'none' },5000);
  $('chat').scrollTop = $('chat').scrollHeight;
}