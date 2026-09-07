# Spritemotion document format

A Spritemotion project is a single JSON document. This describes **version 2**, which is
what the editor writes today; version 1 documents are still read and migrated on open.

The goal is that any engine can play a project back without the editor: the layer
hierarchy, the transform tracks and the artwork are all in the file, and nothing in it is
derived from anything else.

## Shape

```jsonc
{
  "version": "2.0.0",
  "meta": {
    "name": "hero_run",
    "fps": 12,
    "total_frames": 8,
    "canvas_width": 64,
    "canvas_height": 64
  },
  "sheets": [],
  "layers": [
    {
      "id": "layer_base",
      "name": "Torso",
      "parent_id": null,
      "z_index": 0,
      "visible": true,
      "relative_to_parent": true,
      "default_transform": { "x": 32, "y": 32, "rotation": 0, "scale_x": 1, "scale_y": 1, "opacity": 1,
                             "pivot": { "x": 0.5, "y": 0.5 } },
      "tracks": {
        "position": [ { "frame": 0, "value": [32, 32], "easing": "linear" } ],
        "rotation": [], "scale": [], "opacity": [], "sprite_frame": []
      }
    }
  ],
  "animations": [
    {
      "id": "walk",
      "name": "walk",
      "fps": 12,
      "total_frames": 8,
      "layer_groups": { "layer_base": [ { "id": "grp_1", "layer_id": "layer_base",
                                          "start_frame": 0, "end_frame": 4,
                                          "pivot": { "x": 32, "y": 40 } } ] },
      "cels": {
        "layer_base": {
          "0": { "p": ["#3a5f8a", "#e43b44"], "r": [128, 0, 4, 1, 2, 2, 3962, 0] }
        }
      }
    }
  ],
  "activeAnimationId": "walk"
}
```

### `layers` — the skeleton

Hierarchy, draw order and animation curves. Shared by every animation clip: a character
is rigged once and then animated in several clips. This is exactly the subset the Rust
engine deserializes, so it can be handed to the engine as-is.

### `animations[]` — the clips

Each clip owns its own timing, its interpolation groups and, in `cels`, its own artwork.
Nothing outside a clip holds pixels, so painting in one clip cannot affect another.

### `cels` — the artwork

`cels[layerId][frameIndex]` is one layer's pixels on one frame, encoded as a palette plus
a run-length sequence:

- `p` — the colours the cel uses, as `#rrggbb`, in first-appearance order.
- `r` — flat pairs of `[runLength, paletteIndex]` walking the canvas in **row-major**
  order (x fastest). Index `0` means transparent; index `n` means `p[n - 1]`.

The runs always describe exactly `canvas_width * canvas_height` pixels, so a decoder needs
nothing beyond `meta`. A cel with no painted pixels is left out of the document entirely.

Decoding is four lines:

```js
function decodeCel(cel, width) {
  const pixels = {};
  let at = 0;
  for (let i = 0; i + 1 < cel.r.length; i += 2) {
    const [run, value] = [cel.r[i], cel.r[i + 1]];
    if (value > 0) {
      for (let n = at; n < at + run; n++) pixels[`${n % width},${Math.floor(n / width)}`] = cel.p[value - 1];
    }
    at += run;
  }
  return pixels;
}
```

### What is *not* in the file

The flattened per-frame composite. It is rebuilt on load by drawing each visible layer's
cel in ascending `z_index`, which is the same thing the editor and any player do anyway.

## Reading version 1

Version 1 documents carried the same artwork up to three times: once per layer, once as
the flattened composite, and once more inside each animation clip. They are migrated when
opened:

- the active clip recovers its artwork per layer from `layers[].frame_pixels`;
- the other clips only ever had a flattened composite, so it is placed on the
  bottom-most layer, where a flattened image belongs;
- `frame_pixels` at the top level is used only when no layer carries pixels at all.

A migrated document is rewritten as v2 the next time it is saved. A document with no
`version` field is treated as v1 unless it contains `cels`.

## Sizes

Measured on a 24-frame, 3-layer, 64×64 project with sprite-like artwork: 153 kB as v1,
**10 kB as v2**. With random noise — the worst case for run-length encoding — 2.9 MB
becomes 451 kB.
