const { readFileSync, writeFileSync } = require("fs");
const path = "script.js";
let text = readFileSync(path, "utf8");
text = text.replace(/Р—Р°РІР°РЅС‚Р°Р¶РµРЅРЅСЏ РґР°РЅРёС…вЂ¦/g, "Завантаження даних…");
text = text.replace(/Р”Р°РЅС– РІС–РґСЃСѓС‚РЅС–/g, "Дані відсутні");
text = text.replace(/РџРѕРјРёР»РєР° Р·Р°РІР°РЅС‚Р°Р¶РµРЅРЅСЏ РґР°РЅРёС…/g, "Помилка завантаження даних");
writeFileSync(path, text, "utf8");
