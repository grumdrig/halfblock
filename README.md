Halfblock
=========

Halfblock is a Minecraft-a-like implemented in the browser using
modern, HTML5 technologies: 

- WebGL
- Pointer Lock API
- Web Audio API
- IndexedDB

It's mostly been developed/tested on Google Chrome, and an up-to-date
version of Chrome is probably required to run it. Firefox might work
also though there will probably be rot at any given time.

The goals of the project are to better understand the above APIs, to
try ways of implementing various game features, be they copied or
original, and to make something kind of cool. Minecraft is a great
sandbox, but a Minecraft-like codebase is a sandbox sandbox. So each
grain of sand is now a sandbox; you get me?

As it stands, the game is little more than a poor clone of Minecraft;
nevertheless, it is a non-goal to duplicate Minecraft. I've implemented
many features lifted from Minecraft for the sake of doing them myself.

It is an anti-goal to look at Minecraft's source code; rather I've
based my implementations on behavior observed in-game, and general
research on the web. See REFERENCES for links that have helped.

It isn't necessarily a goal to create something fun to play. This is
more of a research and practice project than a game. If something fun
(that isn't Minecraft) evolves from what I've done so far, so much the
better.


Notes about some features
-------------------------

### Web workers

Terrain generation (and perhaps, eventually, loading) are offloaded to
a web worker to take advantage of multiple cores and reduce ugly
pauses in the game. There are still pauses when a new chunk is
generated, probably due to lighting updates.

### Load/save

Forever poorly tested, load and save is implemented using the
[Indexed Database API](http://www.w3.org/TR/IndexedDB). There's only
one save slot as things stand.

### Reticule

The targeting reticule is a color-inverted cross at the middle of the
viewport. It is implemented by drawing WebGL lines over the scene with
the blending function `gl.blendFunc(gl.ONE_MINUS_DST_COLOR, gl.ZERO)`.


Planned features
----------------

### Head bob

Based on field tests, it appears the MC head bob moves the camera
sinusoidally left and right of center about 1/16 m, and up an down at
around the same amplitude, or perhaps a bit less (but, as logic would
dictate, at double the frequency). The POV camera moves smoothly back
to the fixed position when motion stops, in perhaps 1/2 sec, and much
quicker in the reverse direction.

The wavelength of the stride seems to be about 3m (per left + right
step).
