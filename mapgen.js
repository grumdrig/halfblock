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


function generateBlock(seed, x, y, z) {
  var type;
  if (y < 0.75 + 2 * noise(x * 23.2, y * 938.2, z * 28.1)) {
    type = 'bedrock';
  } else {
    var n = pinkNoise(x, y, z + GAME.seed, 32, 2) + 
      (2 * y/SY - NY) / NY;
    if (n < -0.2) type = 'rock';
    else if (n < -0.1) type = 'dirt';
    else if (n < 0) type = GRASSY ? 'dirt' : 'grass';
    else if (y < HY / 4) type = 'apricot jelly';
    else if (y < HY / 2) type = 'water';
    else type = 'air';

    if (Math.pow(noise(x/20 + GAME.seed, y/20, z/20 + 1000), 3) < -0.2)
      type = 'candy';

    // Caves
    if (Math.pow(noise(x/20, y/20 + GAME.seed, z/20), 3) < -0.1)
      type = 'air';
  }
  //console.log(type);
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
    for (var iy = NY-1; y >= 0; --y) {
      var b = block(ix, iy, iz);
      if (b.type !== 'air') return {iy: iy, b: b};
    }
  }

  // Plant some soybeans
  for (var xi = 0; xi < NX; ++xi) {
    var x = xi + chunkx;
    for (var zi = 0; zi < NZ; ++zi) {
      var z = zi + chunkz;
      if (2 * noise(x/10,9938,z/10) + noise(x/1,9938,z/1) < -0.5) {
        var tm = top(xi, zi);
        if (tm && tm.iy < NY-1 && plantable(tm.b.type))
          block(xi, tm.iy+1, zi).type = 'soybeans';
      }
    }
  }

  /*

  // Plant some plants
  var chunk = this;
  function plant(n, howOrWhat, margin) {
    margin = margin || 0;
    while (n--) {
      var ix = margin + irand(NX - margin * 2);
      var iz = margin + irand(NZ - margin * 2);
      var t = top(ix, iz);
      if (t && t.iy < NY-1 && plantable(t.b.type)) {
        t = block(xi, tm.iy, zi).type = 'soybeans';
        t = t.neighbor(FACE_TOP);
        if (typeof howOrWhat === 'function')
          howOrWhat(t);
        else
          t.type = BLOCK_TYPES[howOrWhat];
      }
    }
  }
  plant(4, 'flower');
  plant(2, buildTree, 3);
  plant(6, 'weeds');
  
*/
  // Initial quick lighting update, some of which we can know accurately
  for (var ix = 0; ix < NX; ++ix) {
    for (var iz = 0; iz < NZ; ++iz) {
      var sheltered = false;
      for (var iy = NY-1; iy >= 0; --iy) {
        var b = block(ix, iy, iz);
        /*
        b.light[3] = b.type.opaque ? 0 : sheltered ? 0 : LIGHT_SUN;
        b.dirtyLight = false;
        if (b.type.luminosity) b.dirtyLight = true;
        if (sheltered && !b.type.opaque) b.dirtyLight = true;
        b.sheltered = sheltered;
        sheltered = sheltered || b.type.opaque || b.type.translucent;
        */
        b.dirtyLight = true;
        b.dirtyGeometry = true;
      }
    }
  }

  /*
  // Plant grass
  if (GRASSY) {
    for (var i = 0; i < NX; ++i) {
      for (var j = 0; j < NZ; ++j) {
        var t = topmost(chunkx + i, chunkz + j);
        if (t && t.y < HY-SY && t.type === BLOCK_TYPES.dirt)
          t.neighbor(FACE_TOP).type = BLOCK_TYPES.grassy;
      }
    }
  }
  */

  // Do a few updates to avoid having to recreate the geometry a bunch of 
  // times when we're updating in bulk
  //for (var i = 0; i < 10 && this.nDirty > 50; ++i)
  //  this.updateLight();

  return result;
}
