// Kids' requests:
// TODO: race cars
// TODO: flags
// TODO: tonkatsu
// TODO: rice
// TODO: edamame
// TODO: miso soup

document.addEventListener('DOMContentLoaded', onLoad, false);

// OpenGL rendering things!

var gl;

var mvMatrix = mat4.create();  // model-view matrix
var mvMatrixStack = [];
var pMatrix = mat4.create();   // projection matrix

var DB;

var GAME;
var AVATAR;  // hack-o alias for GAME.avatar because we use it so much

var GRASSY = false;       // true to use decal-style grass
var SPREAD_OUT = 3;       // create nearby chunks at this radius

var PICKED = null;
var PICKED_FACE = 0;
var PICK_MAX = 8;

var KEYS = {};

var DB_VERSION = '8';

// Map chunk dimensions
var LOGNX = 4;
var LOGNY = 5;
var LOGNZ = 4;
var NX = 1 << LOGNX;
var NY = 1 << LOGNY;
var NZ = 1 << LOGNZ;
var CHUNK_RADIUS = Math.sqrt(NX * NX + NZ * NZ);
var SY = 1;        // vertical size of blocks
var HY = NY * SY;  // vertical height of chunk in m

var GEN_STAT = new Stat('Chunk-gen');
var RENDER_STAT = new Stat('Render');
var UPDATE_STAT = new Stat('Update');
var FPS_STAT = new Stat('FPS');
FPS_STAT.invert = true;

var GRAVITY = 23;  // m/s/s
var PARTICLE_GRAVITY = 6.4; // m/s/s
var DRAG = 20;  // m/s/s
var VJUMP = 7.7;   // m/s

var LIGHT_SUN = 6;

var DARKFACE = 0.5;

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
  },
  dirt: {
    tile: 1,
    color: [233/255, 107/255, 0/255],
    solid: true,
    opaque: true,
    plantable: true,
  },
  grass: {
    tile: [1,1],
    color: [0.1, 0.6, 0],
    solid: true,
    opaque: true,
    plantable: true,
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
  },
  testpattern: {
    tile: 5,
    solid: true,
    opaque: true,
  },
  bedrock: {
    tile:6,
    solid: true,
    opaque: true,
  },
  ice: {
    tile: 7,
    solid: true,
    translucent: [36,205,205,0.5],
  },
  flower: {
    tile: 8,
    hashes: 1,
    scale: 0.6,
    update: updatePlant,
  },
  grassy: {
    tile: [4,2],
    hashes: 2,
    height: 0.5,
  },
  soybeans: {
    tile: [7,2],
    hashes: 2,
    update: updatePlant,
    drop: 'soybean',
  },
  weeds: {
    tile: [11,2],
    hashes: 3,
    update: updatePlant,
    onstep: function (ntt) {
      if (ntt.type === ENTITY_TYPES.player &&
          (!this.lastSpawn || this.lastSpawn + 60 < GAME.clock)) {
        // Spawn chumpa opposite ntt
        new Entity({
          type: 'chumpa', 
          x: this.x + 1 - frac(ntt.x),
          y: this.y, 
          z: this.z + 1 - frac(ntt.z),
        });
        this.lastSpawn = GAME.clock;
      }
    }
  },
  lamp: {
    tile: 9,
    hashes: 1,
    luminosity: [8,2,2],
    scale: 0.6,
    update: updateResting,
  },
  candy: {
    tile: 10,
    solid: true,
    opaque: true,
  },
  'grape jelly': {
    tile: 14,
    liquid: true,
    translucent: [154,40,155,0.85],
    viscosity: 0.85,
  },
  'strawberry jelly': {
    tile: 13,
    liquid: true,
    translucent: [200,81,83,0.85],
    viscosity: 0.85,
  },
  'apricot jelly': {
    tile: 15,
    liquid: true,
    translucent: [191,124,66,0.85],
    viscosity: 0.85,
  },
  'water': {
    tile: [6, 2],
    liquid: true,
    translucent: [30, 137, 157, 0.5],
    viscosity: 0.5,
    unpickable: true,
  },
  'miso soup': {
    tile: [10, 2],
    liquid: true,
    translucent: [174, 154, 112, 0.85],
    viscosity: 0.5,
    unpickable: true,
  },
  rope: {
    tile: [1, 2],
    liquid: true,
    hashes: 1,
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
    tile: [2, 2, 2, 1],
    opaque: true,
    solid: true,
    stack: 1,
  },
  hal9000: {
    tile: [3, 2, 3, 1],
    opaque: true,
    solid: true,
    stack: 1,
    update: function () {
      if (!this.horizontalFieldOfView)
        initCamera(this);
      if (!this.framebuffer) {
        this.framebuffer = makeFramebufferForTile(gl.textures.terrain, 2, 2);
      }
      renderToFramebuffer(this, this.framebuffer);
    }
  },
  obelisk: {
    tile: [5, 1],
    stack: 2,
    solid: true,
    opaque: true,
  },
};
for (var i in BLOCK_TYPES)
  BLOCK_TYPES[i].name = i;


var ENTITY_TYPES = {
  player: {
    invisible: true,
    radius: 0.3,
    height: 1.8,
    walk_max: 4.3, // m/s
    fly_max: 10.8, // m/s
    acceleration: 20,  // m/s^2
    init: function () {
      AVATAR = GAME.avatar = this;
      initCamera(this);
      this.inventory = Array(9 * 4);
      this.lastHop = 0;
      this.viewDistance = 100;
      var EYE_HEIGHT = 1.62;
      this.eyeHeight = EYE_HEIGHT;
      var b = topmost(this.x, this.z);
      if (b)
        this.y = b.y + 1;
      else 
        this.flying = true;
      if (window.panoramaMode) {
        this.horizontalFieldOfView = Math.PI / 2;
        this.aspectRatio = 1;
      }
      pickTool(0);
    },
  },
  drone: {
    tile: [3,2, 1,3, 3,1, 3,1, 1,3, 1,3],
    radius: 0.35,
    height: 1,
    walk_max: 4.3, // m/s
    spin_rate: 2,  // radians/s
    acceleration: 20,  // m/s^2
    thrust: GRAVITY * 1.05, // m/s^2
    init: function () {
      this.nextThink = 0;
      this.eyeHeight = 0.75;
    },

    _HEAD: faces(scale(ppiped(-0.5, 0.5, 1, 2, -0.5, 0.5), 0.5)),
    _BODY: faces(scale(vfrustum(0.7, 0.6, 0, 0.99), 0.5)),
    geometry: function (ntt, v) {
      // Head
      var light = block(ntt.x, ntt.y + ntt.height/2, ntt.z).light;
      geometryBox(v, {
        light: light,
        color: ntt.type.color || ntt.sourcetype.color || [1,1,1],
        yaw: ntt.yaw,
        pitch: ntt.pitch,
        x: ntt.x,
        y: ntt.y,
        z: ntt.z,
        tile: ntt,
        faces: ntt.type._HEAD,
      });
      // Body
      var bodytex = {tile:[1,4, 1,4, 2,4, 1,4, 1,4, 1,4]};
      bodytex.tile[4] = ntt.ddy ? 2 : 3;
      geometryBox(v, {
        light: light,
        color: ntt.type.color || ntt.sourcetype.color || [1,1,1],
        yaw: 0,
        x: ntt.x,
        y: ntt.y,
        z: ntt.z,
        tile: bodytex,
        faces: ntt.type._BODY,
      });
    },

    update: function () {
      if (this.nextThink < GAME.clock) {
        this.nextThink = GAME.clock + Math.random() * 2;
        if (Math.random() < 0.4)
          this.ddz = -this.type.acceleration;
        else
          this.ddz = 0;
        var spin = Math.random() * 4 >> 0;
        if (spin === 0)
          this.dyaw = this.type.spin_rate;
        else if (spin === 1)
          this.dyaw = -this.type.spin_rate;
        else
          this.dyaw = 0;
        if (Math.random() < 0.25) {
          this.ddy = GRAVITY * 1.1;
          this.falling = true;
        } else {
          this.ddy = 0;
        }
      }
      if (this.ddy) {
        // Need to do some of this every tick, not every update
        for (var i = 0; i < 10; ++i) {
          gl.particles.spawn({
            x0: this.x, 
            y0: this.y, 
            z0: this.z,
            dy: this.dy - 2,
            tile: {s: 2, t: 3},
          });
        }
      }

      if (!this.horizontalFieldOfView)
        initCamera(this);
      if (!this.framebuffer)
        this.framebuffer = makeFramebufferForTile(gl.textures.terrain, 2, 2);
      renderToFramebuffer(this, this.framebuffer);
    },
  },
  block: {
    fly_max: 20, // m/s
    init: function () {
      this.dyaw = 1;
      hopEntity(this);
      this.height = SY * 2 * this.type.radius;
      this.rebound = 0.75;
      if (this.sourcetype === BLOCK_TYPES.grass)
        this.sourcetype = BLOCK_TYPES.dirt;
      this.height = (this.type.stack || this.sourcetype.stack || SY) *
        2 * this.type.radius;
    },
    collectable: true,
    radius: 0.25 / 2,
  },
  soybean: {
    tile: [9,2],
    scale: 0.25,
    fly_max: 20, // m/s
    collectable: true,
    init: function () {
      hopEntity(this);
    },
    billboard: true,
    bob: 1/8,
  },
  chumpa: {
    tile: 11,
    billboard: true,
    scale: 0.1,
    init: function () {
      this.rebound = 0.75;
      this.landed = this.birthday;
      this.liveliness = 0.25 + Math.random();
      hopEntity(this, 1 + Math.random() * 0.5);
    },
    update: function () {
      this.tile = this.falling ? 12 : 11;
      if (this.falling) 
        this.landed = GAME.clock;
      else if (block(this).type === BLOCK_TYPES.weeds && this.age() > 2)
        this.die();
      else if (this.landed + this.liveliness < GAME.clock)
        hopEntity(this, 1 + Math.random() * 0.5);
    },
  },
};
for (var i in ENTITY_TYPES) {
  ENTITY_TYPES[i].name = i;
  ENTITY_TYPES[i].isEntity = true;
}


function reload() {
  var head = document.getElementsByTagName('head')[0];
  var script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = 'main.js?' + new Date();
  script.onload = function() {
    for (var ic in GAME.chunks) {
      var c = GAME.chunks[ic];
      for (var ie in c.entities) {
        var e = c.entities[ie];
        e.type = ENTITY_TYPES[e.type.name];
      }
    }
    message('Reloaded');
  }
  head.appendChild(script);
  gl.textures.panorama = loadTexture('panorama.png', true);
  gl.textures.terrain  = loadTexture('terrain.png');
}


function scale(aa, factor) {
  for (var i = 0; i < aa.length; ++i) {
    if (typeof aa[i] === 'number')
      aa[i] *= factor;
    else
      scale(aa[i], factor);
  }
  return aa;
}


function hopEntity(ntt, power) {
  power = power || 1;
  ntt.dx = 2 * tweak() * power;
  ntt.dz = 2 * tweak() * power;
  ntt.dy = 6 * power;
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


function initGL(canvas, opts) {
  var problem = '';
  try {
    gl = canvas.getContext('experimental-webgl', opts) ||
      canvas.getContext('webgl', opts);
    if (gl) {
      gl.viewportWidth = canvas.width;
      gl.viewportHeight = canvas.height;
    }
  } catch (e) {
    problem = e;
  }

  if (gl) {
    gl.panorama = new Skybox('skybox', 'panorama');
    gl.sky = new Skybox('skybox', 'sky');
    gl.mainShader = new Shader('main');
    gl.particles = new ParticleSystem();

    // Init textures
    gl.textures = {
      panorama: loadTexture('panorama.png', true),
      terrain:  loadTexture('terrain.png')
    };

    return gl;
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

  // Locate all attributes
  this.attributes = {};
  var na = gl.getProgramParameter(this.program, gl.ACTIVE_ATTRIBUTES);
  for (var i = 0; i < na; ++i) {
    var a = gl.getActiveAttrib(this.program, i);
    this.attributes[a.name] = gl.getAttribLocation(this.program, a.name);
  }

  // Locate all uniforms
  this.uniforms = {};
  var nu = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
  for (var i = 0; i < nu; ++i) {
    var u = gl.getActiveUniform(this.program, i);
    this.uniforms[u.name] = gl.getUniformLocation(this.program, u.name);
  }
}

Shader.prototype.use = function () {
  gl.useProgram(this.program);
  for (var a in this.attributes)
    gl.enableVertexAttribArray(this.attributes[a]);
}

Shader.prototype.disuse = function () {
  for (var a in this.attributes)
    gl.disableVertexAttribArray(this.attributes[a]);
  gl.useProgram(null);
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
  this.entities = {};

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

  for (var i in data.entities||{})
    new Entity(data.entities[i]);
}


Chunk.prototype.data = function () {
  var result = {
    key: this.chunkx + ',' + this.chunkz,
    chunkx: this.chunkx,
    chunkz: this.chunkz,
    blocks: new Array(NX * NY * NZ),
    entities: {},
  };
  for (var i = 0; i < NX * NY * NZ; ++i)
    result.blocks[i] = this.blocks[i].data();
  for (var i in this.entities) {
    var ntt = this.entities[i];
    result.entities[i] = ntt.data();
  }
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
      if (noise(x/10,9938,z/10) < -0.3) {
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

  // Plant some weeds
  for (var n = 0; n < 6; ++n) {
    var x = this.chunkx + 
      Math.round(Math.abs(noise(this.chunkx, this.chunkz, n)) * NX);
    var z = this.chunkz + 
      Math.round(Math.abs(noise(this.chunkx, this.chunkz, n + 23.4)) * NZ);
    var t = topmost(x, z);
    if (t && t.type.plantable)
      t.neighbor(FACE_TOP).type = BLOCK_TYPES.weeds;
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
    if (!b.type.empty) {
      if (!b.vertices) 
        b.buildGeometry();
      var dest = b.type.translucent ? translucents : opaques;
      if (!dest.indices) {
        dest.aPos = [];
        dest.aTexCoord = [];
        dest.aLighting = [];
        dest.aColor = [];
        dest.indices = [];
      }
      appendGeometry(dest, b.vertices, justUpdateLight);
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
  gl.vertexAttribPointer(shader.attributes[attribute],
                         buffers[attribute].itemSize,
                         gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
}


Chunk.prototype.tick = function (elapsed) {
  for (var i in this.entities) {
    var ntt = this.entities[i];

    if (ntt.type.tick) ntt.type.tick.apply(ntt, [ntt]);

    if (ntt.type.collectable) {
      if (ntt.age() > 1) {
        var d = distance(center(AVATAR), ntt);
        if (d < AVATAR.type.radius) {
          new Sound('pop');
          AVATAR.gain(ntt.type.name === 'block' ? 
                      ntt.sourcetype.name : ntt.type.name);
          redisplayInventory(AVATAR);
          pickTool(AVATAR.slot);
          ntt.die();
        } else if (d < 3) {
          ntt.flying = true;
          ntt.dx = AVATAR.x - ntt.x;
          ntt.dy = AVATAR.y + 1 - ntt.y;
          ntt.dz = AVATAR.z - ntt.z;
          ntt.dx *= ntt.type.fly_max / d;
          ntt.dy *= ntt.type.fly_max / d;
          ntt.dz *= ntt.type.fly_max / d;
        }
      }
    }

    ballistics(ntt, elapsed);
  }
}


Chunk.prototype.updatePeriod = function () {
  return Math.max(GAME.UPDATE_PERIOD, 2 * this.hdistance / AVATAR.viewDistance);
}

Chunk.prototype.update = function (force) {
  if (this.nDirty > 0 && 
      (force || GAME.clock > this.lastUpdate + this.updatePeriod())) {
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

    this.lastUpdate = GAME.clock;
    this.generateBuffers(upgeoms === 0);
    //message('Update: ', this.chunkx, this.chunkz, ':', 
    //        uplights, upgeoms, '->', this.nDirty);
  } else {
    // Update some random block in this chunk
    var b = this.blocks[Math.floor(Math.random() * NX * NY * NZ)];
    if (b.type.update)
      b.type.update.apply(b);
  }

  for (var i in this.entities) {
    var ntt = this.entities[i];
    if (ntt.type.update) ntt.type.update.apply(ntt, [ntt]);
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

Entity.prototype.age = function () {
  return GAME.clock - this.birthday;
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
  var result;
  if (!chunk(chunkx, chunkz)) {
    // New chunk needed
    GEN_STAT.start();
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
    GEN_STAT.end();
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



function drawScene(camera, showWireframe) {

  RENDER_STAT.start();

  // Start from scratch
  if (camera.y + camera.eyeHeight >= 0)
    gl.clearColor(0.5 * GAME.sunlight, 
                  0.8 * GAME.sunlight, 
                  0.98 * GAME.sunlight, 1);  // Clear color is sky blue
  else
    gl.clearColor(0,0,0,1);  // Look into the void
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Set up the projection
  var aspectRatio = camera.aspectRatio || 
    (gl.viewportWidth / gl.viewportHeight);
  mat4.perspective(camera.horizontalFieldOfView/aspectRatio * 180/Math.PI, 
                   aspectRatio,
                   0.1,                  // near clipping plane
                   camera.viewDistance,  // far clipping plane
                   pMatrix);

  // Position for camera
  mat4.identity(mvMatrix);
  mat4.rotateX(mvMatrix, camera.pitch);
  mat4.rotateY(mvMatrix, camera.yaw);

  // Sky box / title demo
  // Position for camera
  mat4.identity(mvMatrix);
  mat4.rotateX(mvMatrix, camera.pitch);
  mat4.rotateY(mvMatrix, camera.yaw);
  //mat4.rotateX(mvMatrix, GAME.timeOfDay);
  gl.sky.render();

  // Position for camera
  mat4.identity(mvMatrix);
  mat4.rotateX(mvMatrix, camera.pitch);
  mat4.rotateY(mvMatrix, camera.yaw);
  mat4.translate(mvMatrix, [-camera.x, -camera.y, -camera.z]);
  mat4.translate(mvMatrix, [0, -camera.eyeHeight, 0]);

  // Render the world

  gl.mainShader.use();

  gl.enable(gl.DEPTH_TEST);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, gl.textures.terrain);
  gl.uniform1i(gl.mainShader.uniforms.uSampler, 0);
  gl.uniform1f(gl.mainShader.uniforms.uFogDistance, 2 * camera.viewDistance /5);
  gl.uniform1f(gl.mainShader.uniforms.uSunlight, GAME.sunlight);

  var headblock = block(camera.x, camera.y + camera.eyeHeight, camera.z);
  if (headblock.type.translucent) {
    var rgba = headblock.type.translucent;
    $('hud').style.backgroundColor = 'rgba(' + rgba.join(',') + ')';
  } else {
    $('hud').style.backgroundColor = '';
  }
  $('pause').style.backgroundColor = $('hud').style.backgroundColor;
  
  // Set matrix uniforms
  gl.uniformMatrix4fv(gl.mainShader.uniforms.uPMatrix,  false,  pMatrix);
  gl.uniformMatrix4fv(gl.mainShader.uniforms.uMVMatrix, false, mvMatrix);
  
  // Render opaque blocks
  gl.disable(gl.CULL_FACE);  // don't cull backfaces (decals are 1-sided)
  for (var i in GAME.chunks) {
    var c = GAME.chunks[i];
    if (c.visible) {
      c.opaqueBuffers.render(gl.mainShader);
      c.renderEntities(camera);
    }
  }

  gl.mainShader.disuse();

  // Render particles
  gl.particles.render();

  // Render translucent blocks
  gl.mainShader.use();
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.BLEND);
  gl.enable(gl.CULL_FACE);  // cull backfaces!
  for (var i in GAME.chunks) {
    var c = GAME.chunks[i];
    if (c.visible)
      c.translucentBuffers.render(gl.mainShader);
  }
  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);
  gl.mainShader.disuse();

  // Render block selection indicator
  if (PICKED && showWireframe)
    gl.wireframe.render();

  RENDER_STAT.end();
}


Chunk.prototype.renderEntities = function (camera) {
  // For now, generate all the info each time
  var nttSet = {
    aPos: [],
    aTexCoord: [],
    aLighting: [],
    aColor: [],
    indices: [],
  };
  for (var i in this.entities) {
    var e = this.entities[i];
    if (e !== camera)
      e.buildGeometry(nttSet);
  }
  var nttBuffers = new BufferSet(nttSet);
  nttBuffers.render(gl.mainShader);
}


function frac(x) { return x - Math.floor(x); }
function carf(x) { return Math.ceil(x) - x; }


function updateWorld() {
  UPDATE_STAT.start();
  var waspicked = PICKED;
  var wasface = PICKED_FACE;
  PICKED = pickp();
  
  if (SPREAD_OUT) 
    loadNearbyChunks(AVATAR, SPREAD_OUT);
  
  for (var i in GAME.chunks) {
    var c = GAME.chunks[i];
    c.hdistance = 
      Math.max(0, hDistance(AVATAR, c.centerPoint())-CHUNK_RADIUS);
    c.visible = (c.hdistance < AVATAR.viewDistance);
    c.update();
  }  

  UPDATE_STAT.end();
}


function loadNearbyChunks(epicenter, d, limit) {
  limit = limit || 1000;
  for (var dx = -d; dx <= d; dx += Math.min(NX, 2*d)) {
    for (var dz = -d; dz <= d; dz += Math.min(NZ, 2*d)) {
      if (makeChunk(epicenter.x + dx, epicenter.z + dz)) {
        if (--limit <= 0) 
          return true;
      }
    }
  }
}


function processInput(avatar, elapsed) {
  if (KEYS.O) {
    GAME.timeOfDay = (GAME.timeOfDay + elapsed) % (2*Math.PI);
    GAME.calcSunlight();
  }

  // Movement keys
  avatar.ddx = avatar.ddz = 0;
  if (KEYS.W) avatar.ddz -= avatar.type.acceleration;
  if (KEYS.A) avatar.ddx -= avatar.type.acceleration;
  if (KEYS.S) avatar.ddz += avatar.type.acceleration;
  if (KEYS.D) avatar.ddx += avatar.type.acceleration;
  
  avatar.ddy = 0;
  if (avatar.flying || avatar.swimming) {
    // Fly up and down
    if (KEYS[' '])
      avatar.ddy += avatar.type.acceleration;
    else if (KEYS[16]) // shift
      avatar.ddy -= avatar.type.acceleration;
  }
}


function togglePointerLock() {
  if (cancan.requestPointerLock) {
    if (window.pointerLocked)
      document.exitPointerLock();
    else
      cancan.requestPointerLock();
  }
}


function ballistics(e, elapsed) {
  // Apply the laws of pseudo-physics

  e.swimming = e.falling && block(e).type.liquid;

  if (e.ddx || e.ddz) {
    // Accelerate in the XZ plane
    var ddp = e.type.acceleration * elapsed;
    var cos = Math.cos(e.yaw);
    var sin = Math.sin(e.yaw);
    e.dx += elapsed * (e.ddx * cos - e.ddz * sin);
    e.dz += elapsed * (e.ddx * sin + e.ddz * cos);
  } else if (!e.falling) {
    // Drag. Not quite correct - needs to be applied in opp of dir of travel
    var ddp = (e.type.acceleration||DRAG) * elapsed;
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
      e.dy = Math.max(0, e.dy - elapsed * (e.type.acceleration||DRAG));
    else
      e.dy = Math.min(0, e.dy + elapsed * (e.type.acceleration||DRAG));
  }

  // Limit speed
  var h = sqr(e.dx) + sqr(e.dz);
  if (e.flying || e.swimming) h += sqr(e.dy);
  h = Math.sqrt(h);
  
  var vmax = e.flying ? e.type.fly_max : e.type.walk_max;
  if (typeof vmax !== 'undefined') {
    vmax *= 1 - (block(e).type.viscosity||0);
    var f = h / vmax;
    if (f > 1) {
      e.dx /= f;
      e.dz /= f;
      if (e.flying || e.swimming) e.dy /= f;
    }
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
    var radius = e.type.radius || e.type.scale/2;
    if (e.dx < 0 && blocked(e.x - radius, e.y, e.z)) {
      e.x = Math.max(e.x, Math.floor(e.x) + radius);
      e.dx = (e.rebound || 0) * -e.dx;
    } else if (e.dx > 0 && blocked(e.x + radius, e.y, e.z)) {
      e.x = Math.min(e.x, Math.ceil(e.x) - radius);
      e.dx = (e.rebound || 0) * -e.dx;
    }
    if (e.dz < 0 && blocked(e.x, e.y, e.z - radius)) {
      e.z = Math.max(e.z, Math.floor(e.z) + radius);
      e.dz = (e.rebound || 0) * -e.dz;
    } else if (e.dz > 0 && blocked(e.x, e.y, e.z + radius)) {
      e.z = Math.min(e.z, Math.ceil(e.z) - radius);
      e.dz = (e.rebound || 0) * -e.dz;
    }
    
    // Check corner collisions
    var cw = (e.dx < 0 && frac(e.x) < radius);
    var ce = (e.dx > 0 && carf(e.x) > radius);
    var cs = (e.dz < 0 && frac(e.z) < radius);
    var cn = (e.dz > 0 && carf(e.z) > radius);
    if (cw && cs && blocked(e.x - radius, e.y, e.z - radius)) {
      // sw corner collision
      if (frac(e.x) > frac(e.z))
        e.x = Math.max(e.x, Math.floor(e.x) + radius);
      else
        e.z = Math.max(e.z, Math.floor(e.z) + radius);
    } else if (cw && cn && blocked(e.x - radius, e.y, e.z + radius)) {
      // nw corner collision
      if (frac(e.x) > carf(e.z))
        e.x = Math.max(e.x, Math.floor(e.x) + radius);
      else
        e.z = Math.min(e.z, Math.ceil(e.z) - radius);
    } else if (ce && cn && blocked(e.x + radius, e.y, e.z + radius)) {
      // ne corner collision
      if (carf(e.x) > carf(e.z))
        e.x = Math.min(e.x, Math.ceil(e.x) - radius);
      else
        e.z = Math.min(e.z, Math.ceil(e.z) - radius);
    } else if (ce && cs && blocked(e.x + radius, e.y, e.z - radius)) {
      // se corner collision
      if (carf(e.x) > frac(e.z))
        e.x = Math.min(e.x, Math.ceil(e.x) - radius);
      else
        e.z = Math.max(e.z, Math.floor(e.z) + radius);
    }
  }

  // Fall
  if (e.falling && !(e.swimming && e.ddy))
    e.dy -= GRAVITY * elapsed;

  e.y += e.dy * elapsed;

  var blocke = block(e);
  if (blocke.type.solid) {
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

  if (blocke.type.onstep)
    blocke.type.onstep.call(blocke, e);

  if (e.y < -555)
    e.die();
}


function pickp() { 
  return pick(AVATAR.x, 
              AVATAR.y + AVATAR.eyeHeight, 
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
  var timeNow = wallClock();
  var elapsed = timeNow - window.lastFrame;
  FPS_STAT.add(elapsed);
  window.lastFrame = timeNow;
    
  if (!GAME || GAME.loading) {
    blurryIntro.time = (blurryIntro.time||0) + elapsed * (KEYS.S ? 20 : 1);
    blurryIntro(blurryIntro.time);

  } else if (window.mode !== 'pause' || GAME.multiplayer) {
    
    if (elapsed > 0.1) elapsed = 0.05;  // Limit lagdeath
    GAME.clock += elapsed;

    if (gl.textures.terrain.loaded) {
      if (KEYS.B) {
        blur(AVATAR, 256, 256);
      } else {
        gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
        drawScene(AVATAR, true);
      }
    }
    
    processInput(AVATAR, elapsed);
    
    for (var i in GAME.chunks) {
      var c = GAME.chunks[i];
      c.tick(elapsed);
    }
    
    gl.particles.tick(elapsed);
    
    if (timeNow > GAME.lastUpdate + GAME.UPDATE_PERIOD) {
      updateWorld();
      GAME.lastUpdate = timeNow;
    }
  }
 
  if (!$('stats').hide)
    $('stats').innerHTML = feedback();
}


function feedback() {
  var result = 
    FPS_STAT + '<br>' + 
    GEN_STAT + '<br>' +
    //RENDER_STAT + '<br>' + 
    UPDATE_STAT + '<br>' +
    'Player: ' + AVATAR + '<br>';
  if (GAME)
    result += 'Time: ' + readableTime(GAME.timeOfDay) + ' &#9788;' + 
              GAME.sunlight.toFixed(2);
  if (PICKED) {
    result += '<br>Picked: ' + PICKED + ' @' + PICKED_FACE;
    var pf = PICKED.neighbor(PICKED_FACE);
    if (pf) result += ' &rarr; ' + pf;
  }
  var keys = '';
  for (var k in KEYS) if (KEYS[k]) keys += ' ' + escape(k);
  if (keys.length > 0) result += '<br>Keys: ' + keys;
  return result;
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



function loadTexture(filename, cubemap) {
  var target = cubemap ? gl.TEXTURE_CUBE_MAP : gl.TEXTURE_2D;
  var texture = gl.createTexture();
  texture.image = new Image();
  texture.image.onload = function() {
    gl.bindTexture(target, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, !cubemap);
    gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    if (cubemap) {
      // Unpack separate images from 6-side grid strip
      gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      var facings = [
        gl.TEXTURE_CUBE_MAP_NEGATIVE_Z,  // front
        gl.TEXTURE_CUBE_MAP_NEGATIVE_X,  // left
        gl.TEXTURE_CUBE_MAP_POSITIVE_Z,  // back
        gl.TEXTURE_CUBE_MAP_POSITIVE_X,  // right
        gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,  // bottom
        gl.TEXTURE_CUBE_MAP_POSITIVE_Y,  // top
      ];
      for (var i = 0; i < 6; ++i) {
        var can = document.createElement('canvas');
        can.width = texture.image.height;
        can.height = texture.image.height;
        var ctx = can.getContext('2d');
        ctx.drawImage(texture.image, 
                      i * can.width, 0, can.width, can.height,
                      0, 0, can.width, can.height);
        gl.texImage2D(facings[i], 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, 
                      can);
      }
    } else {
      gl.texImage2D(target, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, 
                    texture.image);
    }
    gl.bindTexture(target, null);
    texture.loaded = true;
  }
  texture.image.src = filename + '?nocache=' + Math.random();
  return texture;
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
    var n = pinkNoise(this.x, this.y, this.z + GAME.seed, 32, 2) + 
      (2 * this.y/SY - NY) / NY;
    if (n < -0.2) this.type = BLOCK_TYPES.rock;
    else if (n < -0.1) this.type = BLOCK_TYPES.dirt;
    else if (n < 0) this.type = GRASSY ? BLOCK_TYPES.dirt : BLOCK_TYPES.grass;
    else if (this.y < HY / 4) this.type = BLOCK_TYPES['apricot jelly'];
    else if (this.y < HY / 2) this.type = BLOCK_TYPES['water'];
    else this.type = BLOCK_TYPES.air;

    if (Math.pow(noise(this.x/20 + GAME.seed, this.y/20, this.z/20 + 1000), 3) < -0.2)
      this.type = BLOCK_TYPES.candy;

    // Caves
    if (Math.pow(noise(this.x/20, this.y/20 + GAME.seed, this.z/20), 3) < -0.1)
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
  var tile = tileCoord(this);
  this.type = BLOCK_TYPES.air;
  delete this.stackPos;
  this.invalidateGeometry(true);
  if (!pos) {
    var drop = new Entity({ 
      type: type.drop || 'block',
      x: this.x + 0.5, 
      y: this.y + (this.stack || this.height || SY)/2,
      z: this.z + 0.5,
      sourcetype: type,
    }, this);
  }
  for (var i = 0; i < 20; ++i) {
    var p = gl.particles.spawn({
      x0: this.x + 0.5, 
      y0: this.y + 0.5, 
      z0: this.z + 0.5,
      tile: tile,
    });
    //gl.particles.bounceParticle(p);
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

function tileCoord(obj, face) {
  var t = obj.tile || obj.type.tile || obj.sourcetype.tile;
  if (typeof t === 'number')
    t = [t, 0];
  var off = 0;
  if (t.length === 2 * 2 && (face === FACE_TOP || face === FACE_BOTTOM))
    off = 2;
  else if (t.length === 2 * 6 && typeof face !== 'undefined')
    off = 2 * face;
  return {s: t[off], t:t[off+1]};
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


function blockGeometryHash(b) {
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

    var tile = tileCoord(b);
    var bottom = 1;
    var top = bottom - 1;

    // Keep away from edges of texture so as to not bleed the one next door
    if (bottom % 1 === 0) bottom -= ZERO;
    if (top % 1 === 0) top += ZERO;

    for (var j = 0; j < 2; ++j)
      v.aTexCoord.push(tile.s + ZERO, tile.t + bottom, 
                       tile.s + ONE,  tile.t + bottom, 
                       tile.s + ONE,  tile.t + top, 
                       tile.s + ZERO, tile.t + top);
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

//var _TWEAKERS = {};
function tweaker(pos) {
  /*var key = pos.join(',');
  if (key in _TWEAKERS)
    return _TWEAKERS[key];
  else
    return _TWEAKERS[key] = 
  */
  return [
      0.25 * pinkNoise(pos[0], pos[1], pos[2]+1593.1, 4, 1),
      0.25 * pinkNoise(pos[0], pos[1], pos[2]+2483.7, 4, 1), 
      0.25 * pinkNoise(pos[0], pos[1], pos[2]+9384.3, 4, 1) 
    ];
}

var _CORNERS = [[0,0,0],
                [1,0,0],
                [1,0,1],
                [0,0,1],
                [0,1,0],
                [1,1,0],
                [1,1,1],
                [0,1,1]];

function faces(corners) {
  return [[corners[0], corners[1], corners[5], corners[4]],  // front
          [corners[2], corners[3], corners[7], corners[6]],  // back
          [corners[3], corners[2], corners[1], corners[0]],  // bottom
          [corners[4], corners[5], corners[6], corners[7]],  // top
          [corners[3], corners[0], corners[4], corners[7]],  // right
          [corners[1], corners[2], corners[6], corners[5]]]; // left
}

var _FACES = faces(_CORNERS);


Block.prototype.buildGeometry = function () {
  if (this.type.empty) {
    // do nothing
  } else if (this.type.hashes) {
    blockGeometryHash(this);
  } else {
    blockGeometryBlock(this);
  }
}

Entity.prototype.buildGeometry = function (vertices) {
  if (this.type.geometry) {
    this.type.geometry(this, vertices);
  } else if (this.type.invisible) {
    // do nothing
  } else if (this.type.billboard) {
    entityGeometryBillboard(this, vertices);
  } else if (this.sourcetype.hashes) {
    entityGeometryHash(this, vertices);
  } else {
    entityGeometryBlock(this, vertices);
  }
}

Entity.prototype.gain = function (itemtype, qty) {
  if (typeof qty === 'undefined') qty = 1;
  for (var i = 0; i < this.inventory.length; ++i)
    if (this.inventory[i] && this.inventory[i].type === itemtype) 
      return this.inventory[i].qty += qty;
  for (var i = 0; i < this.inventory.length; ++i)
    if (!this.inventory[i] || !this.inventory[i].type)
      return this.inventory[i] = {type: itemtype, qty: qty};
  message('Inventory full!');
}


function blockGeometryBlock(b) {
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
        v.aPos = v.aPos.concat(coord);
        if (face === FACE_LEFT || face === FACE_RIGHT)
          v.aLighting.push(n.light[0] * DARKFACE,
                           n.light[1] * DARKFACE,
                           n.light[2] * DARKFACE,
                           n.light[3] * DARKFACE);
        else
          v.aLighting = v.aLighting.concat(n.light);
        var color = b.type.color || [1,1,1];        
        v.aColor = v.aColor.concat(vclamp(vec3.add(color, tweaker(coord), 
                                                   [0,0,0])));
      }
       
      // Set textures per vertex: one ST pair for each vertex
      var tile = tileCoord(b, face);
      var bottom, top;
      if (face === FACE_TOP || face === FACE_BOTTOM) {
        bottom = 0;
        top = 1;
      } else if  (typeof b.stackPos !== 'undefined') {
        bottom = b.type.stack - b.stackPos - SY;
        top = bottom + SY;
      } else if (SY % 1 === 0) {
        bottom = 0;
        top = bottom + SY;
      } else {
        bottom = SY - frac(b.y);
        top = bottom + SY;
      }
      
      // Keep away from edges of texture so as to not bleed neighboring
      if (bottom % 1 === 0) bottom += ZERO;
      if (top % 1 === 0) top -= ZERO;

      v.aTexCoord.push(tile.s + ONE,  tile.t + bottom, 
                       tile.s + ZERO, tile.t + bottom, 
                       tile.s + ZERO, tile.t + top, 
                       tile.s + ONE,  tile.t + top);

      // Describe triangles
      v.indices.push(pindex, pindex + 1, pindex + 2,
                     pindex, pindex + 2, pindex + 3);
    }
  }
}

function entityGeometryHash(ntt, vertices) {
  blockGeometryHash(ntt);
  for (var i = 0; i < ntt.vertices.aPos.length; i += 3) {
    ntt.vertices.aPos[i] -= 0.5;
    ntt.vertices.aPos[i+2] -= 0.5;
  }
  appendGeometry(vertices, ntt.vertices);
}


Array.prototype.append = function (tail) {
  this.push.apply(this, tail);
}


function appendGeometry(v, w, justLighting) {
  v.aLighting.append(w.aLighting);
  if (!justLighting) {
    var pindex = v.aPos.length / 3;
    v.aPos.append(w.aPos);
    v.aColor.append(w.aColor);
    v.aTexCoord.append(w.aTexCoord);
    for (var i = 0; i < w.indices.length; ++i)
      v.indices.push(pindex + w.indices[i]);
  }
}


function entityGeometryBillboard(b, v) {
  var pindex = v.aPos.length / 3;
  v.aColor.push(1,1,1, 1,1,1, 1,1,1, 1,1,1);
  v.indices.push(pindex + 0, pindex + 1, pindex + 2, 
                 pindex + 0, pindex + 2, pindex + 3);

  var light = block(b).light;

  // "Look" vector pointing at player
  var l = vec3.create([
    AVATAR.x - b.x, 
    AVATAR.y + AVATAR.eyeHeight - b.y, 
    AVATAR.z - b.z]);
  vec3.normalize(l);

  // "Right" vector projected on y plane perp to l
  var r = vec3.create([l[2], 0, -l[0]]);
  vec3.normalize(r);

  // "Up" vector
  var u = vec3.cross(l, r, vec3.create());
  vec3.normalize(u);  // probably already unit though, eh?
  //var trans = mat3.create(r.concat(u, l));

  var S = b.type.scale || 0.25;
  var quad = [-S,-S, S,-S, S,S, -S,S];
  var bob = b.type.bob ? b.type.bob * (1 + Math.sin(2 * b.age())) / 2 : 0;
  var p = [b.x, b.y + S + bob, b.z];
  for (var i = 0; i < quad.length; i += 2) {
    var x = quad[i], y = quad[i+1], z = -0.5;
    for (var t = 0; t < 3; ++t)
      v.aPos.push(x * r[t] + y * u[t] + p[t]);
    v.aLighting.append(light);
  }
    
  var tile = tileCoord(b);
  v.aTexCoord.push(tile.s + ZERO, tile.t + ONE, 
                   tile.s + ONE,  tile.t + ONE, 
                   tile.s + ONE,  tile.t + ZERO, 
                   tile.s + ZERO, tile.t + ZERO);
}


function ppiped(x0, x1, y0, y1, z0, z1) {
  return [[x0, y0, z0],
          [x1, y0, z0],
          [x1, y0, z1],
          [x0, y0, z1],
          [x0, y1, z0],
          [x1, y1, z0],
          [x1, y1, z1],
          [x0, y1, z1]];
}

function vfrustum(rbottom, rtop, ybottom, ytop) {
  return [[-rbottom, ybottom, -rbottom],
          [+rbottom, ybottom, -rbottom],
          [+rbottom, ybottom, +rbottom],
          [-rbottom, ybottom, +rbottom],
          [-rtop,    ytop,    -rtop],
          [+rtop,    ytop,    -rtop],
          [+rtop,    ytop,    +rtop],
          [-rtop,    ytop,    +rtop]];
}



/*
function geometryCylinder(v, p) {
  var cos0 = p.radius, sin0 = 0;
  var i0 = v.aPos.length / 3;
  var southpole = v.aPos.length / 3;
  var northpole = southpole + 1;
  v.aPos.push(p.x, p.y, p.z,  p.x, p.y + p.h, p.z);
  for (var n = 0, i = v.aPos.length / 3; n < p.sides; n += 1, i += 2) {
    var cos = p.radius * Math.cos(n * Math.PI * 2 / p.sides);
    var sin = p.radius * Math.sin(n * Math.PI * 2 / p.sides);
    v.aPos.push(p.x + cos, p.y,       p.z + sin,
                p.x + cos, p.y + p.h, p.z + sin);
    var i2 = i0 + 2 * ((n + 1) % p.sides);
    v.indices.push(i, i2+1, i+1,      // bl br tr
                   i,       i+1, i2); // bl    tr tl
  }
    v.indices.push(southpole, pi + 2*n,     pi + 2 * ((n + 1) % p.sides));
    v.indices.push(northpole, pi + 2*n + 1, pi + 2 * ((n + 1) % p.sides) + 1);
    
  }
}
*/



function geometryBox(v, p) {
  for (var face = 0; face < 6; ++face) {
    // Add vertices
    var pindex = v.aPos.length / 3;
    var f = p.faces[face];
    for (var i = 0; i < 4; ++i) {
      var ff = f[i];
      var cos = Math.cos(p.yaw), sin = Math.sin(p.yaw);
      var dx = ff[0] * cos - ff[2] * sin;
      var dy = ff[1];
      var dz = ff[0] * sin + ff[2] * cos;
      v.aPos.push(p.x + dx, p.y + dy, p.z + dz);
      v.aLighting = v.aLighting.concat(p.light);
      v.aColor = v.aColor.concat(p.color);
    }

    var tile = tileCoord(p.tile, face);
    var top = 0;
    if (top % 1 === 0) top += ZERO;
    v.aTexCoord.push(tile.s + ONE,  tile.t + ONE, 
                     tile.s + ZERO, tile.t + ONE, 
                     tile.s + ZERO, tile.t + top,
                     tile.s + ONE,  tile.t + top);

    // Describe triangles
    v.indices.push(pindex, pindex + 1, pindex + 2,
                   pindex, pindex + 2, pindex + 3);
  }

  return v;
}

function entityGeometryBlock(ntt, v) {
  var height = ntt.type.stack || ntt.sourcetype.stack || SY;
  if (!ntt.sourcetype.faces)
    ntt.sourcetype.faces = faces(ppiped(-ntt.type.radius, ntt.type.radius,
                                        0, height * ntt.type.radius * 2,
                                        -ntt.type.radius, ntt.type.radius));
  geometryBox(v, {
    light: block(ntt).light,
    color: ntt.type.color || ntt.sourcetype.color || [1,1,1],
    texheight: height,
    faces: ntt.sourcetype.faces,
    yaw: ntt.yaw,
    x: ntt.x,
    y: ntt.y + 1/8 * (1 + Math.sin(2 * ntt.age())) / 2,
    z: ntt.z,
    tile: ntt,
  });
}                    


function Wireframe() {
  this.shader = new Shader('wireframe');

  var vertices = [
    0,0,0, 1,0,0, 1,0,1, 0,0,1,  // bottom
    0,1,0, 1,1,0, 1,1,1, 0,1,1]; // top
  var indices = [
    4,5, 5,6, 6,7, 7,4,  // top
    0,1, 1,2, 2,3, 3,0,  // bottom
    0,4, 1,5, 2,6, 3,7]; // sides

  for (var i = 1; i < vertices.length; i += 3) vertices[i] *= SY;
  this.aPos = makeBuffer(vertices, 3);
  this.indices = makeBuffer(indices, 1, false, true);
}


Wireframe.prototype.render = function () {
  mvPushMatrix();
  mat4.translate(mvMatrix, [PICKED.x, PICKED.y, PICKED.z]);
  
  this.shader.use();
  
  gl.lineWidth(2);
  
  gl.uniformMatrix4fv(this.shader.uniforms.uPMatrix,  false,  pMatrix);
  gl.uniformMatrix4fv(this.shader.uniforms.uMVMatrix, false, mvMatrix);
  
  pointToAttribute(this.shader, this, 'aPos');
  
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indices);
  gl.drawElements(gl.LINES, this.indices.numItems, gl.UNSIGNED_SHORT, 0);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  
  this.shader.disuse();

  gl.enable(gl.DEPTH_TEST);
  mvPopMatrix();
}


function Skybox(vs, fs) {
  this.shader = new Shader(vs, fs);
  this.buffer = makeBuffer([-1,-1, +1,-1, +1,+1, -1,+1], 2);
}

Skybox.prototype.render = function () {
  this.shader.use();
  gl.disable(gl.DEPTH_TEST);

  if (this.shader.uniforms.hasOwnProperty('uSampler')) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, gl.textures.panorama);
    gl.uniform1i(this.shader.uniforms.uSampler, 0);
  } else {
    gl.uniform1f(this.shader.uniforms.uTimeOfDay, GAME.timeOfDay);
  }

  var invViewRot = mat4.toInverseMat3(mvMatrix, mat3.create());
  var invProj = mat4.inverse(pMatrix, mat4.create());
  gl.uniformMatrix3fv(this.shader.uniforms.uInvViewRot, false, invViewRot);
  gl.uniformMatrix4fv(this.shader.uniforms.uInvProj, false, invProj);
  gl.uniform2f(this.shader.uniforms.uViewport, 
               gl.viewportWidth, gl.viewportHeight);

  pointToAttribute(this.shader, {aPos: this.buffer}, 'aPos');
  gl.drawArrays(gl.TRIANGLE_FAN, 0, this.buffer.numItems);

  gl.enable(gl.DEPTH_TEST);
  this.shader.disuse();
}


function Entity(init1, init2) {
  var that = this;
  init1 = init1 || {};
  init2 = init2 || {};
  function init(prop, defa) {
    if      (typeof init1[prop] !== 'undefined') that[prop] = init1[prop];
    else if (typeof init2[prop] !== 'undefined') that[prop] = init2[prop];
    else if (typeof defa === 'function') that[prop] = defa();
    else that[prop] = defa;
  }
  init('x', 0);
  init('y', HY);
  init('z', 0);
  init('dx', 0);
  init('dy', 0);
  init('dz', 0);
  init('ddx', 0);
  init('ddy', 0);
  init('ddz', 0);
  init('yaw', 0);
  init('pitch', 0);
  init('dyaw', 0);
  init('dpitch', 0);
  //init('falling', false);
  init('birthday', GAME.clock);
  init('id', function () { return GAME.nextEntityID++} );
  init('type');
  init('sourcetype', {});
  if (typeof this.type === 'string') 
    this.type = ENTITY_TYPES[this.type];
  if (typeof this.sourcetype === 'string') 
    this.sourcetype = BLOCK_TYPES[this.sourcetype];
  this.height = this.type.height || this.type.scale;
  this.flying = this.falling = false;
  this.chunk = chunk(0,0);  // for now - all entities in 1 chunk
  this.chunk.entities[this.id] = this;
  if (this.type.init) this.type.init.apply(this);
}


Entity.prototype.data = function () {
  var result = {};
  var keeps = 'x y z dx dy dz yaw pitch dyaw dpitch birthday id'.split(' ');
  for (var i = 0; i < keeps.length; ++i) {
    var k = keeps[i];
    result[k] = this[k];
  }
  result.type = this.type.name;
  result.sourcetype = this.sourcetype.name;
  return result;
}

Entity.prototype.die = function () {
  this.dead = true;
  delete this.chunk.entities[this.id];
  if (this.type === ENTITY_TYPES.player)
    togglePointerLock();
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
  i('eyeHeight', 0);
}


function takePanorama() {
  var can = document.createElement('canvas');
  can.width = 256 * 6;
  can.height = 256;
  var ctx = can.getContext('2d', {preserveDrawingBuffer:true});
  var dones = 0;
  var snappers = [
    [0, 0, 0],
    [1, 0, Math.PI/2],
    [2, 0, Math.PI],
    [3, 0, 3*Math.PI/2],
    [4, Math.PI/2, 0],
    [5, -Math.PI/2, 0],
  ];
  function snap() {
    if (snappers.length > 0) {
      var s = snappers.pop();
      var i = s[0];
      AVATAR.pitch = s[1];
      AVATAR.yaw = s[2];
      drawScene(AVATAR);
      var img = new Image();
      img.src = canvas.toDataURL();
      img.onload = function() {
        ctx.drawImage(img, i * 256, 0);
        snap();
      }
    } else {
      window.open(can.toDataURL());
    }
  }
  snap();
}  



function onLoad() {
  $('throbber').innerText = 
    THROBBERS[Math.floor(Math.random()*THROBBERS.length)];

  var cancan = $('cancan');
  var canvas = $('canvas');

  var glopts = {};
  
  // Skybox-screenshottable with takePanorama()
  // then copypaste into acorn
  if (window.location.search === '?shot') {
    resizeCanvas(256, 256);
    glopts.preserveDrawingBuffer = true;
    window.panoramaMode = true;
  }

  if (!initGL(canvas, glopts)) {
    failinit('<b>Error! Unable to initialize WebGL!</b><br><br><br>Perhaps your browser is hopelessly backwards and out of date. Try the latest Chrome or Firefox.<br><br>If that\'s not the problem, you might try restarting your browser.');
    return;
  }

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

  window.addEventListener('keydown', onkeydown, true);
  window.addEventListener('keyup',   onkeyup,   true);
  window.addEventListener('mousemove', onmousemove, true);
  window.addEventListener('mousedown', onmousedown, true);
  window.addEventListener('focus', onfocus, true);
  document.oncontextmenu = function () { return false };

  document.addEventListener('fullscreenchange', fullscreenChange, false);
  document.addEventListener('mozfullscreenchange', fullscreenChange, false);
  document.addEventListener('webkitfullscreenchange', fullscreenChange, false);
  
  document.addEventListener('pointerlockchange', pointerLockChange, false);
  document.addEventListener('mozpointerlockchange', pointerLockChange, false);
  document.addEventListener('webkitpointerlockchange',pointerLockChange,false);
  
  document.addEventListener('pointerlockerror', pointerLockError, false);
  document.addEventListener('mozpointerlockerror', pointerLockError, false);
  document.addEventListener('webkitpointerlockerror', pointerLockError,false);

  $('inventory').addEventListener('mousemove', function (e) {
    var rect = $('inventory').getBoundingClientRect();
    var mouseX = e.clientX - rect.left;
    var mouseY = e.clientY - rect.top;
    var held = $('held');
    held.style.left = (mouseX - held.width/2) + 'px';
    held.style.top = (mouseY - held.height/2) + 'px';
  }, false);
  for (var i = 0; i < 9 * 4; ++i) {
    makeInventorySlot('inventory', i);
    if (i < 9) makeInventorySlot('hud', i);
  }

  $('newgame').onclick =     function () { newGame(1);  }
  $('newhalfgame').onclick = function () { newGame(0.5); }

  $('loadgame').onclick = function () {
    loadGame(1);
    togglePointerLock();
  }

  if (!cancan.requestPointerLock) {
    failinit("<b>Error! Can't lock the pointer.</b><br><br>This browser does not support mouse pointer locking, so Halfblock won't run here. Try the latest version of Chrome or Firefox.");
  }

  $('resumegame2').onclick = $('resumegame').onclick = function () {
    togglePointerLock();
  }

  $('respawn').onclick = function () {
    AVATAR.dead = false;
    AVATAR.dx = AVATAR.dy = AVATAR.dz = 0;
    AVATAR.x = AVATAR.z = 0.5;
    AVATAR.y = HY;
    var b = topmost(AVATAR.x, AVATAR.z);
    if (b)
      AVATAR.y = b.y + 1;
    else 
      AVATAR.flying = true;
    AVATAR.yaw = AVATAR.pitch = 0;
    chunk(0,0).entities[AVATAR.id] = AVATAR;
    togglePointerLock();
  }

  $('savegame').onclick = function () {
    GAME.save(function () { 
      message('Saved.');
      GAME = null;
      AVATAR = null;
      showAndHideUI();
    });
  }

  $('quitgame').onclick = $('quitgame2').onclick = function () {
    GAME = null;
    AVATAR = null;
    showAndHideUI();
  }

  $('stats').hide = true;

  showAndHideUI();

  tick();
}


function newGame(sy) {
  SY = sy;
  HY = NY * SY;

  gl.wireframe = new Wireframe();

  // Create game
  GAME = new Game();
  GAME.loading = true;
  showAndHideUI();
  var updates = 10;
  var c;
  function forceUpdate() {
    if (c = loadNearbyChunks({x:0, z:0}, SPREAD_OUT, 1)) {
      setTimeout(forceUpdate, 0);
    } else if (updates) {
      for (var i in GAME.chunks) {
        var c = GAME.chunks[i];
        c.update(true);
      }
      updates--;
      setTimeout(forceUpdate, 0);
    } else {
      // Create player
      new Entity({type:'player', x:NX/2 - 0.5, y:HY/2, z:NZ/2 + 0.5});
      GAME.loading = false; 
      showAndHideUI();
    }
  }
  
  togglePointerLock();
  makeChunk(0,0);
  forceUpdate();
}


function failinit(problem) {
  $('failinit').innerHTML = problem;
  show('failinit', true);
  var bs = document.getElementsByTagName('button');
  for (var i = 0; i < bs.length; ++i) bs[i].style.display = 'none';
  show('title', true);
}


function makeInventorySlot(parent, i) {
  var row = 356 - 64 * Math.floor(i / 9);
  var col = 140 + 64 * (i % 9);
  if (i < 9) row += 30;
  var div = document.createElement('div');
  div.className = 'toolbox';
  div.style.left = col + 'px';
  div.style.top = row + 'px';
  div.position = i;
  if (parent === 'inventory') {
    div.addEventListener('mousedown', function () { 
      var slotted = AVATAR.inventory[this.position];
      AVATAR.inventory[this.position] = AVATAR.held;
      AVATAR.held = slotted;
      redisplayInventory(AVATAR);
    }, false);
  }
  $(parent).appendChild(div);
  var can = document.createElement('canvas');
  can.className = 'tool';
  can.id = parent + i;
  can.width = can.height = 48;
  div.appendChild(can);
}

function onfocus(event) {
  if (GAME && AVATAR)
    drawScene(AVATAR);
}

function onkeyup(event) { onkeydown(event, 0); }

function onkeydown(event, count) {
  event = event || window.event;
  if (event.preventDefault)
    event.preventDefault();

  var k = event.keyCode;
  var c = String.fromCharCode(k).toUpperCase();
  if (112 <= k && k < 124)
    c = 'F' + (k - 111);

  if (typeof count === 'undefined') 
    count = (KEYS[k] || 0) + 1;

  if (event.ctrlKey) {
    k = '^' + k;
    c = '^' + c;
  }

  KEYS[k] = KEYS[c] = count;

  if (count === 1) {

    if (c === '\t' || k === 27) { // tab or escape
      if (GAME) GAME.showInventory = false;
      togglePointerLock();
      // Esc key to close inventory isn't a good idea, since it kills
      // pointer lock / fullscreen, unavoidably
    }

    if (c === 'L' && cancan.requestFullscreen)
      cancan.requestFullscreen();

    if (c === 'F3') {
      var stats = $('stats');
      stats.hide = !stats.hide;
      showAndHideUI();
    }

    if (window.mode === 'pause')
      return;

    if (c === ' ') {
      if (GAME.clock < AVATAR.lastHop + 0.25) {
        // Toggle flying
        AVATAR.flying = !AVATAR.flying;
        if (AVATAR.flying) AVATAR.falling = false;
      } else if (!AVATAR.flying && !AVATAR.falling) {
        // Jump!
        AVATAR.dy = VJUMP;
        AVATAR.falling = true;
        //new Sound('jump');
      }
      AVATAR.lastHop = GAME.clock;
    }

    // E and I for inventory
    if (c === 'E' || c === 'I') {
      if (GAME && !GAME.loading && AVATAR) {
        if (event.shiftKey) {
          // Rotate inventory
          Array.prototype.push.apply(AVATAR.inventory, 
                                     AVATAR.inventory.splice(0, 9));
          redisplayInventory(AVATAR);
        } else {
          // Show/hide inventory screen
          redisplayInventory(AVATAR);
          GAME.showInventory = !GAME.showInventory;
          togglePointerLock();
        }
      }
    }

    if (c === 'K' && PICKED) {
      for (var i = 0; i < 10; ++i) {
        var f = PICKED.neighbor(PICKED_FACE);
        var p = gl.particles.spawn({x0: f.x+0.5, y0: f.y+0.5, z0: f.z+0.5});
        gl.particles.bounceParticle(p);
      }
    }

    if (c === '^I') {
      // Cheat-in inventory
      for (var t in BLOCK_TYPES)
        if (BLOCK_TYPES[t].tile)
          AVATAR.gain(t, 10);
      for (var t in ENTITY_TYPES)
        if (ENTITY_TYPES[t].tile)
          AVATAR.gain(t, 10);
      redisplayInventory(AVATAR);
    }

    if (c === '^R')
      reload();

    if (c === 'C' && PICKED) {
      // Spawn a drone
      var f = PICKED.neighbor(PICKED_FACE);
      new Entity({type: 'drone',
                  x: f.x + 0.5, 
                  y: f.y,
                  z: f.z + 0.5});
    }

    if (c === 'T') {
      // Toggle options page
      if (GAME) {
        if (window.showOptions) {
          togglePointerLock();
        } else {
          window.showOptions = true;
          if (window.pointerLocked)
            togglePointerLock();
          else
            showAndHideUI();
        }
      }
    }

    // right paren/brace/bracket means select next tool
    if (k === 190 || k === 221)
      pickTool((AVATAR.slot + 1) % 9);
    
    // Left paren/brace//bracket means select previous tool
    if (k === 188 || k === 219)
      pickTool((AVATAR.slot + 8) % 9);

    if (c === '^S') {
      GAME.save(function () { message('Game saved.'); });
    }

    if (c === '^L') {
      loadGame(1);
    } 

    if (c === '^0') {
      AVATAR.yaw = AVATAR.pitch = 0;
    }

    if (c === 'F1') {
      var hud = $('hud');
      hud.hide = !hud.hide;
      showAndHideUI();
    }

    if (c === 'F4') {
      if (window.panoramaMode)
        takePanorama();
    }

    // Number keys 1-9 select the 9 item slots
    var t = k - '1'.charCodeAt(0);
    if (0 <= t && t < 9)
      pickTool(t);
  }
}


function renderInventoryItem(can, item) {
  var ctx = can.getContext('2d');
  ctx.clearRect(0, 0, can.width, can.height);
  var qty = item && item.qty;
  var type = qty && item.type;
  if (type) {
    type = BLOCK_TYPES[type] || ENTITY_TYPES[type];
    var tile = tileCoord(type);
    ctx.drawImage($('terrain'), 
                  16 * tile.s, 16 * tile.t,  16, 16,
                  0, 0,                      can.width, can.height);
    if (type.color) {
      var im = ctx.getImageData(0,0,can.width,can.height);
      for (var i = 0; i < im.width * im.height; ++i) {
        im.data[i * 4 + 0] *= type.color[0];
        im.data[i * 4 + 1] *= type.color[1];
        im.data[i * 4 + 2] *= type.color[2];
      }
      ctx.putImageData(im, 0, 0);
    }
    if (qty > 1) {
      ctx.fillStyle = 'white';
      ctx.font = '12pt Helvetica';
      ctx.textAlign = 'right';
      ctx.fillText(qty, can.width-2, can.height-3);
    }
    can.title = type.name;
  } else {
    can.title = null;
  }
}

 
function redisplayInventory(whom) {
  if (window.mode === 'inventory')
    renderInventoryItem($('held'), whom.held);
  for (var i = 0; i < whom.inventory.length; ++i) {
    var can = $(window.mode + i);
    if (!can) break;
    renderInventoryItem(can, whom.inventory[i]);
  }
}


function onmousemove(event) {
  if (window.pointerLocked && GAME && !GAME.loading) {
    var movementX = event.movementX || 
      event.mozMovementX || 
      event.webkitMovementX;
    var movementY = event.movementY || 
      event.mozMovementY ||
      event.webkitMovementY;
    var spinRate = 0.01;
    AVATAR.yaw += movementX * spinRate;
    AVATAR.pitch += movementY * spinRate;
    AVATAR.pitch = Math.max(Math.min(Math.PI/2, AVATAR.pitch), -Math.PI/2);
  }
}


function onmousedown(event) {
  if (window.pointerLocked && GAME && !GAME.loading) {
    event = event || window.event;
    if (event.preventDefault) event.preventDefault();
    if (PICKED) {
      if (event.button === 0) {
        PICKED.breakBlock();
        //new Sound('hitHurt');
      } else {
        var b = PICKED.neighbor(PICKED_FACE);
        var tool = AVATAR.inventory[AVATAR.slot] &&
          AVATAR.inventory[AVATAR.slot].qty &&
          AVATAR.inventory[AVATAR.slot].type;
        if (tool) tool = BLOCK_TYPES[tool] || ENTITY_TYPES[tool];
        if (!b.outofbounds && tool) {
          if (tool.isEntity)
            new Entity({type: tool,
                        x: b.x + 0.5, 
                        y: b.y,
                        z: b.z + 0.5});
          else
            b.placeBlock(tool);
          if (--AVATAR.inventory[AVATAR.slot].qty <= 0)
            AVATAR.inventory[i] = null;
          redisplayInventory(AVATAR);
        }
      }
    }
    return false;
  }
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
    var t = 1/h;
    h = 1/l;
    l = t;
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
  window.pointerLocked = (document.mozPointerLockElement ||
                          document.webkitPointerLockElement) === cancan;
  if (window.pointerLocked && window.showOptions) {
    window.showOptions = false;
    var rdist = document.getElementsByName("rdist");
    for (var i = 0; i < rdist.length; i++)
      if (rdist[i].checked) 
        SPREAD_OUT = parseInt(rdist[i].value);
  }
  showAndHideUI();
}

var _MODES = 'title,loading,dead,hud,options,inventory,pause'.split(',');
function showAndHideUI() {
  if (!GAME) {
    window.mode = 'title';
  } else if (GAME.loading) {
    window.mode = 'loading';
  } else if (window.pointerLocked) {
    window.mode = 'hud';
  } else if (AVATAR.dead) {
    window.mode = 'dead';
  } else if (GAME.showInventory) {
    window.mode = 'inventory';
  } else if (window.showOptions) {
    window.mode = 'options';
  } else {
    window.mode = 'pause';
  }
  for (var i = 0; i < _MODES.length; ++i)
    show(_MODES[i], window.mode === _MODES[i] && !$(window.mode).hide);
  if (window.mode === 'inventory' || window.mode === 'hud')
    redisplayInventory(AVATAR);

  show('stats', !$('stats').hide);
}


function show(id, visible) {
  $(id).style.display = visible ? 'block' : 'none';
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
    id: gl.particles.nextID++,
    birthday: GAME.clock - rewind,
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
      this.remove(p);
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

  gl.uniform1f(this.shader.uniforms.uClock, parseFloat(GAME.clock));
  gl.uniform1f(this.shader.uniforms.uGravity, PARTICLE_GRAVITY);
  gl.uniformMatrix4fv(this.shader.uniforms.uPMatrix,  false,  pMatrix);
  gl.uniformMatrix4fv(this.shader.uniforms.uMVMatrix, false, mvMatrix);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, gl.textures.terrain);
  var ext = gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic");
  if (ext)
    gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 
                     $('anisotropic').checked ? 4 : 1);
  gl.uniform1i(this.shader.uniforms.uSampler, 0);

  pointToAttribute(this.shader, this.buffers, 'aInitialPos');
  pointToAttribute(this.shader, this.buffers, 'aVelocity');
  pointToAttribute(this.shader, this.buffers, 'aBirthday');
  pointToAttribute(this.shader, this.buffers, 'aTexCoord');

  gl.drawArrays(gl.POINTS, 0, this.buffers.aInitialPos.numItems);

  this.shader.disuse();
}


function resizeCanvas(w, h) {
  // This needs to be called before initGL
  canvas.width = w;
  canvas.height = h;
  var bigs = 'cancan hud stats options'.split(' ');
  for (var i = 0; i < bigs.length; ++i) {
    $(bigs[i]).style.width = w + 'px';
    $(bigs[i]).style.height = h + 'px';
  }
}


function pickTool(slot) {
  AVATAR.slot = slot;
  for (var i = 0; i < 9; ++i)
    $('hud'+i).parentNode.style.borderColor = 
      (i === slot) ? 'white' : 'rgb(128, 128, 128)';
}


function sqr(x) { return x * x }


function Game(data) {
  data = data || {};
  var game = this;
  function init(key, defa) { 
    game[key] = (data.hasOwnProperty(key)) ? data[key] : defa;
  }
  init('seed', Math.random() * 9999999);
  init('timeOfDay', Math.PI);  // 0 is midnight, PI is noon
  init('nextEntityID', 1);
  init('clock', 0);
  this.lastUpdate = this.clock;
  this.chunks = {};
  this.entities = {};
  this.calcSunlight();

  this.UPDATE_PERIOD = 0.1; // sec
}


Game.prototype.data = function () {
  return {
    seed: this.seed,
    timeOfDay: this.timeOfDay,
    nextEntityID: this.nextEntityID,
    clock: this.clock,
  };
}


Game.prototype.calcSunlight = function () {
  this.sunlight = 0.5 - Math.cos(this.timeOfDay) / 2;
}


function wallClock() {
  return +new Date()/1000;
}
window.lastFrame = wallClock();


Game.prototype.save = function (callback) {
  var game = this;
  prepStorage(function () {
    var trans = DB.transaction(['games', 'chunks'], 'readwrite');
    var games = trans.objectStore('games');
    var chunks = trans.objectStore('chunks');
    var ckeys = Object.keys(game.chunks);
    var data = game.data();
    var req = (typeof GAME.id === 'undefined') ? 
      games.add(data) : 
      games.put(data, GAME.id);
    function putone() {
      if (ckeys.length > 0)
        saveChunk(game.chunks[ckeys.pop()], putone);
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
    var req = games.get(gameid);
    req.onsuccess = function (e) {
      if (!req.result) {
        message('Load game failed!');
        return;
      }
      GAME = new Game(req.result);
      GAME.loading = true;
      showAndHideUI();

      var chunks = trans.objectStore('chunks');
      chunks.openCursor().onsuccess = function(event) {
        var cursor = event.target.result;
        if (cursor) {
          var c = new Chunk(cursor.value);
          c.nDirty = 1;
          cursor.continue();
        } else {
          GAME.loading = false;
          message('Game loaded.'); 
          showAndHideUI();
          if (callback) callback();
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
  var req = window.indexedDB.open('halfblock', 'Halfblock');
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
  fb.top = (15-t) * 16 + 2;
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
var BLIT;
function blur(camera, w, h) {
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
  
  drawScreenAlignedQuad(BLURH, FB1, FB2);
  drawScreenAlignedQuad(BLURV, FB2);
}

function blurryIntro(time) {
  if (!gl) return;
  if (!SAQ)
    SAQ = makeBuffer([-1,-1, +1,-1, +1,+1, -1,+1], 2);
  gl.enable(gl.DEPTH_TEST);
  gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);

  // Set up the projection
  var aspectRatio = gl.viewportWidth / gl.viewportHeight;
  mat4.perspective(Math.PI/3/aspectRatio * 180/Math.PI, 
                   aspectRatio,
                   0.1, // near clipping plane
                   10,  // far clipping plane
                   pMatrix);

  // Position for camera
  mat4.identity(mvMatrix);
  mat4.rotateX(mvMatrix, Math.cos(time / 20) / 10);
  mat4.rotateY(mvMatrix, time / 4 / 20);

  if (gl.textures.panorama.loaded)
    gl.panorama.render();
}


function drawScreenAlignedQuad(shader, step, sourceFB, destFB) {
  shader.use();
  
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sourceFB.texture);
  gl.uniform1i(shader.uniforms.uSrc, 0);
  gl.uniform1f(shader.uniforms.uStep, step);
  gl.bindFramebuffer(gl.FRAMEBUFFER, destFB);  // destFB may be null
  gl.viewport(0, 0, 
              destFB ? destFB.width : gl.viewportWidth, 
              destFB ? destFB.height : gl.viewportHeight);

  pointToAttribute(shader, {aPos: SAQ}, 'aPos');
  gl.drawArrays(gl.TRIANGLE_FAN, 0, SAQ.numItems);

  shader.disuse();
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
  var k = sound;
  if (typeof k === 'string') {
    k = new Knobs();
    k[sound]();
  }
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
    / -44100;
  
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
    if (this.repeatTime != 0 && 
        ++this.elapsedSinceRepeat >= this.repeatTime)
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
  for (var i in defaultKnobs)
    this[i] = defaultKnobs[i];
  if (settings.init) this[settings.init]();
  for (var i in defaultKnobs)
    if (settings.hasOwnProperty(i))
      this[i] = settings[i];
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


Knobs.prototype.tone = function () {
  this.shape = SINE;
  this.frequency = 440;
  this.attack = 0;
  this.sustain = 1;
  this.decay = 0;
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

var THROBBERS = [
  'Slavish duplication!',
  'Throbber!',
  'Lots of candy!',
  'Halfsize blocks!',
  '<!DOCTYPE html>!',
  'Some mining, but no crafting!',
  'Mostly 3D!',
  'Worse than wolves!',
  'Japanese food!',
  'Open source!',
  'No IE support!',
  'Halfbaked!',
  'Not by Notch!',
  'No QA deptartment!',
  'Child-driven design!',
  'Herobrine removed!',
  'No multiplayer!',
  'WebGL!',
  'Custom shaders!',
];

