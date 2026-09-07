import { validateRenderCalibration } from "./lib/render-calibration.mjs";
console.log(JSON.stringify(await validateRenderCalibration(), null, 2));
