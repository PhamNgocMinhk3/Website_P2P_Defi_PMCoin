import { createRequire } from 'module';const require = createRequire(import.meta.url);
import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  OrthographicCamera
} from "./chunk-BRYVJXE4.js";
import {
  __name
} from "./chunk-4EE7O47L.js";

// node_modules/three/examples/jsm/postprocessing/Pass.js
var _Pass = class _Pass {
  constructor() {
    this.isPass = true;
    this.enabled = true;
    this.needsSwap = true;
    this.clear = false;
    this.renderToScreen = false;
  }
  setSize() {
  }
  render() {
    console.error("THREE.Pass: .render() must be implemented in derived pass.");
  }
  dispose() {
  }
};
__name(_Pass, "Pass");
var Pass = _Pass;
var _camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
var _FullscreenTriangleGeometry = class _FullscreenTriangleGeometry extends BufferGeometry {
  constructor() {
    super();
    this.setAttribute("position", new Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
    this.setAttribute("uv", new Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));
  }
};
__name(_FullscreenTriangleGeometry, "FullscreenTriangleGeometry");
var FullscreenTriangleGeometry = _FullscreenTriangleGeometry;
var _geometry = new FullscreenTriangleGeometry();
var _FullScreenQuad = class _FullScreenQuad {
  constructor(material) {
    this._mesh = new Mesh(_geometry, material);
  }
  dispose() {
    this._mesh.geometry.dispose();
  }
  render(renderer) {
    renderer.render(this._mesh, _camera);
  }
  get material() {
    return this._mesh.material;
  }
  set material(value) {
    this._mesh.material = value;
  }
};
__name(_FullScreenQuad, "FullScreenQuad");
var FullScreenQuad = _FullScreenQuad;

export {
  Pass,
  FullScreenQuad
};
//# sourceMappingURL=chunk-RGCZJ4QE.js.map
