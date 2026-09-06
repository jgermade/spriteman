# ROADMAP — Editor de Sprites Animados

Editor de sprites animados con capas de sub-sprites y jerarquía padre-hijo, con interpolación de movimiento entre keyframes.

## Arquitectura

- **Core de animación**: Rust, compilado a WebAssembly (`wasm-bindgen`). Contiene el modelo de datos, la evaluación de la jerarquía de capas, la interpolación de transforms y la serialización.
- **UI / Timeline**: [jq79](https://github.com/jgermade/jq79) (mini reactive component library sin dependencias), consumiendo el core vía WASM.

## Modelo de datos

- Cada capa es un **sub-sprite** con:
  - Transform local por defecto: posición `(x, y)`, rotación en grados/radianes, escala `(sx, sy)`, pivote normalizado `(px, py)`, opacidad.
  - Referencia de imagen (corte en un spritesheet/atlas).
  - Tracks de keyframes propios e independientes por propiedad (`position`, `rotation`, `scale`, `opacity`, `sprite_frame`).
- **Jerarquía padre-hijo** entre capas:
  - Definida mediante `parent_id` (o relación raíz/hijos).
  - El transform mundial de una capa se calcula componiendo recursivamente su transform local con el de su padre teniendo en cuenta los puntos de pivote.
  - Permite fijar un eje de giro dependiente del padre (esqueleto simple 2D con rotación articulada).

## Interpolación

- **Transform**: interpolación continua entre keyframes.
  - Modos de easing soportados: `Linear`, `Step`, `EaseIn`, `EaseOut`, `EaseInOut`, `CubicBezier(p1x, p1y, p2x, p2y)`.
- **Imagen (frame-swap)**: siempre **discreta** (`Step`) — el cambio de imagen ocurre exactamente en el frame del keyframe, sin crossfade ni blending.

## Exportación

Se soportan **ambos** formatos:

1. **JSON con curvas**: jerarquía de capas, keyframes, transforms y referencias de imagen. Reproducible por cualquier motor (web, godot, rust/bevy, etc.) que implemente el intérprete de animación.
2. **Spritesheet rasterizado**: el core WASM compone todas las capas resueltas por frame y genera un spritesheet final (PNG/WebP), para motores tradicionales que reproducen spritesheets 2D planos.

## Especificación técnica detallada

### 1. Esquema del JSON (`spritemotion.json`)
- Metadatos del proyecto: `name`, `fps`, `total_frames`, `canvas_size { width, height }`.
- Hojas de sprites (`sheets`): Diccionario o lista de atlas con imágenes base y sub-rectángulos nombrados (`x, y, w, h, pivot`).
- Capas (`layers`): Lista plana ordenada por `z_index`, cada una con `id`, `name`, `parent_id`, `visible`, `sheet_id`, `default_transform` y `tracks`.
- Tracks de keyframes: Lista de `{ frame, value, easing }` para propiedades escalares y vectoriales.

### 2. Estructura del Crate Rust
- `src/lib.rs`: Entrada del crate con re-exportaciones.
- `src/math.rs`: Transformaciones afines 2D (`Affine2D`), composición de matrices con pivote, operaciones vectoriales.
- `src/model.rs`: Estructuras de datos serializables con `serde` (`Project`, `Layer`, `Track`, `Keyframe`, `Transform2D`, `Easing`, `SheetAtlas`).
- `src/eval.rs`: Motor de evaluación temporal `t -> ResolvedFrame`. Resuelve valores en curvas, evalúa la jerarquía padre-hijo y emite comandos ordenados de dibujado (`RenderItem`).
- `src/wasm.rs`: Bindings WASM con `wasm-bindgen` para exponer la API de evaluación y reproducción fluida a JavaScript / UI en tiempo real.
- `src/raster.rs`: Composición y empaquetado de frames en spritesheet final (opcional/nativo).

### 3. Diseño de la UI del Timeline en jq79
- **Header**: Controles de transporte (Play, Pause, Loop, FPS, Frame actual / total, Zoom).
- **Jerarquía de capas**: Árbol colapsable e indentado que muestra la relación padre-hijo, visibilidad, bloqueo y orden Z.
- **Canvas / Viewport**: Vista previa 2D con transformación pan/zoom interactiva, renderizado del frame actual con gizmos de traslación, rotación y pivote.
- **Timeline**: Pistas horizontales sincronizadas con las capas, visualización de marcas de keyframes, scrubber de reproducción arrastrable y panel de curvas/easing.

### 4. Formato de Spritesheets de entrada
- Admite atlas estructurados con un fichero de imagen (`png`, `webp`) asociado a definiciones de corte rectangulares (`x`, `y`, `width`, `height`, `pivot_x`, `pivot_y`), compatibles con TexturePacker / formato nativo JSON.
