import { createRequire } from 'module';const require = createRequire(import.meta.url);
import {
  MatError,
  MatFormField,
  MatHint,
  MatLabel,
  MatPrefix,
  MatSuffix
} from "./chunk-FLK75OGA.js";
import {
  MatCommonModule,
  ObserversModule
} from "./chunk-KV3CNZMM.js";
import {
  NgModule,
  setClassMetadata,
  ɵɵdefineInjector,
  ɵɵdefineNgModule
} from "./chunk-K2UTRH64.js";
import {
  __name,
  __publicField
} from "./chunk-4EE7O47L.js";

// node_modules/@angular/material/fesm2022/form-field-module.mjs
var _MatFormFieldModule = class _MatFormFieldModule {
};
__name(_MatFormFieldModule, "MatFormFieldModule");
__publicField(_MatFormFieldModule, "ɵfac", /* @__PURE__ */ __name(function MatFormFieldModule_Factory(__ngFactoryType__) {
  return new (__ngFactoryType__ || _MatFormFieldModule)();
}, "MatFormFieldModule_Factory"));
__publicField(_MatFormFieldModule, "ɵmod", ɵɵdefineNgModule({
  type: _MatFormFieldModule,
  imports: [MatCommonModule, ObserversModule, MatFormField, MatLabel, MatError, MatHint, MatPrefix, MatSuffix],
  exports: [MatFormField, MatLabel, MatHint, MatError, MatPrefix, MatSuffix, MatCommonModule]
}));
__publicField(_MatFormFieldModule, "ɵinj", ɵɵdefineInjector({
  imports: [MatCommonModule, ObserversModule, MatFormField, MatCommonModule]
}));
var MatFormFieldModule = _MatFormFieldModule;
(() => {
  (typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(MatFormFieldModule, [{
    type: NgModule,
    args: [{
      imports: [MatCommonModule, ObserversModule, MatFormField, MatLabel, MatError, MatHint, MatPrefix, MatSuffix],
      exports: [MatFormField, MatLabel, MatHint, MatError, MatPrefix, MatSuffix, MatCommonModule]
    }]
  }], null, null);
})();

export {
  MatFormFieldModule
};
//# sourceMappingURL=chunk-76QHGNMJ.js.map
