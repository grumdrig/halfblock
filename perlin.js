// Ken Perlin's improved noise

var permutation = new Uint8Array([151,160,137,91,90,15,131,13,201,95,96,53,
  194, 233,7,225,
  140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,
  62,94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,
  171,168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,
  211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,
  73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,109,
  198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,
  207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,152,2,44,
  154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,110,79,113,
  224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,144,12,191,
  179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,184,
  84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,67,29,24,72,
  243,141,128,195,78,66,215,61,156,180]);


var p = new Uint8Array(512);
for (var i = 0; i < 256; ++i) 
  p[i+256] = p[i] = permutation[i];


function noise(x, y, z) {
  // Find the unit cube that contains point
  var X = Math.floor(x) & 255;                  
  var Y = Math.floor(y) & 255;                  
  var Z = Math.floor(z) & 255;
  // Find the relative x,y,z of the point in the cube
  x -= Math.floor(x);                           
  y -= Math.floor(y);                           
  z -= Math.floor(z);
  // Compute the fade curves for each of x, y, and z
  var u = fade(x);                              
  var v = fade(y);                              
  var w = fade(z);
  // Hash the coordinates of the 8 cube corners
  var A  = p[X  ] + Y;
  var AA = p[A  ] + Z;
  var AB = p[A+1] + Z; 
  var B  = p[X+1] + Y;
  var BA = p[B  ] + Z;
  var BB = p[B+1] + Z;
  // ...and add blended results from the 8 corners of the cube
  return lerp(w, lerp(v, lerp(u, grad(p[AA  ], x  , y  , z   ),  
                                 grad(p[BA  ], x-1, y  , z   )), 
                         lerp(u, grad(p[AB  ], x  , y-1, z   ), 
                                 grad(p[BB  ], x-1, y-1, z   ))),
                 lerp(v, lerp(u, grad(p[AA+1], x  , y  , z-1 ), 
                                 grad(p[BA+1], x-1, y  , z-1 )),
                         lerp(u, grad(p[AB+1], x  , y-1, z-1 ),
                                 grad(p[BB+1], x-1, y-1, z-1 ))));
}

function lerp(t, a, b) { return a + t * (b - a); }

function grad(hash, x, y, z) {
  var h = hash & 15;                        // Convert lo 4 bits of hash code
  var u = (h < 8) ? x : y;                  // into 12 gradient directions.
  var v = (h < 4) ? y : (h == 12 || h == 14) ? x : z;
  return ((h & 1) == 0 ? u : -u) + ((h & 2) == 0 ? v : -v);
}

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }


function pinkNoise(x, y, z, maxScale, minScale, alpha) {
  if (!alpha) alpha = 0.5;
  var result = 0;
  var a = 1;
  for (var scale = maxScale; scale >= minScale; scale /= 2) {
    result += noise(x / scale, y / scale, z / scale) * a;
    a *= alpha;
  }
  return result;
}


// A few 3d textures from
// http://http.developer.nvidia.com/GPUGems/gpugems_ch05.html

// STRIPES TEXTURE (GOOD FOR MAKING MARBLE)
function stripes(x, f) {
  var t = .5 + .5 * Math.sin(f * 2 * Math.PI * x);
  return t * t - .5;
}

// TURBULENCE TEXTURE
function turbulence(x, y, z, f) {
  var t = -0.5;
  for ( ; f <= W/12 ; f *= 2) // W = Image width in pixels
    t += abs(noise(x,y,z,f) / f);
  return t;
}

function marbled(x, y, z) {
  return .01 * stripes(x + 2 * turbulence(x, y, z, 1), 1.6);
}

function crinkled(x, y, z) {
  return -.10 * turbulence(x, y, z, 1);
}


if (typeof exports != 'undefined') {
  exports.noise = noise;
  exports.pinkNoise = pinkNoise;
}
