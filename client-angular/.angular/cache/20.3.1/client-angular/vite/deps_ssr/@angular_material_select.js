import { createRequire } from 'module';const require = createRequire(import.meta.url);
import {
  MAT_SELECT_CONFIG,
  MAT_SELECT_SCROLL_STRATEGY,
  MAT_SELECT_SCROLL_STRATEGY_PROVIDER,
  MAT_SELECT_SCROLL_STRATEGY_PROVIDER_FACTORY,
  MAT_SELECT_TRIGGER,
  MatSelect,
  MatSelectChange,
  MatSelectModule,
  MatSelectTrigger
} from "./chunk-4IKHY2GE.js";
import "./chunk-P6UXMTC7.js";
import "./chunk-PY4TTLIO.js";
import "./chunk-HLZDUGMZ.js";
import "./chunk-76QHGNMJ.js";
import {
  MatError,
  MatFormField,
  MatHint,
  MatLabel,
  MatPrefix,
  MatSuffix
} from "./chunk-FLK75OGA.js";
import "./chunk-ZDJIB5DI.js";
import {
  MatOptgroup,
  MatOption
} from "./chunk-FZ54LIYG.js";
import "./chunk-TXD3OJQE.js";
import "./chunk-YFW26QBT.js";
import "./chunk-X4IHMSOJ.js";
import "./chunk-OZA74OYA.js";
import "./chunk-GLRSCXB5.js";
import "./chunk-ARRJDCCQ.js";
import "./chunk-BSYF6PSK.js";
import "./chunk-KV3CNZMM.js";
import "./chunk-IF5BFEJ2.js";
import "./chunk-GATUPQWG.js";
import "./chunk-DHTGWUXP.js";
import "./chunk-Q2MTCLXJ.js";
import "./chunk-RNVTKZ2O.js";
import "./chunk-K2UTRH64.js";
import {
  require_operators
} from "./chunk-HC33HNB3.js";
import {
  require_cjs
} from "./chunk-YFHIY45Q.js";
import "./chunk-CCLI3XUM.js";
import {
  __toESM
} from "./chunk-4EE7O47L.js";

// node_modules/@angular/material/fesm2022/select.mjs
var import_rxjs = __toESM(require_cjs(), 1);
var import_operators = __toESM(require_operators(), 1);
var matSelectAnimations = {
  // Represents
  // trigger('transformPanel', [
  //   state(
  //     'void',
  //     style({
  //       opacity: 0,
  //       transform: 'scale(1, 0.8)',
  //     }),
  //   ),
  //   transition(
  //     'void => showing',
  //     animate(
  //       '120ms cubic-bezier(0, 0, 0.2, 1)',
  //       style({
  //         opacity: 1,
  //         transform: 'scale(1, 1)',
  //       }),
  //     ),
  //   ),
  //   transition('* => void', animate('100ms linear', style({opacity: 0}))),
  // ])
  /** This animation transforms the select's overlay panel on and off the page. */
  transformPanel: {
    type: 7,
    name: "transformPanel",
    definitions: [
      {
        type: 0,
        name: "void",
        styles: {
          type: 6,
          styles: { opacity: 0, transform: "scale(1, 0.8)" },
          offset: null
        }
      },
      {
        type: 1,
        expr: "void => showing",
        animation: {
          type: 4,
          styles: {
            type: 6,
            styles: { opacity: 1, transform: "scale(1, 1)" },
            offset: null
          },
          timings: "120ms cubic-bezier(0, 0, 0.2, 1)"
        },
        options: null
      },
      {
        type: 1,
        expr: "* => void",
        animation: {
          type: 4,
          styles: { type: 6, styles: { opacity: 0 }, offset: null },
          timings: "100ms linear"
        },
        options: null
      }
    ],
    options: {}
  }
};
export {
  MAT_SELECT_CONFIG,
  MAT_SELECT_SCROLL_STRATEGY,
  MAT_SELECT_SCROLL_STRATEGY_PROVIDER,
  MAT_SELECT_SCROLL_STRATEGY_PROVIDER_FACTORY,
  MAT_SELECT_TRIGGER,
  MatError,
  MatFormField,
  MatHint,
  MatLabel,
  MatOptgroup,
  MatOption,
  MatPrefix,
  MatSelect,
  MatSelectChange,
  MatSelectModule,
  MatSelectTrigger,
  MatSuffix,
  matSelectAnimations
};
//# sourceMappingURL=@angular_material_select.js.map
