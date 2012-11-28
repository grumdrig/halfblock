// Map generation smarts

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

var LIGHT_SUN = 6;

var GRASSY = false;        // true to use decal-style grass

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
    upon: 'plantable',
  },
  grassy: {
    tile: [4,2],
    hashes: 2,
    height: 0.5,
  },
  soybeans: {
    tile: [7,2],
    hashes: 2,
    upon: 'plantable',
    drop: 'soybean',
  },
  weeds: {
    tile: [11,2],
    hashes: 3,
    upon: 'plantable',
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
    upon: 'solid',
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
    tile: [2,2, 2,1],
    opaque: true,
    solid: true,
    stack: 1,
  },
  hal9000: {
    tile: [3,2, 3,1],
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
  log: {
    tile: [4,3, 4,4],
    solid: true,
    geometry: 'log',
  },
  frond: {
    tile: [5,3],
    geometry: 'frond',
  },
};
for (var i in BLOCK_TYPES)
  BLOCK_TYPES[i].name = i;


function generateBlock(seed, x, y, z) {
  var type;
  if (y < 0.75 + 2 * noise(x * 23.2, y * 938.2, z * 28.1)) {
    type = 'bedrock';
  } else {
    var n = pinkNoise(x, y, z + seed, 32, 2) + 
      (2 * y/SY - NY) / NY;
    if (n < -0.2) type = 'rock';
    else if (n < -0.1) type = 'dirt';
    else if (n < 0) type = GRASSY ? 'dirt' : 'grass';
    else if (y < HY / 4) type = 'apricot jelly';
    else if (y < HY / 2) type = 'water';
    else type = 'air';

    if (Math.pow(noise(x/20 + seed, y/20, z/20 + 1000), 3) < -0.2)
      type = 'candy';

    // Caves
    if (Math.pow(noise(x/20, y/20 + seed, z/20), 3) < -0.1)
      type = 'air';
  }
  return type;
}


function generateChunk(seed, chunkx, chunkz) {
  var result = {
    key: chunkx + ',' + chunkz,
    chunkx: chunkx,
    chunkz: chunkz,
    blocks: new Array(NX * NY * NZ),
    entities: {},
  }
  var blocks = result.blocks;

  var i = 0;
  for (var iz = 0; iz < NZ; ++iz) {
    for (var y = 0; y < NY; ++y) {
      for (var ix = 0; ix < NX; ++ix) {
        blocks[i++] = {
          light: [0, 0, 0, 0],
          dirtyLight: false,
          dirtyGeometry: false,
          type: generateBlock(seed, ix + chunkx, y*SY, iz + chunkz)
        }
      }
    }
  }

  function block(ix, iy, iz) {
    return blocks[ix + (iy << LOGNX) + (iz << (LOGNX + LOGNY))];
  }

  function top(ix, iz) {
    for (var iy = NY-1; iy >= 0; --iy) {
      var b = block(ix, iy, iz);
      if (b.type !== 'air') return {iy: iy, b: b};
    }
  }

  // Plant some soybeans
  var upon = BLOCK_TYPES.soybeans.upon;
  for (var xi = 0; xi < NX; ++xi) {
    var x = xi + chunkx;
    for (var zi = 0; zi < NZ; ++zi) {
      var z = zi + chunkz;
      if (2 * noise(x/10,9938,z/10) + noise(x/1,9938,z/1) < -0.5) {
        var tm = top(xi, zi);
        if (tm && tm.iy < NY-1 && BLOCK_TYPES[tm.b.type][upon])
          block(xi, tm.iy+1, zi).type = 'soybeans';
      }
    }
  }

  // Plant some plants
  function plant(n, what, margin) {
    margin = margin || 0;
    while (n--) {
      var ix = margin + irand(NX - margin * 2);
      var iz = margin + irand(NZ - margin * 2);
      var t = top(ix, iz);
      if (t && t.iy < NY-1 && BLOCK_TYPES[t.b.type].plantable) {
        t = block(ix, t.iy+1, iz);
        t.type = what;
      }
    }
  }
  plant(4, 'flower');
  plant(6, 'weeds');
  
  // Initial quick lighting update, some of which we can know accurately
  for (var ix = 0; ix < NX; ++ix) {
    for (var iz = 0; iz < NZ; ++iz) {
      var sheltered = false;
      for (var iy = NY-1; iy >= 0; --iy) {
        var b = block(ix, iy, iz);
        var type = BLOCK_TYPES[b.type];
        b.light[3] = type.opaque ? 0 : sheltered ? 0 : LIGHT_SUN;
        b.dirtyLight = false;
        if (type.luminosity) b.dirtyLight = true;
        if (sheltered && !type.opaque) b.dirtyLight = true;
        sheltered = sheltered || type.opaque || type.translucent;
      }
    }
  }

  // Do a few updates to avoid having to recreate the geometry a bunch of 
  // times when we're updating in bulk
  //for (var i = 0; i < 10 && this.nDirty > 50; ++i)
  //  this.updateLight();

  return result;
}


function irand(n) {
  return Math.floor(Math.random() * n);
}



if (typeof importScripts !== 'undefined') {
  importScripts('perlin.js');

  self.onmessage = function (event) {
    var chunk = generateChunk(event.data.seed, 
                              event.data.chunkx, 
                              event.data.chunkz);
    var message = new ArrayBuffer(chunk);
    if (typeof webkitPostMessage !== 'undefined')
      webkitPostMessage(message, [message]);
    else
      postMessage(message);
  }
}
