import { createRequire } from 'module';const require = createRequire(import.meta.url);
import {
  __name
} from "./chunk-4EE7O47L.js";

// node_modules/@angular/cdk/fesm2022/css-pixel-value.mjs
function coerceCssPixelValue(value) {
  if (value == null) {
    return "";
  }
  return typeof value === "string" ? value : `${value}px`;
}
__name(coerceCssPixelValue, "coerceCssPixelValue");

// node_modules/@angular/cdk/fesm2022/coercion.mjs
function coerceBooleanProperty(value) {
  return value != null && `${value}` !== "false";
}
__name(coerceBooleanProperty, "coerceBooleanProperty");
function coerceStringArray(value, separator = /\s+/) {
  const result = [];
  if (value != null) {
    const sourceValues = Array.isArray(value) ? value : `${value}`.split(separator);
    for (const sourceValue of sourceValues) {
      const trimmedString = `${sourceValue}`.trim();
      if (trimmedString) {
        result.push(trimmedString);
      }
    }
  }
  return result;
}
__name(coerceStringArray, "coerceStringArray");

export {
  coerceCssPixelValue,
  coerceBooleanProperty,
  coerceStringArray
};
//# sourceMappingURL=chunk-OZA74OYA.js.map
